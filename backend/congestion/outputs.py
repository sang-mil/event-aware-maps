"""혼잡 예상 → 화면용 JSON(data 부분): forecast-{날짜}, station-{역}-{날짜}. 사용자에게 보이는 문구도 여기서 만든다.

- 시간대: 19~23시. 그날의 중심 시간대(focus_hour)는 관객이 가장 많은 공연의 끝나는 시간대, 공연이 없으면 20시.
- 한 날짜를 예측할 때는 그날 자료를 뺀 나머지로 만든 기준선·계수를 쓴다(backtest 와 같은 방식).
- 기준선이 월~목으로 대신된 경우 문구에 "행사 없는 평일"이라고 밝힌다.
- 역 순서(ranking)는 올림픽공원 쪽 역만, 단계(여유<보통<혼잡) → 비율 → 예상 인원 순.
"""

from __future__ import annotations

from datetime import date as Date

from .model import Baselines, coefficients, level, predict

HOURS = (19, 20, 21, 22, 23)
DEFAULT_FOCUS = 20
STATIONS = ["olympic_park", "bangi", "mongchontoseong", "sports_complex", "jamsil_saenae", "hanseong_baekje"]
OLYMPIC_AREA = ["olympic_park", "bangi", "mongchontoseong", "hanseong_baekje"]
NAMES = {"olympic_park": "올림픽공원역", "bangi": "방이역", "mongchontoseong": "몽촌토성역",
         "sports_complex": "종합운동장역", "jamsil_saenae": "잠실새내역", "hanseong_baekje": "한성백제역"}
LEVEL_KO = {"relaxed": "여유", "normal": "보통", "crowded": "혼잡", "no_data": "정보 없음"}
_ORDER = {"relaxed": 0, "normal": 1, "crowded": 2, "no_data": 3}


def station_hour(d: str, sid: str, hour: int, lines: list, exits: dict, base: Baselines, coefs: dict) -> dict | None:
    parts = [predict(d, key, hour, exits, base, coefs, exclude=d) for key in lines]
    if not parts or any(p["baseline"] is None for p in parts):
        return None
    b = sum(p["baseline"] for p in parts)
    e = sum(p["expected"] for p in parts)
    if b <= 0:
        return None
    ratio = e / b
    return {"baseline": b, "expected": e, "ratio": ratio, "level": level(ratio),
            "weekday_fallback": any(p["source"] == "mon_thu" for p in parts),
            "effect_unknown": any(p["effect_unknown"] for p in parts)}


def slot_message(s: dict) -> str:
    ref, with_ = ("행사 없는 평일", "행사 없는 평일과") if s["weekday_fallback"] else ("평소", "평소와")
    r = s["ratio"]
    text = f"{round(s['expected']):,}명, " + (f"{with_} 비슷" if 0.85 <= r < 1.15 else f"{ref}의 {r:.1f}배")
    return text + (" (관객 수를 모르는 공연이 있어 더 붐빌 수 있음)" if s["effect_unknown"] else "")


def day_label(d: str) -> str:
    x = Date.fromisoformat(d)
    return f"{x.month}월 {x.day}일 ({'월화수목금토일'[x.weekday()]})"


def focus_hour(d: str, exits: dict) -> int:
    evs = [(a or 0, h) for h, a in exits.get(d, ())]
    if not evs:
        return DEFAULT_FOCUS
    return min(max(max(evs)[1], HOURS[0]), HOURS[-1])


def compute_day(d: str, obs: dict, exits: dict, base: Baselines, res: dict) -> dict:
    """{역: {시각: 예상 또는 None}}"""
    coefs = coefficients(res, exclude=d)
    lines = {sid: sorted(k for k in obs if k[0] == sid) for sid in STATIONS}
    return {sid: {h: station_hour(d, sid, h, lines[sid], exits, base, coefs) for h in HOURS} for sid in STATIONS}


