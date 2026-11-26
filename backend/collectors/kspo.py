"""한국체육산업개발 데이터 (문화데이터광장 api.kcisa.kr 경유).

- linked: 올림픽공원 2025 차량입출차, 공연, 날씨정보 등 연계 데이터 (API_CPM_009). 1시간 단위 기록.
- perf:   올림픽공원 공연정보 (KSCperf). 공연명, 장소, 시작 시각 글, 공연 길이 글.
두 API 모두 XML이고 <item> 아래 필드가 있다. 여기서는 필드를 그대로 꺼내기만 하고, 해석은 normalize 에서 한다.
"""

from __future__ import annotations

import urllib.parse
import xml.etree.ElementTree as ET
from typing import Callable

from .http import CollectError, get_text

ENDPOINTS = {
    "linked": "https://api.kcisa.kr/openapi/API_CPM_009/request",
    "perf": "https://api.kcisa.kr/openapi/service/rest/meta/KSCperf",
}
PAGE_SIZE = 1000
MAX_PAGES = 200  # 안전장치: 이보다 많으면 멈춘다 (개발 계정은 하루 1,000회)


def parse_page(xml_text: str, source: str) -> tuple[int, list[dict[str, str]]]:
    """응답 한 페이지 → (전체 건수, 항목 목록)."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        raise CollectError(f"{source}: XML이 아닌 응답") from None
    code = (root.findtext(".//resultCode") or "").strip()
    if code != "0000":
        msg = (root.findtext(".//resultMsg") or "").strip()
        raise CollectError(f"{source}: 결과 코드 {code or '없음'} {msg}".strip())
    total = int((root.findtext(".//totalCount") or "0").strip() or 0)
    items = [{c.tag: (c.text or "").strip() for c in item} for item in root.iter("item")]
    return total, items


def page_url(kind: str, key: str, page: int, rows: int = PAGE_SIZE) -> str:
    query = urllib.parse.urlencode({"serviceKey": key, "numOfRows": rows, "pageNo": page})
    return f"{ENDPOINTS[kind]}?{query}"


def fetch_all(kind: str, key: str, get: Callable[[str, str], str] = get_text, page_size: int = PAGE_SIZE) -> dict:
    """전체 페이지를 받아 {"total": n, "items": [...]} 로 돌려준다."""
    if kind not in ENDPOINTS:
        raise ValueError(f"알 수 없는 종류: {kind}")
    if page_size < 1:
        raise ValueError("page_size 는 1 이상이어야 합니다")
    source = f"kspo_{kind}"
    items: list[dict[str, str]] = []
    total = None
    for page in range(1, MAX_PAGES + 1):
        page_total, page_items = parse_page(get(page_url(kind, key, page, page_size), source), source)
        total = page_total if total is None else total
        items.extend(page_items)
        if not page_items or len(items) >= total:
            break
        if len(page_items) < page_size:
            # 서버가 한 페이지 크기를 줄여 보냈다면 다음 페이지 위치가 어긋나 빠지는 기록이 생길 수 있다
            raise CollectError(f"{source}: 한 페이지가 {len(page_items)}건만 왔습니다. --page-size {len(page_items)} 로 다시 실행하세요")
    else:
        raise CollectError(f"{source}: {MAX_PAGES}페이지를 넘어 중단")
    return {"total": total or 0, "items": items}
