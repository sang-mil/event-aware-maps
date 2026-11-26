'use client';

import Link from 'next/link';
import { BackHeader } from '@/components/ui';
import { asset } from '@/lib/app';

/** 화면 확인용 목록. 최종본 39개 화면을 한곳에서 열어 볼 수 있어요. */
const GROUPS: { title: string; items: [string, string, string][] }[] = [
  {
    title: '1. 시작',
    items: [
      ['브랜드', '틈길 로고와 아이콘', '/preview/brand/'],
      ['00', '스플래시', '/'],
      ['00-1', '첫 실행 안내 · 권한 요청', '/onboarding/'],
    ],
  },
  {
    title: '2. 홈',
    items: [
      ['01', '홈', '/home/'],
      ['01-1', '홈 · 시간 선택', '/home/?state=time'],
      ['01-2', '홈 · 귀가 후 피드백', '/home/?state=feedback'],
      ['01-3', '설정', '/settings/'],
      ['01-3-1', '개인정보 처리방침', '/settings/privacy/'],
      ['01-3-2', '이용약관', '/settings/terms/'],
    ],
  },
  {
    title: '3. 역 상세',
    items: [
      ['02', '올림픽공원역 (붐빌 때)', '/station/?id=olympic_park'],
      ['02-1', '방이역 (지금이 나을 때)', '/station/?id=bangi'],
      ['02-2', '올림픽공원역 (캘린더에서 고른 날짜)', '/station/?id=olympic_park&date=2025-08-09'],
      ['02-3', '방이역 (캘린더에서 고른 날짜)', '/station/?id=bangi&date=2025-08-09'],
    ],
  },
  {
    title: '4. 행사',
    items: [
      ['03', '캘린더 탭', '/calendar/'],
      ['03-1', '오늘 공연과 경기 전체', '/events/'],
      ['03-2', '공연 상세', '/event/?id=evt_20250809_kspo&from=home'],
      ['03-2a', '공연 상세 · 캘린더에서', '/event/?id=evt_20250809_kspo&from=calendar'],
      ['03-2b', '공연 상세 · 오늘 공연·경기에서', '/event/?id=evt_20250809_kspo&from=events'],
      ['03-2c', '공연 상세 · 지도에서', '/event/?id=evt_20250809_kspo&from=map'],
      ['03-3', '경기 상세 · 경기 중', '/game/?id=evt_20250809_kbo'],
      ['03-3', '경기 상세 · 경기 전', '/game/?id=evt_20250809_kbo&state=before'],
      ['03-3', '경기 상세 · 경기 끝', '/game/?id=evt_20250809_kbo&state=end'],
    ],
  },
  {
    title: '5. 길찾기',
    items: [
      ['04', '길찾기 탭 · 지도', '/map/'],
      ['04-1', '귀갓길 찾기', '/search/'],
      ['04-1-1', '출발 시간 선택', '/search/?state=time'],
      ['04-2', '공연장에서 출발', '/search/?venue=kspo_dome'],
      ['04-3', '귀가 방법 비교', '/compare/'],
      ['04-3a', '귀가 방법 비교 · 공연장에서 출발', '/compare/?from=event&venue=kspo_dome'],
      ['04-3b', '귀가 방법 비교 · 알림에서', '/compare/?from=noti&venue=kspo_dome'],
      ['04-4', '경로 상세 · 방이역에서 타기', '/route/?option=walk_bangi&venue=kspo_dome'],
    ],
  },
  {
    title: '6. 알림',
    items: [
      ['05', '알림 미리보기 · 잠금화면', '/preview/notifications/'],
      ['05-1', '아이폰 알림 받는 방법', '/install/'],
      ['05-2', '알림을 쓸 수 없을 때 · 캘린더에 추가', '/event/?id=evt_20250809_kspo&state=nopush'],
    ],
  },
  {
    title: 'E. 예외 상황',
    items: [
      ['E1', '위치 권한이 꺼져 있을 때', '/home/?state=noLocation'],
      ['E2', '오늘 행사가 없는 날', '/home/?state=noEvent'],
      ['E3', '혼잡 정보가 없는 역', '/station/?id=mongchontoseong'],
      ['E4', '막차가 임박했을 때', '/compare/?state=late&venue=kspo_dome&from=event'],
      ['E5', '연결 오류', '/home/?state=offline'],
      ['E6', '공연 시간이 바뀌었을 때', '/event/?id=evt_20250809_kspo&state=changed'],
      ['E7', '공연이 취소됐을 때', '/event/?id=evt_20250809_kspo&state=canceled'],
      ['E8', '알림 권한을 거부했을 때', '/event/?id=evt_20250809_kspo&state=denied'],
    ],
  },
];

export function PreviewIndex() {
  return (
    <main className="screen">
      <section style={{ padding: '40px 24px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 className="h1 big">틈길 화면 모아 보기</h1>
        <p className="lead" style={{ fontSize: 15 }}>
          디자인 최종본의 화면과 상태를 하나씩 열어 볼 수 있어요. 데이터는 2025년 8월 9일(토) 시안 값이에요.
        </p>
      </section>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="section-title">
            <h2>{g.title}</h2>
          </div>
          <section className="card">
            {g.items.map(([no, name, href]) => (
              <Link key={href} href={href} className="row" style={{ minHeight: 56 }}>
                <span className="t badge" style={{ background: '#EEF0F3', color: '#4A4F5C', minWidth: 56, justifyContent: 'center' }}>
                  {no}
                </span>
                <span className="main">
                  <span style={{ fontSize: 16, fontWeight: 500 }}>{name}</span>
                </span>
              </Link>
            ))}
          </section>
        </div>
      ))}
    </main>
  );
}

