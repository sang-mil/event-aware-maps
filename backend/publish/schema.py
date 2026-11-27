"""data-contract/schema 를 읽어 검사기를 만든다. 스키마 파일은 여기서 고치지 않고 읽기만 한다."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SCHEMA_DIR = Path(__file__).resolve().parents[2] / "data-contract" / "schema"

# 발행 파일 이름 앞부분 → 스키마 이름 (data-contract/mock 과 같은 규칙)
PREFIX_TO_SCHEMA = [
    ("walk-routes.json", "walk-routes"),
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


def schema_for(filename: str) -> str | None:
    for prefix, name in PREFIX_TO_SCHEMA:
        if filename == prefix or (prefix.endswith("-") and filename.startswith(prefix)):
            return name
    return None


@lru_cache(maxsize=1)
def validators() -> dict[str, Draft202012Validator]:
    schemas: dict[str, dict] = {}
    registry = Registry()
    for path in sorted(SCHEMA_DIR.glob("*.schema.json")):
        schema = json.loads(path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        schemas[path.name.removesuffix(".schema.json")] = schema
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    return {
        name: Draft202012Validator(schema, registry=registry)
        for name, schema in schemas.items()
        if name != "common"
    }


def errors_of(filename: str, instance) -> list[str]:
    name = schema_for(filename)
    if name is None:
        return ["어떤 스키마로 검사할지 알 수 없는 파일 이름"]
    out = []
    for err in sorted(validators()[name].iter_errors(instance), key=lambda e: list(e.absolute_path)):
        where = "/".join(str(p) for p in err.absolute_path) or "(맨 위)"
        out.append(f"{where}: {err.message}")
    return out
