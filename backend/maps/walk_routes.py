"""Precompute public venue-to-station walking paths using Kakao Map REST APIs."""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import reference
from publish.schema import errors_of

LOCAL_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
WALK_URL = "https://dapi.kakao.com/v2/routing/walk"


class KakaoMapError(RuntimeError):
    """Safe-to-display API failure without request headers or key values."""


def _request(url: str, key: str, opener=urlopen) -> dict:
    req = Request(url, headers={"Authorization": f"KakaoAK {key}"})
    try:
        with opener(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise KakaoMapError(f"카카오 지도 API 요청 실패 (HTTP {exc.code})") from None
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise KakaoMapError(f"카카오 지도 API 응답을 읽지 못했습니다 ({type(exc).__name__})") from None


def _norm(text: str) -> str:
    return re.sub(r"[\s()·_-]+", "", text).lower()


# 검색 별칭(venues.json search_aliases)의 근거: KSPO 공연정보 API 장소 표기, 카카오 장소 검색이 실제로 돌려준 이름.
VENUE_REGION = "서울 송파구"  # 기준 공연장 12곳은 모두 서울 송파구에 있다. 다른 지역의 같은 이름 장소를 막는다.
CANDIDATES_IN_ERROR = 5


def _address(doc: dict) -> str:
    return doc.get("road_address_name") or doc.get("address_name") or ""


def _pick(docs: list[dict], accepted: list[str], region: str | None) -> dict | None:
    """카카오가 돌려준 장소 중, 이름이 허용 이름과 맞고 (지정 시) 주소가 region 으로 시작하는 것.
    정확히 같은 이름을 먼저, 없으면 허용 이름을 포함하는 이름 중 가장 짧은 것(주차장·출입구 같은 부속 시설보다 본 시설)."""
    wanted = [_norm(a) for a in accepted if a]
    ok = [d for d in docs if (region is None or _address(d).startswith(region))
          and any(w in _norm(d.get("place_name", "")) for w in wanted)]
    exact = [d for d in ok if _norm(d.get("place_name", "")) in wanted]
    pool = exact or ok
    return min(pool, key=lambda d: (_is_sub_facility(d), len(d.get("place_name", "")), docs.index(d))) if pool else None


SUB_FACILITY_WORDS = ("주차장", "출입구", "입구", "정문", "매표소", "화장실", "정류장")


def _is_sub_facility(doc: dict) -> bool:
    """주차장·출입구처럼 본 시설에 딸린 장소면 True (후순위)."""
    text = f"{doc.get('place_name', '')} {doc.get('category_name', '')}"
    return any(w in text for w in SUB_FACILITY_WORDS)


def find_place(name: str, key: str, opener=urlopen, aliases: list[str] | None = None,
               region: str | None = None) -> dict:
    """Find a place whose returned name actually matches the requested venue/station.

    이름 → 별칭 순서로 검색한다. 좌표는 카카오가 돌려준 값만 쓰고, 못 찾으면 카카오가 돌려준 후보를
    (이름 | 주소 | 분류) 그대로 오류에 남겨 사람이 별칭을 근거 있게 고칠 수 있게 한다.
    """
    accepted = [name, *(aliases or [])]
    seen: list[dict] = []
    for query in accepted:
        url = f"{LOCAL_URL}?{urlencode({'query': query, 'size': 15})}"
        docs = _request(url, key, opener).get("documents", [])
        seen.extend(docs)
        place = _pick(docs, accepted, region)
        if place is not None:
            try:
                return {"name": place["place_name"], "x": float(place["x"]), "y": float(place["y"]),
                        "query": query, "address": _address(place)}
            except (KeyError, TypeError, ValueError):
                raise KakaoMapError(f"장소 좌표가 올바르지 않습니다: {name}") from None
    shown = []
    for d in seen:
        label = f"{d.get('place_name', '')} | {_address(d)} | {d.get('category_name', '')}"
        if label not in shown:
            shown.append(label)
    hint = "; ".join(shown[:CANDIDATES_IN_ERROR]) or "검색 결과 없음"
    where = f", 주소 '{region}'" if region else ""
    raise KakaoMapError(f"장소 이름과 일치하는 좌표를 찾지 못했습니다: {name} "
                        f"(검색어 {accepted}{where}) — 카카오 후보: {hint}")


def walking_route(start: dict, end: dict, key: str, opener=urlopen) -> dict | None:
    params = {
        "start_x": start["x"], "start_y": start["y"],
        "end_x": end["x"], "end_y": end["y"],
        "s_name": start["name"], "e_name": end["name"],
        "route_mode": "BROAD_FIRST",
    }
    body = _request(f"{WALK_URL}?{urlencode(params)}", key, opener)
    if body.get("status") != "OK":
        return None
    route = body.get("route", {})
    props = route.get("properties", {})
    points: list[list[float]] = []
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            for point in step.get("path", {}).get("points", []):
                if len(point) == 2:
                    pair = [float(point[0]), float(point[1])]
                    if not points or points[-1] != pair:
                        points.append(pair)
    if len(points) < 2:
        return None
    distance = props.get("totalDistance")
    duration = props.get("totalTime")
    if not isinstance(distance, int) or not isinstance(duration, int):
        return None
    return {
        "distance_m": distance,
        "walk_min": max(1, round(duration / 60)),
        "path": points,
        "landing_url": props.get("landingUrl"),
    }


def build(key: str, pause_seconds: float = 0.25, opener=urlopen, report: list[str] | None = None) -> dict:
    """Return a complete dataset; unmatched/unsupported routes remain explicit nulls.
    report 를 주면 장소마다 '기준 이름 → 카카오가 돌려준 이름 | 주소 (검색어)'를 남긴다(키·헤더는 넣지 않음)."""
    venues = json.loads(reference.VENUES_FILE.read_text(encoding="utf-8"))
    station_ids = {s[0] for s in reference.STATIONS}
    places: dict[str, dict] = {}
    failures: list[str] = []
    rows = [*({**v, "region": VENUE_REGION} for v in venues),
            *({"id": s[0], "name": s[1], "region": None} for s in reference.STATIONS)]
    for row in rows:
        try:
            places[row["id"]] = find_place(row["name"], key, opener, row.get("search_aliases"), row["region"])
            if report is not None:
                pl = places[row["id"]]
                report.append(f"{row['name']} → {pl['name']} | {pl['address']} (검색어: {pl['query']})")
        except KakaoMapError as exc:
            failures.append(str(exc))  # 한 곳에서 멈추지 않고 전부 확인한 뒤 한꺼번에 알린다
        time.sleep(pause_seconds)
    if failures:
        raise KakaoMapError(f"장소 {len(failures)}/{len(rows)}곳을 찾지 못했습니다:\n- " + "\n- ".join(failures))

    routes = []
    for venue in venues:
        for station_id in venue["nearby_station_ids"]:
            if station_id not in station_ids:
                raise KakaoMapError(f"기준 역 목록에 없는 역입니다: {station_id}")
            route = walking_route(places[venue["id"]], places[station_id], key, opener)
            routes.append({
                "venue_id": venue["id"],
                "station_id": station_id,
                **(route or {"distance_m": None, "walk_min": None, "path": [], "landing_url": None}),
            })
            time.sleep(pause_seconds)

    return {
        "schema_version": "1.0",
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "attribution": "도보 경로·장소 좌표: Kakao Map API",
        "places": [{"id": pid, "name": p["name"], "x": p["x"], "y": p["y"]} for pid, p in places.items()],
        "routes": routes,
    }


def write(key: str, out: Path, report: list[str] | None = None) -> int:
    if not key.strip():
        raise KakaoMapError("환경변수 KAKAO_REST_API_KEY 가 없습니다.")
    data = build(key.strip(), report=report)
    errors = errors_of("walk-routes.json", data)
    if errors:
        raise KakaoMapError("도보 경로 JSON 검증 실패: " + "; ".join(errors))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    missing = sum(1 for r in data["routes"] if not r["path"])
    if report is not None:
        report.append(f"도보 경로 {len(data['routes'])}개 중 경로 없음 {missing}개")
    return len(data["routes"])
