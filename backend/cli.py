"""배치 실행 명령.

    python backend/cli.py collect                       # 원자료 수집 (2-2에서 구현)
    python backend/cli.py build                         # 행사 반영 → 혼잡 계산 → 추천 (2-3~2-5에서 구현)
    python backend/cli.py publish --src 폴더 --out 폴더   # src 의 JSON을 검증해 out 에 발행

publish 는 하나라도 검증에 실패하면 out 의 기존 파일을 그대로 두고 종료 코드 1로 끝난다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from publish import PublishError, publish  # noqa: E402


def cmd_publish(src: Path, out: Path) -> int:
    files = {p.name: json.loads(p.read_text(encoding="utf-8")) for p in sorted(src.glob("*.json"))}
    if not files:
        print(f"발행할 JSON이 없습니다: {src}")
        return 1
    try:
        written = publish(files, out)
    except PublishError as e:
        print(e)
        return 1
    print(f"{len(written)}개 파일 발행: {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cli.py")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("collect", help="원자료 수집")
    sub.add_parser("build", help="행사 반영, 혼잡 계산, 추천 생성")
    p = sub.add_parser("publish", help="검증 후 발행")
    p.add_argument("--src", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command == "publish":
        return cmd_publish(args.src, args.out)
    print(f"'{args.command}' 는 아직 만들지 않았습니다 (2단계 다음 작업).")
    return 2


if __name__ == "__main__":
    sys.exit(main())
