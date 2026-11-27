"""실시간 지역 혼잡 기록 쌓기 (나중에 '오늘 예측'의 실시간 보정 규칙을 검증하기 위한 원자료).

지금은 화면 예측이 2025 다시 보기라 오늘 실시간 값으로 보정하지 않는다(다른 날 값을 섞게 됨). 기록만 쌓는다.

- 출처: 서울시 실시간 도시데이터(서울특별시 공공데이터)를 이미 있는 live-api Worker 가 대신 조회한 결과.
  서울 인증키는 Worker 비밀값에만 있고, 이 수집은 공개된 Worker 주소만 부른다(키를 다루지 않음).
- 저장: 한 줄에 한 기록(JSON Lines), 날짜별 파일 realtime/YYYY-MM-DD.jsonl. 같은 지역·같은 관측 시각은 한 번만.
- 남기는 값: 지역 이름·코드, 혼잡 단계, 추정 인구 범위, 관측 시각, 수집 시각, 출처. 개인 정보는 없다.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from .http import CollectError, get_text

AREAS = ("olympic-park", "jamsil")
KST = timezone(timedelta(hours=9))
FIELDS = ("level", "population_min", "population_max", "observed_at")


def record(area_key: str, body: dict, fetched_at: datetime) -> dict | None:
    """Worker 응답 → 기록 한 줄. 관측 시각이 없으면 None (쌓지 않음)."""
    crowd = body.get("crowd") or {}
    area = body.get("area") or {}
    if not crowd.get("observed_at"):
        return None
    return {"area_key": area_key, "area_name": area.get("name"), "area_code": area.get("code"),
            **{f: crowd.get(f) for f in FIELDS},
            "fetched_at": fetched_at.isoformat(timespec="seconds"), "source": body.get("source")}


def append(out_dir: Path, rows: list[dict]) -> int:
    """날짜별 파일에 덧붙인다. 이미 있는 (지역, 관측 시각)은 건너뛴다. 새로 쓴 줄 수를 돌려준다."""
    written = 0
    for row in rows:
        day = row["fetched_at"][:10]
        path = out_dir / f"{day}.jsonl"
        seen = set()
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    old = json.loads(line)
                    seen.add((old["area_key"], old["observed_at"]))
        if (row["area_key"], row["observed_at"]) in seen:
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        written += 1
    return written


def collect(base_url: str, out_dir: Path, now: datetime | None = None,
            get: Callable[[str, str], str] = get_text) -> tuple[int, list[str]]:
    """두 지역을 조회해 쌓는다. → (새로 쓴 줄 수, 실패 메시지 목록). 한 지역이 실패해도 다른 지역은 쌓는다."""
    now = now or datetime.now(KST)
    rows, errors = [], []
    for key in AREAS:
        try:
            body = json.loads(get(f"{base_url.rstrip('/')}/api/realtime/{key}", f"realtime_{key}"))
        except (CollectError, json.JSONDecodeError) as e:
            errors.append(f"{key}: {e}")
            continue
        row = record(key, body, now)
        if row is None:
            errors.append(f"{key}: 관측 시각이 없는 응답이라 쌓지 않음")
        else:
            rows.append(row)
    return append(out_dir, rows), errors
