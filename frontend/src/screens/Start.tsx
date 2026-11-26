'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BottomBar, Icon } from '@/components/ui';
import { pushReady } from '@/api';
import { asset, isIphone, pushSupport, requestLocation, requestPush, store, track, useLocationGranted } from '@/lib/app';

/** 00 스플래시 */
export function Splash() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => {
      router.replace(store<boolean>('onboarded') ? '/home/' : '/onboarding/');
    }, 1200);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <main className="screen" style={{ background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <img className="rise" src={asset('/brand/wordmark.png')} alt="틈길" style={{ width: 190, height: 'auto' }} />
      <p className="rise late" style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: '#4A4F5C' }}>
        붐비는 사이, 덜 붐비는 역과 시간
      </p>
    </main>
  );
}

const STEPS = [
  { d: 'M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 3v4M16 3v4', title: '오늘 송파 공연과 경기를 한눈에', sub: '올림픽공원 공연과 잠실 경기를 함께 보여드려요' },
  { d: 'M4 20V10M10 20V4M16 20v-7M22 20H2', title: '근처 역이 언제 붐비는지', sub: '쌓인 승차 기록으로 시간대별 혼잡을 예상해 드려요' },
  { d: 'M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 19h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5', title: '덜 붐비는 역과 시간 추천', sub: '조금 걸을지, 조금 늦게 탈지 비교해서 골라요' },
];

/** 00-1 첫 실행 안내 · 권한 요청 */
export function Onboarding() {
  const locGranted = useLocationGranted();
  const [loc, setLoc] = useState(false);
  const [noti, setNoti] = useState(false);
  const [iphone, setIphone] = useState(false);
  useEffect(() => {
    setIphone(isIphone());
    setNoti(pushSupport() === 'granted');
  }, []);
  useEffect(() => {
    if (locGranted) setLoc(true);
  }, [locGranted]);

  const perms = [
    { key: 'loc', title: '위치', sub: '내 주변 역과 도보 시간을 보여드려요', on: loc, ask: async () => setLoc(await requestLocation()), ready: true },
    { key: 'noti', title: '알림', sub: pushReady ? '공연이 끝나기 전, 행사 전날에 알려드려요' : '공연이 끝나기 전, 행사 전날 알림은 준비 중이에요', on: noti, ask: async () => setNoti(await requestPush()), ready: pushReady },
  ];

  return (
    <main className="screen">
      <section style={{ padding: '56px 24px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <img src={asset('/brand/wordmark.png')} alt="틈길" style={{ width: 96, height: 'auto' }} />
        <h1 className="h1 big">
          공연이 끝나고
          <br />
          편안하게 집에 가요
        </h1>
      </section>
      <ol className="card" style={{ marginTop: 20, listStyle: 'none' }}>
        {STEPS.map((s) => (
          <li key={s.title} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 20px' }}>
            <span className="tile" aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: '#EEF0F3' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d={s.d} />
              </svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <strong style={{ fontSize: 16 }}>{s.title}</strong>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: '#5F6573' }}>{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="section-title">
        <h2>더 정확하게 쓰려면</h2>
      </div>
      <section className="card">
        {perms.map((p) => (
          <div key={p.key} className="row">
            <span className="main">
              <span className="title">{p.title}</span>
              <span className="sub">{p.sub}</span>
            </span>
            <button
              type="button"
              aria-pressed={p.on}
              onClick={p.ask}
              disabled={p.on || !p.ready}
              className="chip"
              style={{ minWidth: 72, fontSize: 14, background: p.on || !p.ready ? '#E9EBEF' : '#17171C', color: p.on || !p.ready ? '#2C303A' : '#FFFFFF' }}
            >
              {!p.ready ? '준비 중' : p.on ? '허용됨' : '허용'}
            </button>
          </div>
        ))}
      </section>
      <div style={{ padding: '14px 24px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {iphone && pushReady && (
          <Link href="/install/?from=onboarding" className="link-u">
            아이폰이라면 홈 화면에 추가해야 알림을 받아요
          </Link>
        )}
        <span style={{ fontSize: 13, lineHeight: 1.55, color: '#5F6573' }}>
          허용하지 않아도 올림픽공원 기준으로 쓸 수 있어요. 개인정보는 받지 않아요.
        </span>
      </div>
      <BottomBar>
        <Link
          href="/home/"
          className="btn primary"
          onClick={() => {
            store('onboarded', true);
            track('onboarding_complete', { location_granted: loc, push_granted: noti });
          }}
        >
          시작하기
        </Link>
      </BottomBar>
    </main>
  );
}

/** 05-1 아이폰 알림 받는 방법 */
export function Install({ from, event }: { from: string | null; event: string | null }) {
  const steps = [
    ['사파리 아래쪽 공유 버튼을 눌러요', '네모에서 화살표가 위로 나온 모양이에요'],
    ['‘홈 화면에 추가’를 골라요', '목록을 조금 내리면 있어요'],
    ['홈 화면의 틈길 아이콘으로 열어요', '처음 열 때 알림 허용을 눌러 주세요'],
  ];
  const back = from === 'onboarding' ? '/onboarding/' : event ? `/event/?id=${event}` : '/home/';
  return (
    <main className="screen">
      <header className="topbar">
        <Link href={back} aria-label="뒤로" className="icon-btn">
          <Icon.back />
        </Link>
      </header>
      <section className="intro" style={{ paddingBottom: 20 }}>
        <h1 className="h1 big">
          아이폰은 홈 화면에
          <br />
          추가하면 알림을
          <br />
          받을 수 있어요
        </h1>
      </section>
      <ol className="card" style={{ listStyle: 'none' }}>
        {steps.map(([t, s], i) => (
          <li key={t} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '12px 20px' }}>
            <span className="t tile" style={{ width: 28, height: 28, borderRadius: '50%', background: '#17171C', color: '#FFFFFF', fontSize: 14, fontWeight: 700 }}>
              {i + 1}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <strong style={{ fontSize: 17 }}>{t}</strong>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: '#5F6573' }}>{s}</span>
            </span>
          </li>
        ))}
      </ol>
      <section className="card pad" style={{ marginTop: 12, gap: 4 }}>
        <strong style={{ fontSize: 17 }}>안드로이드와 PC는 바로 돼요</strong>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: '#5F6573' }}>브라우저에서 알림 허용만 누르면 받을 수 있어요</span>
      </section>
      <p className="note">iOS 16.4 이상에서 지원돼요. 추가하기 어렵다면 공연 상세의 ‘캘린더에 추가하기’를 써 주세요.</p>
    </main>
  );
}
