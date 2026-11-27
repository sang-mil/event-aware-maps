"""공연 기록이 없는 날의 관측 혼잡 후보를 찾는다.

KSPO 기록이 있는 날짜 중 감지된 공연이 없는 날짜를 대상으로, 같은 요일·시각의
평소 승차 중앙값보다 실제 승차가 기준 비율 이상인 역·시각을 표시한다.
이 결과는 '원인 미상 혼잡 후보'이며, 실제 원인을 단정하지 않는다.
"""

from __future__ import annotations

from .model import Baselines, Key, weekday


def find_non_event_anomalies(
    obs: dict[Key, dict],
    covered: set[str],
    exits: dict,
    base: Baselines,
    stations: list[str],
    hours: range = range(16, 24),
    min_ratio: float = 1.5,
    as_of: str | None = None,
) -> list[dict]:
    """공연 없는 날짜에서 기준선보다 높은 역·시각 관측을 반환한다.

    날짜별로 그 날짜를 기준선 계산에서 빼며, 노선별 승차 인원을 역 단위로 합친다.
    공연 기록 자체가 없는 날짜는 공연 유무를 알 수 없으므로 분석 대상에서 제외한다.
    """
    station_keys = {sid: [key for key in obs if key[0] == sid] for sid in stations}
    anomalies = []
    for d in sorted(covered):
        if as_of and d >= as_of:
            continue
        if exits.get(d):
            continue
        wd = weekday(d)
        for sid in stations:
            keys = station_keys[sid]
            if not keys:
                continue
            for hour in hours:
                actual_values = [obs[key].get((d, hour)) for key in keys]
                if any(value is None for value in actual_values):
                    continue
                actual = sum(actual_values)
                baselines = [base.get(key, wd, hour, exclude=d)[0] for key in keys]
                if any(value is None for value in baselines):
                    continue
                baseline = sum(baselines)
                if baseline <= 0:
                    continue
                ratio = actual / baseline
                if ratio >= min_ratio:
                    anomalies.append({
                        "date": d,
                        "station_id": sid,
                        "hour": hour,
                        "actual": actual,
                        "baseline": baseline,
                        "ratio": ratio,
                    })
    return anomalies
