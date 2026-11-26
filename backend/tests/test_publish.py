"""발행 단계 테스트. 입력은 data-contract/mock 의 목업(스키마 통과가 확인된 예시)을 쓴다."""

from __future__ import annotations

import copy
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import cli  # noqa: E402
from publish import PublishError, publish, wrap  # noqa: E402

MOCK_DIR = BACKEND.parent / "data-contract" / "mock"
KST = timezone(timedelta(hours=9))


def mock(name: str) -> dict:
    return json.loads((MOCK_DIR / name).read_text(encoding="utf-8"))


def test_valid_files_are_written(tmp_path):
    files = {"stations.json": mock("stations.json"), "venues.json": mock("venues.json")}
    written = publish(files, tmp_path)
    assert sorted(p.name for p in written) == ["stations.json", "venues.json"]
    assert json.loads((tmp_path / "stations.json").read_text(encoding="utf-8")) == files["stations.json"]
    assert not list(tmp_path.glob("*.tmp"))


def test_invalid_file_keeps_existing_output(tmp_path):
    good = mock("station-bangi-2025-08-09.json")
    publish({"station-bangi-2025-08-09.json": good}, tmp_path)
    before = (tmp_path / "station-bangi-2025-08-09.json").read_bytes()

    bad = copy.deepcopy(good)
    bad["data"]["slots"][0]["level"] = 3  # 숫자 단계는 허용하지 않음
    with pytest.raises(PublishError) as e:
        publish({"station-bangi-2025-08-09.json": bad}, tmp_path)

    assert "station-bangi-2025-08-09.json" in e.value.failures
    assert (tmp_path / "station-bangi-2025-08-09.json").read_bytes() == before


def test_one_failure_blocks_whole_batch(tmp_path):
    bad = mock("venues.json")
    del bad["updated_at"]
    with pytest.raises(PublishError):
        publish({"stations.json": mock("stations.json"), "venues.json": bad}, tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_unknown_filename_is_rejected(tmp_path):
    with pytest.raises(PublishError):
        publish({"something.json": mock("stations.json")}, tmp_path)


def test_wrap_uses_as_of_with_offset():
    as_of = datetime(2025, 8, 9, 18, 5, tzinfo=KST)
    body = wrap(mock("stations.json")["data"], as_of)
    assert body["updated_at"] == "2025-08-09T18:05:00+09:00"
    assert body["schema_version"] == "1.0"
    with pytest.raises(ValueError):
        wrap([], datetime(2025, 8, 9, 18, 5))


def test_cli_publish_exit_codes(tmp_path):
    src, out = tmp_path / "src", tmp_path / "out"
    src.mkdir()
    (src / "stations.json").write_text(json.dumps(mock("stations.json")), encoding="utf-8")
    assert cli.main(["publish", "--src", str(src), "--out", str(out)]) == 0
    assert (out / "stations.json").exists()

    broken = mock("stations.json")
    broken["data"][0]["has_data"] = "yes"
    (src / "stations.json").write_text(json.dumps(broken), encoding="utf-8")
    before = (out / "stations.json").read_bytes()
    assert cli.main(["publish", "--src", str(src), "--out", str(out)]) == 1
    assert (out / "stations.json").read_bytes() == before
