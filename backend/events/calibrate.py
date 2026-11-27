"""객석 대비 관객 비율 계산 (순수 함수).

2025년 같은 날 열린 공연을 KOPIS(공연장·객석 수)와 KSPO 연계 데이터(실제 관람객수)에서 짝지어
비율 = KSPO 관람객수 ÷ KOPIS 공연장 객석 수 를 구하고, 공연장별·전체 중앙값을 낸다.
짝짓기: 같은 날짜 + 제목이 충분히 겹침(아래 similar). 애매하면 쓰지 않는다.
"""

from __future__ import annotations

import re
import statistics
from collections import defaultdict

from .detect import Event

MIN_OVERLAP = 0.6
MIN_PER_VENUE = 5


# 공연 제목에 흔히 붙어 서로 다른 공연을 이어 붙이게 만드는 말 (2025 짝짓기 검토에서 확인: GFRIEND ↔ I.M WORLD TOUR)
STOPWORDS = {"concert", "tour", "world", "fan", "con", "live", "in", "the", "of", "seoul", "special", "encore",
             "asia", "final", "show", "2024", "2025", "2026", "콘서트", "단독", "공연", "전국투어", "서울", "팬콘서트", "앙코르"}


def _tokens(title: str) -> set[str]:
    t = re.sub(r"\[[^\]]*\]", " ", title.lower())          # [서울] 같은 지역 표시 제거
    t = re.sub(r"[^0-9a-z가-힣]+", " ", t)
    return {w for w in t.split() if len(w) >= 2 and w not in STOPWORDS}


def similar(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def match(kspo: list[Event], kopis_seats: list[Event]) -> list[dict]:
    """kopis_seats: audience 자리에 객석 수가 들어 있는 KOPIS 회차(fill='*':1.0 으로 만든 것)."""
    by_date: dict[str, list[Event]] = defaultdict(list)
    for e in kopis_seats:
        if e.audience and e.venue_id:
            by_date[e.date].append(e)
    pairs, used = [], set()
    for k in kspo:
        if not k.audience:
            continue
        best = max(by_date.get(k.date, []), key=lambda e: similar(k.title, e.title), default=None)
        if best is None or similar(k.title, best.title) < MIN_OVERLAP or (k.date, best.venue_id, k.title) in used:
            continue
        used.add((k.date, best.venue_id, k.title))
        pairs.append({"date": k.date, "kspo_title": k.title, "kopis_title": best.title, "venue_id": best.venue_id,
                      "audience": k.audience, "seats": best.audience, "ratio": k.audience / best.audience})
    return pairs


def ratios(pairs: list[dict]) -> dict:
    by_venue: dict[str, list[float]] = defaultdict(list)
    for p in pairs:
        by_venue[p["venue_id"]].append(p["ratio"])
    out = {"*": round(statistics.median([p["ratio"] for p in pairs]), 3) if pairs else None}
    detail = {"*": len(pairs)}
    for v, xs in sorted(by_venue.items()):
        detail[v] = len(xs)
        if len(xs) >= MIN_PER_VENUE:
            out[v] = round(statistics.median(xs), 3)
    return {"ratio": out, "samples": detail}
