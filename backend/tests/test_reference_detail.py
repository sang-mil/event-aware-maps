"""역·공연장 목록과 행사 상세 테스트. 인원·관객 수는 가짜 테스트 값이다."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import reference  # noqa: E402
from events import detail  # noqa: E402
from events.detect import Event  # noqa: E402
from publish.schema import errors_of  # noqa: E402


def wrap(name, data):
    return errors_of(name, {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00+09:00", "data": data})


def test_stations_has_data_from_db_keys():
    st = reference.stations({("olympic_park", "9"), ("bangi", "5")})
    assert wrap("stations.json", st) == []
    by = {s["id"]: s for s in st}
    assert by["olympic_park"]["has_data"] is True and by["olympic_park"]["data_lines"] == ["9"]
    assert by["mongchontoseong"]["has_data"] is False and by["mongchontoseong"]["data_lines"] == []
    assert all(s["lat"] is None and s["lng"] is None for s in st)   # 좌표는 확인된 자료가 없어 null


def test_venues_unknowns_are_null():
    vs = reference.venues()
    assert wrap("venues.json", vs) == []
    kspo = next(v for v in vs if v["id"] == "kspo_dome")
    assert kspo["area"] == "olympic_park"
    assert [n["station_id"] for n in kspo["nearby_stations"]] == ["olympic_park", "bangi"]
    assert all(n["walk_min"] is None for v in vs for n in v["nearby_stations"])


def s(expected, baseline):
    r = expected / baseline
    return {"baseline": baseline, "expected": expected, "ratio": r,
            "level": "crowded" if r >= 1.5 else "relaxed" if r < 0.8 else "normal",
            "weekday_fallback": False, "effect_unknown": False}


DAY = {"olympic_park": {19: s(100, 100), 20: s(400, 100), 21: s(120, 100), 22: None, 23: None},
       "bangi": {19: s(100, 100), 20: s(100, 100), 21: s(100, 100), 22: s(100, 100), 23: None}}


def test_event_detail_after_end_and_same_day():
    a = Event("2099-01-10", "가짜 공연 가", [18, 19, 20], 1000)
    b = Event("2099-01-10", "가짜 공연 나", [19, 20, 21], 500)
    d = detail.event_detail(a, [a, b], DAY, lambda e: "crowded")
    assert wrap(f"event-{a.id}.json", d) == []
    assert d["linkable"] is True and d["nearest_station"] == {"station_id": "olympic_park", "level": "crowded"}
    assert d["after_end"]["end"]["hour_label"] == "20~21시 예상"
    assert [(x["station_id"], x["level"], x["message"]) for x in d["after_end"]["end"]["stations"]] == [
        ("olympic_park", "crowded", "400명, 평소의 4.0배"), ("bangi", "normal", "100명, 평소와 비슷")]
    assert d["after_end"]["later"]["stations"][0]["level"] == "normal"
    assert "no_data_message" not in d["after_end"]
    assert [x["id"] for x in d["same_day"]] == [b.id]
    assert d["same_day"][0]["end_at"] == "2099-01-10T21:00:00+09:00" and d["same_day"][0]["end_at_source"] == "estimated"
    assert d["crossing_note"] is None


def test_event_detail_outside_forecast_hours_says_no_data():
    day_show = Event("2099-01-10", "낮 공연", [13, 14], 300)
    d = detail.event_detail(day_show, [day_show], DAY, lambda e: None)
    assert wrap(f"event-{day_show.id}.json", d) == []
    assert all(x["level"] == "no_data" and x["message"] is None for x in d["after_end"]["end"]["stations"])
    assert "later" not in d["after_end"]
    assert "예상 정보가 없어요" in d["after_end"]["no_data_message"]
