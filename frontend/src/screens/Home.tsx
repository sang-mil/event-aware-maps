'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getEvents, getForecast, postFeedback, type Level } from '@/api';
import {
  Headline,
  Icon,
  KindChip,
  LevelBadge,
  LineBadge,
  Loading,
  Offline,
  Ph,
  SectionTitle,
  Sheet,
  StaleNotice,
  TabBar,
  Time,
  TimeSheet,
  Walk,
} from '@/components/ui';
import { DEMO_NOW_MIN, DEMO_QUIET_DAY, DEMO_TODAY, LEVEL, asset, fmtMin, requestLocation, store, track, useLocationGranted } from '@/lib/app';
import { useLoad, useRefs } from '@/lib/useLoad';

export interface PendingFeedback {
  station_id: string;
  station_name: string;
  event_id: string | null;
  event_title: string | null;
  date: string;
  hour: string;
  level: Level;
}

/** 01 홈 (+ 01-1 시간 선택, 01-2 피드백, E1 위치 꺼짐, E2 행사 없는 날, E5 연결 오류) */
export function Home() {
  const q = useSearchParams();
  const demo = q.get('state'); // 시안 미리보기: noLocation | noEvent | feedback | offline | time
  const date = demo === 'noEvent' ? DEMO_QUIET_DAY : DEMO_TODAY;

  const forecast = useLoad(() => (demo === 'offline' ? Promise.reject(new Error('demo')) : getForecast(date)), [date, demo]);
  const events = useLoad(() => getEvents(date), [date]);
  const { st, vn } = useRefs();
  const locGranted = useLocationGranted();
  const [locOn, setLocOn] = useState(false);
  const noLoc = demo === 'noLocation' || (locGranted === false && !locOn && demo !== 'feedback');

  const [at, setAt] = useState(DEMO_NOW_MIN);
  const [sheet, setSheet] = useState(demo === 'time');
  const [fb, setFb] = useState<PendingFeedback | null>(null);
  useEffect(() => {
    if (demo === 'feedback') {
      setFb({ station_id: 'bangi', station_name: '방이역', event_id: 'evt_20250809_kspo', event_title: '더보이즈 공연', date: DEMO_TODAY, hour: '20', level: 'normal' });
    } else {
      setFb(store<PendingFeedback>('pendingFeedback'));
    }
  }, [demo]);

  if (forecast.status === 'loading' || events.status === 'loading') return <Loading />;
  if (forecast.status === 'error') return <Offline lastUpdatedAt={forecast.lastUpdatedAt} onRetry={forecast.retry} />;
  if (events.status === 'error') return <Offline lastUpdatedAt={events.lastUpdatedAt} onRetry={events.retry} />;

  const f = forecast.value.data;
  const hour = String(Math.floor(at / 60)).padStart(2, '0');
  const supported = f.supported_hours.includes(hour);
  const summary = f.summaries[hour];
  const order = f.ranking[hour] ?? f.stations.map((s) => s.station_id);
  const list = order
    .map((id) => {
      const slot = f.stations.find((s) => s.station_id === id)?.slots.find((s) => s.hour === hour);
      const station = st[id];
      if (!station) return null;
      const note = slot ? slot.message : station.has_data ? '이 시간대는 연동 후 보여드려요' : '혼잡 정보 연동 예정';
      return { id, station, level: (slot?.level ?? 'no_data') as Level, note, best: summary?.best_station_id === id };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 3);
  const ev = events.value.data;
  const hourNum = Number(hour);
  const timeLabel = at === DEMO_NOW_MIN ? `지금 ${fmtMin(at)}` : `오늘 ${fmtMin(at)}`;

  return (
    <main className="screen with-tabs">
      <header className="topbar" style={{ padding: '0 12px 0 24px' }}>
        <img src={asset('/brand/wordmark.png')} alt="틈길" style={{ height: 22, width: 'auto' }} />
        <Link href="/settings/" aria-label="설정" className="icon-btn" style={{ color: '#5F6573' }}>
          <Icon.gear />
        </Link>
      </header>
      {forecast.value.fromCache && <StaleNotice updatedAt={forecast.value.updatedAt} />}
      {noLoc && (
        <div role="status" style={{ margin: '4px 16px 0', background: '#FFFFFF', borderRadius: 16, padding: '10px 8px 10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon.pin />
          <span style={{ flex: 1, fontSize: 14, lineHeight: 1.45, color: '#4A4F5C' }}>
            위치 권한이 꺼져 있어 <strong style={{ color: '#17171C' }}>올림픽공원 기준</strong>으로 보여드려요
          </span>
          <button type="button" className="chip" style={{ fontSize: 14, padding: '0 12px' }} onClick={async () => setLocOn(await requestLocation())}>
            켜기
          </button>
        </div>
      )}
      <section style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-haspopup="dialog"
          aria-label={`기준 시간 바꾸기, 지금은 ${timeLabel} 예상`}
          style={{ alignSelf: 'flex-start', minHeight: 44, marginLeft: -4, padding: '0 4px', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 500, color: '#5F6573' }}
        >
          <span className="t">{timeLabel}</span> 예상
          <Icon.down />
        </button>
        {!f.has_event ? (
          <Headline highlight={null} text={summary?.text ?? '오늘은 큰 행사가 없어 주변 역이 평소와 비슷할 거예요'} />
        ) : summary && supported ? (
          <Headline highlight={summary.highlight} text={summary.text} />
        ) : (
          <Headline highlight={`${hourNum}시`} text=" 혼잡 예상은 데이터를 연동한 뒤 보여드려요" />
        )}
      </section>

      <section className="card">
        {list.map((s) => (
          <Link
            key={s.id}
            className="row"
            href={s.station.has_data ? `/station/?id=${s.id}` : `/station/?id=${s.id}`}
          >
            <LineBadge line={s.station.lines[0]} />
            <span className="main">
              <span className="title">{s.station.name}</span>
              <span className="sub">
                <Walk min={null} />, {s.best && <b className="best">가장 덜 붐빔</b>}
                {!s.best && s.note}
              </span>
            </span>
            <LevelBadge level={s.level} />
          </Link>
        ))}
      </section>

      <SectionTitle right={<Link href="/events/">전체</Link>}>오늘 공연과 경기</SectionTitle>
      <section className="card">
        {ev.events.length > 0 ? (
          ev.events
            .filter((e) => e.linkable)
            .filter((e, i, arr) => arr.findIndex((x) => x.type === e.type) === i)
            .map((e) => (
              <Link key={e.id} className="row" href={e.type === 'game' ? `/game/?id=${e.id}` : `/event/?id=${e.id}&from=home`}>
                <KindChip type={e.type} />
                <span className="main">
                  <span className="title">{e.title}</span>
                  <span className="sub">
                    {e.venue_id ? vn[e.venue_id]?.name : '장소 확인 중'},{' '}
                    {e.type === 'game' ? (
                      <>
                        <Time iso={e.start_at} /> 시작
                      </>
                    ) : (
                      <>
                        <Time iso={e.end_at} />에 끝나요
                      </>
                    )}
                  </span>
                </span>
              </Link>
            ))
        ) : (
          <Link className="row" href="/calendar/">
            <span className="tile" aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: '#EEF0F3', color: '#5F6573' }}>
              <Icon.calendar />
            </span>
            <span className="main">
              <span className="title">오늘은 큰 행사가 없어요</span>
              <span className="sub">
                다음 공연 <Ph value={ev.next_event?.date ?? null}>0월 0일 (토)</Ph>
                {ev.next_event?.venue_id ? `, ${vn[ev.next_event.venue_id]?.name ?? ''}` : ''}
              </span>
            </span>
            <Icon.chevron />
          </Link>
        )}
      </section>
      <TabBar active="home" />

      <TimeSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="언제 기준으로 볼까요?"
        sub="오늘 시와 분을 직접 맞춰요"
        value={at}
        now={DEMO_NOW_MIN}
        min={18 * 60}
        max={24 * 60 - 10}
        hint={(h) => (f.supported_hours.includes(String(h).padStart(2, '0')) ? `${h}시대 혼잡 예상을 보여드려요` : `${h}시대 혼잡 정보는 아직 준비 중이에요`)}
        confirmLabel={(v, isNow) => (isNow ? '지금 기준으로 보기' : `${fmtMin(v)} 기준으로 보기`)}
        onConfirm={(v) => {
          setAt(v);
          setSheet(false);
          track('time_set', { screen: 'home', time: fmtMin(v) });
        }}
      />
      {fb && <FeedbackSheet fb={fb} onClose={() => setFb(null)} />}
    </main>
  );
}

/** 01-2 귀가 후 피드백 */
function FeedbackSheet({ fb, onClose }: { fb: PendingFeedback; onClose: () => void }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const close = () => {
    store('pendingFeedback', null);
    onClose();
  };
  const send = (a: 'relaxed' | 'normal' | 'crowded' | 'not_used', label: string | null) => {
    postFeedback({ station_id: fb.station_id, date: fb.date, hour: fb.hour, predicted_level: fb.level, answer: a, event_id: fb.event_id });
    track('feedback', { station_id: fb.station_id, hour: fb.hour, predicted_level: fb.level, answer: a });
    if (label) setAnswer(label);
    else close();
  };
  const opts = [
    ['relaxed', '여유'],
    ['normal', '보통'],
    ['crowded', '붐빔'],
  ] as const;
  return (
    <Sheet open onClose={close} title={answer ? '고마워요' : `${fb.station_name}, 실제로 어땠나요?`}>
      {!answer ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>{fb.station_name}, 실제로 어땠나요?</h2>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: '#5F6573' }}>
              {fb.event_title ? `어제 ${fb.event_title}이 끝나고 ` : ''}
              {fb.station_name}에서 타셨어요. 알려 주시면 다음 예상이 더 정확해져요
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {opts.map(([a, label]) => (
              <button
                key={a}
                type="button"
                onClick={() => send(a, label)}
                style={{ height: 64, borderRadius: 16, border: 0, cursor: 'pointer', fontSize: 16, fontWeight: 700, background: LEVEL[a].bg, color: LEVEL[a].fg }}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => send('not_used', null)} style={{ height: 44, border: 0, background: 'transparent', fontSize: 15, fontWeight: 700, color: '#5F6573', cursor: 'pointer' }}>
            이용하지 않았어요
          </button>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>고마워요</h2>
            <span style={{ fontSize: 15, lineHeight: 1.55, color: '#4A4F5C' }}>
              ‘{answer}’{answer === '여유' ? '로' : '으로'} 기록했어요. 다음 예상에 반영할게요.
            </span>
          </div>
          <button type="button" className="btn primary" style={{ flex: 'none' }} onClick={close}>
            확인
          </button>
        </>
      )}
    </Sheet>
  );
}
