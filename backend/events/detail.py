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

import reference

NEARBY = {"olympic_park": ["olympic_park", "bangi"], "jamsil": ["sports_complex", "jamsil_saenae"]}  # venues.json 의 가까운 역


def _nearby(ev: Event) -> list[str]:
    if ev.venue_id:
        for v in reference.venues():
            if v["id"] == ev.venue_id and v["nearby_stations"]:
                return [n["station_id"] for n in v["nearby_stations"]]
    return NEARBY.get(ev.area, [])


def _block(day: dict, hour: int | None, stations_ids: list[str], unmodeled: bool = False,
           walks: dict | None = None) -> dict:
    """unmodeled: 이 지역 공연의 행사 효과를 학습하지 못해(잠실) 예상에 공연 영향이 빠져 있음 → uncertain."""
    stations = []
    for sid in stations_ids:
        s = day[sid].get(hour) if hour in HOURS else None
        stations.append({"station_id": sid, "level": s["level"] if s else "no_data",
                         "message": slot_message(s) if s else None, "walk_min": (walks or {}).get(sid),
                         "uncertain": bool(s and (s["effect_unknown"] or unmodeled))})
    return {"hour_label": f"{hour}~{hour + 1}시 예상" if hour is not None else None, "stations": stations}


def event_detail(ev: Event, same_day: list[Event], day: dict, nearest, walk: dict | None = None) -> dict:
    """walk: 카카오 도보 경로 표 {(공연장, 역): {...}}. 공연장을 아는 공연만 역까지 도보 시간을 채운다."""
    exit_h = ev.exit_hour
    near = _nearby(ev)
    unmodeled = ev.area != "olympic_park"
    walks = {sid: w["walk_min"] for (v, sid), w in (walk or {}).items() if ev.venue_id and v == ev.venue_id}
    after_end: dict = {"end": _block(day, exit_h, near, unmodeled, walks)}
    if exit_h is None:
        after_end["no_data_message"] = "공연 시간 정보가 없어 끝나는 시각과 혼잡 예상을 알 수 없어요."
    else:
        if exit_h + 1 in HOURS:
            after_end["later"] = _block(day, exit_h + 1, near, unmodeled, walks)
        if exit_h not in HOURS:
            after_end["no_data_message"] = f"{exit_h}시대는 혼잡 예상 정보가 없어요. 예상은 19~23시만 제공해요."
    return {
        **event_item(ev, nearest, linkable=True),
        "after_end": after_end,
        "same_day": [{"id": o.id, "title": o.title, "venue_id": o.venue_id, "start_at": o.start_at,
                      "end_at": event_item(o)["end_at"], "end_at_source": "estimated" if event_item(o)["end_at"] else None,
                      "type": "show"} for o in same_day if o.id != ev.id],
        "crossing_note": None,
    }
