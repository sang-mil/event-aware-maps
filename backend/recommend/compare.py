"""귀가 방법 비교(compare)와 경로 상세(route) → 화면용 JSON(data 부분). 순수 함수.

출발지는 지역 하나(올림픽공원)로 둔다(2-5 결정 A): 원자료에 공연장이 없어 올림픽공원 공연장 6곳의 결과가 같기 때문.
가까운 역은 프런트 목업 venues 의 올림픽공원 공연장 nearby_stations(올림픽공원역, 방이역)를 따른다.
선택지
- now_olympic   (board_now)     올림픽공원역에서 그 시간대에 타기
- later_olympic (wait_later)    올림픽공원역에서 1시간 뒤에 타기 (23시대는 없음)
- walk_bangi    (walk_to_other) 방이역까지 걸어가서 타기
순서: 단계(여유<보통<혼잡) → 배수 → 예상 인원. 첫째가 추천.
도보 시간·거리·도착·막차·출구·방향은 자료가 없어 null. 목적지별 경로 자료도 없어 목적지와 무관하다.
"""

from __future__ import annotations

from congestion.outputs import HOURS, NAMES, slot_message

AREA = "olympic_park"
NEAREST, OTHER = "olympic_park", "bangi"
LINES = {"olympic_park": "5·9호선", "bangi": "5호선"}
_ORDER = {"relaxed": 0, "normal": 1, "crowded": 2}


def options(day: dict, hour: int) -> list[dict]:
    """가능한 선택지 (예상이 있는 것만), 추천 순으로 정렬."""
    cands = [("now_olympic", "board_now", NEAREST, hour, f"{NAMES[NEAREST]}에서 {hour}시대에 타기", "가장 가까운 역"),
             ("walk_bangi", "walk_to_other", OTHER, hour, f"{NAMES[OTHER]}에서 타기", "가까운 다른 역까지 걸어가기")]
    if hour + 1 in HOURS:
        cands.insert(1, ("later_olympic", "wait_later", NEAREST, hour + 1,
                         f"{NAMES[NEAREST]}에서 {hour + 1}시대에 타기", "1시간 기다렸다 타기"))
    out = []
    for oid, kind, sid, h, title, subtitle in cands:
        s = day[sid].get(h)
        if s:
            out.append({"id": oid, "kind": kind, "station_id": sid, "hour": h, "title": title, "subtitle": subtitle, "s": s})
    out.sort(key=lambda o: (_ORDER[o["s"]["level"]], o["s"]["ratio"], o["s"]["expected"]))
    return out


def compare(day: dict, hour: int) -> dict | None:
    opts = options(day, hour)
    if not opts:
        return None
    best = opts[0]
    headline = ({"highlight": f"{best['hour']}시대", "text": "에 타면 가장 덜 붐빌 거예요"} if best["kind"] == "wait_later"
                else {"highlight": NAMES[best["station_id"]], "text": "에서 타면 가장 덜 붐빌 거예요"})
    return {
        "condition_label": {"to_name": None, "hour_label": f"{hour}시대 출발"},
        "headline": headline,
        "last_train": None,
        "options": [{"id": o["id"], "kind": o["kind"], "recommended": i == 0, "title": o["title"], "subtitle": o["subtitle"],
                     "station_id": o["station_id"], "board_hour": f"{o['hour']:02d}", "walk_min": None,
                     "expected": round(o["s"]["expected"]), "level": o["s"]["level"], "compare_message": slot_message(o["s"])}
                    for i, o in enumerate(opts)],
    }


def route(day: dict, hour: int, option_id: str) -> dict | None:
    o = next((x for x in options(day, hour) if x["id"] == option_id), None)
    if o is None:
        return None
    sid, h = o["station_id"], o["hour"]
    board_title = f"{NAMES[sid]}에서 {h}시대에 타기" if h != hour else f"{NAMES[sid]}에서 타기"
    items = [{"station_id": x, "expected": round(day[x][h]["expected"])} for x in (NEAREST, OTHER) if day[x].get(h)]
    note = f"{h}시대 예상: " + ", ".join(f"{NAMES[i['station_id']]} {i['expected']:,}명" for i in items)
    return {
        "option_id": option_id, "board_station_id": sid, "to_station_id": None, "walk_min": None, "distance_km": None,
        "arrive_at": None, "last_train_at": None, "level": o["s"]["level"], "message": slot_message(o["s"]),
        "steps": [
            {"type": "start", "title": "출발", "detail": f"{hour}시대 출발", "exit_no": None, "direction": None},
            {"type": "walk", "title": f"{NAMES[sid]}까지 걷기", "detail": None, "exit_no": None, "direction": None},
            {"type": "board", "title": board_title, "detail": LINES[sid], "exit_no": None, "direction": None},
        ],
        "compare": {"hour": f"{h:02d}", "items": items, "note": note},
        "map_links": None,
    }


def build_files(d: str, day: dict) -> dict[str, dict]:
    """한 날짜의 compare·route 파일 (data 부분). 이름: compare-{지역}-{날짜}-{시}, route-{지역}-{날짜}-{시}-{선택지}."""
    files: dict[str, dict] = {}
    for hour in HOURS:
        c = compare(day, hour)
        if c is None:
            continue
        files[f"compare-{AREA}-{d}-{hour:02d}.json"] = c
        for opt in c["options"]:
            files[f"route-{AREA}-{d}-{hour:02d}-{opt['id']}.json"] = route(day, hour, opt["id"])
    return files