/** 브랜드 · 틈길 로고와 아이콘 */
export function Brand() {
  const colors = [
    ['#4E3DBC', '보라, 주요 버튼과 추천'],
    ['#17171C', '먹색, 글자'],
    ['#1B2A5E', '남색, 로고 글자'],
    ['', ''],
    ['#C2281B', '혼잡'],
    ['#8A5300', '보통'],
    ['#156B37', '여유'],
    ['#9AA0AC', '정보 없음'],
    ['#8B50A4', '5호선'],
    ['#BDA35C', '9호선'],
    ['#C8306E', '8호선'],
    ['#2F9E44', '2호선'],
  ];
  return (
    <main className="screen">
      <BackHeader href="/preview/" />
      <section className="intro" style={{ paddingBottom: 20 }}>
        <h1 className="h1 big">틈길 로고와 아이콘</h1>
      </section>
      <section className="card" style={{ padding: '32px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <img src={asset('/brand/wordmark.png')} alt="틈길 워드마크" style={{ width: 200, height: 'auto' }} />
        <span style={{ fontSize: 13, color: '#5F6573' }}>틈과 길 사이의 점이 덜 붐비는 틈을 뜻해요</span>
      </section>
      <section className="card" style={{ marginTop: 12, padding: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around' }}>
        {[112, 60, 36].map((w) => (
          <span key={w} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <img src={asset('/brand/icon.png')} alt={w === 112 ? '앱 아이콘' : ''} style={{ width: w, height: 'auto' }} />
            <span className="t" style={{ fontSize: 13, color: '#5F6573' }}>
              {w === 112 ? '앱 아이콘' : w}
            </span>
          </span>
        ))}
      </section>
      <div className="section-title">
        <h2>화면에서 쓰는 색</h2>
      </div>
      <section className="card" style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 16px' }}>
        {colors.map(([c, label], i) =>
          c ? (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4A4F5C' }}>
              <span style={{ flex: 'none', width: 20, height: 20, borderRadius: 6, background: c, boxShadow: 'inset 0 0 0 1px rgba(23,23,28,0.08)' }} />
              {label}
            </span>
          ) : (
            <span key={i} />
          ),
        )}
      </section>
      <p className="note">보라색은 주요 버튼과 추천 표시에만 써요. 혼잡 색은 언제나 글자와 함께 나와요.</p>
    </main>
  );
}

/** 05 알림 미리보기 · 잠금화면 */
export function Notifications() {
  const items = [
    ['지금', '더보이즈 공연이 곧 끝나요', '20시대 올림픽공원역은 혼잡, 방이역은 보통일 거예요. 눌러서 귀가 방법을 비교해 보세요.', '웹 푸시, 관람 예정 알림. 누르면 귀가 방법 비교로 가요', '/compare/?from=noti&venue=kspo_dome'],
    ['오늘 21:00', '21시예요. 올림픽공원역이 덜 붐빌 거예요', '20시대의 절반 수준으로 줄 거예요.', '웹 푸시, 출발 시간 알림. 누르면 역 상세로 가요', '/station/?id=olympic_park'],
    ['어제 18:00', '내일 저녁 송파에 큰 행사가 있어요', 'KSPO DOME 공연이 있어 20~21시 올림픽공원역이 붐빌 수 있어요.', '웹 푸시, 주민용 행사 전날 알림. 누르면 캘린더로 가요', '/calendar/'],
    ['오늘 15:02', '공연 시간이 바뀌었어요', '더보이즈 공연이 끝나는 시간이 바뀌어 알림도 맞춰 옮겼어요.', '웹 푸시, 일정 변경 알림. 누르면 공연 상세로 가요', '/event/?id=evt_20250809_kspo&state=changed'],
    ['오늘 11:40', '등록한 공연이 취소됐어요', '강다니엘 공연(올림픽홀)이 취소됐어요. 등록한 알림도 함께 지웠어요.', '웹 푸시, 일정 취소 알림. 누르면 취소된 공연 상세로 가요', '/event/?id=evt_20250809_kspo&state=canceled'],
    ['20:30', '더보이즈 공연 끝나기 30분 전', '틈길에서 덜 붐비는 귀갓길을 확인하세요.', '캘린더 알림, 푸시를 못 쓰는 아이폰 사파리용. 누르면 공연 상세로 가요', '/event/?id=evt_20250809_kspo'],
  ];
  return (
    <main className="screen" style={{ background: '#1E2130', padding: '56px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ textAlign: 'center', color: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 500, color: '#C9CCD6' }}>8월 9일 토요일</span>
        <span className="t" style={{ fontSize: 76, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em' }}>
          20:31
        </span>
      </div>
      {items.map(([when, title, body, who, href]) => (
        <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Link href={href} style={{ background: 'rgba(255,255,255,0.94)', borderRadius: 20, padding: '12px 14px', display: 'flex', gap: 12 }}>
            <img src={asset('/brand/icon.png')} alt="" style={{ flex: 'none', width: 36, height: 'auto', alignSelf: 'flex-start' }} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5F6573' }}>
                <span style={{ fontWeight: 700, color: '#17171C' }}>틈길</span>
                <span className="t">{when}</span>
              </span>
              <strong style={{ fontSize: 15 }}>{title}</strong>
              <span style={{ fontSize: 14, lineHeight: 1.45, color: '#4A4F5C' }}>{body}</span>
            </span>
          </Link>
          <span style={{ padding: '0 14px 6px', fontSize: 12, lineHeight: 1.5, color: '#C9CCD6' }}>{who}</span>
        </div>
      ))}
      <Link href="/preview/" style={{ color: '#C9CCD6', fontSize: 14, textAlign: 'center', padding: 12, textDecoration: 'underline' }}>
        화면 모아 보기로 돌아가기
      </Link>
    </main>
  );
}
