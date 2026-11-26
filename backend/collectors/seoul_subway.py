"""서울 열린데이터광장 지하철 승하차 (CardSubwayTime, OA-12252).

월 단위 × 역 × 시간대(04시~다음날 03시) 승차·하차 인원. 1~9호선.
주소 형식: http://openapi.seoul.go.kr:8088/{KEY}/json/CardSubwayTime/{시작}/{끝}/{YYYYMM}/
"""

from __future__ import annotations

import json
import re
import urllib.parse
from typing import Callable

from .http import CollectError, get_text

BASE = "http://openapi.seoul.go.kr:8088"
SERVICE = "CardSubwayTime"
PAGE_SIZE = 1000  # API 최대값
NO_DATA = "INFO-200"


def parse_page(text: str) -> tuple[int, list[dict]]:
    """응답 한 페이지 → (전체 건수, 행 목록). 데이터 없음(INFO-200)은 (0, [])."""
    try:
        body = json.loads(text)
    except json.JSONDecodeError:
        raise CollectError("seoul_subway: JSON이 아닌 응답") from None
    if SERVICE not in body:
        result = body.get("RESULT", {})
        if result.get("CODE") == NO_DATA:
            return 0, []
        raise CollectError(f"seoul_subway: {result.get('CODE', '알 수 없는 응답')} {result.get('MESSAGE', '')}".strip())
    data = body[SERVICE]
    code = data.get("RESULT", {}).get("CODE")
    if code != "INFO-000":
        raise CollectError(f"seoul_subway: {code} {data.get('RESULT', {}).get('MESSAGE', '')}".strip())
    return int(data.get("list_total_count", 0)), data.get("row", [])


def page_url(key: str, month: str, start: int, end: int) -> str:
    return f"{BASE}/{urllib.parse.quote(key, safe='')}/json/{SERVICE}/{start}/{end}/{month}/"


def fetch_month(key: str, month: str, get: Callable[[str, str], str] = get_text) -> dict:
    """한 달 치 전체 역을 받아 {"month", "total", "rows"} 로 돌려준다."""
    if not re.fullmatch(r"\d{6}", month):
        raise ValueError("month 는 YYYYMM 형식이어야 합니다")
    rows: list[dict] = []
    total = None
    start = 1
    while True:
        page_total, page_rows = parse_page(get(page_url(key, month, start, start + PAGE_SIZE - 1), "seoul_subway"))
        total = page_total if total is None else total
        rows.extend(page_rows)
        if not page_rows or len(rows) >= total:
            break
        if len(page_rows) < PAGE_SIZE:
            raise CollectError(f"seoul_subway: 한 페이지가 {len(page_rows)}건만 왔습니다")
        start += PAGE_SIZE
    return {"month": month, "total": total or 0, "rows": rows}
