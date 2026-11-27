"""발행된 도보 경로로 도보 시간 채우기 테스트. 경로 값은 가짜 테스트 값이다."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import reference  # noqa: E402
from maps import walk_routes  # noqa: E402
from publish.schema import errors_of  # noqa: E402
from recommend import compare  # noqa: E402


def walk_file(tmp_path, routes):
    body = {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00Z", "attribution": "도보 경로·장소 좌표: Kakao Map API",
            "places": [{"id": "kspo_dome", "name": "가짜", "x": 127.1, "y": 37.5}], "routes": routes}
    p = tmp_path / "walk-routes.json"
    p.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
    return p


def route(venue, station, minutes, meters):
    return {"venue_id": venue, "station_id": station, "distance_m": meters, "walk_min": minutes,
            "path": [[127.1, 37.5], [127.2, 37.6]] if minutes else [], "landing_url": None}


def test_lookup_keeps_only_computed_routes(tmp_path):
    p = walk_file(tmp_path, [route("kspo_dome", "olympic_park", 12, 783), route("kspo_dome", "bangi", None, None)])
    assert walk_routes.load_lookup(p) == {("kspo_dome", "olympic_park"): {"walk_min": 12, "distance_m": 783}}
    assert walk_routes.load_lookup(tmp_path / "없음.json") == {}


def test_lookup_rejects_broken_file(tmp_path):
    p = tmp_path / "walk-routes.json"
    p.write_text('{"places": "x"}', encoding="utf-8")
    with pytest.raises(walk_routes.KakaoMapError):
        walk_routes.load_lookup(p)


def test_venues_fill_only_known_walks():
    vs = reference.venues({("kspo_dome", "olympic_park"): {"walk_min": 12, "distance_m": 783}})
    kspo = next(v for v in vs if v["id"] == "kspo_dome")
    assert [(n["station_id"], n["walk_min"]) for n in kspo["nearby_stations"]] == [("olympic_park", 12), ("bangi", None)]
    assert errors_of("venues.json", {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00+09:00", "data": vs}) == []


def s(expected, baseline=100):
    r = expected / baseline
    return {"baseline": baseline, "expected": expected, "ratio": r,
            "level": "crowded" if r >= 1.5 else "relaxed" if r < 0.8 else "normal",
            "weekday_fallback": False, "effect_unknown": False}


def test_compare_and_route_carry_walk_by_venue():
    day = {"olympic_park": {h: s(400 if h == 20 else 100) for h in range(19, 24)},
           "bangi": {h: s(100) for h in range(19, 24)}}
    walk = {("kspo_dome", "olympic_park"): {"walk_min": 12, "distance_m": 783},
            ("kspo_dome", "bangi"): {"walk_min": 27, "distance_m": 1639},
            ("olympic_hall", "bangi"): {"walk_min": 15, "distance_m": 881}}
    files = compare.build_files("2099-01-10", day, walk)
    c = files["compare-olympic_park-2099-01-10-20.json"]
    by_id = {o["id"]: o["walk_by_venue"] for o in c["options"]}
    assert by_id["walk_bangi"] == {"kspo_dome": {"walk_min": 27, "distance_m": 1639},
                                   "olympic_hall": {"walk_min": 15, "distance_m": 881}}
    assert by_id["now_olympic"] == {"kspo_dome": {"walk_min": 12, "distance_m": 783}}
    r = files["route-olympic_park-2099-01-10-20-walk_bangi.json"]
    assert r["walk_by_venue"]["kspo_dome"]["walk_min"] == 27
    assert r["walk_min"] is None                      # 지역 단위 파일이라 공연장 하나로 정하지 않음
    for name, body in files.items():
        assert errors_of(name, {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00+09:00", "data": body}) == []
