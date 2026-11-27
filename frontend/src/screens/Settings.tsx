'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { loadPreferences, pushReady, savePreferences } from '@/api';
import { BackHeader, Icon, Ph } from '@/components/ui';

/** 01-3 설정 */
export function Settings() {
  const [prefs, setPrefs] = useState({ day_before: true, departure: false });
  useEffect(() => setPrefs(loadPreferences()), []);
  const alerts = [
    { key: 'day_before' as const, title: '행사 전날 알림', sub: '올림픽공원과 잠실에 큰 행사가 있으면 알려드려요' },
    { key: 'departure' as const, title: '출발 시간 알림', sub: '역 상세에서 고른 시간에 맞춰 알려드려요' },
  ];
  const toggle = (k: 'day_before' | 'departure') => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    savePreferences(next);
  };
  return (
    <main className="screen">
      <BackHeader href="/home/" />
      <section style={{ padding: '4px 24px 0' }}>
        <h1 className="h1 big">설정</h1>
      </section>
      <div className="section-title">
        <h2>알림</h2>
      </div>
      <section className="card">
        {alerts.map((a) => (
          <div key={a.key} className="row" style={{ minHeight: 72 }}>
            <span className="main">
              <span className="title">{a.title}</span>
              <span className="sub">{a.sub}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={pushReady && prefs[a.key]}
              aria-label={a.title}
              className="switch"
              disabled={!pushReady}
              style={pushReady ? undefined : { opacity: 0.5, cursor: 'default' }}
              onClick={() => toggle(a.key)}
            >
              <span />
            </button>
          </div>
        ))}
        {!pushReady && <p style={{ margin: 0, padding: '4px 20px 12px', fontSize: 14, color: '#8A5300' }}>알림은 준비 중이에요. 알림 서버가 연결되면 켤 수 있어요.</p>}
      </section>
      <div className="section-title">
        <h2>정보</h2>
      </div>
      <section className="card">
        {[
          ['개인정보 처리방침', '/settings/privacy/'],
          ['이용약관', '/settings/terms/'],
        ].map(([label, href]) => (
          <Link key={href} href={href} className="row" style={{ minHeight: 56, fontSize: 16, fontWeight: 500 }}>
            <span style={{ flex: 1 }}>{label}</span>
            <Icon.chevron />
          </Link>
        ))}
        <div className="row" style={{ minHeight: 56, justifyContent: 'space-between', fontSize: 16, fontWeight: 500 }}>
          <span>버전</span>
          <span className="t" style={{ color: '#5F6573' }}>
            0.1.0
          </span>
        </div>
      </section>
      <p className="note" style={{ padding: '16px 24px' }}>
        로그인 없이 쓰는 서비스예요. 이름이나 연락처 같은 개인정보를 받지 않고, 설정은 이 기기에만 저장돼요.
      </p>
    </main>
  );
}

function Doc({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="screen">
      <BackHeader href="/settings/" />
      <section className="intro">
        <h1 className="h1 big">{title}</h1>
        <p className="lead" style={{ fontSize: 15 }}>
          {intro}
        </p>
        <span style={{ fontSize: 15, color: '#5F6573' }}>
          시행일 <Ph />
        </span>
      </section>
      <article className="doc">{children}</article>
    </main>
  );
}

