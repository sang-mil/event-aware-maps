"""기준 정보: 역·공연장 목록 → stations.json, venues.json (data 부분).

- 역 이름·노선은 실제 노선 정보. has_data·data_lines 는 DB에 실제 승하차 자료가 있는지로 정한다.
- 공연장 목록(venues.json 파일)은 이름·지역·가까운 역만 둔다. 좌표(lat/lng)와 도보 시간(walk_min)은
  확인된 자료가 없어 null 로 둔다(지어내지 않음). 화면은 null 을 "정보 없음"으로 표시한다.
"""

from __future__ import annotations

import json
from pathlib import Path

VENUES_FILE = Path(__file__).parent / "venues.json"

STATIONS = [
    ("olympic_park", "올림픽공원역", ["5", "9"]),
    ("bangi", "방이역", ["5"]),
    ("mongchontoseong", "몽촌토성역", ["8"]),
    ("sports_complex", "종합운동장역", ["2", "9"]),
    ("jamsil_saenae", "잠실새내역", ["2"]),
    ("hanseong_baekje", "한성백제역", ["9"]),
]


def stations(obs_keys: set[tuple[str, str]]) -> list[dict]:
    """obs_keys: DB에 승하차 자료가 있는 (역, 노선) 집합."""
    out = []
    for sid, name, lines in STATIONS:
        data_lines = [ln for ln in lines if (sid, ln) in obs_keys]
        out.append({"id": sid, "name": name, "lines": lines, "lat": None, "lng": None,
                    "has_data": bool(data_lines), "data_lines": data_lines})
    return out


def venues() -> list[dict]:
    rows = json.loads(VENUES_FILE.read_text(encoding="utf-8"))
    return [{"id": v["id"], "name": v["name"], "area": v["area"], "lat": None, "lng": None,
             "nearby_stations": [{"station_id": s, "walk_min": None} for s in v["nearby_station_ids"]]}
            for v in rows]
