# data-contract
BE와 FE의 유일한 약속입니다. 변경 절차는 docs/COLLABORATION.md 7절을 따릅니다.
- `schema/*.schema.json` 스키마 v1 (JSON Schema 2020-12). 화면이 부르는 API마다 하나씩 있고, `common.schema.json`은 공통 조각입니다.
- `mock/*.json` 스키마를 통과해야 하는 목업. 파일 이름 앞부분으로 검사할 스키마가 정해집니다.
- `validate.py` 스키마 문법 확인 + 목업 전부 검사 + 틀린 값을 잡아내는지 자체 점검

## 스키마와 목업

| 스키마 | API | 목업 파일 이름 |
|---|---|---|
| stations | GET /stations | `stations.json` |
| venues | GET /venues | `venues.json` |
| events | GET /events?date= | `events-*.json` |
| event | GET /events/{id} | `event-*.json` |
| calendar | GET /calendar?month= | `calendar-*.json` |
| forecast | GET /forecast?date= | `forecast-*.json` |
| station-forecast | GET /stations/{id}/forecast?date= | `station-*.json` |
| compare | GET /routes/compare | `compare-*.json` |
| route | GET /routes/{option_id} | `route-*.json` |

## 정해진 규칙
- 혼잡 단계(`level`)는 문자열 4가지: `relaxed` 여유, `normal` 보통, `crowded` 혼잡, `no_data` 데이터 없음.
- 시각은 오프셋이 붙은 ISO 형식(`2025-08-09T20:00:00+09:00`), 시간대는 두 자리 문자열(`"20"`).
- 모르는 값은 키를 지우지 않고 `null`. 스키마에 없는 키는 검사에서 실패합니다(오타 방지).
- 필드 추가는 자유, 삭제·이름 변경·의미 변경은 버전을 올립니다(`1.x` → `2.0`).

## 검사 실행 (외부 접속·API 키 필요 없음)

```
python -m venv .venv
.venv/Scripts/python -m pip install -r data-contract/requirements.txt   # macOS/Linux: .venv/bin/python
.venv/Scripts/python data-contract/validate.py
```

마지막 줄이 `실패 0건`이면 통과입니다. 하나라도 실패하면 종료 코드 1을 돌려주므로 CI에서 그대로 쓸 수 있습니다.
