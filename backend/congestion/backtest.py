"""정직한 검증: 공연 날 하루씩, 그날을 뺀 나머지로 기준선·계수를 만들어 예측하고 실제와 비교한다.

실제 단계 = 실제 승차 ÷ 기준선(그날 제외). 예측 단계 = 예상 ÷ 기준선.
비교용으로 '행사 효과 없이 기준선만' 쓴 경우(늘 비율 1 = 보통)의 적중률도 함께 낸다.
"""

from __future__ import annotations

from collections import Counter

from .model import Baselines, coefficients, level, predict, residuals, station_ratio

HOURS = range(19, 24)


def run(obs: dict, covered: set[str], exits: dict, stations: list[str]) -> dict:
    base = Baselines(obs, covered, exits)
    res = residuals(obs, exits, base)
    lines = {sid: [k for k in obs if k[0] == sid] for sid in stations}
    hits = Counter()
    naive_hits = Counter()
    total = Counter()
    confusion = Counter()
    abs_err: list[float] = []
    for d in sorted(exits):
        if d not in covered:
            continue
        coefs = coefficients(res, exclude=d)
        for sid in stations:
            for hour in HOURS:
                parts = []
                for key in lines[sid]:
                    p = predict(d, key, hour, exits, base, coefs, exclude=d)
                    p["actual"] = obs[key].get((d, hour))
                    parts.append(p)
                pred, actual = station_ratio(parts), station_ratio(parts, "actual")
                if pred is None or actual is None:
                    continue
                pl, al = level(pred), level(actual)
                total[sid] += 1
                hits[sid] += pl == al
                naive_hits[sid] += al == "normal"
                confusion[(al, pl)] += 1
                abs_err.append(abs(sum(p["expected"] for p in parts) - sum(p["actual"] for p in parts)))
    return _result(hits, naive_hits, total, confusion, abs_err, exits, covered, stations)


def run_as_of(
    obs: dict,
    covered: set[str],
    exits: dict,
    stations: list[str],
    through: str | None = None,
) -> dict:
    """날짜순 검증: 각 예측일에는 그 날짜보다 앞선 기록만 학습에 쓴다.

    `through`는 검증할 마지막 날짜(포함)이며, 테스트·부분 재현에 쓸 수 있다.
    해당 날짜의 공연 종료·관객 기록은 예측 입력으로 사용하고, 그날의 승차 실측은 정답으로만 쓴다.
    """
    hits = Counter()
    naive_hits = Counter()
    total = Counter()
    confusion = Counter()
    abs_err: list[float] = []
    scored_days: set[str] = set()
    lines = {sid: [k for k in obs if k[0] == sid] for sid in stations}

    for d in sorted(exits):
        if d not in covered or (through is not None and d > through):
            continue
        base = Baselines(obs, covered, exits, as_of=d)
        res = residuals(obs, exits, base, as_of=d)
        coefs = coefficients(res)
        target_exits = {d: exits[d]}
        day_scored = False
        for sid in stations:
            for hour in HOURS:
                parts = []
                for key in lines[sid]:
                    p = predict(d, key, hour, target_exits, base, coefs)
                    p["actual"] = obs[key].get((d, hour))
                    parts.append(p)
                pred, actual = station_ratio(parts), station_ratio(parts, "actual")
                if pred is None or actual is None:
                    continue
                pl, al = level(pred), level(actual)
                total[sid] += 1
                hits[sid] += pl == al
                naive_hits[sid] += al == "normal"
                confusion[(al, pl)] += 1
                abs_err.append(abs(sum(p["expected"] for p in parts) - sum(p["actual"] for p in parts)))
                day_scored = True
        if day_scored:
            scored_days.add(d)

    result = _result(hits, naive_hits, total, confusion, abs_err, exits, covered, stations)
    result["validation"] = "as_of"
    result["days"] = len(scored_days)
    result["first_scored_day"] = min(scored_days) if scored_days else None
    result["last_scored_day"] = max(scored_days) if scored_days else None
    return result


def _result(hits: Counter, naive_hits: Counter, total: Counter, confusion: Counter,
            abs_err: list[float], exits: dict, covered: set[str], stations: list[str]) -> dict:
    n = sum(total.values())
    said_crowded = sum(v for (a, p), v in confusion.items() if p == "crowded")
    was_crowded = sum(v for (a, p), v in confusion.items() if a == "crowded")
    both = confusion[("crowded", "crowded")]
    return {
        "crowded_precision": both / said_crowded if said_crowded else None,  # '혼잡'이라 했을 때 실제로 혼잡했던 비율
        "crowded_recall": both / was_crowded if was_crowded else None,       # 실제 혼잡 중 미리 '혼잡'이라 한 비율
        "days": sum(1 for d in exits if d in covered),
        "cases": n,
        "accuracy": sum(hits.values()) / n if n else None,
        "naive_accuracy": sum(naive_hits.values()) / n if n else None,
        "by_station": {s: (hits[s] / total[s], naive_hits[s] / total[s], total[s]) for s in stations if total[s]},
        "confusion": dict(confusion),
        "median_abs_error": sorted(abs_err)[len(abs_err) // 2] if abs_err else None,
    }
