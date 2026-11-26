"""혼잡 계산 (순수 함수, 외부 접속 없음).

용어
- 관측(obs): {(역, 노선): {(날짜, 시각): 승차 인원}}
- 기록 있는 날(covered): KSPO 시간대별 기록이 있는 날. 이 날만 "공연이 있었는지"를 안다.
- 퇴장(exits): {날짜: [(끝나는 시간대, 관객 수 또는 None), ...]}

기준선 (DR-1, 2-4 계획대로 조정)
  같은 요일·시간대 중 "기록 있는 날이면서 그 시각 ±CLEAN_GAP 시간 안에 퇴장이 없는" 날의 승차 중앙값.
  같은 요일 표본이 MIN_SAMPLES 미만이면 월~목 표본 중앙값으로 대신한다(2025년 토 1일·일 0일뿐이라서).
행사 효과 (DR-2)
  퇴장 시간대 기준 OFFSETS 시간마다 "관객 1명당 평소보다 더 탄 인원"의 중앙값(계수).
  다른 공연과 퇴장이 겹치지 않고 관객 수를 아는 공연만으로 구한다.
예상 (DR-3) = 기준선 + Σ(관객 수 × 계수),  단계 (DR-4) = 예상 ÷ 기준선 비율로 판정.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date as Date

CLEAN_GAP = 2
MIN_SAMPLES = 20
MON_THU = (0, 1, 2, 3)
OFFSETS = (-2, -1, 0, 1)
CROWDED, RELAXED = 1.5, 0.8
EFFECT_MIN = 0.01  # 관객 1명당 0.01명(관객 1만 명이면 100명) 미만이면 공연 영향이 없는 역으로 본다

Key = tuple[str, str]  # (역 id, 노선)


def weekday(d: str) -> int:
    return Date.fromisoformat(d).weekday()


def level(ratio: float | None) -> str:
    if ratio is None:
        return "no_data"
    return "crowded" if ratio >= CROWDED else "relaxed" if ratio < RELAXED else "normal"


def is_clean(d: str, hour: int, covered: set[str], exits: dict) -> bool:
    return d in covered and all(abs(h - hour) > CLEAN_GAP for h, _ in exits.get(d, ()))


class Baselines:
    """기준선 표본을 (역, 노선, 요일, 시각)별로 미리 모아 두고, 특정 날을 빼고 중앙값을 낸다."""

    def __init__(self, obs: dict[Key, dict], covered: set[str], exits: dict, as_of: str | None = None):
        """as_of('YYYY-MM-DD')가 있으면 그 날 이전 자료만 쓴다(그 시점에 알 수 있던 것만)."""
        self.samples: dict[tuple, list[tuple[str, int]]] = defaultdict(list)
        for key, series in obs.items():
            for (d, h), v in series.items():
                if as_of and d >= as_of:
                    continue
                if v is not None and is_clean(d, h, covered, exits):
                    self.samples[(key, weekday(d), h)].append((d, v))

    def get(self, key: Key, wd: int, hour: int, exclude: str | None = None) -> tuple[float | None, str | None]:
        """→ (기준선, 출처 'weekday' | 'mon_thu' | None)"""
        same = [v for d, v in self.samples.get((key, wd, hour), ()) if d != exclude]
        if len(same) >= MIN_SAMPLES:
            return statistics.median(same), "weekday"
        pooled = [v for w in MON_THU for d, v in self.samples.get((key, w, hour), ()) if d != exclude]
        if len(pooled) >= MIN_SAMPLES:
            return statistics.median(pooled), "mon_thu"
        return None, None


def residuals(obs: dict[Key, dict], exits: dict, base: Baselines, as_of: str | None = None) -> dict[tuple, list[tuple[str, float]]]:
    """계수 학습용: {(역, 노선, 오프셋): [(날짜, (승차-기준선)/관객), ...]}. 퇴장이 겹치지 않는 공연만.
    as_of 가 있으면 그 날 이전 공연만 쓴다."""
    out: dict[tuple, list[tuple[str, float]]] = defaultdict(list)
    for d, evs in exits.items():
        if as_of and d >= as_of:
            continue
        for exit_h, audience in evs:
            if not audience or any(abs(h - exit_h) <= CLEAN_GAP + 1 for h, _ in evs if h != exit_h) or \
                    sum(1 for h, _ in evs if h == exit_h) > 1:
                continue
            for key, series in obs.items():
                for off in OFFSETS:
                    v = series.get((d, exit_h + off))
                    b, _ = base.get(key, weekday(d), exit_h + off)
                    if v is not None and b is not None:
                        out[(key, off)].append((d, (v - b) / audience))
    return out


def coefficients(res: dict[tuple, list[tuple[str, float]]], exclude: str | None = None) -> dict[tuple, float]:
    coefs = {}
    for k, vals in res.items():
        xs = [x for d, x in vals if d != exclude]
        if xs:
            coefs[k] = statistics.median(xs)
    return coefs


def predict(d: str, key: Key, hour: int, exits: dict, base: Baselines, coefs: dict, exclude: str | None = None) -> dict:
    """한 역·노선·시각의 예상.
    effect_unknown: 관객 수를 모르는 공연의 퇴장이 이 시각 근처에 있고, 이 역이 공연 영향을 받는 역일 때
    (계수가 관객 1명당 EFFECT_MIN 명 이상)."""
    b, source = base.get(key, weekday(d), hour, exclude)
    if b is None:
        return {"baseline": None, "expected": None, "source": None, "effect_unknown": False}
    add, unknown = 0.0, False
    for exit_h, audience in exits.get(d, ()):
        off = hour - exit_h
        if off in OFFSETS:
            if audience:
                add += audience * coefs.get((key, off), 0.0)
            elif coefs.get((key, off), 0.0) >= EFFECT_MIN:
                unknown = True
    return {"baseline": b, "expected": max(b + add, 0.0), "source": source, "effect_unknown": unknown}


def station_ratio(parts: list[dict], field: str = "expected") -> float | None:
    """한 역의 여러 노선을 합쳐 (합계 ÷ 기준선 합계). 하나라도 모르면 None."""
    if not parts or any(p[field] is None or p["baseline"] is None for p in parts):
        return None
    total_base = sum(p["baseline"] for p in parts)
    return sum(p[field] for p in parts) / total_base if total_base > 0 else None
