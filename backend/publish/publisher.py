"""검증된 JSON 발행.

규칙 (backend/CLAUDE.md)
- 모든 파일을 먼저 검사한다. 하나라도 실패하면 아무 파일도 쓰지 않고 PublishError 를 낸다.
- 통과하면 임시 파일에 쓴 뒤 바꿔치기해서, 쓰다가 멈춰도 반쯤 쓴 파일이 남지 않게 한다.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from .schema import errors_of

SCHEMA_VERSION = "1.0"


class PublishError(Exception):
    def __init__(self, failures: dict[str, list[str]]):
        self.failures = failures
        lines = [f"{name}: {err}" for name, errs in failures.items() for err in errs]
        super().__init__("스키마 검증 실패로 발행하지 않았습니다\n" + "\n".join(lines))


def wrap(data, as_of: datetime) -> dict:
    """계산 결과(data)를 겉봉투로 감싼다. updated_at 은 기준 시각(as_of)."""
    if as_of.tzinfo is None:
        raise ValueError("as_of 에는 시간대(+09:00 등)가 있어야 합니다")
    return {"schema_version": SCHEMA_VERSION, "updated_at": as_of.isoformat(), "data": data}


def publish(files: dict[str, dict], out_dir: Path) -> list[Path]:
    """files: {파일 이름: 겉봉투까지 갖춘 JSON}. 전부 통과해야 out_dir 에 쓴다."""
    failures = {name: errs for name, body in files.items() if (errs := errors_of(name, body))}
    if failures:
        raise PublishError(failures)

    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for name, body in files.items():
        target = out_dir / name
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, target)
        written.append(target)
    return written