def _slots(per_hour: dict) -> list[dict]:
    have = {h: s for h, s in per_hour.items() if s}
    if not have:
        return []
    best = min(have, key=lambda h: (have[h]["ratio"], h))
    return [{"hour": f"{h:02d}", "expected": round(s["expected"]), "baseline": round(s["baseline"]),
             "ratio": round(s["ratio"], 1), "level": s["level"], "message": slot_message(s), "recommended": h == best}
            for h, s in sorted(have.items())]


def ranking(day: dict, hour: int) -> list[str]:
    have = [sid for sid in OLYMPIC_AREA if day[sid][hour]]
    return sorted(have, key=lambda sid: (_ORDER[day[sid][hour]["level"]], day[sid][hour]["ratio"], day[sid][hour]["expected"]))


def forecast(d: str, day: dict, exits: dict) -> dict:
    has_event = bool(exits.get(d))
    summaries, ranks = {}, {}
    for h in HOURS:
        order = ranking(day, h)
        ranks[f"{h:02d}"] = order
        best = order[0] if order else None
        if not has_event:
            summaries[f"{h:02d}"] = {"highlight": None, "text": "큰 공연이 없어 주변 역이 평소와 비슷할 거예요", "best_station_id": best}
        elif best:
            summaries[f"{h:02d}"] = {"highlight": NAMES[best], "text": "에서 타면 가장 덜 붐빌 거예요", "best_station_id": best}
        else:
            summaries[f"{h:02d}"] = {"highlight": None, "text": "이 시간대는 예상 정보가 없어요", "best_station_id": None}
    return {"date": d, "day_label": day_label(d), "has_event": has_event, "focus_hour": f"{focus_hour(d, exits):02d}",
            "supported_hours": [f"{h:02d}" for h in HOURS], "summaries": summaries, "ranking": ranks,
            "stations": [{"station_id": sid, "slots": _slots(day[sid])} for sid in STATIONS]}


def station_forecast(d: str, sid: str, day: dict, exits: dict) -> dict:
    fh = focus_hour(d, exits)
    slots = _slots(day[sid])
    base = {"station_id": sid, "date": d, "focus_hour": f"{fh:02d}", "alternatives_title": None,
            "alternatives": [], "notify_hour": None, "no_data": None}
    if not slots:
        nearby = [{"station_id": o, "level": day[o][fh]["level"], "walk_min": None}
                  for o in OLYMPIC_AREA if o != sid and day[o][fh]]
        return {**base, "focus_level": "no_data", "headline": None, "description": None, "slots": [],
                "no_data": {"message": "이 역은 아직 시간대별 승하차 자료가 부족해 예상할 수 없어요.", "nearby": nearby}}
    focus = day[sid][fh]
    best = next(s for s in slots if s["recommended"])
    best_h = int(best["hour"])
    headline = ({"highlight": f"{best_h}시대", "text": "에 타면 가장 덜 붐빌 거예요"} if focus and focus["level"] == "crowded" and best_h != fh
                else {"highlight": f"{fh}시대", "text": f" 예상: {LEVEL_KO[focus['level']] if focus else '정보 없음'}"})
    out = {**base, "focus_level": focus["level"] if focus else "no_data", "headline": headline,
           "description": f"{fh}시대 {slot_message(focus)}." if focus else None, "slots": slots}
    if focus and focus["level"] == "crowded" and sid in OLYMPIC_AREA:
        better = [o for o in ranking(day, fh) if o != sid and _ORDER[day[o][fh]["level"]] < _ORDER["crowded"]]
        if better:
            out["alternatives_title"] = f"{fh}시대에 타야 한다면"
            out["alternatives"] = [{"station_id": o, "level": day[o][fh]["level"], "walk_min": None,
                                    "message": f"{NAMES[o]} {slot_message(day[o][fh])}"} for o in better]
        out["notify_hour"] = f"{best_h:02d}" if best_h != fh else None
    return out


def nearest_level(day: dict, exit_hour: int) -> str:
    """올림픽공원 공연의 가장 가까운 역(올림픽공원역)의 끝나는 시간대 단계."""
    s = day["olympic_park"].get(min(max(exit_hour, HOURS[0]), HOURS[-1]))
    return s["level"] if s else "no_data"
