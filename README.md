# event-aware-maps

잠실·올림픽공원 일대에 행사가 겹치는 날, 관객과 근처 주민·직장인에게
**몇 시에, 어느 역·노선으로 이동하면 가장 덜 붐비는지** 추천하는 귀가·이동 안내 서비스.

## 문서
- 협업 규칙: [docs/COLLABORATION.md](docs/COLLABORATION.md)
- 초기 설계: [docs/DESIGN.md](docs/DESIGN.md)
- Claude Code 규칙: [CLAUDE.md](CLAUDE.md)

## 구조
| 폴더 | 역할 | 담당 |
|---|---|---|
| `backend/` | 데이터 수집·혼잡 추정·추천 (계산은 전부 여기서) | BE |
| `frontend/` | 정적 웹 (표시와 선택만) | FE |
| `data-contract/` | JSON 스키마와 목업. BE-FE의 유일한 약속 | BE 승인 |
| `docs/` | 협업 규칙, 설계, 결정 기록 | 공통 |

## 시작하기
작업은 항상 이슈에서 시작합니다. 규칙은 `docs/COLLABORATION.md`를 따릅니다.
