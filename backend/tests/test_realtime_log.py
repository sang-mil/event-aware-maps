"""실시간 지역 혼잡 기록 테스트. 응답 값은 가짜 테스트 값이다(형태만 Worker 응답을 따름)."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from collectors import CollectError, realtime_log  # noqa: E402

KST = timezone(timedelta(hours=9))
NOW = datetime(2099, 1, 10, 20, 0, tzinfo=KST)


def body(level="보통", observed="2099-01-10 19:55"):
    return {"area": {"name": "가짜지역", "code": "POI000"},
            "crowd": {"level": level, "message": "긴 안내 문장", "population_min": "100", "population_max": "200",
                      "observed_at": observed},
            "source": "서울특별시 공공데이터 · 서울시 실시간 도시데이터"}


def fake_get(table):
    def get(url, source):
        key = url.rsplit("/", 1)[-1]
        v = table[key]
        if isinstance(v, Exception):
            raise v
        return json.dumps(v, ensure_ascii=False)
    return get


def test_collect_writes_one_line_per_area(tmp_path):
    n, errors = realtime_log.collect("https://w.example", tmp_path, NOW,
                                     fake_get({"olympic-park": body(), "jamsil": body("붐빔")}))
    assert (n, errors) == (2, [])
    lines = [json.loads(x) for x in (tmp_path / "2099-01-10.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [(x["area_key"], x["level"]) for x in lines] == [("olympic-park", "보통"), ("jamsil", "붐빔")]
    assert set(lines[0]) == {"area_key", "area_name", "area_code", "level", "population_min", "population_max",
                             "observed_at", "fetched_at", "source"}        # 긴 안내 문장 등은 남기지 않음


def test_same_observation_is_not_duplicated(tmp_path):
    get = fake_get({"olympic-park": body(), "jamsil": body()})
    realtime_log.collect("https://w.example", tmp_path, NOW, get)
    n, _ = realtime_log.collect("https://w.example", tmp_path, NOW + timedelta(minutes=30), get)
    assert n == 0                                                       # 관측 시각이 그대로면 안 씀
    n, _ = realtime_log.collect("https://w.example", tmp_path, NOW, fake_get(
        {"olympic-park": body(observed="2099-01-10 20:25"), "jamsil": body()}))
    assert n == 1


def test_one_area_failing_does_not_block_the_other(tmp_path):
    n, errors = realtime_log.collect("https://w.example", tmp_path, NOW, fake_get(
        {"olympic-park": CollectError("realtime_olympic-park: HTTP 502"), "jamsil": body()}))
    assert n == 1 and len(errors) == 1 and "HTTP 502" in errors[0]


def test_response_without_observation_time_is_skipped(tmp_path):
    empty = body()
    empty["crowd"]["observed_at"] = None
    n, errors = realtime_log.collect("https://w.example", tmp_path, NOW, fake_get({"olympic-park": empty, "jamsil": empty}))
    assert n == 0 and len(errors) == 2 and not list(tmp_path.glob("*.jsonl"))
