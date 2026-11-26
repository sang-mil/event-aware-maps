"""행사 반영 테스트. 공연명·인원은 가짜 테스트 값이다 (2025 원자료의 표기 형태만 따름)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import cli  # noqa: E402
from events import detect, outputs  # noqa: E402
from normalize import db  # noqa: E402
from publish.schema import errors_of  # noqa: E402

# 원자료처럼 두 공연이 "A\n, B" 와 "B, A" 로 합쳐진 시간대가 있음
ROWS = [
    ("2099-01-02", 14, "공연가", 100),
    ("2099-01-02", 15, "공연가", 100),
    ("2099-01-02", 16, "공연가\n, 공연나", 300),
    ("2099-01-02", 17, "공연나, 공연가", 300),
    ("2099-01-02", 18, "공연가", 100),
    ("2099-01-05", 19, "쇼 〈하나, 둘〉", 50),  # 공연명 안의 쉼표는 나누지 않음
    ("2099-01-05", 20, "쇼 〈하나, 둘〉", 50),
]


def test_split_and_group_events():
    events = detect.detect_events(ROWS)
    got = [(e.date, e.title, e.hours, e.audience, e.exit_hour) for e in events]
    assert got == [
        ("2099-01-02", "공연가", [14, 15, 16, 17, 18], 100, 18),
        ("2099-01-02", "공연나", [16, 17], None, 17),  # 혼자 표시된 적이 없어 관람객수 모름
        ("2099-01-05", "쇼 〈하나, 둘〉", [19, 20], 50, 20),
    ]


def test_event_id_is_stable():
    a = detect.detect_events(ROWS)[0]
    b = detect.detect_events(list(reversed(ROWS)))[0]
    assert a.id == b.id and a.id.startswith("evt_20990102_")


def test_outputs_match_schema_and_rules():
    events = detect.detect_events(ROWS)
    files = outputs.build_files(events, "2099-01-01", "2099-02-01")
    assert len(files) == 32 + 2  # 32일 + 1·2월 달력
    for name, data in files.items():
        body = {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00+09:00", "data": data}
        assert errors_of(name, body) == [], name

    day = files["events-2099-01-02.json"]
    assert [e["end_at"] for e in day["events"]] == ["2099-01-02T18:00:00+09:00", "2099-01-02T17:00:00+09:00"]
    assert all(e["venue_id"] is None and e["linkable"] is False and e["end_at_source"] == "estimated" for e in day["events"])
    assert files["events-2099-01-03.json"]["next_event"]["date"] == "2099-01-05"
    assert files["events-2099-01-06.json"]["next_event"] is None
    cal = files["calendar-2099-01.json"]["days"]
    assert [(d["date"], d["count"]) for d in cal] == [("2099-01-02", 2), ("2099-01-05", 1)]
    assert files["calendar-2099-02.json"]["days"] == []


def test_cli_build_publishes_with_as_of(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    items = [{"TITLE": f"공연명:{t},공연관람객수:{a}", "ISSUED_DATE": f"{d} {h:02d}:00:00", "DESCRIPTION": "주차대수:1"}
             for d, h, t, a in ROWS]
    (raw / "kspo_linked.json").write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")
    db.build(raw, tmp_path / "t.db")
    out = tmp_path / "site"
    assert cli.main(["build", "--db", str(tmp_path / "t.db"), "--out", str(out), "--as-of", "2099-01-10T09:00:00+09:00"]) == 0
    body = json.loads((out / "events-2099-01-02.json").read_text(encoding="utf-8"))
    assert body["updated_at"] == "2099-01-10T09:00:00+09:00"
    assert len(body["data"]["events"]) == 2
    assert cli.main(["build", "--db", str(tmp_path / "없음.db"), "--out", str(out)]) == 1
    assert cli.main(["build", "--db", str(tmp_path / "t.db"), "--out", str(out), "--as-of", "2099-01-10T09:00:00"]) == 1
