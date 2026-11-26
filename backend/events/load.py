"""SQLite(build-db 결과)에서 공연명이 있는 시간대 기록을 읽는다."""

from __future__ import annotations

import sqlite3
from pathlib import Path


def load_rows(db_path: Path) -> list[tuple[str, int, str, int | None]]:
    con = sqlite3.connect(db_path)
    try:
        return con.execute(
            "SELECT substr(ts, 1, 10), CAST(substr(ts, 12, 2) AS INTEGER), perf_title, audience "
            "FROM park_hourly WHERE perf_title IS NOT NULL ORDER BY ts"
        ).fetchall()
    finally:
        con.close()


def date_range(db_path: Path) -> tuple[str, str] | None:
    con = sqlite3.connect(db_path)
    try:
        lo, hi = con.execute("SELECT MIN(substr(ts, 1, 10)), MAX(substr(ts, 1, 10)) FROM park_hourly").fetchone()
        return (lo, hi) if lo else None
    finally:
        con.close()
