# 틈길 프론트엔드

디자인 캔버스 '최종본'(39개 화면)을 Next.js로 옮긴 모바일 웹이에요.
기준 문서: `docs/PRD.md`, 틈길 화면 명세서, 틈길 API 명세서(초안).

## 실행하기

Node.js 20 이상이 필요해요.

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:3000/preview/ 를 열면 **모든 화면과 상태(E1~E8 포함)를 목록에서 하나씩** 열어 볼 수 있어요.
휴대폰 크기로 보려면 브라우저 개발자 도구에서 기기 모드(390×844)를 켜 주세요.

정적 파일로 만들기:

```bash
npm run build          # out/ 폴더에 정적 사이트가 생겨요
NEXT_PUBLIC_BASE_PATH=/event-aware-maps npm run build   # GitHub Pages 하위 경로에 올릴 때
```

## 환경 변수

| 이름 | 뜻 | 없으면 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | 백엔드 API 주소 (예: `https://api.example.com/api/v1`) | `public/mock/` 목업을 읽고, 쓰기(알림·피드백)는 "준비 중" |
| `NEXT_PUBLIC_REALTIME_API_BASE` | 서울시 실시간 데이터 Worker 주소 (도메인만, 경로 제외) | 운영 Worker 주소를 사용해요 |
| `NEXT_PUBLIC_DATA_BASE` | GitHub Pages에 발행된 2025년 예측 JSON 기본 주소 | `public/mock/` 목업을 읽어요 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 웹 푸시 공개 키 (Worker용 VAPID 키 쌍에서 공개 부분) | 비어 있으면 알림은 "준비 중" |
| `NEXT_PUBLIC_PUSH_API_BASE` | 푸시 쓰기 API 주소 (예: `https://...workers.dev/api`) | 비어 있으면 알림 기능을 꺼 둬요. Worker와 D1 준비 후 설정 |
| `NEXT_PUBLIC_BASE_PATH` | 하위 경로에 배포할 때 (예: `/event-aware-maps`) | 사이트 맨 위 경로 |

## 구조

| 위치 | 내용 |
|---|---|
| `src/app/` | 주소별 페이지 (`/home`, `/station`, `/event` …) |
| `src/screens/` | 화면 본체. 화면 명세서의 번호를 주석으로 달았어요 |
| `src/components/ui.tsx` | 공통 요소: 탭, 뒤로 버튼, 혼잡 배지, 노선 원, 시간 선택 시트, 연결 오류(E5) |
| `src/api/` | **데이터는 여기서만 불러와요.** 2025년 예측 JSON과 실시간 Worker 정보를 읽어요 |
| `src/lib/` | 디자인 값(색, 혼잡 단계), 시간 표시, 기기 저장, 권한 확인 |
| `public/mock/` | API 명세서 형태의 목업 데이터 (2025년 8월 9일 시안 값) |

## 지금 상태와 남은 일

- **데이터**: 날짜별 예측은 GitHub Pages의 2025년 JSON을 읽고, 현장 인구 혼잡은 서울시 실시간 도시데이터 Worker에서 따로 읽어요. Worker 주소는 `NEXT_PUBLIC_REALTIME_API_BASE`로 설정합니다.
- **계산하지 않기**: 혼잡 단계, 문장, 역 순서(`ranking`)는 모두 데이터에 있는 값을 그대로 보여줘요.
- **점선 칸**: 도보 시간, 막차, 공연 시각처럼 아직 모르는 값은 디자인처럼 점선 칸으로 보여줘요. 값이 들어오면 자동으로 바뀌어요.
- **연결 오류**: 불러오기에 실패하면 기기에 저장한 마지막 값을 보여주고 "n분 전 정보" 안내를 띄워요. 저장한 값도 없으면 E5 화면을 보여줘요.
- **알림·피드백**: 서버가 없으면 켜진 것처럼 보이지 않게 **"준비 중"**으로 보여줘요(역 상세·경기 상세 버튼, 설정 스위치, 첫 실행 안내). 공연 상세는 캘린더 추가를 권해요. 귀가 후 피드백도 서버가 있을 때만 물어봐요.
- **PWA**: `public/sw.js` 서비스 워커가 화면 파일을 기기에 저장해 오프라인에서도 열리고, 웹 푸시를 받아 띄워요. 아이콘은 192·512 정사각형과 마스커블 아이콘이 있어요. 서비스 워커는 빌드한 결과(`npm run build` 후 `out/`)에서만 켜져요.
- **지도**: 지도 API를 정하기 전이라 디자인의 개략도를 그대로 옮겼어요. 경로 상세의 지도 앱 버튼은 역 이름 검색으로 열려요.
- **frontend/CLAUDE.md와 다른 점**: 기획서를 따르기로 해서 한·영 전환과 신뢰도(confidence) 표시는 넣지 않았어요. 타입은 `data-contract` 스키마가 아직 비어 있어서 `src/api/types.ts`에 직접 적었어요.
