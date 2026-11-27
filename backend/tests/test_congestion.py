"""혼잡 계산 테스트. 승차 인원·관객 수는 모두 가짜 테스트 값이다."""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from congestion import anomalies, backtest, model  # noqa: E402

KEY = ("olympic_park", "5")


def make_world(weeks: int = 30):
    """가짜 세상: 평일 20시 100명. 토요일마다 공연(관객 1000명, 20시 퇴장) → 20시 승차 100 + 300."""
    obs, covered, exits = {KEY: {}}, set(), {}
    start = date(2099, 1, 5)  # 월요일
    for i in range(weeks * 7):
        d = (start + timedelta(days=i)).isoformat()
        covered.add(d)
        is_sat = (start + timedelta(days=i)).weekday() == 5
        for h in (18, 19, 20, 21, 22):
            obs[KEY][(d, h)] = 100 + (300 if is_sat and h == 20 else 0)
        if is_sat:
            exits[d] = [(20, 1000)]
    return obs, covered, exits


@pytest.mark.parametrize("ratio,expected", [(None, "no_data"), (0.79, "relaxed"), (0.8, "normal"), (1.49, "normal"), (1.5, "crowded")])
def test_level_thresholds(ratio, expected):
    assert model.level(ratio) == expected


def test_baseline_uses_weekday_or_falls_back_to_mon_thu():
    obs, covered, exits = make_world()
    base = model.Baselines(obs, covered, exits)
    assert base.get(KEY, 1, 20) == (100, "weekday")        # 화요일: 표본 30개
    assert base.get(KEY, 5, 20) == (100, "mon_thu")        # 토요일 20시는 늘 퇴장 시각 → 월~목으로 대신
    assert base.get(KEY, 1, 3) == (None, None)             # 표본 없음


def test_baseline_ignores_hours_near_exits_and_uncovered_days():
    obs, covered, exits = make_world()
    base = model.Baselines(obs, covered, exits)
    sat_samples = base.samples.get((KEY, 5, 20), [])
    assert sat_samples == []                               # 퇴장 ±2시간은 기준선에서 뺌
    covered.clear()
    assert model.Baselines(obs, covered, exits).get(KEY, 1, 20) == (None, None)


def test_as_of_uses_only_earlier_days():
    obs, covered, exits = make_world()
    early = model.Baselines(obs, covered, exits, as_of="2099-01-20")
    assert all(d < "2099-01-20" for samples in early.samples.values() for d, _ in samples)
    res = model.residuals(obs, exits, model.Baselines(obs, covered, exits), as_of="2099-02-01")
    assert all(d < "2099-02-01" for d, _ in res[(KEY, 0)])


def test_coefficient_and_prediction():
    obs, covered, exits = make_world()
    base = model.Baselines(obs, covered, exits)
    coefs = model.coefficients(model.residuals(obs, exits, base))
    assert coefs[(KEY, 0)] == pytest.approx(0.3)           # (400-100)/1000
    assert coefs[(KEY, -1)] == pytest.approx(0.0)
    sat = "2099-01-10"
    p = model.predict(sat, KEY, 20, exits, base, coefs)
    assert p["expected"] == pytest.approx(400) and p["source"] == "mon_thu"
    assert model.level(model.station_ratio([p])) == "crowded"
    p_unknown = model.predict(sat, KEY, 20, {sat: [(20, None)]}, base, coefs)
    assert p_unknown["expected"] == 100 and p_unknown["effect_unknown"] is True


def test_overlapping_exits_are_not_used_for_coefficients():
    obs, covered, exits = make_world()
    exits["2099-01-10"] = [(20, 1000), (21, 500)]          # 퇴장이 겹치는 날은 학습에서 뺌
    base = model.Baselines(obs, covered, exits)
    res = model.residuals(obs, exits, base)
    assert "2099-01-10" not in {d for d, _ in res[(KEY, 0)]}


def test_backtest_leave_one_out_on_fake_world():
    obs, covered, exits = make_world()
    r = backtest.run(obs, covered, exits, ["olympic_park"])
    assert r["days"] == 30 and r["cases"] == 30 * 4        # 19~22시 (가짜 세상에 23시 자료 없음)
    assert r["accuracy"] == 1.0                            # 규칙대로 만든 가짜 세상이라 모두 맞음
    assert r["crowded_recall"] == 1.0
    assert r["naive_accuracy"] == pytest.approx(3 / 4)     # 기준선만 쓰면 퇴장 시각을 놓침


def test_backtest_as_of_never_uses_records_after_the_prediction_date():
    obs, covered, exits = make_world(12)
    cutoff = "2099-03-20"
    before = backtest.run_as_of(obs, covered, exits, ["olympic_park"], through=cutoff)

    changed_obs = {key: dict(series) for key, series in obs.items()}
    for key, series in changed_obs.items():
        for point in list(series):
            d, hour = point
            if d > cutoff:
                series[point] += 100_000
    changed_exits = {
        d: [(hour, None if audience is None else audience * 100) for hour, audience in events]
        for d, events in exits.items()
    }
    after = backtest.run_as_of(changed_obs, covered, changed_exits, ["olympic_park"], through=cutoff)

    assert before["validation"] == "as_of"
    assert before["cases"] > 0
    assert before["first_scored_day"] == after["first_scored_day"]
    assert before["last_scored_day"] == after["last_scored_day"]
    assert before["accuracy"] == after["accuracy"]
    assert before["median_abs_error"] == after["median_abs_error"]


def test_non_event_anomalies_find_spikes_without_calling_them_events():
    obs, covered, exits = make_world()
    second = ("bangi", "5")
    obs[second] = {point: 100 for point in obs[KEY]}
    spike_day = "2099-01-06"  # 공연 기록 없는 수요일
    obs[KEY][(spike_day, 20)] = 200
    obs[second][(spike_day, 20)] = 180
    base = model.Baselines(obs, covered, exits)

    findings = anomalies.find_non_event_anomalies(
        obs, covered, exits, base, ["olympic_park", "bangi"], hours=range(20, 21)
    )

    assert {(item["date"], item["station_id"]) for item in findings} == {
        (spike_day, "olympic_park"), (spike_day, "bangi")
    }
    assert all(item["ratio"] >= 1.5 for item in findings)

    history_base = model.Baselines(obs, covered, exits, as_of=spike_day)
    history_only = anomalies.find_non_event_anomalies(
        obs, covered, exits, history_base, ["olympic_park", "bangi"],
        hours=range(20, 21), as_of=spike_day,
    )
    assert all(item["date"] < spike_day for item in history_only)
