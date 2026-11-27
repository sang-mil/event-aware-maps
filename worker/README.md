# 실시간 장소 데이터 Worker

서울시 실시간 도시데이터를 서버에서 조회하고 5분 동안 캐시하는 작은 프록시입니다. 브라우저 코드에 서울 인증키를 넣지 않습니다.

## Cloudflare 프로젝트 설정

- 저장소: `sang-mil/event-aware-maps`
- Worker 소스 폴더: `worker`
- Worker 이름: `event-aware-maps-live-api`
- 배포 명령: `npx wrangler deploy`
- 빌드 명령: 비워 둡니다 (별도 빌드가 없습니다)
- 브랜치 미리보기 명령: `npx wrangler preview` (로컬 시험은 `npx wrangler dev`)

배포 전에 Cloudflare Worker의 **Settings → Variables and Secrets → Add → Secret**에서 아래 항목을 저장합니다.

- 이름: `SEOUL_CITYDATA_KEY`
- 값: 열린데이터광장에서 발급한 인증키

또는 Worker 폴더에서 `npx wrangler secret put SEOUL_CITYDATA_KEY`를 실행해 등록할 수 있습니다. 비밀값은 `wrangler.toml`, GitHub Actions 변수, 프런트 환경변수에 넣지 않습니다.

## API 주소

- `/api/realtime/olympic-park`
- `/api/realtime/jamsil`

서울 API는 장소명 하나씩 조회하며, 현재 Worker는 이 두 장소만 요청할 수 있게 제한합니다. 장소명이 공식 장소 목록과 다르면 `AREAS`의 값을 공식 목록에 맞춰 바꿔야 합니다.

## 응답에 포함하는 정보

Worker는 원본 응답 전체를 브라우저로 전달하지 않습니다. 장소명·장소 코드와 현재 혼잡 단계·안내 문구·추정 인구 범위·관측 시각만 골라 아래 모양으로 반환합니다.

```json
{
  "area": { "name": null, "code": null },
  "crowd": {
    "level": null,
    "message": null,
    "population_min": null,
    "population_max": null,
    "observed_at": null
  },
  "source": "서울특별시 공공데이터 · 서울시 실시간 도시데이터"
}
```

각 값은 서울시 응답에 값이 있을 때만 채우며, 성별·연령별 비율, 상권, 날씨, 교통 등 화면에 쓰지 않는 원본 항목은 전달하지 않습니다. 인구 범위는 역 승차 인원이나 열차 내부 혼잡도가 아니라 해당 장소의 추정 인구입니다.

## GitHub Actions

기존 `data-refresh.yml`은 KSPO 자료로 일일 예보 JSON을 만드는 배치라 그대로 둡니다. 실시간 도시데이터 키를 GitHub Actions Secret에도 복사할 필요는 없습니다. 이 Worker는 Cloudflare 런타임 Secret을 사용합니다.

## API 키 전송 관련 참고

서울시 공식 명세에 기재된 API 주소는 HTTP이며 인증키가 URL 경로에 들어갑니다. Worker Secret은 프런트 사용자에게 키가 보이지 않게 하지만, 서울 API로 전달되는 요청 자체를 HTTPS로 바꾸지는 못합니다. Worker는 요청 URL을 기록하지 않고 정해진 두 장소만 조회하도록 제한합니다.

응답을 화면에 표시할 때 출처를 `서울특별시 공공데이터`로 표시해야 합니다.
