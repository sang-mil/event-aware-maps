"""배치 실행 명령.

    python backend/cli.py collect kspo_linked              # KSPO 연계 데이터(1시간 단위 공연·주차·날씨) 전체
    python backend/cli.py collect kspo_perf                # KSPO 공연정보 전체
    python backend/cli.py collect subway_month --month 202510   # 지하철 월별·시간대별 승하차
    python backend/cli.py build                            # 행사 반영 → 혼잡 계산 → 추천 (다음 작업)
    python backend/cli.py publish --src 폴더 --out 폴더      # src 의 JSON을 검증해 out 에 발행

collect 는 인증키를 환경변수에서 읽고(backend/.env 파일이 있으면 그것도 읽음, 형식은 backend/env.example), 결과를 backend/data/raw/ 에 저장한다(이 폴더는 git에 올라가지 않음).
publish 는 하나라도 검증에 실패하면 out 의 기존 파일을 그대로 두고 종료 코드 1로 끝난다.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND))

from collectors import CollectError, kspo, seoul_subway  # noqa: E402
from publish import PublishError, publish  # noqa: E402

RAW_DIR = BACKEND / "data" / "raw"
ENV_FILE = BACKEND / ".env"  # backend/.env. .gitignore 로 git에 올라가지 않음. 형식은 backend/env.example
KST = timezone(timedelta(hours=9))


def load_env_file(path: Path) -> None:
    """KEY=값 줄을 읽어 환경변수로 넣는다. 이미 있는 환경변수는 덮어쓰지 않는다. 값은 출력하지 않는다."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = (part.strip() for part in line.split("=", 1))
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if name and value:
            os.environ.setdefault(name, value)

# 수집 종류 → 필요한 환경변수
KEY_ENV = {
    "kspo_linked": "KSPO_LINKED_KEY",
    "kspo_perf": "KSPO_PERF_KEY",
    "subway_month": "SEOUL_KEY",
}


def cmd_collect(source: str, month: str | None, raw_dir: Path, page_size: int | None = None) -> int:
    env = KEY_ENV[source]
    key = os.environ.get(env, "").strip()
    if not key:
        print(f"환경변수 {env} 에 인증키가 없습니다.")
        return 1
    try:
        if source == "subway_month":
            if not month:
                print("subway_month 는 --month YYYYMM 이 필요합니다.")
                return 1
            result = seoul_subway.fetch_month(key, month)
            name = f"subway_month_{month}.json"
        else:
            extra = {"page_size": page_size} if page_size else {}
            result = kspo.fetch_all(source.removeprefix("kspo_"), key, **extra)
            name = f"{source}.json"
    except CollectError as e:
        print(f"수집 실패: {e}")
        return 1

    result = {"source": source, "fetched_at": datetime.now(KST).isoformat(timespec="seconds"), **result}
    raw_dir.mkdir(parents=True, exist_ok=True)
    target = raw_dir / name
    tmp = target.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, target)
    count = len(result.get("items", result.get("rows", [])))
    print(f"{source}: {count}건 저장 (전체 {result['total']}건) → {target}")
    return 0


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
    c = sub.add_parser("collect", help="원자료 수집")
    c.add_argument("source", choices=sorted(KEY_ENV))
    c.add_argument("--month", help="YYYYMM (subway_month 전용)")
    c.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    c.add_argument("--page-size", type=int, help="KSPO 한 번에 받을 건수 (기본 1000)")
    sub.add_parser("build", help="행사 반영, 혼잡 계산, 추천 생성")
    p = sub.add_parser("publish", help="검증 후 발행")
    p.add_argument("--src", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command == "collect":
        return cmd_collect(args.source, args.month, args.raw_dir, args.page_size)
    if args.command == "publish":
        return cmd_publish(args.src, args.out)
    print(f"'{args.command}' 는 아직 만들지 않았습니다 (2단계 다음 작업).")
    return 2


if __name__ == "__main__":
    load_env_file(ENV_FILE)
    sys.exit(main())
