"""KOPIS(공연예술통합전산망, 예술경영지원센터) 공연·공연시설 수집.

출처 표시 의무: "출처: (재)예술경영지원센터 공연예술통합전산망(www.kopis.or.kr)" — 화면에 반드시 표시.
인증키는 환경변수 KOPIS_API_KEY 에서만 읽고, 오류 메시지·파일에 남기지 않는다(주소에 키가 들어가므로 주소도 남기지 않음).

- 공연 목록(pblprfr): 기간(최대 31일)·지역으로 조회. 한 번에 최대 100건.
- 공연 상세(pblprfr/{id}): 공연장(mt10id·mt13id·fcltynm), 공연 시간 글(dtguidance), 런타임, 상태.
- 공연시설 상세(prfplc/{id}): 공연장(mt13)별 객석 수(seatscale).
대상 시설은 틈길 공연장 목록과 같은 5곳(2026-11 KOPIS 시설 검색으로 확인한 id).
"""

from __future__ import annotations

import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from typing import Callable

from .http import CollectError, get_text

BASE = "http://www.kopis.or.kr/openApi/restful"
FACILITIES = {
    "FC001247": "올림픽공원",
    "FC001837": "잠실종합운동장",
    "FC002049": "잠실학생체육관",
    "FC001513": "롯데콘서트홀",
    "FC000012": "샤롯데씨어터",
}
SONGPA = {"signgucode": "11", "signgucodesub": "1171"}  # 서울 송파구 (5곳 모두 송파구)
MAX_DAYS = 31
ROWS = 100
PAUSE_SEC = 0.2


def _url(path: str, key: str, **params) -> str:
    return f"{BASE}/{path}?{urllib.parse.urlencode({'service': key, **params})}"


def _parse(text: str, source: str) -> ET.Element:
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        raise CollectError(f"{source}: XML이 아닌 응답") from None
    code = (root.findtext(".//returncode") or "").strip()
    if code and code != "00":
        raise CollectError(f"{source}: 결과 코드 {code} {(root.findtext('.//errmsg') or '').strip()}")
    return root


def _fields(db: ET.Element) -> dict:
    return {c.tag: (c.text or "").strip() for c in db if len(c) == 0}


def list_window(key: str, start: date, end: date, get: Callable = get_text, wait: Callable = time.sleep) -> list[dict]:
    """start~end(최대 31일) 송파구 공연 목록. 대상 5곳 시설명으로 시작하는 것만."""
    if (end - start).days + 1 > MAX_DAYS:
        raise ValueError("KOPIS 목록은 한 번에 31일까지만 조회할 수 있습니다")
    out, page = [], 1
    while True:
        root = _parse(get(_url("pblprfr", key, stdate=start.strftime("%Y%m%d"), eddate=end.strftime("%Y%m%d"),
                                cpage=page, rows=ROWS, **SONGPA), "kopis_list"), "kopis_list")
        rows = [_fields(db) for db in root.iter("db")]
        out += [r for r in rows if any(r.get("fcltynm", "").startswith(n) for n in FACILITIES.values())]
        if len(rows) < ROWS:
            return out
        page += 1
        wait(PAUSE_SEC)


def detail(key: str, mt20id: str, get: Callable = get_text) -> dict:
    db = _parse(get(_url(f"pblprfr/{urllib.parse.quote(mt20id)}", key), "kopis_detail"), "kopis_detail").find("db")
    if db is None:
        raise CollectError(f"kopis_detail: {mt20id} 상세 없음")
    return _fields(db)


def facility(key: str, mt10id: str, get: Callable = get_text) -> dict:
    db = _parse(get(_url(f"prfplc/{urllib.parse.quote(mt10id)}", key), "kopis_facility"), "kopis_facility").find("db")
    if db is None:
        raise CollectError(f"kopis_facility: {mt10id} 상세 없음")
    halls = []
    for m in db.iter("mt13"):
        seats = (m.findtext("seatscale") or "").replace(",", "").strip()
        halls.append({"mt13id": (m.findtext("mt13id") or "").strip(), "name": (m.findtext("prfplcnm") or "").strip(),
                      "seats": int(seats) if seats.isdigit() else None})
    return {"mt10id": mt10id, "name": (db.findtext("fcltynm") or "").strip(), "halls": halls}


def fetch_range(key: str, start: date, days: int, get: Callable = get_text, wait: Callable = time.sleep) -> dict:
    """start 부터 days 일 동안의 대상 시설 공연(상세 포함)과 시설 객석 정보."""
    rows: dict[str, dict] = {}
    d = start
    end = start + timedelta(days=days - 1)
    while d <= end:
        w_end = min(end, d + timedelta(days=MAX_DAYS - 1))
        for r in list_window(key, d, w_end, get, wait):
            rows.setdefault(r["mt20id"], r)
        d = w_end + timedelta(days=1)
        wait(PAUSE_SEC)
    details, skipped = [], []
    for mt20id in sorted(rows):
        det = None
        for attempt in range(2):  # 한 번 실패하면 잠시 뒤 다시 시도, 그래도 안 되면 그 공연만 건너뛰고 기록
            try:
                det = detail(key, mt20id, get)
                break
            except CollectError as e:
                if attempt == 1:
                    skipped.append({"mt20id": mt20id, "error": str(e)})
                wait(1.0)
        if det and det.get("mt10id") in FACILITIES:
            details.append(det)
        wait(PAUSE_SEC)
    facilities = []
    for fid in FACILITIES:
        facilities.append(facility(key, fid, get))
        wait(PAUSE_SEC)
    return {"window": {"start": start.isoformat(), "end": end.isoformat()},
            "performances": details, "facilities": facilities, "skipped": skipped,
            "attribution": "출처: (재)예술경영지원센터 공연예술통합전산망(www.kopis.or.kr)"}
