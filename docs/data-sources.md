# 데이터 출처와 이용 조건

## Kakao Map

- 제공 항목: 장소 검색 결과의 이름·좌표, 공연장과 가까운 역 사이의 도보 시간·거리·경로
- API: [Kakao Map REST API](https://developers.kakao.com/docs/ko/kakaomap/rest-api), [Kakao Map JavaScript SDK](https://developers.kakao.com/docs/ko/kakaomap/common)
- 이용 조건: [Kakao Developers 운영 정책](https://developers.kakao.com/terms/ko/site-policies)
- 갱신: 월 1회 자동 또는 GitHub Actions 수동 실행. 경로 계산에 실패한 조합은 값이 없다고 발행하며 임의의 거리·시간을 넣지 않음.
- 표시: 지도에 Kakao Map을 표기. 카카오가 갱신한 최신 경로 데이터를 계속 사용하도록 정기적으로 다시 계산.
- 인증: REST API 키는 GitHub Actions 비밀 값, JavaScript 키는 허용 도메인을 제한해 웹 배포 설정에 보관. 소스와 로그에는 기록하지 않음.
