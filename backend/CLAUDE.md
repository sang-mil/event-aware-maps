# backend 규칙
- 모든 계산 함수는 `as_of`(기준 시각)를 인자로 받는 순수 함수로 만든다. (리플레이·백테스트 공용)
- 외부 호출은 collectors/ 에만 둔다. 나머지는 fixtures로 테스트한다. API 키 없이 CI가 돌아야 한다.
- 발행(publish) 전에 data-contract/schema 로 검증한다. 실패하면 기존 JSON을 덮어쓰지 않는다.
- 추천 순위·혼잡 점수 로직을 바꾸면 반드시 테스트를 함께 추가한다.
- 사용자에게 보이는 문구(message_ko, message_en)는 여기서 만든다.
- frontend/ 와 data-contract/ 는 이 작업에서 수정하지 않는다 (스키마 이슈 제외).
