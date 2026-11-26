"""data-contract 검증 스크립트.

하는 일
1. schema/*.schema.json 이 올바른 JSON Schema(2020-12)인지 확인한다.
2. mock/*.json 을 파일 이름 앞부분으로 해당 스키마에 맞춰 전부 검사한다.
3. 일부러 틀린 값을 넣어 검사기가 실제로 잡아내는지 스스로 확인한다.

실행: python data-contract/validate.py   (하나라도 실패하면 종료 코드 1)
외부 접속 없이 돈다. 필요한 라이브러리는 requirements.txt 참고.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent
SCHEMA_DIR = ROOT / "schema"
MOCK_DIR = ROOT / "mock"

# 목업 파일 이름 앞부분 → 스키마 이름. 긴 것부터 비교한다(event- 와 events- 구분).
PREFIX_TO_SCHEMA = [
    ("stations.json", "stations"),
    ("venues.json", "venues"),
    ("events-", "events"),
    ("event-", "event"),
    ("calendar-", "calendar"),
    ("forecast-", "forecast"),
    ("station-", "station-forecast"),
    ("compare-", "compare"),
    ("route-", "route"),
]


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_schemas() -> tuple[dict[str, dict], Registry]:
    schemas: dict[str, dict] = {}
    registry = Registry()
    for path in sorted(SCHEMA_DIR.glob("*.schema.json")):
        schema = load_json(path)
        Draft202012Validator.check_schema(schema)
        schemas[path.name.removesuffix(".schema.json")] = schema
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    return schemas, registry


def schema_for(filename: str) -> str | None:
    for prefix, name in PREFIX_TO_SCHEMA:
        if filename == prefix or (prefix.endswith("-") and filename.startswith(prefix)):
            return name
    return None


def errors_of(validator: Draft202012Validator, instance) -> list[str]:
    out = []
    for err in sorted(validator.iter_errors(instance), key=lambda e: list(e.absolute_path)):
        where = "/".join(str(p) for p in err.absolute_path) or "(맨 위)"
        out.append(f"{where}: {err.message}")
    return out


def self_test(validators: dict[str, Draft202012Validator]) -> list[str]:
    """일부러 틀린 목업을 만들어, 검사기가 통과시키면 실패로 본다."""
    station = load_json(MOCK_DIR / "station-bangi-2025-08-09.json")
    events = load_json(MOCK_DIR / "events-2025-08-09.json")
    cases = []

    bad = copy.deepcopy(station)
    bad["data"]["slots"][0]["level"] = 3
    cases.append(("혼잡 단계에 숫자(1~5 방식)", "station-forecast", bad))

    bad = copy.deepcopy(station)
    del bad["data"]["focus_hour"]
    cases.append(("필수 키 focus_hour 누락", "station-forecast", bad))

    bad = copy.deepcopy(station)
    bad["data"]["unknown_field"] = 1
    cases.append(("스키마에 없는 키", "station-forecast", bad))

    bad = copy.deepcopy(events)
    bad["data"]["events"][0]["extra"] = True
    cases.append(("행사 목록 항목에 없는 키", "events", bad))

    bad = copy.deepcopy(station)
    bad["updated_at"] = "2025-08-09 18:05"
    cases.append(("오프셋 없는 시각", "station-forecast", bad))

    problems = []
    for label, name, instance in cases:
        if not errors_of(validators[name], instance):
            problems.append(f"자체 점검 실패: '{label}' 을(를) 잡아내지 못함")
    return problems


def main() -> int:
    schemas, registry = load_schemas()
    validators = {
        name: Draft202012Validator(schema, registry=registry) for name, schema in schemas.items()
        if name != "common"
    }
    print(f"스키마 {len(schemas)}개 문법 확인 완료")

    failed = 0
    mocks = sorted(MOCK_DIR.glob("*.json"))
    for path in mocks:
        name = schema_for(path.name)
        if name is None:
            print(f"[실패] {path.name}: 어떤 스키마로 검사할지 알 수 없는 파일 이름")
            failed += 1
            continue
        errs = errors_of(validators[name], load_json(path))
        if errs:
            failed += 1
            print(f"[실패] {path.name} ({name})")
            for e in errs:
                print(f"    - {e}")
        else:
            print(f"[통과] {path.name} ({name})")

    problems = self_test(validators)
    for p in problems:
        print(f"[실패] {p}")
    if not problems:
        print("자체 점검 통과: 틀린 목업 5가지를 모두 잡아냄")

    total_failed = failed + len(problems)
    print(f"\n결과: 목업 {len(mocks)}개 중 {len(mocks) - failed}개 통과, 실패 {total_failed}건")
    return 1 if total_failed else 0


if __name__ == "__main__":
    sys.exit(main())
