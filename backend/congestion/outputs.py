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
    """해요체 한 문장 (#38). 기준선이 월~목으로 대신됐는지는 문장 대신 baseline_basis 필드로 알린다.
    관객 수를 모르는 공연이 있다는 안내도 문장에서 빼고 uncertain 필드로 준다."""
    r = s["ratio"]
    return f"{round(s['expected']):,}명, " + ("평소와 비슷해요" if 0.85 <= r < 1.15 else f"평소의 {r:.1f}배예요")


def _basis(s: dict) -> str:
    return "weekday_fallback" if s["weekday_fallback"] else "same_weekday"


def _how(s: dict) -> str:
    r = s["ratio"]
    if r >= 1.15:
        return f"평소의 {r:.1f}배가 탈 거예요"
    return "평소와 비슷하게 탈 거예요" if r >= 0.85 else "평소보다 적게 탈 거예요"


def description(fh: int, per_hour: dict, has_event: bool) -> str | None:
    """두 문장을 줄바꿈(\\n)으로 (#38-2.5). 예: '공연이 끝나는 20시대엔 평소의 2.6배가 탈 거예요.' + 줄바꿈 + '21시대엔 643명으로 줄어요.'"""
    focus = per_hour.get(fh)
    if not focus:
        return None
    first = f"{'공연이 끝나는 ' if has_event else ''}{fh}시대엔 {_how(focus)}."
    nxt = per_hour.get(fh + 1)
    if not nxt:
        return first
    n1, n2 = round(focus["expected"]), round(nxt["expected"])
    if n1 > 0 and 0.45 <= n2 / n1 <= 0.55:
        change = "그 절반 정도로 줄어요"
    else:
        change = f"{n2:,}명으로 " + ("줄어요" if n2 < n1 * 0.95 else "늘어요" if n2 > n1 * 1.05 else "비슷해요")
    return f"{first}\n{fh + 1}시대엔 {change}."


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
             "ratio": round(s["ratio"], 1), "level": s["level"], "message": slot_message(s), "recommended": h == best,
             "uncertain": s["effect_unknown"], "baseline_basis": _basis(s)}
            for h, s in sorted(have.items())]


def ranking(day: dict, hour: int) -> list[str]:
    have = [sid for sid in OLYMPIC_AREA if day[sid][hour]]
    return sorted(have, key=lambda sid: (_ORDER[day[sid][hour]["level"]], day[sid][hour]["ratio"], day[sid][hour]["expected"]))


def forecast(d: str, day: dict, exits: dict, has_event: bool | None = None) -> dict:
    """has_event: 예측에 넣지 않은 공연(잠실)도 있는 날이면 True 로 넘긴다."""
    has_event = bool(exits.get(d)) if has_event is None else has_event
    summaries, ranks = {}, {}
    for h in HOURS:
        order = ranking(day, h)
        ranks[f"{h:02d}"] = order
        best = order[0] if order else None
        if not has_event:
            summaries[f"{h:02d}"] = {"highlight": None, "text": "오늘은 큰 공연이 없어\n주변 역이 평소와 비슷할 거예요",
                                     "best_station_id": best}
        elif best:
            # 역 이름은 모두 '역'(받침 있음)으로 끝나 조사는 '이'
            summaries[f"{h:02d}"] = {"highlight": f"{h}시", "text": f"엔 {NAMES[best]}이\n가장 덜 붐빌 거예요",
                                     "best_station_id": best}
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
    if not focus:
        headline = {"highlight": f"{fh}시대", "text": " 예상 정보가 없어요"}
    elif focus["level"] != "crowded":
        headline = {"highlight": f"{fh}시대", "text": "에 타기 좋아요"}
    elif best_h != fh:
        headline = {"highlight": f"{best_h}시대", "text": "에 타면 덜 붐벼요"}
    else:
        headline = {"highlight": f"{fh}시대", "text": "엔 붐빌 거예요"}
    out = {**base, "focus_level": focus["level"] if focus else "no_data", "headline": headline,
           "description": description(fh, day[sid], bool(exits.get(d))), "slots": slots}
    if focus and focus["level"] == "crowded" and sid in OLYMPIC_AREA:
        better = [o for o in ranking(day, fh) if o != sid and _ORDER[day[o][fh]["level"]] < _ORDER["crowded"]]
        if better:
            out["alternatives_title"] = f"{fh}시대에 타야 한다면"
            out["alternatives"] = [{"station_id": o, "level": day[o][fh]["level"], "walk_min": None,
                                    "message": slot_message(day[o][fh]), "uncertain": day[o][fh]["effect_unknown"]}
                                   for o in better]
        out["notify_hour"] = f"{best_h:02d}" if best_h != fh else None
    return out


def nearest_level(day: dict, exit_hour: int | None, station: str = "olympic_park") -> str:
    """공연의 가장 가까운 역의 끝나는 시간대 단계. 끝나는 시각을 모르거나 예상 시간대(19~23시) 밖이면 no_data
    (가장 가까운 시간대 값을 빌려 쓰지 않는다)."""
    if exit_hour is None or exit_hour not in HOURS:
        return "no_data"
    s = day[station].get(exit_hour)
    return s["level"] if s else "no_data"
