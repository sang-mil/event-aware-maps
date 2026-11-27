"""길 안내 분배: 모두가 같은 1순위로 몰리지 않도록 선택지마다 '나눠 안내할 비율'을 준다 (순수 함수).

기준 (설계 결정이며, 효과를 수치로 주장하지 않는다. 틈길 사용자가 관객 중 몇 명인지 모른다)
- 남는 여유 = max(0, 혼잡 기준(평소의 1.5배, PRD DR-4) × 평소 인원 − 예상 인원)
  = '혼잡'이 되기 전까지 더 받을 수 있는 인원. 비율은 남는 여유에 비례한다.
- 모든 선택지가 이미 혼잡이면(남는 여유 0) 덜 붐비는 쪽에 더 주도록 1/배수에 비례한다.
- 출발 공연장에서 그 역까지 걸어서 MAX_WALK_MIN 분을 넘는 선택지는 그 공연장 기준 비율 0 (카카오 도보 경로 기준).
- 1·2순위가 같은 단계이고 배수 차이가 SIMILAR_RATIO_GAP 이하이면 similar = True (어느 쪽도 괜찮다는 뜻).
"""

from __future__ import annotations

from congestion.model import CROWDED

MAX_WALK_MIN = 20        # 사용자 승인 대기 중인 기준. 바꾸려면 이 값만 고친다
SIMILAR_RATIO_GAP = 0.1


def headroom(s: dict) -> float:
    return max(0.0, CROWDED * s["baseline"] - s["expected"])


def shares(opts: list[dict], allowed: list[bool] | None = None) -> list[float]:
    """opts: options() 결과(각각 's' 에 예상 정보). allowed: 선택지별 포함 여부(도보 기준). 합이 1인 비율."""
    allowed = allowed or [True] * len(opts)
    room = [headroom(o["s"]) if ok else 0.0 for o, ok in zip(opts, allowed)]
    if sum(room) <= 0:
        room = [1.0 / o["s"]["ratio"] if ok and o["s"]["ratio"] > 0 else 0.0 for o, ok in zip(opts, allowed)]
    total = sum(room)
    if total <= 0:
        return [0.0] * len(opts)
    raw = [r / total for r in room]
    rounded = [round(x, 2) for x in raw]
    i = max(range(len(raw)), key=lambda k: raw[k])
    rounded[i] = round(rounded[i] + 1 - sum(rounded), 2)   # 반올림 뒤 합을 정확히 1로
    return rounded


def shares_by_venue(opts: list[dict], walk_by_option: list[dict]) -> dict[str, list[float]]:
    """출발 공연장별 비율. walk_by_option[i] = 그 선택지의 walk_by_venue."""
    venues = sorted({v for w in walk_by_option for v in w})
    out = {}
    for v in venues:
        allowed = [v in w and w[v]["walk_min"] <= MAX_WALK_MIN for w in walk_by_option]
        if any(allowed):
            out[v] = shares(opts, allowed)
    return out


def similar(opts: list[dict]) -> bool:
    if len(opts) < 2:
        return False
    a, b = opts[0]["s"], opts[1]["s"]
    return a["level"] == b["level"] and abs(a["ratio"] - b["ratio"]) <= SIMILAR_RATIO_GAP
