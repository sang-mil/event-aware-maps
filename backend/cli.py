"""배치 실행 명령.

    python backend/cli.py collect kspo_linked              # KSPO 연계 데이터(1시간 단위 공연·주차·날씨) 전체
    python backend/cli.py collect kspo_perf                # KSPO 공연정보 전체
    python backend/cli.py collect subway_month --month 202510   # 지하철 월별·시간대별 승하차
    python backend/cli.py build-db                         # 원본(raw) → SQLite 한 파일 (backend/data/tumgil.db). 원본 CSV가 없으면 요약(seed) 사용
    python backend/cli.py export-seed                      # DB → 승하차 요약 backend/data/seed/ridership_daily.csv.gz
    python backend/cli.py build --out 폴더 [--as-of 시각]   # 행사 반영·혼잡 계산 → stations·venues·calendar·events·event·forecast·station·compare·route JSON 검증 후 발행
    python backend/cli.py backtest                         # 공연 날마다 그날을 빼고 예측해 실제와 비교 (혼잡 단계 적중률)
    python backend/cli.py recommend-backtest               # 추천 1순위와 실제 승차 결과 비교
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

from collectors import CollectError, kspo, realtime_log, seoul_subway  # noqa: E402
from normalize import db as normalize_db, seed as normalize_seed  # noqa: E402
from congestion import anomalies as cg_anomalies, backtest as cg_backtest, load as cg_load, model as cg_model, outputs as cg_outputs  # noqa: E402
from recommend import backtest as rc_backtest, compare as rc_compare  # noqa: E402
from maps import walk_routes  # noqa: E402
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


WALK_ROUTES_PATH = BACKEND / "data" / "raw" / "walk-routes.json"  # data-refresh 가 gh-pages 에서 받아 둠 (git 제외)


def cmd_build(db_path: Path, out: Path, as_of: datetime, walk_path: Path = WALK_ROUTES_PATH) -> int:
    if not db_path.is_file():
        print(f"DB가 없습니다. 먼저 build-db 를 실행하세요: {db_path}")
        return 1
    span = ev_load.date_range(db_path)
    if span is None:
        print("DB에 KSPO 연계 데이터가 없습니다.")
        return 1
    events = ev_detect.detect_events(ev_load.load_rows(db_path))
    obs, covered, exits = cg_load.load_inputs(db_path)
    days: dict[str, dict] = {}

    def day_of(d: str) -> dict:
        if d not in days:
            # Historical replay for d may use only data available before d.
            base = cg_model.Baselines(obs, covered, exits, as_of=d)
            res = cg_model.residuals(obs, exits, base, as_of=d)
            days[d] = cg_outputs.compute_day(d, obs, exits, base, res)
        return days[d]

    nearest = lambda ev: cg_outputs.nearest_level(day_of(ev.date), ev.exit_hour)  # noqa: E731
    data = ev_outputs.build_files(events, *span, nearest=nearest, linkable=True)
    data["stations.json"] = reference.stations(set(obs))
    try:
        walk = walk_routes.load_lookup(walk_path)
    except walk_routes.KakaoMapError as e:
        print(e)
        return 1
    print(f"도보 경로 {len(walk)}개 조합 사용" if walk else "도보 경로 파일 없음: 도보 시간은 '정보 없음'으로 둡니다")
    data["venues.json"] = reference.venues(walk)
    for ev in events:
        same = [o for o in events if o.date == ev.date]
        data[f"event-{ev.id}.json"] = ev_detail.event_detail(ev, same, day_of(ev.date), nearest)
    for d in sorted(name[len("events-"):-len(".json")] for name in list(data) if name.startswith("events-")):
        data[f"forecast-{d}.json"] = cg_outputs.forecast(d, day_of(d), exits)
        for sid in cg_outputs.STATIONS:
            data[f"station-{sid}-{d}.json"] = cg_outputs.station_forecast(d, sid, day_of(d), exits)
        if exits.get(d):  # 귀가 방법 비교는 공연 날만
            data.update(rc_compare.build_files(d, day_of(d), walk))
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
    inputs = cg_load.load_inputs(db_path)
    r = cg_backtest.run_as_of(*inputs, BACKTEST_STATIONS)
    loo = cg_backtest.run(*inputs, BACKTEST_STATIONS)
    if not r["cases"]:
        print("이전 자료만으로 기준선을 만들 수 있는 비교 사례가 없습니다.")
        return 1
    pct = lambda x: "-" if x is None else f"{x:.0%}"  # noqa: E731
    print(f"시간순 검증 {r['days']}일 ({r['first_scored_day']} ~ {r['last_scored_day']}), {r['cases']}건")
    print(f"단계 적중률 {pct(r['accuracy'])} (기준선만 {pct(r['naive_accuracy'])})")
    print(f"'혼잡' 예측이 맞은 비율 {pct(r['crowded_precision'])}, 실제 혼잡을 미리 잡은 비율 {pct(r['crowded_recall'])}")
    for sid, (acc, naive, n) in r["by_station"].items():
        print(f"  {sid}: {pct(acc)} (기준선만 {pct(naive)}, {n}건)")
    for group, label in (("overlap", "공연 겹침"), ("single", "단독 공연")):
        stats = r["by_overlap"][group]
        print(f"{label}: {stats['days']}일, {stats['cases']}건, 적중 {pct(stats['accuracy'])}, 혼잡 재현 {pct(stats['crowded_recall'])}, 인원 오차 중앙값 {stats['median_abs_error']:.0f}명")
    print(f"예상 인원 오차 중앙값 {r['median_abs_error']:.0f}명")
    print("실제→예측: " + ", ".join(f"{LEVEL_KO[a]}→{LEVEL_KO[p]} {n}" for (a, p), n in sorted(r["confusion"].items())))
    print(f"참고: leave-one-out 적중률 {pct(loo['accuracy'])} (각 날짜를 제외한 과거·미래 자료를 함께 학습하므로 운영 신뢰도 지표로 쓰지 않음)")
    return 0


def cmd_recommend_backtest(db_path: Path) -> int:
    if not db_path.is_file():
        print(f"DB가 없습니다. 먼저 build-db 를 실행하세요: {db_path}")
        return 1
    result = rc_backtest.run(*cg_load.load_inputs(db_path))
    if not result["cases"]:
        print("추천 후보와 실제 승차를 비교할 수 있는 사례가 없습니다.")
        return 1
    print(f"추천 시간순 검증: {result['cases']}건")
    print(f"추천 1순위가 실제로 가장 덜 붐빈 선택지와 일치: {result['accuracy']:.0%} ({result['correct']}/{result['cases']})")
    print("예측된 1순위 선택지: " + ", ".join(f"{key} {count}건" for key, count in sorted(result["recommended_options"].items())))
    return 0


def cmd_anomalies(db_path: Path, min_ratio: float, as_of: str | None = None) -> int:
    """2025 KSPO 관측일 중 공연 기록이 없는 혼잡 후보를 출력한다."""
    if not db_path.is_file():
        print(f"DB가 없습니다. 먼저 build-db 를 실행하세요: {db_path}")
        return 1
    obs, covered, exits = cg_load.load_inputs(db_path)
    base = cg_model.Baselines(obs, covered, exits, as_of=as_of)
    findings = cg_anomalies.find_non_event_anomalies(
        obs, covered, exits, base, cg_outputs.STATIONS, min_ratio=min_ratio, as_of=as_of
    )
    if not findings:
        print(f"공연 기록 없는 날짜에서 기준선 {min_ratio:.1f}배 이상 혼잡 후보가 없습니다.")
        return 0
    dates = sorted({item["date"] for item in findings})
    print(f"원인 미상 혼잡 후보: {len(dates)}일, 역·시각 {len(findings)}건 (기준선 {min_ratio:.1f}배 이상)")
    print("이 후보는 KSPO에 공연 기록이 없다는 뜻이며, 혼잡 원인은 확인되지 않았습니다.")
    for item in sorted(findings, key=lambda x: (-x["ratio"], x["date"], x["hour"], x["station_id"]))[:30]:
        print(f"  {item['date']} {item['hour']:02d}시 {item['station_id']}: "
              f"실측 {item['actual']:.0f}명 / 기준 {item['baseline']:.0f}명 ({item['ratio']:.1f}배)")
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
    bd.add_argument("--walk-routes", type=Path, default=WALK_ROUTES_PATH, help="발행된 walk-routes.json (없으면 도보 시간 null)")
    bt = sub.add_parser("backtest", help="혼잡 단계 적중률 검증")
    bt.add_argument("--db", type=Path, default=DB_PATH)
    rb = sub.add_parser("recommend-backtest", help="추천 1순위를 실제 승차로 검증")
    rb.add_argument("--db", type=Path, default=DB_PATH)
    an = sub.add_parser("anomalies", help="공연 기록 없는 혼잡 후보 찾기")
    an.add_argument("--db", type=Path, default=DB_PATH)
    an.add_argument("--min-ratio", type=float, default=1.5, help="평소 기준선 대비 후보 비율 (기본 1.5)")
    an.add_argument("--as-of", help="이 날짜 이전 자료만 분석 (YYYY-MM-DD)")
    p = sub.add_parser("publish", help="검증 후 발행")
    p.add_argument("--src", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    rl = sub.add_parser("log-realtime", help="실시간 지역 혼잡(live-api Worker)을 날짜별 기록에 덧붙이기")
    rl.add_argument("--base-url", required=True, help="live-api Worker 주소")
    rl.add_argument("--out-dir", type=Path, required=True)
    wr = sub.add_parser("precompute-walk-routes", help="카카오 지도에서 공연장·역 도보 경로를 계산")
    wr.add_argument("--out", type=Path, default=Path("site_data/walk-routes.json"))
    args = parser.parse_args(argv)

    if args.command == "collect":
        return cmd_collect(args.source, args.month, args.raw_dir, args.page_size)
    if args.command == "backtest":
        return cmd_backtest(args.db)
    if args.command == "recommend-backtest":
        return cmd_recommend_backtest(args.db)
    if args.command == "anomalies":
        return cmd_anomalies(args.db, args.min_ratio, args.as_of)
    if args.command == "build":
        as_of = args.as_of or datetime.now(KST)
        if as_of.tzinfo is None:
            print("--as-of 에는 시간대(+09:00)가 있어야 합니다.")
            return 1
        return cmd_build(args.db, args.out, as_of, args.walk_routes)
    if args.command == "build-db":
        return cmd_build_db(args.raw_dir, args.db, args.seed)
    if args.command == "export-seed":
        return cmd_export_seed(args.db, args.out)
    if args.command == "publish":
        return cmd_publish(args.src, args.out)
    if args.command == "log-realtime":
        written, errors = realtime_log.collect(args.base_url, args.out_dir)
        for e in errors:
            print(f"  실패 {e}")
        print(f"실시간 기록 {written}줄 추가: {args.out_dir}")
        return 1 if errors and not written else 0
    if args.command == "precompute-walk-routes":
        try:
            report: list[str] = []
            count = walk_routes.write(os.environ.get("KAKAO_REST_API_KEY", ""), args.out, report)
        except walk_routes.KakaoMapError as e:
            for line in report:  # 실패해도 찾은 장소는 보여 준다
                print(f"  {line}")
            print(e)
            return 1
        for line in report:
            print(f"  {line}")
        print(f"공연장·역 조합 {count}개의 도보 경로 데이터를 만들었습니다: {args.out}")
        return 0
    print(f"'{args.command}' 는 아직 만들지 않았습니다 (2단계 다음 작업).")
    return 2


if __name__ == "__main__":
    load_env_file(ENV_FILE)
    sys.exit(main())
