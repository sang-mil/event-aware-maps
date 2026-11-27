'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SourceNote } from '@/components/DataNote';
import { getEvents, getForecast, getRealtimeCrowd, postFeedback, serverReady, usingRealtimeApi, type Level, type RealtimeCrowd } from '@/api';
import {
  Headline,
  Icon,
  KindChip,
  LevelBadge,
  LineBadge,
  LoadError,
  Loading,
  Offline,
  SectionTitle,
  Sheet,
  StaleNotice,
  TabBar,
  EventWhen,
  placeLabel,
  stationName,
  venueName,
  TimeSheet,
  Walk,
} from '@/components/ui';
import { DEMO_QUIET_DAY, dateLabel, demoState, LEVEL, nowMin, today, viewTime, asset, fmtMin, requestLocation, store, track, useLocationGranted } from '@/lib/app';
import { useLoad, useRefs, type LoadState } from '@/lib/useLoad';

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
  const demo = demoState(q); // 시안 미리보기: noLocation | noEvent | feedback | offline | time
  const date = demo === 'noEvent' ? DEMO_QUIET_DAY : today(); // noEvent: 행사가 없는 날(E2) 목업

  const forecast = useLoad(() => (demo === 'offline' ? Promise.reject(new Error('demo')) : getForecast(date)), [date, demo]);
  const events = useLoad(() => getEvents(date), [date]);
  const olympicCrowd = useLoad(() => getRealtimeCrowd('olympic-park'), []);
  const jamsilCrowd = useLoad(() => getRealtimeCrowd('jamsil'), []);
  const { st, vn } = useRefs();
  const locGranted = useLocationGranted();
  const [locOn, setLocOn] = useState(false);
  const noLoc = demo === 'noLocation' || (locGranted === false && !locOn && demo !== 'feedback');

  const now = nowMin();
  const [picked, setPicked] = useState<number | null>(null); // 사용자가 시간 시트에서 고른 시각
  const [sheet, setSheet] = useState(demo === 'time');
  const [fb, setFb] = useState<PendingFeedback | null>(null);
  useEffect(() => {
    if (demo === 'feedback') {
      // 시안(01-2) 미리보기용 예시 값이에요. 실제로는 비교 화면에서 고른 방법이 저장돼요.
      setFb({ station_id: 'bangi', station_name: '방이역', event_id: 'evt_20250809_kspo', event_title: '더보이즈 공연', date: today(), hour: '20', level: 'normal' });
    } else if (serverReady) {
      // 응답을 받을 서버가 있을 때만 물어봐요
      setFb(store<PendingFeedback>('pendingFeedback'));
    }
  }, [demo]);

  if (forecast.status === 'loading' || events.status === 'loading') return <Loading />;
  if (forecast.status === 'error') return <LoadError code={forecast.code} lastUpdatedAt={forecast.lastUpdatedAt} onRetry={forecast.retry} />;
  if (events.status === 'error') return <LoadError code={events.code} lastUpdatedAt={events.lastUpdatedAt} onRetry={events.retry} />;

  const f = forecast.value.data;
  const view = viewTime(now, f);
  const at = picked ?? view.min;
  const showingFallback = picked === null && view.fallback;
  const hour = String(Math.floor(at / 60)).padStart(2, '0');
  const supported = f.supported_hours.includes(hour);
  const summary = f.summaries[hour];
  const order = f.ranking[hour] ?? f.stations.map((s) => s.station_id);
  const list = order
    .map((id) => {
      const slot = f.stations.find((s) => s.station_id === id)?.slots.find((s) => s.hour === hour);
      const station = st[id];
      const note = slot ? slot.message : station && !station.has_data ? '혼잡 정보 없음' : '이 시간대 혼잡 정보 없음';
      return { id, station, level: (slot?.level ?? 'no_data') as Level, note, best: summary?.best_station_id === id };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 3);
  const ev = events.value.data;
  const hourNum = Number(hour);
  const timeLabel = at === now ? `지금 ${fmtMin(at)}` : `오늘 ${fmtMin(at)}`;
  const fallbackNote = showingFallback ? `지금(${fmtMin(now)})은 예상이 없는 시간이라, 행사가 끝나는 ${hourNum}시대를 보여드려요` : null;

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
          <span style={{ flex: 1, fontSize: 15, lineHeight: 1.45, color: '#4A4F5C' }}>
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
        {fallbackNote && (
          <span role="status" style={{ fontSize: 15, lineHeight: 1.5, color: '#5F6573', marginTop: -6 }}>
            {fallbackNote}
          </span>
        )}
        {!f.has_event ? (
          <Headline highlight={null} text={summary?.text ?? '오늘은 큰 행사가 없어 주변 역이 평소와 비슷할 거예요'} />
        ) : summary && supported ? (
          <Headline highlight={summary.highlight} text={summary.text} />
        ) : (
          <Headline highlight={`${hourNum}시`} text=" 혼잡 예상 정보가 없어요" />
        )}
      </section>

      <section className="card">
        {list.map((s) => (
          <Link
            key={s.id}
            className="row"
            href={`/station/?id=${s.id}`}
          >
            <LineBadge line={s.station?.lines[0]} />
            <span className="main">
              <span className="title">{stationName(st, s.id)}</span>
              <span className="sub">
                <Walk min={null} />, {s.best && <b className="best">가장 덜 붐빔</b>}
                {!s.best && s.note}
              </span>
            </span>
            <LevelBadge level={s.level} />
          </Link>
        ))}
      </section>

      <SectionTitle>현장 실시간 혼잡</SectionTitle>
      <section className="card" aria-label="올림픽공원과 잠실의 실시간 장소 혼잡 정보">
        {!usingRealtimeApi ? (
          <div className="row" role="status" style={{ minHeight: 64 }}>
            <span className="main">
              <span className="title">실시간 현장 정보가 아직 연결되지 않았어요</span>
              <span className="sub">서울시 공공데이터 Worker 주소를 설정하면 표시돼요</span>
            </span>
          </div>
        ) : (
          <>
            <RealtimeCrowdRow title="올림픽공원" state={olympicCrowd} />
            <RealtimeCrowdRow title="잠실" state={jamsilCrowd} />
          </>
        )}
        <p className="note" style={{ margin: 0, padding: '0 16px 14px', lineHeight: 1.5 }}>
          서울시가 추정한 장소 인구 정보예요. 역 승차 인원이나 열차 안 혼잡도와는 달라요.
        </p>
      </section>

      <SectionTitle right={<Link href="/events/">전체</Link>}>오늘 공연과 경기</SectionTitle>
      <section className="card">
        {ev.events.length > 0 ? (
          ev.events
            .filter((e, i, arr) => arr.findIndex((x) => x.type === e.type) === i)
            .map((e) => {
              const inner = (
                <>
                  <KindChip type={e.type} />
                  <span className="main">
                    <span className="title">{e.title}</span>
                    <span className="sub">
                      {placeLabel(vn, e)}, <EventWhen e={e} start={false} />
                    </span>
                  </span>
                </>
              );
              return e.linkable ? (
                <Link key={e.id} className="row" href={e.type === 'game' ? `/game/?id=${e.id}` : `/event/?id=${e.id}&from=home`}>
                  {inner}
                </Link>
              ) : (
                <div key={e.id} className="row">
                  {inner}
                </div>
              );
            })
        ) : (
          <Link className="row" href="/calendar/">
            <span className="tile" aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: '#EEF0F3', color: '#5F6573' }}>
              <Icon.calendar />
            </span>
            <span className="main">
              <span className="title">오늘은 큰 행사가 없어요</span>
              <span className="sub">
                {ev.next_event?.date ? (
                  <>
                    다음 공연 <span className="t">{dateLabel(ev.next_event.date)}</span>, {venueName(vn, ev.next_event.venue_id)}
                  </>
                ) : (
                  <span className="na">다음 공연 정보 없음</span>
                )}
              </span>
            </span>
            <Icon.chevron />
          </Link>
        )}
      </section>
      <SourceNote />
      <TabBar active="home" />

      <TimeSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="언제 기준으로 볼까요?"
        sub="오늘 시와 분을 직접 맞춰요"
        value={at}
        now={now}
        min={18 * 60}
        max={24 * 60 - 10}
        hint={(h) => (f.supported_hours.includes(String(h).padStart(2, '0')) ? `${h}시대 혼잡 예상을 보여드려요` : `${h}시대 혼잡 정보는 아직 준비 중이에요`)}
        confirmLabel={(v, isNow) => (isNow ? '지금 기준으로 보기' : `${fmtMin(v)} 기준으로 보기`)}
        onConfirm={(v) => {
          setPicked(v);
          setSheet(false);
          track('time_set', { screen: 'home', time: fmtMin(v) });
        }}
      />
      {fb && <FeedbackSheet fb={fb} onClose={() => setFb(null)} />}
    </main>
  );
}

