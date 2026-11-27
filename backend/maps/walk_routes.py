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


def find_place(name: str, key: str, opener=urlopen) -> dict:
    """Find a place whose returned name actually matches the requested venue/station."""
    url = f"{LOCAL_URL}?{urlencode({'query': name, 'size': 15})}"
    docs = _request(url, key, opener).get("documents", [])
    wanted = _norm(name)
    matches = [d for d in docs if wanted in _norm(d.get("place_name", ""))]
    if not matches:
        raise KakaoMapError(f"장소 이름과 일치하는 좌표를 찾지 못했습니다: {name}")
    place = matches[0]
    try:
        return {"name": place["place_name"], "x": float(place["x"]), "y": float(place["y"])}
    except (KeyError, TypeError, ValueError):
        raise KakaoMapError(f"장소 좌표가 올바르지 않습니다: {name}") from None


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


def build(key: str, pause_seconds: float = 0.25, opener=urlopen) -> dict:
    """Return a complete dataset; unmatched/unsupported routes remain explicit nulls."""
    venues = json.loads(reference.VENUES_FILE.read_text(encoding="utf-8"))
    station_ids = {s[0] for s in reference.STATIONS}
    places: dict[str, dict] = {}
    for row in [*venues, *({"id": s[0], "name": s[1]} for s in reference.STATIONS)]:
        places[row["id"]] = find_place(row["name"], key, opener)
        time.sleep(pause_seconds)

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
        "places": [{"id": pid, **place} for pid, place in places.items()],
        "routes": routes,
    }


def write(key: str, out: Path) -> int:
    if not key.strip():
        raise KakaoMapError("환경변수 KAKAO_REST_API_KEY 가 없습니다.")
    data = build(key.strip())
    errors = errors_of("walk-routes.json", data)
    if errors:
        raise KakaoMapError("도보 경로 JSON 검증 실패: " + "; ".join(errors))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return len(data["routes"])
