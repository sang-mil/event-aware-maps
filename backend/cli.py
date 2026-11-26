"""배치 실행 명령.

    python backend/cli.py collect kspo_linked              # KSPO 연계 데이터(1시간 단위 공연·주차·날씨) 전체
    python backend/cli.py collect kspo_perf                # KSPO 공연정보 전체
    python backend/cli.py collect subway_month --month 202510   # 지하철 월별·시간대별 승하차
    python backend/cli.py build-db                         # 원본(raw) → SQLite 한 파일 (backend/data/tumgil.db). 원본 CSV가 없으면 요약(seed) 사용
    python backend/cli.py export-seed                      # DB → 승하차 요약 backend/data/seed/ridership_daily.csv.gz
    python backend/cli.py build --out 폴더 [--as-of 시각]   # 행사 반영·혼잡 계산 → stations·venues·calendar·events·event·forecast·station·compare·route JSON 검증 후 발행
    python backend/cli.py backtest                         # 공연 날마다 그날을 빼고 예측해 실제와 비교 (혼잡 단계 적중률)
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
from normalize import db as normalize_db, seed as normalize_seed  # noqa: E402
from congestion import backtest as cg_backtest, load as cg_load, model as cg_model, outputs as cg_outputs  # noqa: E402
from recommend import compare as rc_compare  # noqa: E402
import reference  # noqa: E402
from events import detail as ev_detail, detect as ev_detect, load as ev_load, outputs as ev_outputs  # noqa: E402
from publish import PublishError, publish, wrap  # noqa: E402

RAW_DIR = BACKEND / "data" / "raw"
DB_PATH = BACKEND / "data" / "tumgil.db"  # backend/.gitignore 로 git에 올라가지 않음
SEED_PATH = BACKEND / "data" / "seed" / "ridership_daily.csv.gz"  # 대상 역 승하차 요약 (git에 올림)
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
            print(f"{source}: 서버 제한(5초에 1번) 때문에 {kspo.MIN_INTERVAL_SEC:.0f}초 간격으로 받습니다.", flush=True)
            result = kspo.fetch_all(
                source.removeprefix("kspo_"), key,
                on_page=lambda page, got, total: print(f"  {page}페이지: {got}/{total}건", flush=True),
                **extra,
            )
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


def cmd_build_db(raw_dir: Path, db_path: Path, seed_path: Path = SEED_PATH) -> int:
    try:
        report = normalize_db.build(raw_dir, db_path, seed_path)
    except (ValueError, OSError) as e:
        print(f"DB 만들기 실패 (기존 DB는 그대로): {e}")
        return 1
    print(f"원본 {len(report['sources'])}개 → {db_path}")
    for table, n in report["counts"].items():
        print(f"  {table}: {n}행")
    for reason, n in report["skipped"].items():
        print(f"  건너뜀 {reason}: {n}행")
    return 0


def cmd_export_seed(db_path: Path, out: Path) -> int:
    if not db_path.is_file():
        print(f"DB가 없습니다. 먼저 build-db 를 실행하세요: {db_path}")
        return 1
    n = normalize_seed.export(db_path, out)
    print(f"승하차 요약 {n}행 → {out} ({out.stat().st_size / 1024:.0f}KB)")
    return 0


def cmd_build(db_path: Path, out: Path, as_of: datetime) -> int:
    if not db_path.is_file():
        print(f"DB가 없습니다. 먼저 build-db 를 실행하세요: {db_path}")
        return 1
    span = ev_load.date_range(db_path)
    if span is None:
        print("DB에 KSPO 연계 데이터가 없습니다.")
        return 1
    events = ev_detect.detect_events(ev_load.load_rows(db_path))
    obs, covered, exits = cg_load.load_inputs(db_path)
    base = cg_model.Baselines(obs, covered, exits)
    res = cg_model.residuals(obs, exits, base)
    days: dict[str, dict] = {}

    def day_of(d: str) -> dict:
        if d not in days:
            days[d] = cg_outputs.compute_day(d, obs, exits, base, res)
        return days[d]

    nearest = lambda ev: cg_outputs.nearest_level(day_of(ev.date), ev.exit_hour)  # noqa: E731
    data = ev_outputs.build_files(events, *span, nearest=nearest, linkable=True)
    data["stations.json"] = reference.stations(set(obs))
    data["venues.json"] = reference.venues()
    for ev in events:
        same = [o for o in events if o.date == ev.date]
        data[f"event-{ev.id}.json"] = ev_detail.event_detail(ev, same, day_of(ev.date), nearest)
    for d in sorted(name[len("events-"):-len(".json")] for name in list(data) if name.startswith("events-")):
        data[f"forecast-{d}.json"] = cg_outputs.forecast(d, day_of(d), exits)
        for sid in cg_outputs.STATIONS:
            data[f"station-{sid}-{d}.json"] = cg_outputs.station_forecast(d, sid, day_of(d), exits)
        if exits.get(d):  # 귀가 방법 비교는 공연 날만
            data.update(rc_compare.build_files(d, day_of(d)))
    files = {name: wrap(body, as_of) for name, body in data.items()}
    try:
        written = publish(files, out)
    except PublishError as e:
        print(e)
        return 1
    print(f"공연 {len(events)}건 ({span[0]} ~ {span[1]}) → {len(written)}개 파일 발행: {out}")
    return 0


BACKTEST_STATIONS = ["olympic_park", "bangi", "mongchontoseong", "hanseong_baekje"]
LEVEL_KO = {"relaxed": "여유", "normal": "보통", "crowded": "혼잡"}


def cmd_backtest(db_path: Path) -> int:
    if not db_path.is_file():
        print(f"DB가 없습니다. 먼저 build-db 를 실행하세요: {db_path}")
        return 1
    r = cg_backtest.run(*cg_load.load_inputs(db_path), BACKTEST_STATIONS)
    if not r["cases"]:
        print("비교할 공연 날이 없습니다.")
        return 1
    pct = lambda x: "-" if x is None else f"{x:.0%}"  # noqa: E731
    print(f"공연 날 {r['days']}일 × 역 {len(BACKTEST_STATIONS)}곳 × 19~23시 = {r['cases']}건 (각 날은 그날을 빼고 예측)")
    print(f"단계 적중률 {pct(r['accuracy'])} (행사 효과 없이 기준선만 쓰면 {pct(r['naive_accuracy'])})")
    print(f"'혼잡' 예측이 맞은 비율 {pct(r['crowded_precision'])}, 실제 혼잡을 미리 잡은 비율 {pct(r['crowded_recall'])}")
    for sid, (acc, naive, n) in r["by_station"].items():
        print(f"  {sid}: {pct(acc)} (기준선만 {pct(naive)}, {n}건)")
    print(f"예상 인원 오차 중앙값 {r['median_abs_error']:.0f}명")
    print("실제→예측: " + ", ".join(f"{LEVEL_KO[a]}→{LEVEL_KO[p]} {n}" for (a, p), n in sorted(r["confusion"].items())))
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
    b = sub.add_parser("build-db", help="원본 → SQLite")
    b.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    b.add_argument("--db", type=Path, default=DB_PATH)
    b.add_argument("--seed", type=Path, default=SEED_PATH)
    es = sub.add_parser("export-seed", help="DB → 승하차 요약 파일 (원본 CSV가 없는 곳에서 build-db 가 씀)")
    es.add_argument("--db", type=Path, default=DB_PATH)
    es.add_argument("--out", type=Path, default=SEED_PATH)
    bd = sub.add_parser("build", help="행사 반영 → 화면용 JSON 발행")
    bd.add_argument("--db", type=Path, default=DB_PATH)
    bd.add_argument("--out", type=Path, required=True)
    bd.add_argument("--as-of", type=datetime.fromisoformat, default=None, help="기준 시각 (예: 2025-08-09T18:00:00+09:00)")
    bt = sub.add_parser("backtest", help="혼잡 단계 적중률 검증")
    bt.add_argument("--db", type=Path, default=DB_PATH)
    p = sub.add_parser("publish", help="검증 후 발행")
    p.add_argument("--src", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command == "collect":
        return cmd_collect(args.source, args.month, args.raw_dir, args.page_size)
    if args.command == "backtest":
        return cmd_backtest(args.db)
    if args.command == "build":
        as_of = args.as_of or datetime.now(KST)
        if as_of.tzinfo is None:
            print("--as-of 에는 시간대(+09:00)가 있어야 합니다.")
            return 1
        return cmd_build(args.db, args.out, as_of)
    if args.command == "build-db":
        return cmd_build_db(args.raw_dir, args.db, args.seed)
    if args.command == "export-seed":
        return cmd_export_seed(args.db, args.out)
    if args.command == "publish":
        return cmd_publish(args.src, args.out)
    print(f"'{args.command}' 는 아직 만들지 않았습니다 (2단계 다음 작업).")
    return 2


if __name__ == "__main__":
    load_env_file(ENV_FILE)
    sys.exit(main())
