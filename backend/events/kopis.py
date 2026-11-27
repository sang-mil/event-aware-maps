"""KOPIS 수집 결과 → 공연 회차(Event) 목록 (순수 함수).

- 공연장: KOPIS 공연장 id(mt13id) → 틈길 공연장 id. 대응표는 2026-11 KOPIS 공연시설 상세의 공연장 이름으로 만들었다.
  대응하지 않는 공연장(예: K-아트홀, 수변무대)은 venue_id 를 null 로 두고 지역만 채운다.
- 회차: 공연 기간의 날짜마다 '공연 시간 글(dtguidance)'의 요일·시각으로 회차를 만든다.
  예: "금요일(19:00), 토요일 ~ 일요일(16:00)". 'HOL(…)'(공휴일)은 공휴일 달력이 없어 쓰지 않는다.
- 끝나는 시각 = 시작 + 런타임(prfruntime). 런타임이 없으면 끝나는 시각을 정하지 않는다(지어내지 않음).
- 관객 수: KOPIS 에 없다. 객석 수 × 객석 대비 관객 비율(2025 실제 자료로 계산, reference/fill_ratio.json)로 추정한다.
  비율이 없으면 관객 수를 모름(None)으로 둔다.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta

from normalize.kspo import duration_min

from .detect import Event

HALL_TO_VENUE = {
    "FC001247-01": "kspo_dome",              # KSPO DOME(체조경기장)
    "FC001247-02": "ticketlink_live_arena",  # 티켓링크 라이브 아레나 (핸드볼경기장)
    "FC001247-03": "olympic_hall",           # 올림픽홀
    "FC001247-04": "muse_live",              # 뮤즈라이브
    "FC001247-05": "woori_art_hall",         # 우리금융아트홀(역도경기장)
    "FC001247-07": "grass_88",               # 야외(88잔디마당)
    "FC001837-02": "jamsil_arena",           # 잠실종합운동장 실내체육관
    "FC001837-05": "jamsil_main_stadium",    # 잠실종합운동장 주경기장
    "FC002049-01": "jamsil_student_gym",     # 잠실학생체육관 본관
    "FC001513-01": "lotte_concert_hall",     # 롯데콘서트홀
    "FC000012-01": "charlotte_theater",      # 샤롯데씨어터
}
AREA_BY_FACILITY = {"FC001247": "olympic_park"}  # 나머지 4곳은 잠실
DAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
KST = "+09:00"


def parse_schedule(text: str) -> dict[int, list[str]]:
    """'금요일(19:00), 토요일 ~ 일요일(16:00,19:00)' → {4: ['19:00'], 5: ['16:00','19:00'], 6: [...]} (월=0)."""
    out: dict[int, list[str]] = {}
    for spec, times in re.findall(r"([가-힣A-Z ~]+?)\s*\(([^)]*)\)", text or ""):
        hhmm = re.findall(r"\d{1,2}:\d{2}", times)
        spec = spec.strip(" ,")
        if "~" in spec:
            a, b = (x.strip() for x in spec.split("~", 1))
            if a not in DAYS or b not in DAYS:
                continue
            i, j = DAYS.index(a), DAYS.index(b)
            days = list(range(i, j + 1)) if i <= j else list(range(i, 7)) + list(range(0, j + 1))
        elif spec in DAYS:
            days = [DAYS.index(spec)]
        else:
            continue  # HOL(공휴일) 등
        for d in days:
            out.setdefault(d, [])
            out[d] += [t.zfill(5) for t in hhmm if t.zfill(5) not in out[d]]
    return out


def _date(s: str) -> date | None:
    try:
        return datetime.strptime(s.strip(), "%Y.%m.%d").date()
    except ValueError:
        return None


def seats_by_hall(facilities: list[dict]) -> dict[str, int]:
    return {h["mt13id"]: h["seats"] for f in facilities for h in f["halls"] if h.get("seats")}


def instances(raw: dict, fill: dict[str, float] | None = None, start: date | None = None,
              end: date | None = None) -> list[Event]:
    """수집 결과 → start~end 의 공연 회차. fill: {venue_id 또는 '*': 객석 대비 관객 비율}."""
    fill = fill or {}
    seats = seats_by_hall(raw.get("facilities", []))
    start = start or date.fromisoformat(raw["window"]["start"])
    end = end or date.fromisoformat(raw["window"]["end"])
    out: list[Event] = []
    for p in raw.get("performances", []):
        p_from, p_to = _date(p.get("prfpdfrom", "")), _date(p.get("prfpdto", ""))
        if not p_from or not p_to:
            continue
        hall = p.get("mt13id", "")
        venue = HALL_TO_VENUE.get(hall)
        area = AREA_BY_FACILITY.get(p.get("mt10id", ""), "jamsil")
        runtime = duration_min(p.get("prfruntime", ""))
        sched = parse_schedule(p.get("dtguidance", ""))
        ratio = fill.get(venue or "", fill.get("*"))
        audience = round(seats[hall] * ratio) if hall in seats and ratio else None
        d = max(start, p_from)
        while d <= min(end, p_to):
            for hhmm in sched.get(d.weekday(), []):
                h, m = map(int, hhmm.split(":"))
                begin = datetime(d.year, d.month, d.day, h, m)
                fin = begin + timedelta(minutes=runtime) if runtime else None
                exit_hour = (fin.hour + (24 if fin.date() > d else 0)) if fin else None
                out.append(Event(
                    date=d.isoformat(), title=p.get("prfnm", ""), hours=[exit_hour] if exit_hour is not None else [],
                    audience=audience, venue_id=venue, area=area,
                    start_at=begin.isoformat(timespec="seconds") + KST,
                    end_at=fin.isoformat(timespec="seconds") + KST if fin else None,
                    ext_id=f"evt_{d.strftime('%Y%m%d')}_{p['mt20id'].lower()}_{h:02d}{m:02d}",
                    source="kopis", audience_estimated=audience is not None,
                ))
            d += timedelta(days=1)
    return sorted(out, key=lambda e: (e.date, e.start_at or "", e.title))
