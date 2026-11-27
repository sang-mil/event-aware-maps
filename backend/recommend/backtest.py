"""추천 1순위가 실제 관측으로도 가장 덜 붐볐는지 날짜순으로 검증한다."""

from __future__ import annotations

from collections import Counter

from congestion import outputs
from congestion.model import Baselines, level, residuals, weekday
from . import compare as recommendation


def run(
    obs: dict,
    covered: set[str],
    exits: dict,
    stations: list[str] | None = None,
    through: str | None = None,
) -> dict:
    """각 날짜의 이전 자료만 학습에 사용하고, 예측 후보의 실제 승차로 1순위를 채점한다.

    실제 최선은 추천 로직과 같은 단계→기준선 대비 비율→실제 승차 인원 순으로 정한다.
    예측과 실제 양쪽에 관측값이 있는 선택지만 비교해 자료 누락으로 인한 가짜 실패를 막는다.
    """
    stations = stations or [recommendation.NEAREST, recommendation.OTHER]
    lines = {sid: [key for key in obs if key[0] == sid] for sid in stations}
    checked = correct = 0
    by_option: Counter = Counter()

    for day in sorted(exits):
        if day not in covered or (through is not None and day > through):
            continue
        base = Baselines(obs, covered, exits, as_of=day)
        res = residuals(obs, exits, base, as_of=day)
        predicted_day = outputs.compute_day(day, obs, exits, base, res)
        actual_day: dict = {sid: {} for sid in stations}
        for sid in stations:
            for hour in outputs.HOURS:
                parts = []
                for key in lines[sid]:
                    baseline, _ = base.get(key, weekday(day), hour)
                    actual = obs[key].get((day, hour))
                    parts.append((baseline, actual))
                if not parts or any(b is None or value is None for b, value in parts):
                    actual_day[sid][hour] = None
                    continue
                baseline_total = sum(b for b, _ in parts)
                actual_total = sum(value for _, value in parts)
                ratio = actual_total / baseline_total if baseline_total else None
                actual_day[sid][hour] = {
                    "baseline": baseline_total,
                    "expected": actual_total,
                    "ratio": ratio,
                    "level": level(ratio),
                }

        for hour in outputs.HOURS:
            predicted = recommendation.options(predicted_day, hour)
            actual = recommendation.options(actual_day, hour)
            actual_by_id = {item["id"]: item for item in actual}
            shared = [item for item in predicted if item["id"] in actual_by_id]
            if not shared:
                continue
            predicted_best = shared[0]["id"]
            actual_best = min(
                (actual_by_id[item["id"]] for item in shared),
                key=lambda item: (
                    recommendation._ORDER[item["s"]["level"]],
                    item["s"]["ratio"],
                    item["s"]["expected"],
                ),
            )["id"]
            checked += 1
            correct += predicted_best == actual_best
            by_option[predicted_best] += 1

    return {
        "validation": "as_of",
        "cases": checked,
        "correct": correct,
        "accuracy": correct / checked if checked else None,
        "recommended_options": dict(by_option),
    }
