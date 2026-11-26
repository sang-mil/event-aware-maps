"""SQLite(build-db 결과)에서 혼잡 계산 입력을 읽는다."""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from pathlib import Path

from events.detect import detect_events
from events.load import load_rows


def load_inputs(db_path: Path) -> tuple[dict, set[str], dict]:
    """→ (관측 obs, 기록 있는 날 covered, 퇴장 exits). 시각은 0~23만(묶음 시간대 -1, 24 제외)."""
    con = sqlite3.connect(db_path)
    try:
        obs: dict = defaultdict(dict)
        for sid, line, d, h, board in con.execute(
                "SELECT station_id, line, date, hour, board FROM ridership_daily WHERE hour BETWEEN 0 AND 23"):
            obs[(sid, line)][(d, h)] = board
        covered = {r[0] for r in con.execute("SELECT DISTINCT substr(ts, 1, 10) FROM park_hourly")}
    finally:
        con.close()
    exits: dict = defaultdict(list)
    for e in detect_events(load_rows(db_path)):
        exits[e.date].append((e.exit_hour, e.audience))
    return dict(obs), covered, dict(exits)
