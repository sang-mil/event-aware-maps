"""행사 상세 → event-{id}.json (data 부분). data-contract 의 event 스키마를 따른다.

- after_end.end: 끝나는 시간대(추정)의 가까운 역(올림픽공원역, 방이역) 혼잡 예상
- after_end.later: 그다음 시간대 (23시대 다음은 없음)
- 예상이 있는 시간대(19~23시) 밖에서 끝나는 공연은 역 단계를 no_data 로 두고 no_data_message 로 밝힌다.
- same_day: 같은 날 다른 공연. crossing_note: 판단 근거 자료가 없어 null.
"""

from __future__ import annotations

from congestion.outputs import HOURS, slot_message

from .detect import Event
from .outputs import event_item

NEARBY = ["olympic_park", "bangi"]  # 올림픽공원 공연장의 가까운 역 (backend/reference/venues.json)


def _block(day: dict, hour: int) -> dict:
    stations = []
    for sid in NEARBY:
        s = day[sid].get(hour) if hour in HOURS else None
        stations.append({"station_id": sid, "level": s["level"] if s else "no_data",
                         "message": slot_message(s) if s else None, "walk_min": None})
    return {"hour_label": f"{hour}~{hour + 1}시 예상", "stations": stations}


def event_detail(ev: Event, same_day: list[Event], day: dict, nearest) -> dict:
    exit_h = ev.exit_hour
    after_end: dict = {"end": _block(day, exit_h)}
    if exit_h + 1 in HOURS:
        after_end["later"] = _block(day, exit_h + 1)
    if exit_h not in HOURS:
        after_end["no_data_message"] = f"{exit_h}시대는 혼잡 예상 정보가 없어요. 예상은 19~23시만 제공해요."
    return {
        **event_item(ev, nearest, linkable=True),
        "after_end": after_end,
        "same_day": [{"id": o.id, "title": o.title, "venue_id": None, "start_at": None,
                      "end_at": event_item(o)["end_at"], "end_at_source": "estimated", "type": "show"} for o in same_day if o.id != ev.id],
        "crossing_note": None,
    }
