"""승하차 요약(seed) 테스트. 값은 가짜 테스트 값이다."""

from __future__ import annotations

import gzip
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import cli  # noqa: E402
from normalize import db, seed  # noqa: E402

CSV_9 = (
    "연번,날짜,호선,역번호,역사명,구분,20시-21시,21시-22시\n"
    "1,2099-01-01,9,4136,올림픽공원,순승차,70,\n"
    "2,2099-01-01,9,4136,올림픽공원,순하차,7,8\n"
)


def _db_from_csv(tmp_path) -> Path:
    raw = tmp_path / "raw"
    (raw / "csv").mkdir(parents=True)
    (raw / "csv" / "a.csv").write_text(CSV_9, encoding="utf-8")
    db.build(raw, tmp_path / "a.db")
    return tmp_path / "a.db"


def test_export_and_load_round_trip_keeps_blanks(tmp_path):
    out = tmp_path / "seed.csv.gz"
    assert seed.export(_db_from_csv(tmp_path), out) == 2
    assert seed.load(out) == [("2099-01-01", "olympic_park", "9", 20, 70, 7),
                              ("2099-01-01", "olympic_park", "9", 21, None, 8)]  # 빈칸은 0이 아니라 모름


def test_export_is_byte_identical(tmp_path):
    a, b = tmp_path / "a.gz", tmp_path / "b.gz"
    path = _db_from_csv(tmp_path)
    seed.export(path, a)
    seed.export(path, b)
    assert a.read_bytes() == b.read_bytes()


def test_build_db_uses_seed_only_without_csv(tmp_path):
    out = tmp_path / "seed.csv.gz"
    seed.export(_db_from_csv(tmp_path), out)
    empty_raw = tmp_path / "empty"
    empty_raw.mkdir()
    report = db.build(empty_raw, tmp_path / "b.db", seed_path=out)
    assert report["counts"]["ridership_daily"] == 2 and report["sources"] == ["seed.csv.gz"]
    report2 = db.build(tmp_path / "raw", tmp_path / "c.db", seed_path=out)  # 원본이 있으면 원본 우선
    assert report2["sources"] == ["a.csv"]


def test_load_rejects_wrong_columns(tmp_path):
    bad = tmp_path / "bad.csv.gz"
    with gzip.open(bad, "wt", encoding="utf-8") as f:
        f.write("a,b\n1,2\n")
    with pytest.raises(ValueError):
        seed.load(bad)


def test_cli_export_seed(tmp_path, capsys):
    path = _db_from_csv(tmp_path)
    out = tmp_path / "s" / "seed.csv.gz"
    assert cli.main(["export-seed", "--db", str(path), "--out", str(out)]) == 0
    assert out.exists() and "2행" in capsys.readouterr().out
    assert cli.main(["export-seed", "--db", str(tmp_path / "없음.db"), "--out", str(out)]) == 1
