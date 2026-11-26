"""HTTP 요청. 표준 라이브러리(urllib)만 쓴다."""

from __future__ import annotations

import urllib.error
import urllib.request

TIMEOUT_SEC = 30


class CollectError(Exception):
    """수집 실패. 메시지에 인증키나 주소를 넣지 않는다."""


def get_text(url: str, source: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "tumgil-collector"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as res:
            return res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise CollectError(
                f"{source}: HTTP 429 (요청이 너무 많음). 하루 호출 한도를 넘었거나 한 번에 요청한 건수가 너무 큽니다. "
                "--page-size 를 줄이거나 다음 날 다시 실행하세요"
            ) from None
        raise CollectError(f"{source}: HTTP {e.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise CollectError(f"{source}: 연결 실패 ({type(e).__name__})") from None
