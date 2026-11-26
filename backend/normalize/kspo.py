"""KSPO 원본 → 표의 행.

- 연계 데이터(1시간 단위): TITLE "공연명:X,공연관람객수:N", DESCRIPTION "주차대수:..,방문객:.., 기온:.., ..,휴일:.."
  (2026-11 실제 응답에서 확인. 공연명 뒤에 줄바꿈이 들어 있는 경우가 있다)
- 공연정보: 필드를 그대로 두고, 공연 길이 글("120분", "4시간 30분")만 분으로 바꾼다.
  날짜·시작 시각 글은 형식이 제각각이라 해석은 행사 단계(2-3)에서 한다.
"""

from __future__ import annotations

import re

_TITLE = re.compile(r"공연명:(?P<title>.*?)\s*,\s*공연관람객수:(?P<aud>[\d,]*)", re.S)
_DESC_KEYS = {"주차대수": "parked", "방문객": "visitors", "기온": "temp_c", "풍향": "wind",
              "강수량": "rain_mm", "습도": "humidity", "휴일": "holiday"}


def _field(desc: str, label: str) -> str:
    m = re.search(rf"{label}\s*:\s*([^,]*)", desc)
    return m.group(1).strip() if m else ""


def _float(s: str) -> float | None:
    try:
        return float(s.replace(",", "")) if s.strip() else None
    except ValueError:
        return None


def parse_linked_item(item: dict) -> tuple:
    """→ (시각 'YYYY-MM-DDTHH:MM:SS', 공연명|None, 관람객수|None, 주차대수, 방문객, 기온, 풍향, 강수량, 습도, 휴일|None)"""
    ts = item.get("ISSUED_DATE", "").strip().replace(" ", "T")
    m = _TITLE.search(item.get("TITLE", ""))
    title = (m.group("title").strip() or None) if m else None
    audience = int(m.group("aud").replace(",", "")) if m and m.group("aud") else None
    desc = item.get("DESCRIPTION", "")
    vals = {col: _field(desc, label) for label, col in _DESC_KEYS.items()}
    return (
        ts, title, audience,
        _float(vals["parked"]), _float(vals["visitors"]), _float(vals["temp_c"]),
        _float(vals["wind"]), _float(vals["rain_mm"]), _float(vals["humidity"]),
        vals["holiday"] or None,
    )


def duration_min(text: str) -> int | None:
    """'120분', '4시간 30분', '1시간', '총 150분 예상' → 분. 알 수 없으면 None."""
    text = text or ""
    h = re.search(r"(\d+)\s*시간", text)
    m = re.search(r"(\d+)\s*분", text)
    if not h and not m:
        return None
    return (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)


def parse_perf_item(item: dict) -> tuple:
    """→ (제목, 장소, 장소 키워드, 시작 시각 글, 공연 길이 글, 공연 길이(분)|None, 등록일)"""
    g = lambda k: (item.get(k) or "").strip()  # noqa: E731
    return (g("title"), g("spatial"), g("subjectKeyword"), g("temporalCoverage"),
            g("extent"), duration_min(g("extent")), g("regDate"))
