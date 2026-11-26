"""공연 목록 → 화면용 JSON(data 부분). data-contract 의 calendar, events 스키마를 따른다.

공연장은 원자료에 없어서 venue_id 는 null, 지역은 올림픽공원. 공연장이 없으면 상세 화면을 만들 수 없어 linkable=false.
역 혼잡(nearest_station)은 nearest(공연) 함수가 주면 채운다: 올림픽공원 공연장은 모두 올림픽공원역이 가장 가깝다. 시작 시각은 원자료로 알 수 없어 null.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date as Date, timedelta
from typing import Callable

from .detect import Event

AREA = "olympic_park"
TZ = "+09:00"


def _end_at(ev: Event) -> str:
    day = Date.fromisoformat(ev.date) + timedelta(days=ev.exit_hour // 24)
    return f"{day.isoformat()}T{ev.exit_hour % 24:02d}:00:00{TZ}"


Nearest = Callable[[Event], "str | None"]  # 공연 → 가장 가까운 역의 혼잡 단계 (모르면 None)


def event_item(ev: Event, nearest: Nearest | None = None) -> dict:
    lv = nearest(ev) if nearest else None
    return {
        "id": ev.id, "type": "show", "title": ev.title, "venue_id": None, "area": AREA, "date": ev.date,
        "start_at": None, "end_at": _end_at(ev), "end_at_source": "estimated",
        "status": "scheduled", "change": None, "game_state": None,
        "nearest_station": {"station_id": "olympic_park", "level": lv} if lv else None, "linkable": False,
    }


def events_for_day(events: list[Event], day: str, nearest: Nearest | None = None) -> dict:
    todays = [e for e in events if e.date == day]
    later = [e for e in events if e.date > day]
    nxt = None
    if not todays and later:
        n = later[0]
        nxt = {"id": n.id, "title": n.title, "venue_id": None, "date": n.date}
    return {"date": day, "events": [event_item(e, nearest) for e in todays], "next_event": nxt}


def calendar_for_month(events: list[Event], month: str) -> dict:
    per_day: dict[str, int] = defaultdict(int)
    for e in events:
        if e.date.startswith(month + "-"):
            per_day[e.date] += 1
    days = [{"date": d, "has_show": True, "has_game": False, "count": n,
             "by_venue": {}, "by_area": {AREA: {"show": True}}} for d, n in sorted(per_day.items())]
    return {"month": month, "days": days}


def build_files(events: list[Event], first_day: str, last_day: str, nearest: Nearest | None = None) -> dict[str, dict]:
    """first_day~last_day 의 모든 날 events 파일과 그 달들의 calendar 파일 (data 부분만)."""
    files: dict[str, dict] = {}
    d, end = Date.fromisoformat(first_day), Date.fromisoformat(last_day)
    months: set[str] = set()
    while d <= end:
        files[f"events-{d.isoformat()}.json"] = events_for_day(events, d.isoformat(), nearest)
        months.add(d.isoformat()[:7])
        d += timedelta(days=1)
    for m in sorted(months):
        files[f"calendar-{m}.json"] = calendar_for_month(events, m)
    return files
