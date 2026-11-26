"""정리 단계 테스트. 모든 숫자는 가짜 테스트 값이다 (원자료의 형태만 따름)."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import cli  # noqa: E402
from normalize import db, kspo, ridership, stations  # noqa: E402

FIX = Path(__file__).parent / "fixtures"

# 1~8호선 형식 (앞뒤 시간대를 묶은 열이 있음). 가짜 값
CSV_1_8 = (
    "연번,수송일자,호선,역번호,역명,승하차구분,06시이전,06-07시간대,20-21시간대,24시이후\n"
    "1,2099-01-01,5호선,1,올림픽공원(한국체대),승차,1,2,300,4\n"
    "2,2099-01-01,5호선,1,올림픽공원(한국체대),하차,5,6,100,\n"
    "3,2099-01-01,1호선,2,서울역,승차,9,9,9,9\n"
    "4,,5호선,1,올림픽공원(한국체대),,1,1,1,1\n"
)
# 9호선 형식 (24개 시간대, 순승차/순하차). 가짜 값
CSV_9 = (
    "연번,날짜,호선,역번호,역사명,구분,20시-21시,21시-22시\n"
    "1,2099-01-01,9,4136,올림픽공원,순승차,70,80\n"
    "2,2099-01-01,9,4136,올림픽공원,순하차,7,8\n"
)


def test_station_mapping():
    assert stations.station_id("올림픽공원(한국체대)") == "olympic_park"
    assert stations.station_id("몽촌토성(평화의문)") == "mongchontoseong"
    assert stations.station_id("방이역") == "bangi"
    assert stations.station_id("부천종합운동장") is None
    assert stations.line_no("9호선2~3단계") == "9" and stations.line_no("5호선") == "5"


def test_parse_daily_csv_1_8_format():
    rows, skipped = ridership.parse_daily_csv(CSV_1_8)
    assert rows == [
        ("2099-01-01", "olympic_park", "5", -1, 1, 5),
        ("2099-01-01", "olympic_park", "5", 6, 2, 6),
        ("2099-01-01", "olympic_park", "5", 20, 300, 100),
        ("2099-01-01", "olympic_park", "5", 24, 4, None),  # 빈 칸은 0이 아니라 모름
    ]
    assert skipped == {"날짜·구분·노선 없음": 1}  # 서울역(대상 아님)은 사유 없이 제외


def test_parse_daily_csv_9_format():
    rows, _ = ridership.parse_daily_csv(CSV_9)
    assert rows == [("2099-01-01", "olympic_park", "9", 20, 70, 7), ("2099-01-01", "olympic_park", "9", 21, 80, 8)]


def test_parse_monthly_api():
    fixture_rows = json.loads((FIX / "seoul_subway_month.json").read_text(encoding="utf-8"))["CardSubwayTime"]["row"]
    assert len(fixture_rows) == 2
    assert ridership.parse_monthly_api({"rows": fixture_rows}) == []  # fixture 의 역 이름은 대상 역이 아님
    payload = {"rows": [{"USE_MM": "209901", "SBWY_ROUT_LN_NM": "9호선2~3단계", "STTN": "올림픽공원(한국체대)",
                         "HR_20_GET_ON_NOPE": 31.0, "HR_20_GET_OFF_NOPE": 3.0}]}
    rows = ridership.parse_monthly_api(payload)
    assert len(rows) == 24
    assert ("2099-01", "olympic_park", "9", 20, 31, 3) in rows
    assert ("2099-01", "olympic_park", "9", 4, None, None) in rows


def test_parse_linked_item_with_newline_in_title():
    row = kspo.parse_linked_item({
        "TITLE": "공연명:테스트 공연 〈A, B〉\n,공연관람객수:1,234",
        "ISSUED_DATE": "2099-01-01 20:00:00",
        "DESCRIPTION": "주차대수:10,방문객:50, 기온:-1.5, 풍향:2.0, 강수량:, 습도:30,휴일:신정",
    })
    assert row == ("2099-01-01T20:00:00", "테스트 공연 〈A, B〉", 1234, 10.0, 50.0, -1.5, 2.0, None, 30.0, "신정")
    empty = kspo.parse_linked_item({"TITLE": "공연명:,공연관람객수:0", "ISSUED_DATE": "2099-01-01 21:00:00", "DESCRIPTION": "휴일:"})
    assert empty[1] is None and empty[2] == 0 and empty[-1] is None


@pytest.mark.parametrize("text,minutes", [("120분", 120), ("4시간 30분", 270), ("1시간", 60), ("총 150분 예상", 150), (".", None), ("", None)])
def test_duration_min(text, minutes):
    assert kspo.duration_min(text) == minutes


def _make_raw(raw: Path):
    (raw / "csv").mkdir(parents=True)
    (raw / "csv" / "a.csv").write_bytes(CSV_1_8.encode("cp949"))  # 실제 파일처럼 cp949
    (raw / "csv" / "b.csv").write_text(CSV_9, encoding="utf-8")
    items = [{"TITLE": "공연명:테스트,공연관람객수:5", "ISSUED_DATE": "2099-01-01 20:00:00", "DESCRIPTION": "주차대수:1"}]
    (raw / "kspo_linked.json").write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")
    (raw / "kspo_perf.json").write_text(json.dumps({"items": [{"title": "t", "extent": "90분"}]}), encoding="utf-8")


def test_build_db_counts_and_index_order(tmp_path):
    _make_raw(tmp_path / "raw")
    report = db.build(tmp_path / "raw", tmp_path / "t.db")
    assert report["counts"] == {"ridership_daily": 6, "ridership_monthly": 0, "park_hourly": 1, "performances": 1}
    con = sqlite3.connect(tmp_path / "t.db")
    plan = con.execute("EXPLAIN QUERY PLAN SELECT board FROM ridership_daily "
                       "WHERE station_id='olympic_park' AND date='2099-01-01' AND hour=20").fetchall()
    assert "PRIMARY KEY" in str(plan)  # 처음부터 뒤지지 않고 색인으로 찾음
    assert con.execute("SELECT duration_min FROM performances").fetchone() == (90,)


def test_build_db_failure_keeps_old_db(tmp_path):
    _make_raw(tmp_path / "raw")
    target = tmp_path / "t.db"
    target.write_bytes(b"old")
    (tmp_path / "raw" / "csv" / "dup.csv").write_text(CSV_9, encoding="utf-8")  # 같은 날짜·역·시간대 중복
    with pytest.raises(ValueError):
        db.build(tmp_path / "raw", target)
    assert target.read_bytes() == b"old"
    assert not target.with_suffix(".db.tmp").exists()


def test_cli_build_db(tmp_path, capsys):
    _make_raw(tmp_path / "raw")
    assert cli.main(["build-db", "--raw-dir", str(tmp_path / "raw"), "--db", str(tmp_path / "t.db")]) == 0
    assert "ridership_daily: 6행" in capsys.readouterr().out
