"""지하철 승하차 원본 → (날짜 또는 월, 역 id, 노선, 시간대, 승차, 하차) 행.

시간대(hour) 규칙: 0~23 은 그 시각부터 1시간. 서울교통공사 1~8호선 CSV는 앞뒤를 묶어서 주므로
'06시이전' 합계는 -1, '24시이후' 합계는 24 로 둔다(정확한 시각을 모르므로 따로 표시).
빈 칸은 0으로 채우지 않고 None(모름)으로 둔다. 대상 역이 아닌 행은 버린다.
"""

from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from pathlib import Path

from .stations import line_no, station_id

EARLY, LATE = -1, 24


def read_csv_text(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"인코딩을 알 수 없는 파일: {path.name}")


def _num(v) -> int | None:
    s = str(v).replace(",", "").strip() if v is not None else ""
    if not s:
        return None
    return int(float(s))


def _hour_of(col: str) -> int | None:
    if "이전" in col:
        return EARLY
    if "이후" in col:
        return LATE
    m = re.match(r"(\d{2})\s*시?\s*-", col)
    return int(m.group(1)) if m else None


def _direction(v: str) -> str | None:
    v = (v or "").strip()
    return "board" if v.endswith("승차") else "alight" if v.endswith("하차") else None


def parse_daily_csv(text: str) -> tuple[list[tuple], dict]:
    """서울교통공사 일별 시간대별 CSV (1~8호선 형식, 9호선 형식 모두) → 행 목록과 건너뛴 사유별 개수."""
    reader = csv.reader(io.StringIO(text))
    header = next(reader)
    date_col = header.index("수송일자") if "수송일자" in header else header.index("날짜")
    name_col = header.index("역명") if "역명" in header else header.index("역사명")
    dir_col = header.index("승하차구분") if "승하차구분" in header else header.index("구분")
    line_col = header.index("호선")
    hour_cols = [(i, h) for i, c in enumerate(header) if (h := _hour_of(c)) is not None]

    acc: dict[tuple, dict] = defaultdict(lambda: {"board": None, "alight": None})
    skipped: dict[str, int] = defaultdict(int)
    for row in reader:
        if len(row) < len(header):
            skipped["열 부족"] += 1
            continue
        sid, line = station_id(row[name_col]), line_no(row[line_col])
        if sid is None:
            continue
        date, direction = row[date_col].strip(), _direction(row[dir_col])
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) or direction is None or line is None:
            skipped["날짜·구분·노선 없음"] += 1
            continue
        for i, hour in hour_cols:
            acc[(date, sid, line, hour)][direction] = _num(row[i])
    rows = [(*k, v["board"], v["alight"]) for k, v in sorted(acc.items())]
    return rows, dict(skipped)


def parse_monthly_api(payload: dict) -> list[tuple]:
    """collect subway_month 결과 → (월 YYYY-MM, 역 id, 노선, 시간대, 승차, 하차) 행."""
    out = []
    for r in payload.get("rows", []):
        sid, line = station_id(r.get("STTN", "")), line_no(r.get("SBWY_ROUT_LN_NM", ""))
        if sid is None or line is None:
            continue
        mm = str(r["USE_MM"])
        month = f"{mm[:4]}-{mm[4:6]}"
        for hour in range(24):
            out.append((month, sid, line, hour, _num(r.get(f"HR_{hour}_GET_ON_NOPE")), _num(r.get(f"HR_{hour}_GET_OFF_NOPE"))))
    return out
