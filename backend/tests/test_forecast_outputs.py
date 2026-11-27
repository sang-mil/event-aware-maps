"""혼잡 예상 JSON 테스트. 인원·관객 수는 모두 가짜 테스트 값이다."""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from congestion import model, outputs  # noqa: E402
from events import outputs as ev_outputs  # noqa: E402
from events.detect import Event  # noqa: E402
from publish.schema import errors_of  # noqa: E402

SAT = "2099-01-10"


def world():
    """가짜 세상: 올림픽공원역(5호선)·방이역 매일 19~23시 100명. 토요일 20시 퇴장(관객 1000) → 올림픽공원 20시 +300."""
    obs = {("olympic_park", "5"): {}, ("bangi", "5"): {}}
    covered, exits = set(), {}
    start = date(2099, 1, 5)
    for i in range(30 * 7):
        x = start + timedelta(days=i)
        d = x.isoformat()
        covered.add(d)
        for h in outputs.HOURS:
            obs[("olympic_park", "5")][(d, h)] = 100 + (300 if x.weekday() == 5 and h == 20 else 0)
            obs[("bangi", "5")][(d, h)] = 100
        if x.weekday() == 5:
            exits[d] = [(20, 1000)]
    base = model.Baselines(obs, covered, exits)
    return obs, exits, base, model.residuals(obs, exits, base)


def wrap(name, data):
    return errors_of(name, {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00+09:00", "data": data})


def test_forecast_for_event_day():
    obs, exits, base, res = world()
    day = outputs.compute_day(SAT, obs, exits, base, res)
    f = outputs.forecast(SAT, day, exits)
    assert wrap(f"forecast-{SAT}.json", f) == []
    assert f["has_event"] is True and f["focus_hour"] == "20" and f["day_label"] == "1월 10일 (토)"
    assert f["ranking"]["20"] == ["bangi", "olympic_park"]          # 데이터 없는 역은 순위에서 빠짐
    assert f["summaries"]["20"] == {"highlight": "20시", "text": "엔 방이역이\n가장 덜 붐빌 거예요", "best_station_id": "bangi"}
    op = next(s for s in f["stations"] if s["station_id"] == "olympic_park")["slots"]
    s20 = next(s for s in op if s["hour"] == "20")
    assert (s20["expected"], s20["baseline"], s20["ratio"], s20["level"]) == (400, 100, 4.0, "crowded")
    assert s20["message"] == "400명, 평소의 4.0배예요"
    assert s20["baseline_basis"] == "weekday_fallback"                     # 토요일 기준선은 월~목으로 대신했음을 필드로 밝힘
    assert s20["uncertain"] is False
    assert next(s for s in f["stations"] if s["station_id"] == "mongchontoseong")["slots"] == []
    bangi20 = next(s for s in next(x for x in f["stations"] if x["station_id"] == "bangi")["slots"] if s["hour"] == "20")
    assert bangi20["message"] == "100명, 평소와 비슷해요"


def test_station_forecast_crowded_and_no_data():
    obs, exits, base, res = world()
    day = outputs.compute_day(SAT, obs, exits, base, res)
    s = outputs.station_forecast(SAT, "olympic_park", day, exits)
    assert wrap(f"station-olympic_park-{SAT}.json", s) == []
    assert s["focus_level"] == "crowded"
    assert s["alternatives_title"] == "20시대에 타야 한다면"
    assert [a["station_id"] for a in s["alternatives"]] == ["bangi"]
    assert s["notify_hour"] == "19" and s["headline"] == {"highlight": "19시대", "text": "에 타면 덜 붐벼요"}
    assert s["description"] == "공연이 끝나는 20시대엔 평소의 4.0배가 탈 거예요.\n21시대엔 100명으로 줄어요."
    assert [a["message"] for a in s["alternatives"]] == ["100명, 평소와 비슷해요"]   # 역 이름은 화면이 이미 보여 줌
    nd = outputs.station_forecast(SAT, "mongchontoseong", day, exits)
    assert wrap(f"station-mongchontoseong-{SAT}.json", nd) == []
    assert nd["focus_level"] == "no_data" and nd["slots"] == [] and nd["no_data"]["nearby"][0]["station_id"] == "olympic_park"


def test_weekday_without_event():
    obs, exits, base, res = world()
    tue = "2099-01-13"
    f = outputs.forecast(tue, outputs.compute_day(tue, obs, exits, base, res), exits)
    assert f["has_event"] is False and f["focus_hour"] == "20"
    assert f["summaries"]["20"] == {"highlight": None, "text": "오늘은 큰 공연이 없어\n주변 역이 평소와 비슷할 거예요",
                                    "best_station_id": f["summaries"]["20"]["best_station_id"]}
    op = next(s for s in f["stations"] if s["station_id"] == "olympic_park")["slots"]
    assert all(s["level"] == "normal" and s["message"] == "100명, 평소와 비슷해요" and s["baseline_basis"] == "same_weekday" for s in op)
    st = outputs.station_forecast(tue, "olympic_park", outputs.compute_day(tue, obs, exits, base, res), exits)
    assert st["headline"] == {"highlight": "20시대", "text": "에 타기 좋아요"}
    assert st["description"] == "20시대엔 평소와 비슷하게 탈 거예요.\n21시대엔 100명으로 비슷해요."


def test_events_get_nearest_station_level():
    obs, exits, base, res = world()
    day = outputs.compute_day(SAT, obs, exits, base, res)
    ev = Event(SAT, "가짜 공연", [18, 19, 20], 1000)
    item = ev_outputs.event_item(ev, lambda e: outputs.nearest_level(day, e.exit_hour))
    assert item["nearest_station"] == {"station_id": "olympic_park", "level": "crowded"}
    assert ev_outputs.event_item(ev)["nearest_station"] is None


def test_unknown_audience_flag_only_on_affected_stations():
    obs, exits, base, res = world()
    exits_unknown = dict(exits)
    exits_unknown[SAT] = [(20, None)]
    day = outputs.compute_day(SAT, obs, exits_unknown, base, res)
    assert day["olympic_park"][20]["effect_unknown"] is True          # 계수 0.3: 영향 받는 역
    assert day["bangi"][20]["effect_unknown"] is False                # 계수 0: 영향 없는 역
    assert "관객" not in outputs.slot_message(day["olympic_park"][20])             # 안내는 문장 대신 uncertain 필드로
    f = outputs.forecast(SAT, day, exits_unknown)
    op20 = next(x for x in next(st for st in f["stations"] if st["station_id"] == "olympic_park")["slots"] if x["hour"] == "20")
    assert op20["uncertain"] is True
