"""외부 데이터 수집. 외부 호출은 이 폴더에만 둔다 (backend/CLAUDE.md).

인증키는 코드에 쓰지 않고 실행할 때 환경변수에서 받는다. 오류 메시지에도 키나 키가 든 주소를 남기지 않는다.
"""

from .http import CollectError

__all__ = ["CollectError"]
