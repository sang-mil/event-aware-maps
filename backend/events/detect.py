"""시간대별 공연명 기록 → 공연 목록 (순수 함수, 외부 접속 없음).

입력: (날짜 'YYYY-MM-DD', 시각 0~23, 공연명 원문, 관람객수) 목록. KSPO 연계 데이터에서 공연명이 있는 시간대만.

규칙
- 한 시간대에 공연이 둘이면 원문이 "A\\n, B" 또는 "B, A" 로 합쳐져 온다(2025 실제 데이터).
  "\\n," 로 먼저 나누고, ", " 는 나눈 조각이 모두 '알려진 공연명'일 때만 나눈다.
  (공연명 안의 쉼표, 예: "〈A, B〉" 를 잘못 나누지 않기 위해)
- 퇴장 시간대 = 그날 그 공연명이 나타난 마지막 시간대.
  근거: 2025년 공연 날 136일 중 96일(71%)에서 올림픽공원역(5호선) 승차가 가장 많은 시간대가
  이 마지막 시간대와 같거나 1시간 앞이었다(2026-11 실제 데이터로 확인).
- 관람객수는 그 공연만 표시된 시간대의 값. 늘 다른 공연과 함께 표시되면 모름(None).
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field

Row = tuple[str, int, str, "int | None"]


@dataclass
class Event:
    date: str
    title: str
    hours: list[int] = field(default_factory=list)
    audience: int | None = None

    @property
    def id(self) -> str:
        digest = hashlib.sha1(self.title.encode("utf-8")).hexdigest()[:6]
        return f"evt_{self.date.replace('-', '')}_{digest}"

    @property
    def exit_hour(self) -> int:
        return max(self.hours)


def _clean(title: str) -> str:
    return " ".join(title.split())


def known_titles(rows: list[Row]) -> set[str]:
    """혼자 표시된 공연명 + '\\n,' 로 나뉜 조각."""
    known: set[str] = set()
    for _, _, raw, _ in rows:
        pieces = raw.split("\n,")
        if len(pieces) > 1 or ", " not in raw:
            known.update(_clean(p) for p in pieces if _clean(p))
    return known


def split_titles(raw: str, known: set[str]) -> list[str]:
    out: list[str] = []
    for piece in raw.split("\n,"):
        piece = _clean(piece)
        parts = [_clean(p) for p in piece.split(", ")]
        out.extend(parts if len(parts) > 1 and all(p in known for p in parts) else [piece])
    return [t for t in out if t]


def detect_events(rows: list[Row]) -> list[Event]:
    """날짜·첫 시간대·공연명 순으로 정렬된 공연 목록."""
    known = known_titles(rows)
    events: dict[tuple[str, str], Event] = {}
    alone_audience: dict[tuple[str, str], int] = defaultdict(int)
    for date, hour, raw, audience in rows:
        titles = split_titles(raw, known)
        for title in titles:
            ev = events.setdefault((date, title), Event(date, title))
            if hour not in ev.hours:
                ev.hours.append(hour)
            if len(titles) == 1 and audience:
                alone_audience[(date, title)] = max(alone_audience[(date, title)], audience)
    for key, ev in events.items():
        ev.hours.sort()
        ev.audience = alone_audience.get(key) or None
    return sorted(events.values(), key=lambda e: (e.date, e.hours[0], e.title))