function RealtimeCrowdRow({ title, state }: { title: string; state: LoadState<RealtimeCrowd> }) {
  if (state.status === 'loading') {
    return <div className="row" role="status" style={{ minHeight: 64 }}><span className="main"><span className="title">{title}</span><span className="sub">현장 정보를 확인하고 있어요</span></span></div>;
  }
  if (state.status === 'error') {
    return <div className="row" role="status" style={{ minHeight: 64 }}><span className="main"><span className="title">{title}</span><span className="sub">현재 혼잡 정보를 불러오지 못했어요</span></span><button type="button" className="chip" onClick={state.retry}>다시 시도</button></div>;
  }

  const { crowd } = state.value.data;
  const min = formatPopulation(crowd.population_min);
  const max = formatPopulation(crowd.population_max);
  const range = min && max ? `추정 인구 ${min}~${max}명` : '추정 인구 정보 없음';
  const observed = crowd.observed_at ? `관측 기준 ${crowd.observed_at}` : '관측 시각 정보 없음';

  return (
    <div className="row" style={{ minHeight: 72, alignItems: 'flex-start' }}>
      <span className="main" style={{ gap: 5 }}>
        <span className="title">{title} · {crowd.level ?? '혼잡 정보 없음'}</span>
        <span className="sub">{crowd.message ?? '혼잡 안내 문구가 없어요'}</span>
        <span className="sub">{range} · {observed}</span>
        {state.value.fromCache && <span className="sub" role="status">연결이 끊겨 기기에 저장된 이전 정보를 보여드려요</span>}
      </span>
    </div>
  );
}

function formatPopulation(value: string | number | null): string | null {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat('ko-KR').format(parsed) : null;
}

/** 01-2 귀가 후 피드백 */
function FeedbackSheet({ fb, onClose }: { fb: PendingFeedback; onClose: () => void }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const close = () => {
    store('pendingFeedback', null);
    onClose();
  };
  const send = async (a: 'relaxed' | 'normal' | 'crowded' | 'not_used', label: string | null) => {
    setSaved(await postFeedback({ station_id: fb.station_id, date: fb.date, hour: fb.hour, predicted_level: fb.level, answer: a, event_id: fb.event_id }));
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
            <span style={{ fontSize: 15, lineHeight: 1.5, color: '#5F6573' }}>
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
              {saved
                ? `‘${answer}’${answer === '여유' ? '로' : '으로'} 기록했어요. 다음 예상에 반영할게요.`
                : '응답 저장은 아직 준비 중이에요. 서버가 연결되면 다음 예상에 반영할게요.'}
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
