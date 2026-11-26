"""승하차 요약(seed): 대상 6개 역의 일별·시간대별 승하차만 뽑은 압축 CSV.

GitHub Actions 처럼 원본 CSV(서울교통공사, 25MB)가 없는 곳에서 build-db 가 이 파일을 대신 읽는다.
원본이 새로 나오면: 원본 CSV를 backend/data/raw/csv/ 에 두고 build-db → export-seed 로 다시 만든다.
같은 DB에서는 늘 같은 파일이 나오도록(바이트까지) 정렬하고 압축 시각을 0으로 고정한다.
"""

from __future__ import annotations

import csv
import gzip
import io
import sqlite3
from pathlib import Path

COLUMNS = ["date", "station_id", "line", "hour", "board", "alight"]


def export(db_path: Path, out_path: Path) -> int:
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(f"SELECT {', '.join(COLUMNS)} FROM ridership_daily "
                           "ORDER BY date, station_id, line, hour").fetchall()
    finally:
        con.close()
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(COLUMNS)
    w.writerows(("" if v is None else v for v in r) for r in rows)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".tmp")
    with open(tmp, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, filename="") as gz:
        gz.write(buf.getvalue().encode("utf-8"))
    tmp.replace(out_path)
    return len(rows)


def load(path: Path) -> list[tuple]:
    """→ build-db 에 넣을 (date, station_id, line, hour, board, alight) 행."""
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        if next(reader) != COLUMNS:
            raise ValueError(f"{path.name}: 열 이름이 예상과 다릅니다")
        num = lambda v: int(v) if v != "" else None  # noqa: E731
        return [(d, sid, line, int(h), num(b), num(a)) for d, sid, line, h, b, a in reader]
