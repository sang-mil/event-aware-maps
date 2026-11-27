"""HTTP 요청. 표준 라이브러리(urllib)만 쓴다."""

from __future__ import annotations

import urllib.error
import urllib.request

TIMEOUT_SEC = 30


class CollectError(Exception):
    """수집 실패. 메시지에 인증키나 주소를 넣지 않는다."""


class RateLimited(CollectError):
    """HTTP 429. 잠시 기다렸다가 다시 시도할 수 있다."""


def _limit_detail(e: urllib.error.HTTPError) -> str:
    """서버가 알려 준 한도 정보(제한·남은 횟수·초기화까지 시간)와 메시지. 키나 주소는 넣지 않는다."""
    headers = e.headers or {}
    limits = [f"{k}={v}" for k, v in headers.items() if "ratelimit" in k.lower() or k.lower() == "retry-after"]
    try:
        body = (e.read(300) or b"").decode("utf-8", "replace").strip().replace("\n", " ")
    except OSError:
        body = ""
    parts = ([f"서버 한도 정보: {', '.join(limits)}"] if limits else []) + ([f"서버 메시지: {body}"] if body else [])
    return ("\n  " + "\n  ".join(parts)) if parts else ""


def get_text(url: str, source: str, headers: dict[str, str] | None = None) -> str:
    request_headers = {"User-Agent": "tumgil-collector", **(headers or {})}
    req = urllib.request.Request(url, headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as res:
            return res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise RateLimited(f"{source}: HTTP 429 (요청이 너무 많음)" + _limit_detail(e)) from None
        raise CollectError(f"{source}: HTTP {e.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise CollectError(f"{source}: 연결 실패 ({type(e).__name__})") from None
