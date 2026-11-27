"""공연 목록 → 화면용 JSON(data 부분). data-contract 의 calendar, events 스키마를 따른다.

KSPO 기록 공연은 공연장·시작 시각이 원자료에 없어 null. KOPIS 공연은 공연장·시작 시각·지역을 채운다.
linkable 은 행사 상세(event-{id}.json)를 함께 발행할 때 true.
역 혼잡(nearest_station)은 nearest(공연) 함수가 주면 채운다: 올림픽공원 공연장은 모두 올림픽공원역이 가장 가깝다.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date as Date, timedelta
from typing import Callable

from .detect import Event

AREA = "olympic_park"
TZ = "+09:00"


import reference

_VENUE_NEAREST = {v["id"]: (v["nearby_stations"][0]["station_id"] if v["nearby_stations"] else None)
                  for v in reference.venues()}


def nearest_station_id(ev: Event) -> str | None:
    """공연장을 알면 공연장 목록의 첫 번째 가까운 역. 모르면 올림픽공원 공연만 올림픽공원역
    (올림픽공원 공연장은 모두 올림픽공원역이 가장 가깝다). 그 밖(잠실, 가까운 역 자료 없는 공연장)은 None."""
    if ev.venue_id:
        return _VENUE_NEAREST.get(ev.venue_id)
    return "olympic_park" if ev.area == "olympic_park" else None


def _end_at(ev: Event) -> str | None:
    if ev.end_at:
        return ev.end_at
    if ev.exit_hour is None:
        return None
    day = Date.fromisoformat(ev.date) + timedelta(days=ev.exit_hour // 24)
    return f"{day.isoformat()}T{ev.exit_hour % 24:02d}:00:00{TZ}"


Nearest = Callable[[Event], "str | None"]  # 공연 → 가장 가까운 역의 혼잡 단계 (모르면 None)


def event_item(ev: Event, nearest: Nearest | None = None, linkable: bool = False) -> dict:
    lv = nearest(ev) if nearest else None
    end_at = _end_at(ev)
    station = nearest_station_id(ev)
    return {
        "id": ev.id, "type": "show", "title": ev.title, "venue_id": ev.venue_id, "area": ev.area, "date": ev.date,
        "start_at": ev.start_at, "end_at": end_at, "end_at_source": "estimated" if end_at else None,
        "status": "scheduled", "change": None, "game_state": None,
        "nearest_station": {"station_id": station, "level": lv} if lv and station else None, "linkable": linkable,
    }


def events_for_day(events: list[Event], day: str, nearest: Nearest | None = None, linkable: bool = False) -> dict:
    todays = [e for e in events if e.date == day]
    later = [e for e in events if e.date > day]
    nxt = None
    if not todays and later:
        n = later[0]
        nxt = {"id": n.id, "title": n.title, "venue_id": n.venue_id, "date": n.date}
    return {"date": day, "events": [event_item(e, nearest, linkable) for e in todays], "next_event": nxt}


def calendar_for_month(events: list[Event], month: str) -> dict:
    per_day: dict[str, list[Event]] = defaultdict(list)
    for e in events:
        if e.date.startswith(month + "-"):
            per_day[e.date].append(e)
    days = [{"date": d, "has_show": True, "has_game": False, "count": len(evs),
             "by_venue": {e.venue_id: {"show": True} for e in evs if e.venue_id},
             "by_area": {e.area: {"show": True} for e in evs}} for d, evs in sorted(per_day.items())]
    return {"month": month, "days": days}


def build_files(events: list[Event], first_day: str, last_day: str, nearest: Nearest | None = None,
                linkable: bool = False) -> dict[str, dict]:
    """first_day~last_day 의 모든 날 events 파일과 그 달들의 calendar 파일 (data 부분만)."""
    files: dict[str, dict] = {}
    d, end = Date.fromisoformat(first_day), Date.fromisoformat(last_day)
    months: set[str] = set()
    while d <= end:
        files[f"events-{d.isoformat()}.json"] = events_for_day(events, d.isoformat(), nearest, linkable)
        months.add(d.isoformat()[:7])
        d += timedelta(days=1)
    for m in sorted(months):
        files[f"calendar-{m}.json"] = calendar_for_month(events, m)
    return files
