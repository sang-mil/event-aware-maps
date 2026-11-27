"""역 상세 대안 역의 갈아타기 안내·역 간 도보 테스트. 인원·도보 값은 가짜 테스트 값이다."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from congestion import outputs  # noqa: E402
from maps import walk_routes  # noqa: E402
from publish.schema import errors_of  # noqa: E402


def s(expected, baseline=100):
    r = expected / baseline
    return {"baseline": baseline, "expected": expected, "ratio": r,
            "level": "crowded" if r >= 1.5 else "relaxed" if r < 0.8 else "normal",
            "weekday_fallback": False, "effect_unknown": False}


def test_transfer_note_only_for_shared_line():
    assert outputs.transfer_note("olympic_park", "bangi") == "같은 5호선이라 갈아타지 않아요"
    assert outputs.transfer_note("olympic_park", "hanseong_baekje") == "같은 9호선이라 갈아타지 않아요"
    assert outputs.transfer_note("bangi", "mongchontoseong") is None          # 5호선 vs 8호선: 환승 말하지 않음


def test_alternatives_carry_walk_and_transfer():
    day = {sid: {h: s(100) for h in outputs.HOURS} for sid in outputs.STATIONS}
    day["olympic_park"][20] = s(400)
    st = outputs.station_forecast("2099-01-10", "olympic_park", day, {"2099-01-10": [(20, 1000)]},
                                  {("olympic_park", "bangi"): 11})
    alt = {a["station_id"]: a for a in st["alternatives"]}
    assert alt["bangi"]["walk_min"] == 11 and alt["bangi"]["transfer_note"] == "같은 5호선이라 갈아타지 않아요"
    assert alt["mongchontoseong"]["walk_min"] is None and alt["mongchontoseong"]["transfer_note"] is None
    assert errors_of("station-olympic_park-2099-01-10.json",
                     {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00+09:00", "data": st}) == []


def test_station_lookup_and_build_include_station_pairs(tmp_path, monkeypatch):
    monkeypatch.setattr(walk_routes, "find_place", lambda name, *a, **k: {
        "name": name, "x": 127.0, "y": 37.5, "query": name, "address": "서울 송파구", "category": ""})
    monkeypatch.setattr(walk_routes, "walking_route", lambda *a, **k: {
        "distance_m": 700, "walk_min": 11, "path": [[127.0, 37.5], [127.1, 37.6]], "landing_url": None})
    data = walk_routes.build("unused", pause_seconds=0)
    assert len(data["station_routes"]) == 12                                 # 4개 역 × 다른 3개 역
    assert errors_of("walk-routes.json", data) == []
    p = tmp_path / "walk-routes.json"
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    lookup = walk_routes.load_station_lookup(p)
    assert lookup[("olympic_park", "bangi")] == 11 and len(lookup) == 12
    assert walk_routes.load_station_lookup(tmp_path / "없음.json") == {}
