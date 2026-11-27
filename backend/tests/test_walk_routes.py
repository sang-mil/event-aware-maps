"""도보 경로 사전 계산 테스트. 카카오 응답은 모두 가짜(형태만 따름)이고, 실제 API는 부르지 않는다."""

from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse

import pytest

from maps import walk_routes

SECRET = "TEST-KEY-123"


def doc(name, x="127.1", y="37.5", addr="서울 송파구 방이동 1", cat="문화,예술 > 공연장"):
    return {"place_name": name, "x": x, "y": y, "road_address_name": addr, "category_name": cat}


def by_query(table):
    """검색어별로 다른 가짜 응답을 돌려주는 _request 대역."""
    def fake(url, key, opener=None):
        q = parse_qs(urlparse(url).query)["query"][0]
        return {"documents": table.get(q, [])}
    return fake


def test_place_search_requires_matching_name(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", lambda *_: {"documents": [
        {"place_name": "올림픽공원역", "x": "127.12", "y": "37.51"},
        {"place_name": "올림픽공원", "x": "127.13", "y": "37.52"},
    ]})
    got = walk_routes.find_place("올림픽공원역", "not-a-real-key")
    assert (got["name"], got["x"], got["y"]) == ("올림픽공원역", 127.12, 37.51)


def test_alias_is_searched_when_name_has_no_match(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", by_query({
        "KSPO DOME": [doc("케이스포 무관 카페", addr="서울 송파구 방이동 2")],
        "올림픽체조경기장": [doc("올림픽공원 올림픽체조경기장", "127.126", "37.519")],
    }))
    got = walk_routes.find_place("KSPO DOME", SECRET, aliases=["올림픽체조경기장"], region="서울 송파구")
    assert got["name"] == "올림픽공원 올림픽체조경기장" and got["query"] == "올림픽체조경기장"
    assert (got["x"], got["y"]) == (127.126, 37.519)   # 좌표는 카카오가 준 값 그대로


def test_region_blocks_same_name_elsewhere(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", by_query({
        "체조경기장": [doc("체조경기장", addr="부산 연제구 거제동 1")],
    }))
    with pytest.raises(walk_routes.KakaoMapError) as e:
        walk_routes.find_place("체조경기장", SECRET, region="서울 송파구")
    assert "부산 연제구" in str(e.value)               # 왜 안 됐는지 후보를 남김


def test_exact_or_shortest_name_beats_parking_lot(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", lambda *_: {"documents": [
        doc("올림픽홀 주차장", "1", "1", cat="교통 > 주차장"),
        doc("올림픽공원 올림픽홀", "2", "2"),
        doc("올림픽홀", "3", "3"),
    ]})
    assert walk_routes.find_place("올림픽홀", SECRET, region="서울 송파구")["x"] == 3.0
    monkeypatch.setattr(walk_routes, "_request", lambda *_: {"documents": [
        doc("올림픽홀 주차장", "1", "1"), doc("올림픽공원 올림픽홀", "2", "2"),
    ]})
    assert walk_routes.find_place("올림픽홀", SECRET, region="서울 송파구")["x"] == 2.0   # 주차장은 뒤로


def test_error_lists_candidates_and_never_the_key(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", lambda *_: {"documents": [
        doc("전혀 다른 곳", addr="서울 송파구 잠실동 1", cat="음식점"),
    ]})
    with pytest.raises(walk_routes.KakaoMapError) as e:
        walk_routes.find_place("KSPO DOME", SECRET, aliases=["체조경기장"], region="서울 송파구")
    msg = str(e.value)
    assert "KSPO DOME" in msg and "전혀 다른 곳 | 서울 송파구 잠실동 1 | 음식점" in msg
    assert SECRET not in msg and "KakaoAK" not in msg


def test_http_error_message_has_no_key_or_url():
    def boom(req, timeout):
        raise HTTPError(req.full_url, 401, "Unauthorized", {}, None)
    with pytest.raises(walk_routes.KakaoMapError) as e:
        walk_routes._request(f"{walk_routes.LOCAL_URL}?query=x", SECRET, opener=boom)
    assert "401" in str(e.value) and SECRET not in str(e.value) and "dapi.kakao.com" not in str(e.value)


def test_build_checks_every_place_before_failing(monkeypatch):
    def fake_find(name, key, opener=None, aliases=None, region=None):
        if name in ("KSPO DOME", "잠실야구장"):
            raise walk_routes.KakaoMapError(f"장소 이름과 일치하는 좌표를 찾지 못했습니다: {name}")
        return {"name": name, "x": 127.0, "y": 37.5, "query": name, "address": "서울 송파구"}
    seen = []
    monkeypatch.setattr(walk_routes, "find_place", lambda *a, **k: (seen.append(a[0]), fake_find(*a, **k))[1])
    monkeypatch.setattr(walk_routes, "walking_route", lambda *a, **k: None)
    with pytest.raises(walk_routes.KakaoMapError) as e:
        walk_routes.build(SECRET, pause_seconds=0)
    msg = str(e.value)
    assert "장소 2/18곳을 찾지 못했습니다" in msg and "KSPO DOME" in msg and "잠실야구장" in msg
    assert len(seen) == 18                              # 공연장 12 + 역 6 모두 확인


def test_build_report_and_missing_routes_stay_null(monkeypatch):
    monkeypatch.setattr(walk_routes, "find_place", lambda name, *a, **k: {
        "name": f"{name}(카카오)", "x": 127.0, "y": 37.5, "query": name, "address": "서울 송파구 방이동"})
    monkeypatch.setattr(walk_routes, "walking_route", lambda *a, **k: None)
    report: list[str] = []
    data = walk_routes.build(SECRET, pause_seconds=0, report=report)
    assert set(data["places"][0]) == {"id", "name", "x", "y"}   # 검색어·주소는 발행하지 않음(스키마 그대로)
    assert all(r["path"] == [] and r["walk_min"] is None for r in data["routes"])
    assert any(line.startswith("KSPO DOME → KSPO DOME(카카오)") for line in report)
    assert all(SECRET not in line for line in report)


def test_route_extracts_path_duration_and_distance(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", lambda *_: {
        "status": "OK",
        "route": {
            "properties": {"totalDistance": 501, "totalTime": 601, "landingUrl": "https://map.kakao.com/route"},
            "legs": [{"steps": [
                {"path": {"points": [[127.1, 37.5], [127.2, 37.6]]}},
                {"path": {"points": [[127.2, 37.6], [127.3, 37.7]]}},
            ]}],
        },
    })
    route = walk_routes.walking_route({"x": 127.1, "y": 37.5, "name": "A"}, {"x": 127.3, "y": 37.7, "name": "B"}, "unused")
    assert route == {
        "distance_m": 501,
        "walk_min": 10,
        "path": [[127.1, 37.5], [127.2, 37.6], [127.3, 37.7]],
        "landing_url": "https://map.kakao.com/route",
    }


def test_unavailable_route_is_explicitly_missing(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", lambda *_: {"status": "ROUTE_RESULT_NOT_FOUND"})
    assert walk_routes.walking_route({"x": 127, "y": 37, "name": "A"}, {"x": 128, "y": 38, "name": "B"}, "unused") is None
