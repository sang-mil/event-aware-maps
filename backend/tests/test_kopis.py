"""KOPIS 수집·회차 만들기·객석 대비 관객 비율 테스트. 공연·객석 값은 가짜 테스트 값이다(형태만 KOPIS 응답을 따름)."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from collectors import CollectError, kopis as kc  # noqa: E402
from congestion import outputs as cg_outputs  # noqa: E402
from events import calibrate, kopis  # noqa: E402
from events import outputs as ev_outputs  # noqa: E402
from events.detect import Event  # noqa: E402
from publish.schema import errors_of  # noqa: E402

SECRET = "TEST-KEY-123"


def perf(mt20id="PF1", hall="FC001247-01", sched="금요일(19:00), 토요일 ~ 일요일(16:00,19:00)", runtime="2시간",
         frm="2099.01.09", to="2099.01.11", title="가짜 콘서트 [서울]"):
    return {"mt20id": mt20id, "prfnm": title, "prfpdfrom": frm, "prfpdto": to, "mt10id": hall.split("-")[0],
            "mt13id": hall, "prfruntime": runtime, "dtguidance": sched}


RAW = {"window": {"start": "2099-01-09", "end": "2099-01-11"},
       "facilities": [{"mt10id": "FC001247", "name": "올림픽공원",
                       "halls": [{"mt13id": "FC001247-01", "name": "KSPO DOME", "seats": 10000}]}],
       "performances": [perf()]}


def test_parse_schedule_ranges_multiple_times_and_holiday():
    got = kopis.parse_schedule("화요일 ~ 금요일(20:00), 토요일(15:00,17:30), 일요일(15:00), HOL(11:00)")
    assert got == {1: ["20:00"], 2: ["20:00"], 3: ["20:00"], 4: ["20:00"], 5: ["15:00", "17:30"], 6: ["15:00"]}
    assert kopis.parse_schedule("토요일 ~ 월요일(18:00)") == {5: ["18:00"], 6: ["18:00"], 0: ["18:00"]}
    assert kopis.parse_schedule("") == {}


def test_instances_have_venue_start_end_and_estimated_audience():
    evs = kopis.instances(RAW, fill={"kspo_dome": 0.5})
    got = [(e.date, e.start_at[11:16], e.end_at[11:16], e.exit_hour, e.venue_id, e.area, e.audience) for e in evs]
    assert got == [
        ("2099-01-09", "19:00", "21:00", 21, "kspo_dome", "olympic_park", 5000),   # 2099-01-09 금요일
        ("2099-01-10", "16:00", "18:00", 18, "kspo_dome", "olympic_park", 5000),
        ("2099-01-10", "19:00", "21:00", 21, "kspo_dome", "olympic_park", 5000),
        ("2099-01-11", "16:00", "18:00", 18, "kspo_dome", "olympic_park", 5000),
        ("2099-01-11", "19:00", "21:00", 21, "kspo_dome", "olympic_park", 5000),
    ]
    assert evs[0].id == "evt_20990109_pf1_1900" and evs[0].audience_estimated is True


def test_unknown_runtime_unknown_hall_and_no_ratio_stay_unknown():
    raw = dict(RAW, performances=[perf(runtime="", hall="FC001247-06"), perf(mt20id="PF2", hall="FC001513-01")])
    evs = kopis.instances(raw, fill={})
    k_art = [e for e in evs if e.id.startswith("evt_20990109_pf1")][0]
    assert k_art.end_at is None and k_art.exit_hour is None and k_art.venue_id is None   # K-아트홀은 대응 없음
    lotte = [e for e in evs if "pf2" in e.id][0]
    assert lotte.venue_id == "lotte_concert_hall" and lotte.area == "jamsil" and lotte.audience is None


def test_show_past_midnight_gets_hour_24_or_more():
    raw = dict(RAW, performances=[perf(sched="금요일(23:00)", runtime="1시간 30분", to="2099.01.09")])
    e = kopis.instances(raw)[0]
    assert e.end_at.startswith("2099-01-10T00:30") and e.exit_hour == 24


def test_nearest_station_only_from_known_data():
    assert ev_outputs.nearest_station_id(Event("2099-01-09", "x", venue_id="kspo_dome")) == "olympic_park"
    assert ev_outputs.nearest_station_id(Event("2099-01-09", "x", venue_id="charlotte_theater", area="jamsil")) is None
    assert ev_outputs.nearest_station_id(Event("2099-01-09", "x")) == "olympic_park"          # KSPO 기록 공연
    assert ev_outputs.nearest_station_id(Event("2099-01-09", "x", area="jamsil")) is None


def test_nearest_level_does_not_borrow_other_hours():
    day = {"olympic_park": {h: {"level": "crowded"} for h in cg_outputs.HOURS}}
    assert cg_outputs.nearest_level(day, 16) == "no_data"
    assert cg_outputs.nearest_level(day, None) == "no_data"
    assert cg_outputs.nearest_level(day, 20) == "crowded"


def test_event_item_for_kopis_show_passes_schema():
    e = kopis.instances(RAW, fill={"kspo_dome": 0.5})[0]
    body = ev_outputs.events_for_day([e], e.date, nearest=lambda ev: "crowded", linkable=True)
    item = body["events"][0]
    assert (item["venue_id"], item["start_at"], item["end_at_source"]) == ("kspo_dome", "2099-01-09T19:00:00+09:00", "estimated")
    assert errors_of("events-2099-01-09.json", {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00+09:00", "data": body}) == []


def test_calibration_ignores_generic_words_and_takes_median():
    kspo = [Event("2099-01-09", "가짜그룹 WORLD TOUR [서울]", audience=6000),
            Event("2099-01-10", "다른가수 WORLD TOUR", audience=9000),
            Event("2099-01-11", "가짜그룹 WORLD TOUR", audience=8000)]
    seats = kopis.instances(dict(RAW, performances=[perf(title="가짜그룹 WORLD TOUR: 부제")]), fill={"*": 1.0})
    pairs = calibrate.match(kspo, seats)
    assert [p["date"] for p in pairs] == ["2099-01-09", "2099-01-11"]   # 'WORLD TOUR'만 같은 다른가수는 짝짓지 않음
    r = calibrate.ratios(pairs)
    assert r["ratio"]["*"] == pytest.approx(0.7) and r["samples"]["kspo_dome"] == 2
    assert "kspo_dome" not in r["ratio"]                                 # 표본 5개 미만이면 공연장별 비율 없음


def xml(rows, code="00"):
    body = "".join("<db>" + "".join(f"<{k}>{v}</{k}>" for k, v in r.items()) + "</db>" for r in rows)
    return f"<dbs><returncode>{code}</returncode>{body}</dbs>"


def test_fetch_range_filters_facilities_and_skips_failed_details():
    calls = []

    def get(url, source):
        calls.append(url)
        path = urlparse(url).path
        if path.endswith("/pblprfr"):
            return xml([{"mt20id": "PF1", "fcltynm": "올림픽공원"}, {"mt20id": "PF9", "fcltynm": "다른극장"},
                        {"mt20id": "PF2", "fcltynm": "롯데콘서트홀"}])
        if path.endswith("/PF1"):
            return xml([perf()])
        if path.endswith("/PF2"):
            raise CollectError("kopis_detail: HTTP 400")
        return "<dbs><db><fcltynm>시설</fcltynm><mt13s><mt13><mt13id>X-01</mt13id><prfplcnm>홀</prfplcnm>" \
               "<seatscale>1,234</seatscale></mt13></mt13s></db></dbs>"

    out = kc.fetch_range(SECRET, date(2099, 1, 9), 3, get=get, wait=lambda s: None)
    assert [p["mt20id"] for p in out["performances"]] == ["PF1"]
    assert out["skipped"] == [{"mt20id": "PF2", "error": "kopis_detail: HTTP 400"}]
    assert out["facilities"][0]["halls"] == [{"mt13id": "X-01", "name": "홀", "seats": 1234}]
    assert not any("PF9" in u for u in calls)                              # 대상 시설 아닌 공연은 상세를 부르지 않음
    assert parse_qs(urlparse(calls[0]).query)["service"] == [SECRET]
    assert "출처: (재)예술경영지원센터" in out["attribution"]


def test_list_window_rejects_more_than_31_days():
    with pytest.raises(ValueError):
        kc.list_window(SECRET, date(2099, 1, 1), date(2099, 2, 5), get=lambda u, s: "", wait=lambda s: None)
