"""원본 → SQLite 한 파일 (backend/data/tumgil.db, git 제외).

언제든 원본에서 다시 만들 수 있다. 임시 파일에 다 만든 뒤 바꿔치기해서, 실패하면 기존 DB를 그대로 둔다.
표마다 기본키가 곧 색인이다: 승하차는 (역, 날짜, 시간대, 노선) 순이라 "이 역의 이 날 이 시간" 조회가 빠르다.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

from . import kspo, ridership

SCHEMA = """
CREATE TABLE ridership_daily (          -- 서울교통공사 일별 시간대별 CSV
    station_id TEXT NOT NULL, date TEXT NOT NULL, hour INTEGER NOT NULL, line TEXT NOT NULL,
    board INTEGER, alight INTEGER,       -- NULL = 원자료에 값 없음
    PRIMARY KEY (station_id, date, hour, line)
) WITHOUT ROWID;
CREATE TABLE ridership_monthly (        -- 지하철 월별 API (CardSubwayTime)
    station_id TEXT NOT NULL, month TEXT NOT NULL, hour INTEGER NOT NULL, line TEXT NOT NULL,
    board INTEGER, alight INTEGER,
    PRIMARY KEY (station_id, month, hour, line)
) WITHOUT ROWID;
CREATE TABLE park_hourly (              -- KSPO 연계 데이터 (1시간 단위)
    ts TEXT PRIMARY KEY, perf_title TEXT, audience INTEGER, parked REAL, visitors REAL,
    temp_c REAL, wind REAL, rain_mm REAL, humidity REAL, holiday TEXT
);
CREATE TABLE performances (             -- KSPO 공연정보 (과거 공연)
    id INTEGER PRIMARY KEY, title TEXT, venue TEXT, venue_keyword TEXT,
    time_text TEXT, extent_text TEXT, duration_min INTEGER, reg_date TEXT
);
CREATE TABLE meta (name TEXT PRIMARY KEY, value TEXT);
"""


def build(raw_dir: Path, db_path: Path) -> dict:
    """raw_dir 의 원본을 읽어 db_path 를 새로 만든다. 표별 건수와 건너뛴 사유를 돌려준다."""
    report: dict = {"skipped": {}, "sources": []}
    tmp = db_path.with_suffix(".db.tmp")
    tmp.unlink(missing_ok=True)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(tmp)
    try:
        con.executescript(SCHEMA)
        for path in sorted((raw_dir / "csv").glob("*.csv")):
            rows, skipped = ridership.parse_daily_csv(ridership.read_csv_text(path))
            try:
                con.executemany("INSERT INTO ridership_daily (date, station_id, line, hour, board, alight) VALUES (?,?,?,?,?,?)", rows)
            except sqlite3.IntegrityError:
                raise ValueError(f"{path.name}: 다른 파일과 같은 날짜·역·시간대가 겹칩니다") from None
            report["sources"].append(path.name)
            for k, v in skipped.items():
                report["skipped"][f"{path.name}: {k}"] = v
        for path in sorted(raw_dir.glob("subway_month_*.json")):
            rows = ridership.parse_monthly_api(json.loads(path.read_text(encoding="utf-8")))
            con.executemany("INSERT INTO ridership_monthly (month, station_id, line, hour, board, alight) VALUES (?,?,?,?,?,?)", rows)
            report["sources"].append(path.name)
        linked = raw_dir / "kspo_linked.json"
        if linked.exists():
            items = json.loads(linked.read_text(encoding="utf-8"))["items"]
            con.executemany("INSERT OR REPLACE INTO park_hourly VALUES (?,?,?,?,?,?,?,?,?,?)", [kspo.parse_linked_item(i) for i in items])
            report["sources"].append(linked.name)
        perf = raw_dir / "kspo_perf.json"
        if perf.exists():
            items = json.loads(perf.read_text(encoding="utf-8"))["items"]
            con.executemany("INSERT INTO performances (title, venue, venue_keyword, time_text, extent_text, duration_min, reg_date) "
                            "VALUES (?,?,?,?,?,?,?)", [kspo.parse_perf_item(i) for i in items])
            report["sources"].append(perf.name)
        con.execute("INSERT INTO meta VALUES ('sources', ?)", (json.dumps(report["sources"], ensure_ascii=False),))
        con.commit()
        report["counts"] = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                            for t in ("ridership_daily", "ridership_monthly", "park_hourly", "performances")}
    except Exception:
        con.close()
        tmp.unlink(missing_ok=True)
        raise
    con.close()
    os.replace(tmp, db_path)
    return report
