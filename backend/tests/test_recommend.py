"""귀가 방법 비교·경로 테스트. 인원은 모두 가짜 테스트 값이다."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from publish.schema import errors_of  # noqa: E402
from recommend import compare  # noqa: E402

D = "2099-01-10"


def s(expected, baseline, fallback=False):
    r = expected / baseline
    lv = "crowded" if r >= 1.5 else "relaxed" if r < 0.8 else "normal"
    return {"baseline": baseline, "expected": expected, "ratio": r, "level": lv,
            "weekday_fallback": fallback, "effect_unknown": False}


def fake_day():
    """20시 퇴장: 올림픽공원역 20시 혼잡, 21시 보통, 방이역은 늘 보통."""
    return {
        "olympic_park": {19: s(100, 100), 20: s(400, 100), 21: s(120, 100), 22: s(100, 100), 23: None},
        "bangi": {19: s(100, 100), 20: s(110, 100), 21: s(100, 100), 22: s(100, 100), 23: s(90, 100)},
    }


def wrap(name, data):
    return errors_of(name, {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00+09:00", "data": data})


def test_compare_orders_by_level_then_ratio():
    c = compare.compare(fake_day(), 20)
    assert wrap("compare-olympic_park-2099-01-10-20.json", c) == []
    assert [o["id"] for o in c["options"]] == ["walk_bangi", "later_olympic", "now_olympic"]
    assert [o["recommended"] for o in c["options"]] == [True, False, False]
    assert c["headline"] == {"highlight": "방이역", "text": "에서 타면 가장 덜 붐빌 거예요"}
    assert c["condition_label"] == {"to_name": None, "hour_label": "20시대 출발"}
    later = c["options"][1]
    assert (later["board_hour"], later["expected"], later["level"]) == ("21", 120, "normal")


def test_wait_later_can_win_and_last_hour_has_no_wait():
    day = fake_day()
    day["bangi"][20] = s(300, 100)            # 방이역도 혼잡해지면
    c = compare.compare(day, 20)
    assert c["options"][0]["id"] == "later_olympic"
    assert c["headline"] == {"highlight": "21시대", "text": "에 타면 가장 덜 붐빌 거예요"}
    c23 = compare.compare(fake_day(), 23)     # 23시대: 1시간 뒤가 없고, 올림픽공원역 자료 없음
    assert [o["id"] for o in c23["options"]] == ["walk_bangi"]


def test_route_detail():
    r = compare.route(fake_day(), 20, "walk_bangi")
    assert wrap("route-olympic_park-2099-01-10-20-walk_bangi.json", r) == []
    assert [st["type"] for st in r["steps"]] == ["start", "walk", "board"]
    assert r["steps"][2] == {"type": "board", "title": "방이역에서 타기", "detail": "5호선", "exit_no": None, "direction": None}
    assert r["compare"] == {"hour": "20", "items": [{"station_id": "olympic_park", "expected": 400},
                                                    {"station_id": "bangi", "expected": 110}],
                            "note": "20시대 예상: 올림픽공원역 400명, 방이역 110명"}
    assert r["walk_min"] is None and r["last_train_at"] is None and r["map_links"] is None
    later = compare.route(fake_day(), 20, "later_olympic")
    assert later["steps"][2]["title"] == "올림픽공원역에서 21시대에 타기"
    assert compare.route(fake_day(), 23, "later_olympic") is None


def test_build_files_names_and_schema():
    files = compare.build_files(D, fake_day())
    assert "compare-olympic_park-2099-01-10-20.json" in files
    assert "route-olympic_park-2099-01-10-20-walk_bangi.json" in files
    assert "route-olympic_park-2099-01-10-23-later_olympic.json" not in files
    assert all(wrap(name, body) == [] for name, body in files.items())


def test_no_data_hour_is_skipped():
    day = {"olympic_park": {h: None for h in range(19, 24)}, "bangi": {h: None for h in range(19, 24)}}
    assert compare.compare(day, 20) is None
    assert compare.build_files(D, day) == {}
