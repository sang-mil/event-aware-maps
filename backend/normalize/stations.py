"""역 이름 매핑: 원자료의 여러 표기 → 우리 역 id (data-contract 의 stations 와 같은 id).

원자료 표기 예 (2026-11 실제 파일·API에서 확인):
- 서울교통공사 1~8호선 CSV: "올림픽공원(한국체대)", "몽촌토성(평화의문)", "방이", "잠실새내", "종합운동장"
- 9호선 CSV: "올림픽공원", "한성백제", "종합운동장"
- 지하철 월별 API: 노선 "9호선2~3단계", 역 "올림픽공원(한국체대)"
"""

from __future__ import annotations

import re

# 괄호·'역'을 뗀 이름 → 역 id
STATION_IDS = {
    "올림픽공원": "olympic_park",
    "방이": "bangi",
    "몽촌토성": "mongchontoseong",
    "종합운동장": "sports_complex",
    "잠실새내": "jamsil_saenae",
    "한성백제": "hanseong_baekje",
}


def clean_name(raw: str) -> str:
    name = re.sub(r"\(.*?\)", "", raw or "").strip()
    return name[:-1] if name.endswith("역") and len(name) > 1 else name


def station_id(raw_name: str) -> str | None:
    """대상 역이면 id, 아니면 None."""
    return STATION_IDS.get(clean_name(raw_name))


def line_no(raw_line: str) -> str | None:
    """'5호선', '9', '9호선2~3단계' → '5', '9'. 숫자 노선이 아니면 None."""
    m = re.match(r"\s*(\d+)", raw_line or "")
    return m.group(1) if m else None