/** 01-3-1 개인정보 처리방침 */
export function Privacy() {
  return (
    <Doc title="개인정보 처리방침" intro="틈길은 로그인 없이 쓰는 서비스라 이름, 연락처 같은 개인정보를 받지 않아요. 서비스를 쓰면서 생기는 최소한의 정보만 이렇게 다뤄요.">
      <h2>1. 처리하는 정보</h2>
      <ul>
        <li>위치: 허용한 경우에만, 근처 역과 도보 시간을 계산할 때 기기 안에서 써요. 서버에 저장하지 않아요</li>
        <li>알림 구독 정보: 알림을 허용한 경우, 알림을 보내기 위한 기기별 구독 값을 저장해요</li>
        <li>알림을 신청한 공연과 출발 시간</li>
        <li>귀가 후 피드백 응답(여유, 보통, 붐빔): 누가 답했는지 알 수 없게 저장해요</li>
        <li>최근 검색과 설정: 이 기기에만 저장해요</li>
      </ul>
      <h2>2. 쓰는 목적</h2>
      <ul>
        <li>덜 붐비는 역과 시간 안내</li>
        <li>공연 종료 전, 행사 전날, 출발 시간 알림</li>
        <li>예상 정확도를 높이기 위한 통계</li>
      </ul>
      <h2>3. 보관 기간</h2>
      <ul>
        <li>알림 구독 정보는 알림을 끄거나 앱을 삭제하면 지체 없이 지워요</li>
        <li>
          피드백 응답은 통계로 만든 뒤 지워요(보관 기간: <Ph />)
        </li>
      </ul>
      <h2>4. 다른 곳에 주는 경우</h2>
      <ul>
        <li>법에 정해진 경우 말고는 제3자에게 주지 않아요</li>
        <li>
          알림 발송은 발송 업체(<Ph />)에 맡기며, 맡긴 정보는 발송에만 써요
        </li>
      </ul>
      <h2>5. 내 정보 지우기</h2>
      <ul>
        <li>설정에서 알림을 끄면 구독 정보가 지워져요</li>
        <li>브라우저 사이트 데이터를 지우면 기기에 저장된 기록이 모두 지워져요</li>
      </ul>
      <h2>6. 개인정보 보호 담당</h2>
      <ul>
        <li>
          담당: <Ph />
        </li>
        <li>
          문의: <Ph />
        </li>
      </ul>
      <h2>7. 바뀌는 경우</h2>
      <ul>
        <li>내용이 바뀌면 시행 7일 전부터 앱에서 알려드려요</li>
      </ul>
    </Doc>
  );
}

/** 01-3-2 이용약관 */
export function Terms() {
  return (
    <Doc title="이용약관" intro="틈길을 쓰기 전에 알아 두면 좋은 약속이에요.">
      <h2>1. 서비스 내용</h2>
      <ul>
        <li>송파 지역 공연·경기 일정과 지하철 승차 기록으로, 덜 붐비는 역과 시간을 예상해 알려드려요</li>
        <li>로그인 없이 누구나 무료로 쓸 수 있어요</li>
      </ul>
      <h2>2. 정보의 성격</h2>
      <ul>
        <li>역 혼잡 예측은 비슷한 날의 과거 승차 기록을 바탕으로 해요. 현장 실시간 혼잡 정보와 구분해서 보여드려요</li>
        <li>현장 정보는 서울시가 추정한 장소 인구예요. 역 승차 인원, 열차 안 혼잡도, 대기 시간과는 달라요</li>
        <li>공연 끝나는 시간은 예상이라 달라질 수 있어요</li>
        <li>현장 안내와 다르면 현장 안내를 따라 주세요</li>
      </ul>
      <h2>3. 책임의 범위</h2>
      <ul>
        <li>예상과 실제 혼잡이 달라 생긴 손해에 대해서는 고의나 중대한 과실이 없는 한 책임지지 않아요</li>
        <li>외부 지도 앱으로 넘어간 뒤의 경로 안내는 해당 앱의 약관을 따라요</li>
      </ul>
      <h2>4. 서비스 변경과 중단</h2>
      <ul>
        <li>데이터 제공 기관의 사정이나 점검으로 일부 정보가 늦거나 빠질 수 있어요</li>
        <li>서비스를 크게 바꾸거나 멈출 때는 미리 앱에서 알려드려요</li>
      </ul>
      <h2>5. 이용자의 약속</h2>
      <ul>
        <li>서비스를 자동으로 대량 조회하거나 운영을 방해하지 않아요</li>
      </ul>
      <h2>6. 데이터 출처</h2>
      <ul>
        <li>한국체육산업개발 공공데이터: 올림픽공원 공연 정보</li>
        <li>서울특별시 공공데이터: 서울교통공사 일별·시간대별 승하차 인원</li>
        <li>서울특별시 공공데이터: 서울시 실시간 도시데이터(장소 인구 추정)</li>
        <li>KBO 경기 일정</li>
        <li>각 데이터는 제공 기관의 이용 조건을 따라요</li>
      </ul>
      <h2>7. 운영자</h2>
      <ul>
        <li>
          운영: <Ph />
        </li>
        <li>
          문의: <Ph />
        </li>
      </ul>
    </Doc>
  );
}
