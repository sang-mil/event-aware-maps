"""수집기 테스트. 외부 접속 없이 가짜 응답(fixtures)으로만 돈다."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import cli  # noqa: E402
from collectors import CollectError, kspo, seoul_subway  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
SECRET = "TEST-KEY-123"
NO_WAIT = lambda seconds: None  # noqa: E731  테스트에서는 실제로 기다리지 않음


def test_cli_kopis_uses_worker_token_without_kopis_api_key(tmp_path, monkeypatch):
    monkeypatch.delenv("KOPIS_API_KEY", raising=False)
    monkeypatch.setenv("KOPIS_PROXY_URL", "https://example.workers.dev")
    monkeypatch.setenv("KOPIS_PROXY_TOKEN", "TEST-PROXY-TOKEN")
    seen = {}

    def fake_fetch_range(key, start, days):
        seen.update(key=key, start=start, days=days)
        return {"window": {"start": "2026-12-01", "end": "2026-12-07"}, "performances": [],
                "facilities": [], "skipped": [], "attribution": "출처"}

    monkeypatch.setattr(cli.kopis_collector, "fetch_range", fake_fetch_range)
    assert cli.cmd_collect("kopis", None, tmp_path, start="2026-12-01", days=7) == 0
    assert seen["key"] == ""
    assert seen["days"] == 7
    saved = json.loads((tmp_path / "kopis_upcoming.json").read_text(encoding="utf-8"))
    assert saved["performances"] == []


def fixture(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


def kspo_xml(items: int, total: int, code: str = "0000") -> str:
    body = "".join(f"<item><LOCAL_ID>{i}</LOCAL_ID></item>" for i in range(items))
    return (f"<response><header><resultCode>{code}</resultCode><resultMsg>m</resultMsg></header>"
            f"<body><items>{body}</items><totalCount>{total}</totalCount></body></response>")


# ── KSPO ──────────────────────────────────────────────

def test_kspo_parse_linked_fields():
    total, items = kspo.parse_page(fixture("kspo_linked_page.xml"), "t")
    assert total == 2
    assert items[0]["TITLE"] == "공연명:테스트공연,공연관람객수:100"
    assert items[0]["ISSUED_DATE"] == "2025-01-01 20:00:00"
    assert items[1]["DESCRIPTION"].startswith("주차대수:5")


def test_kspo_parse_perf_fields():
    _, items = kspo.parse_page(fixture("kspo_perf_page.xml"), "t")
    assert items == [{
        "title": "테스트 공연", "regDate": "2025-01-01 00:00:00", "subjectKeyword": "올림픽홀",
        "extent": "120분", "spatial": "올림픽홀", "temporalCoverage": "19:30",
    }]


def test_kspo_error_code_raises_without_key():
    with pytest.raises(CollectError) as e:
        kspo.parse_page(kspo_xml(0, 0, code="F2013"), "kspo_linked")
    assert "F2013" in str(e.value)


def test_kspo_fetch_all_pages_and_key_in_query_only():
    calls = []

    def fake_get(url, source):
        calls.append(url)
        page = int(parse_qs(urlparse(url).query)["pageNo"][0])
        return kspo_xml(kspo.PAGE_SIZE if page == 1 else 5, kspo.PAGE_SIZE + 5)

    result = kspo.fetch_all("linked", SECRET, get=fake_get, wait=NO_WAIT)
    assert result["total"] == kspo.PAGE_SIZE + 5
    assert len(result["items"]) == kspo.PAGE_SIZE + 5
    assert len(calls) == 2
    assert parse_qs(urlparse(calls[0]).query)["serviceKey"] == [SECRET]


def test_kspo_short_page_stops_instead_of_skipping():
    with pytest.raises(CollectError):
        kspo.fetch_all("perf", SECRET, get=lambda url, source: kspo_xml(100, 5000), wait=NO_WAIT)


def test_kspo_page_size_is_used_in_url_and_paging():
    calls = []

    def fake_get(url, source):
        q = parse_qs(urlparse(url).query)
        calls.append((q["numOfRows"][0], q["pageNo"][0]))
        return kspo_xml(100 if q["pageNo"][0] != "3" else 50, 250)

    result = kspo.fetch_all("linked", SECRET, get=fake_get, page_size=100, wait=NO_WAIT)
    assert len(result["items"]) == 250
    assert calls == [("100", "1"), ("100", "2"), ("100", "3")]


def test_http_429_message_has_no_key(monkeypatch):
    import urllib.error
    import urllib.request

    from collectors import http

    import io
    from email.message import Message

    def raise_429(req, timeout):
        hdrs = Message()
        hdrs["X-RateLimit-Remaining-Day"] = "0"
        hdrs["Content-Type"] = "application/json"
        body = io.BytesIO(b'{"message":"API rate limit exceeded"}')
        raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", hdrs, body)

    monkeypatch.setattr(urllib.request, "urlopen", raise_429)
    with pytest.raises(CollectError) as e:
        http.get_text(kspo.page_url("linked", SECRET, 1), "kspo_linked")
    assert "429" in str(e.value)
    assert "X-RateLimit-Remaining-Day=0" in str(e.value)
    assert "API rate limit exceeded" in str(e.value)
    assert "Content-Type" not in str(e.value)
    assert SECRET not in str(e.value)


def test_http_500_is_retryable_without_exposing_key(monkeypatch):
    import urllib.error
    import urllib.request

    from collectors.http import RetryableServerError

    def raise_500(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 500, "Internal Server Error", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", raise_500)
    with pytest.raises(RetryableServerError) as e:
        kspo.get_text(kspo.page_url("linked", SECRET, 1), "kspo_linked")
    assert "HTTP 500" in str(e.value)
    assert SECRET not in str(e.value)


def test_kspo_waits_between_pages_and_retries_429():
    from collectors.http import RateLimited

    waits, state = [], {"n": 0}

    def flaky_get(url, source):
        state["n"] += 1
        if state["n"] == 2:  # 두 번째 요청만 한도 초과
            raise RateLimited("kspo_linked: HTTP 429")
        page = parse_qs(urlparse(url).query)["pageNo"][0]
        return kspo_xml(10 if page == "1" else 5, 15)

    result = kspo.fetch_all("linked", SECRET, get=flaky_get, page_size=10, wait=waits.append)
    assert len(result["items"]) == 15
    assert waits == [kspo.MIN_INTERVAL_SEC, kspo.MIN_INTERVAL_SEC]  # 페이지 사이 1번 + 재시도 전 1번


def test_kspo_retries_transient_500_without_breaking_page_spacing():
    from collectors.http import RetryableServerError

    waits, state = [], {"n": 0}

    def flaky_get(url, source):
        state["n"] += 1
        page = int(parse_qs(urlparse(url).query)["pageNo"][0])
        if page == 2 and state["n"] == 2:
            raise RetryableServerError("kspo_linked: HTTP 500")
        return kspo_xml(10 if page == 1 else 5, 15)

    result = kspo.fetch_all("linked", SECRET, get=flaky_get, page_size=10, wait=waits.append)
    assert len(result["items"]) == 15
    assert state["n"] == 3
    assert waits == [kspo.MIN_INTERVAL_SEC, kspo.MIN_INTERVAL_SEC]


def test_kspo_stops_after_bounded_500_retries():
    from collectors.http import RetryableServerError

    waits, calls = [], []

    def always_500(url, source):
        calls.append(url)
        raise RetryableServerError("kspo_linked: HTTP 500")

    with pytest.raises(RetryableServerError):
        kspo.fetch_all("linked", SECRET, get=always_500, wait=waits.append)
    assert len(calls) == kspo.RETRIES_ON_SERVER_ERROR + 1
    assert waits == [kspo.MIN_INTERVAL_SEC, kspo.MIN_INTERVAL_SEC * 2]


def test_kspo_gives_up_after_retries():
    from collectors.http import RateLimited

    def always_429(url, source):
        raise RateLimited("kspo_linked: HTTP 429")

    with pytest.raises(RateLimited):
        kspo.fetch_all("linked", SECRET, get=always_429, wait=NO_WAIT)


# ── 서울 지하철 ────────────────────────────────────────

def test_subway_parse_rows():
    total, rows = seoul_subway.parse_page(fixture("seoul_subway_month.json"))
    assert total == 2
    assert rows[1]["SBWY_ROUT_LN_NM"] == "9호선2~3단계"
    assert rows[0]["HR_20_GET_ON_NOPE"] == 100.0


def test_subway_no_data_is_empty_not_error():
    assert seoul_subway.parse_page('{"RESULT":{"CODE":"INFO-200","MESSAGE":"없음"}}') == (0, [])


def test_subway_invalid_key_raises():
    with pytest.raises(CollectError) as e:
        seoul_subway.parse_page('{"RESULT":{"CODE":"INFO-100","MESSAGE":"인증키가 유효하지 않습니다."}}')
    assert "INFO-100" in str(e.value)


def test_subway_fetch_month_url_and_month_check():
    urls = []

    def fake_get(url, source):
        urls.append(url)
        return fixture("seoul_subway_month.json")

    result = seoul_subway.fetch_month(SECRET, "209901", get=fake_get)
    assert result["total"] == 2 and len(result["rows"]) == 2
    assert urls == [f"http://openapi.seoul.go.kr:8088/{SECRET}/json/CardSubwayTime/1/1000/209901/"]
    with pytest.raises(ValueError):
        seoul_subway.fetch_month(SECRET, "2099-01", get=fake_get)


# ── collect 명령 ──────────────────────────────────────

def test_cli_collect_needs_key(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("KSPO_LINKED_KEY", raising=False)
    assert cli.main(["collect", "kspo_linked", "--raw-dir", str(tmp_path)]) == 1
    assert "KSPO_LINKED_KEY" in capsys.readouterr().out
    assert list(tmp_path.iterdir()) == []


def test_cli_collect_saves_raw_without_key(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("KSPO_LINKED_KEY", SECRET)
    real_fetch_all = kspo.fetch_all
    monkeypatch.setattr(kspo, "fetch_all", lambda kind, key, **kw: real_fetch_all(
        kind, key, get=lambda url, source: fixture("kspo_linked_page.xml")))
    assert cli.main(["collect", "kspo_linked", "--raw-dir", str(tmp_path)]) == 0
    saved = (tmp_path / "kspo_linked.json").read_text(encoding="utf-8")
    assert json.loads(saved)["total"] == 2
    assert SECRET not in saved
    assert SECRET not in capsys.readouterr().out


def test_load_env_file_does_not_override(tmp_path, monkeypatch):
    env = tmp_path / "test.env"
    env.write_text('# 주석\nKSPO_PERF_KEY="from-file"\nSEOUL_KEY=from-file\nEMPTY_KEY=\n', encoding="utf-8")
    monkeypatch.delenv("KSPO_PERF_KEY", raising=False)
    monkeypatch.delenv("EMPTY_KEY", raising=False)
    monkeypatch.setenv("SEOUL_KEY", "already-set")
    cli.load_env_file(env)
    import os
    assert os.environ["KSPO_PERF_KEY"] == "from-file"
    assert os.environ["SEOUL_KEY"] == "already-set"
    assert "EMPTY_KEY" not in os.environ
    cli.load_env_file(tmp_path / "없는파일.env")  # 파일이 없어도 오류 없음


def test_cli_collect_failure_keeps_previous_file(tmp_path, monkeypatch):
    (tmp_path / "subway_month_209901.json").write_text("이전 파일", encoding="utf-8")
    monkeypatch.setenv("SEOUL_KEY", SECRET)

    def boom(*a, **k):
        raise CollectError("seoul_subway: HTTP 500")

    monkeypatch.setattr(seoul_subway, "fetch_month", boom)
    assert cli.main(["collect", "subway_month", "--month", "209901", "--raw-dir", str(tmp_path)]) == 1
    assert (tmp_path / "subway_month_209901.json").read_text(encoding="utf-8") == "이전 파일"
