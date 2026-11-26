'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { alertKey, getCalendar, getEvent, getEvents, getForecast, hasAlert, pushReady, setAlert, type EventDetail, type EventItem, usingStaticData } from '@/api';
import { SourceNote } from '@/components/DataNote';
import {
  BackHeader,
  BottomBar,
  Icon,
  KindChip,
  LevelBadge,
  LineBadge,
  LineStack,
  LoadError,
  Loading,
  Offline,
  SectionTitle,
  StaleNotice,
  TabBar,
  Time,
  Walk,
  AREA_LABEL,
  EventWhen,
  placeLabel,
  stationName,
  venueName,
} from '@/components/ui';
import { REPLAY_MAX, REPLAY_MIN, dateLabel, demoState, isIphone, pushSupport, requestPush, today, track, type PushSupport } from '@/lib/app';
import { useLoad, useRefs } from '@/lib/useLoad';

const AREAS = [
  ['all', '전체'],
  ['olympic_park', '올림픽공원'],
  ['jamsil', '잠실'],
] as const;

function eventHref(e: { id: string; type: 'show' | 'game' }, from: string) {
  return e.type === 'game' ? `/game/?id=${e.id}` : `/event/?id=${e.id}&from=${from}`;
}

/** 03 캘린더 탭 */
export function Calendar() {
  const [area, setArea] = useState<string>('all');
  const [venue, setVenue] = useState<string>('all');
  const [picked, setPicked] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const cal = useLoad(() => getCalendar(month), [month]);
  // 데이터가 있는 달(2025-01 ~ 2025-12) 안에서만 넘겨요
  const shiftMonth = (delta: number) => {
    const [yy, mm] = month.split('-').map(Number);
    const d = new Date(Date.UTC(yy, mm - 1 + delta, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (next < REPLAY_MIN.slice(0, 7) || next > REPLAY_MAX.slice(0, 7)) return;
    setMonth(next);
    setPicked(`${next}-01`);
  };
  // 일정이 없는 날은 목업 파일이 없어서 오류가 나요. 그때는 '일정 없음'으로 보여줘요.
  const events = useLoad(() => getEvents(picked), [picked]);
  const fc = useLoad(() => getForecast(picked), [picked]);
  const { st, vn, venues } = useRefs();

  // 달을 넘길 때 화면 전체를 '불러오는 중'으로 바꾸지 않고, 달력 칸 안에만 불러오는 중을 적어요.
  // 그 달 파일이 없으면(not_found) 달력은 그대로 두고 '이 달은 데이터가 없어요'를 보여줘요
  if (cal.status === 'error' && cal.code !== 'not_found') return <LoadError code={cal.code} lastUpdatedAt={cal.lastUpdatedAt} onRetry={cal.retry} />;
  const calLoading = cal.status === 'loading';
  const calDays = cal.status === 'ok' ? cal.value.data.days : null;

  const [y, m] = month.split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayInfo = (d: number) => {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const info = calDays?.find((x) => x.date === date);
    if (!info) return { show: false, game: false };
    const src = venue !== 'all' ? info.by_venue[venue] : area !== 'all' ? info.by_area[area] : { show: info.has_show, game: info.has_game };
    return { show: !!src?.show, game: !!src?.game };
  };
  const venueChips = venues.filter((v) => area === 'all' || v.area === area);
  const dayEvents: EventItem[] =
    events.status === 'ok'
      ? events.value.data.events.filter((e) => (area === 'all' || e.area === area) && (venue === 'all' || e.venue_id === venue))
      : [];
  const showStations = dayEvents.some((e) => e.area === 'olympic_park') && fc.status === 'ok';
  const pickDate = (d: number) => {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    setPicked(date);
    track('calendar_pick', { area, venue_id: venue, event_count: dayEvents.length });
  };
  // 그날 가장 중요한 시간대(서버가 정해요)와 그 시간대의 역 순서를 그대로 써요.
  const focus = fc.status === 'ok' ? fc.value.data.focus_hour : null;
  const nearStations =
    fc.status === 'ok' && focus
      ? (fc.value.data.ranking[focus] ?? []).filter((sid) => fc.value.data.stations.find((s) => s.station_id === sid)?.slots.some((x) => x.hour === focus)).slice(0, 2)
      : [];

  return (
    <main className="screen with-tabs">
      <section style={{ padding: '40px 24px 20px' }}>
        <h1 className="h1 big">행사 캘린더</h1>
      </section>
      <div role="radiogroup" aria-label="지역" className="segmented" style={{ marginBottom: 10 }}>
        {AREAS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={area === id}
            onClick={() => {
              setArea(id);
              setVenue('all');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="공연장" className="hs" style={{ padding: '0 16px 12px' }}>
        {[{ id: 'all', name: '모든 공연장' }, ...venueChips].map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={venue === v.id}
            onClick={() => setVenue(v.id)}
            className="chip"
            style={{ flex: 'none', height: 40, fontSize: 14, background: venue === v.id ? '#17171C' : '#FFFFFF', color: venue === v.id ? '#FFFFFF' : '#2C303A' }}
          >
            {v.name}
          </button>
        ))}
      </div>
      <section className="card" style={{ padding: '8px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" aria-label="이전 달" className="icon-btn" style={{ color: '#4A4F5C' }} disabled={month <= REPLAY_MIN.slice(0, 7)} onClick={() => shiftMonth(-1)}>
            <Icon.back />
          </button>
          <span className="t" style={{ fontSize: 17, fontWeight: 700 }}>
            {y}년 {m}월
          </span>
          <button type="button" aria-label="다음 달" className="icon-btn" style={{ color: '#4A4F5C', transform: 'scaleX(-1)' }} disabled={month >= REPLAY_MAX.slice(0, 7)} onClick={() => shiftMonth(1)}>
            <Icon.back />
          </button>
        </div>
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', textAlign: 'center', fontSize: 13, color: '#5F6573' }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <span key={d} style={{ color: i === 0 ? '#C2281B' : i === 6 ? '#1F5FAF' : undefined }}>
              {d}
            </span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', rowGap: 4 }}>
          {Array.from({ length: lead }).map((_, i) => (
            <span key={`e${i}`} />
          ))}
          {Array.from({ length: daysIn }).map((_, i) => {
            const d = i + 1;
            const dow = (lead + i) % 7;
            const k = dayInfo(d);
            const sel = picked === `${month}-${String(d).padStart(2, '0')}`;
            return (
              <button
                key={d}
                type="button"
                onClick={() => pickDate(d)}
                aria-pressed={sel}
                aria-label={`${m}월 ${d}일${k.show ? ', 공연 있음' : ''}${k.game ? ', 잠실 경기 있음' : ''}`}
                style={{
                  height: 46,
                  margin: '0 2px',
                  border: 0,
                  borderRadius: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  background: sel ? '#17171C' : 'transparent',
                  color: sel ? '#FFFFFF' : dow === 0 ? '#C2281B' : dow === 6 ? '#1F5FAF' : '#17171C',
                }}
              >
                <span className="t" style={{ fontSize: 15, fontWeight: sel ? 700 : 500 }}>
                  {d}
                </span>
                <span aria-hidden="true" style={{ display: 'flex', gap: 3, height: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: k.show ? (sel ? '#9FC1EE' : '#1F5FAF') : 'transparent' }} />
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: k.game ? (sel ? '#F6B88A' : '#B54708') : 'transparent' }} />
                </span>
              </button>
            );
          })}
        </div>
        {!calDays && (
          <p role="status" style={{ margin: 0, padding: '4px 8px 0', fontSize: 14, color: calLoading ? '#5F6573' : '#8A5300' }}>
            {calLoading ? '이 달 일정을 불러오는 중이에요' : '이 달은 데이터가 없어요'}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', padding: '4px 8px 0', fontSize: 13, color: '#4A4F5C' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1F5FAF' }} />
            공연
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#B54708' }} />
            경기
          </span>
        </div>
      </section>

      {dayEvents.length > 0 ? (
        <>
          {showStations && fc.status === 'ok' && (
            <>
              <p style={{ margin: 0, padding: '28px 24px 10px', fontSize: 15, fontWeight: 700, color: '#4A4F5C' }}>근처 역, {Number(focus)}시대 예상</p>
              <section className="card">
                {nearStations.map((sid) => {
                  const slot = fc.value.data.stations.find((s) => s.station_id === sid)?.slots.find((s) => s.hour === focus);
                  if (!slot) return null;
                  return (
                    <Link key={sid} className="row" href={`/station/?id=${sid}&date=${picked}`}>
                      <LineBadge line={st[sid]?.lines[0]} />
                      <span className="main">
                        <span className="title">{stationName(st, sid)}</span>
                        <span className="sub">{slot.level === 'crowded' ? `공연이 끝나 ${slot.message}가 탈 거예요` : slot.message}</span>
                      </span>
                      <LevelBadge level={slot.level} />
                      <Icon.chevron />
                    </Link>
                  );
                })}
              </section>
            </>
          )}
          <p style={{ margin: 0, padding: '22px 24px 10px', fontSize: 15, fontWeight: 700, color: '#4A4F5C' }}>이날 공연과 경기</p>
          <section className="card">
            {dayEvents.map((e) => {
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
                <Link key={e.id} className="row" href={eventHref(e, 'calendar')}>
                  {inner}
                  <Icon.chevron />
                </Link>
              ) : (
                <div key={e.id} className="row">
                  {inner}
                </div>
              );
            })}
          </section>
        </>
      ) : (
        <section className="card pad" style={{ marginTop: 28, gap: 4, padding: '24px 20px' }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>
            {venue === 'all' ? '이날은 등록된 공연과 경기가 없어요' : `이날 ${venueName(vn, venue)}에는 일정이 없어요`}
          </span>
          <span style={{ fontSize: 14, color: '#5F6573' }}>역 혼잡도 평소와 비슷할 거예요</span>
        </section>
      )}
      {!usingStaticData && <p className="note">지금은 2025년 8월 9일 일정만 들어 있어요.</p>}
      <SourceNote />
      <TabBar active="calendar" />
    </main>
  );
}

/** 03-1 오늘 공연과 경기 전체 */
export function EventsToday() {
  const [f, setF] = useState('all');
  const res = useLoad(() => getEvents(today()), []);
  const { st, vn } = useRefs();
  if (res.status === 'loading') return <Loading />;
  if (res.status === 'error') return <LoadError code={res.code} lastUpdatedAt={res.lastUpdatedAt} onRetry={res.retry} />;
  const all = res.value.data.events;
  const list = all.filter((e) => f === 'all' || e.type === f || e.area === f);
  const filters = [
    ['all', '전체'],
    ['show', '공연'],
    ['game', '경기'],
    ['olympic_park', '올림픽공원'],
    ['jamsil', '잠실'],
  ];
  return (
    <main className="screen">
      <BackHeader href="/home/" />
      {res.value.fromCache && <StaleNotice updatedAt={res.value.updatedAt} />}
      <section className="intro" style={{ paddingBottom: 8, gap: 10 }}>
        <h1 className="h1 big">
          송파에서 오늘
          <br />
          <span className="t">{list.length}</span>개 열려요
        </h1>
        <span className="t" style={{ fontSize: 15, color: '#5F6573' }}>
          {dateLabel(res.value.data.date, true)}
        </span>
      </section>
      <div role="radiogroup" aria-label="종류" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '16px 24px 8px' }}>
        {filters.map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={f === id} onClick={() => setF(id)} className="chip" style={{ padding: '0 16px' }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((e) => {
          const ns = e.nearest_station;
          const body = (
            <>
              <span className="row" style={{ padding: '8px 20px' }}>
                <KindChip type={e.type} />
                <span className="main">
                  <span className="title">{e.title}</span>
                  <span className="sub">
                    {placeLabel(vn, e)}, <EventWhen e={e} />
                  </span>
                </span>
              </span>
              <span className="divider" />
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '4px 20px' }}>
                <LineBadge line={ns ? st[ns.station_id]?.lines[0] : undefined} size={28} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500 }}>
                  {ns ? stationName(st, ns.station_id) : '가까운 역 정보 없음'} <span style={{ color: '#5F6573', fontWeight: 400 }}>끝날 무렵</span>
                </span>
                <LevelBadge level={ns?.level ?? 'no_data'} />
              </span>
            </>
          );
          const style = { background: '#FFFFFF', borderRadius: 20, padding: '6px 0', display: 'flex', flexDirection: 'column' as const };
          return e.linkable ? (
            <Link key={e.id} href={eventHref(e, 'events')} style={style}>
              {body}
            </Link>
          ) : (
            <div key={e.id} style={style}>
              {body}
            </div>
          );
        })}
        {list.length === 0 && <div style={{ background: '#FFFFFF', borderRadius: 20, padding: '28px 20px', fontSize: 16, color: '#4A4F5C' }}>이 조건의 일정이 오늘은 없어요</div>}
      </div>
      <p className="note">역 상태는 공연이 끝날 무렵의 예상이에요.</p>
      <SourceNote />
    </main>
  );
}

const BACK: Record<string, string> = { home: '/home/', calendar: '/calendar/', events: '/events/', map: '/map/' };

/** 03-2 공연 상세 (+ 05-2 알림 불가, E6 시간 변경, E7 취소, E8 알림 거부) */
export function EventScreen() {
  const q = useSearchParams();
  const id = q.get('id') ?? '';
  const from = q.get('from') ?? 'home';
  const demo = demoState(q); // changed | canceled | nopush | denied
  const variant = demo === 'changed' || demo === 'canceled' ? demo : undefined;
  const res = useLoad(() => getEvent(id, variant), [id, variant]);
  const { st, vn } = useRefs();
  const [tab, setTab] = useState<'end' | 'later'>('end');
  const [push, setPush] = useState<PushSupport>('default');
  const [going, setGoing] = useState(false);
  const [calMsg, setCalMsg] = useState<string | null>(null);
  const [iphone, setIphone] = useState(false);
  const key = alertKey('show_end', id);
  useEffect(() => {
    setPush(demo === 'nopush' ? 'unsupported' : demo === 'denied' ? 'denied' : pushSupport());
    setGoing(hasAlert(key));
    setIphone(isIphone());
  }, [demo, key]);

  if (res.status === 'loading') return <Loading />;
  if (res.status === 'error') return <LoadError code={res.code} lastUpdatedAt={res.lastUpdatedAt} onRetry={res.retry} back={BACK[from] ?? '/home/'} />;
  const e = res.value.data;
  const canceled = e.status === 'canceled';
  // 알림 서버가 아직 없으면(pushReady=false) 푸시를 못 쓰는 경우와 똑같이 캘린더 추가를 권해요(05-2)
  const notReady = !pushReady && demo !== 'nopush' && demo !== 'denied';
  const noPush = push === 'unsupported' || push === 'denied' || notReady;
  const denied = push === 'denied';
  const block = tab === 'later' && e.after_end.later ? e.after_end.later : e.after_end.end;

  const toggleGoing = async () => {
    if (!going && push !== 'granted') {
      const ok = await requestPush();
      setPush(pushSupport());
      if (!ok) return;
    }
    if (!(await setAlert(key, !going, { kind: 'show_end', event_id: id }))) return;
    if (!going) track('notify_on', { kind: 'show_end', event_id: id });
    setGoing(!going);
  };
  const addCalendar = () => {
    if (!e.end_at) {
      setCalMsg('끝나는 시간이 정해지면 캘린더에 넣을 수 있어요');
      return;
    }
    downloadIcs(e, vn[e.venue_id ?? '']?.name ?? '');
    setCalMsg('캘린더에 추가했어요');
  };

  return (
    <main className="screen">
      <BackHeader href={BACK[from] ?? '/home/'} />
      {res.value.fromCache && <StaleNotice updatedAt={res.value.updatedAt} />}
      <section style={{ padding: '4px 24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {canceled && (
          <div role="alert" className="alert red">
            <strong>이 공연은 취소됐어요</strong>
            <span>KSPO 공연 정보 기준이에요. 등록한 알림도 함께 지웠어요.</span>
          </div>
        )}
        {e.status === 'changed' && (
          <div role="status" className="alert yellow">
            <strong>공연 시간이 바뀌었어요</strong>
            <span>
              끝나는 시간이 <Time iso={e.change?.prev_end_at} />에서 <Time iso={e.change?.new_end_at} />로 바뀌어 알림 시간도 맞춰 옮겼어요
            </span>
          </div>
        )}
        <h1 className="h1 big" style={{ textDecoration: canceled ? 'line-through' : 'none', color: canceled ? '#5F6573' : '#17171C' }}>
          {e.title}
        </h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge" style={{ background: '#E8F0FB', color: '#1F5FAF' }}>
            공연
          </span>
          <span style={{ fontSize: 15, color: '#5F6573' }}>{AREA_LABEL[e.area] ?? '지역 정보 없음'}</span>
        </span>
      </section>
      <section className="card" style={{ marginTop: 16, padding: '6px 20px' }}>
        <dl className="dl">
          <dt>공연장</dt>
          <dd>{venueName(vn, e.venue_id)}</dd>
          <dt>날짜</dt>
          <dd>{dateLabel(e.date, true)}</dd>
          <dt>시작</dt>
          <dd>
            <Time iso={e.start_at} />
          </dd>
          <dt>끝나는 시간</dt>
          <dd>
            <Time iso={e.end_at} /> {e.end_at && e.end_at_source === 'estimated' && <span style={{ color: '#5F6573', fontWeight: 400 }}>(추정)</span>}
          </dd>
        </dl>
      </section>

      {!canceled && !noPush && (
        <button
          type="button"
          onClick={toggleGoing}
          aria-pressed={going}
          style={{ margin: '12px 16px 0', width: 'calc(100% - 32px)', border: 0, borderRadius: 20, padding: '16px 20px', background: '#FFFFFF', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, boxShadow: `inset 0 0 0 ${going ? 2 : 0}px #17171C` }}
        >
          <span className="tile" aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: going ? '#17171C' : '#EEF0F3', color: going ? '#FFFFFF' : '#5F6573' }}>
            <Icon.bell filled={going} />
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <strong style={{ fontSize: 17 }}>{going ? '공연 끝나기 30분 전에 알려드릴게요' : '이 공연 보러 가세요?'}</strong>
            <span style={{ fontSize: 14, lineHeight: 1.45, color: '#5F6573' }}>
              {going ? '그때 어느 역이 덜 붐비는지 함께 보내드려요. 다시 누르면 취소돼요' : '끝나기 30분 전, 덜 붐비는 역을 알림으로 받아요'}
            </span>
          </span>
        </button>
      )}
      {!canceled && noPush && (
        <section className="card pad" style={{ marginTop: 12, gap: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="tile" aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: '#EEF0F3', color: '#5F6573' }}>
              <Icon.bell off />
            </span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <strong style={{ fontSize: 17 }}>{denied ? '알림이 꺼져 있어요' : '이 공연 보러 가세요?'}</strong>
              <span style={{ fontSize: 14, lineHeight: 1.45, color: '#5F6573' }}>
                {denied
                  ? '브라우저 설정에서 알림을 켜거나, 캘린더에 넣어 두면 끝나기 30분 전에 알려드려요'
                  : notReady
                    ? '앱 알림은 준비 중이에요. 휴대폰 캘린더에 넣어 두면 끝나기 30분 전에 알려드려요'
                    : '휴대폰 캘린더에 넣어 두면 끝나기 30분 전에 알려드려요'}
              </span>
            </span>
          </span>
          <button type="button" onClick={addCalendar} className={calMsg === '캘린더에 추가했어요' ? 'btn secondary' : 'btn dark'} style={{ height: 48, borderRadius: 14, fontSize: 16, flex: 'none' }}>
            {calMsg === '캘린더에 추가했어요' ? '캘린더에 추가했어요' : '캘린더에 추가하기'}
          </button>
          {calMsg && calMsg !== '캘린더에 추가했어요' && (
            <span role="status" style={{ fontSize: 14, color: '#8A5300' }}>
              {calMsg}
            </span>
          )}
          {!notReady && (denied || iphone || demo === 'nopush') && (
            <Link href={`/install/?from=event&event=${e.id}`} className="link-u">
              {denied ? '알림 다시 켜는 방법' : '홈 화면에 추가하면 실시간 알림도 받을 수 있어요'}
            </Link>
          )}
        </section>
      )}

      <div className="section-title" style={{ paddingRight: 24 }}>
        <h2>공연이 끝나면 주변 역은</h2>
        <span className="t" style={{ fontSize: 14, color: '#5F6573' }}>
          {block.hour_label}
        </span>
      </div>
      {e.after_end.later && (
        <div role="radiogroup" aria-label="언제 나갈지" className="segmented">
          {(
            [
              ['end', '끝날 무렵'],
              ['later', '1시간 뒤'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <section className="card">
        {block.stations.map((s) => (
          <Link key={s.station_id} className="row" href={`/station/?id=${s.station_id}`}>
            <LineStack lines={st[s.station_id]?.lines ?? []} />
            <span className="main">
              <span className="title">{stationName(st, s.station_id)}</span>
              <span className="sub">
                <Walk min={s.walk_min} />
                {s.message ? `, ${s.message}` : ''}
              </span>
            </span>
            <LevelBadge level={s.level} />
          </Link>
        ))}
        {e.after_end.no_data_message && <p style={{ margin: 0, padding: '4px 20px 12px', fontSize: 14, color: '#5F6573' }}>{e.after_end.no_data_message}</p>}
      </section>

      <SectionTitle>같은 날 송파 일정</SectionTitle>
      <ul className="card" style={{ listStyle: 'none' }}>
        {e.same_day.length === 0 && (
          <li className="row" style={{ minHeight: 56 }}>
            <span className="na">같은 날 다른 일정이 없어요</span>
          </li>
        )}
        {e.same_day.map((s) => (
          <li key={s.id} className="row" style={{ minHeight: 64 }}>
            <span className="main">
              <span className="title">{s.title}</span>
              <span className="sub">
                {venueName(vn, s.venue_id)}, <EventWhen e={{ ...s, end_at_source: s.end_at_source ?? null }} />
              </span>
            </span>
          </li>
        ))}
      </ul>
      <BottomBar>
        {/* 공연장을 모르면 '이 공연장에서'라고 하지 않고 출발지를 고르는 화면으로 보내요 */}
        <Link href={e.venue_id ? `/search/?venue=${e.venue_id}&event=${e.id}` : `/search/?event=${e.id}`} className="btn primary">
          {e.venue_id ? '이 공연장에서 출발하기' : '귀갓길 찾기'}
        </Link>
      </BottomBar>
    </main>
  );
}

/** 휴대폰 캘린더 일정 파일(.ics). 끝나기 30분 전 알림을 넣어요. */
function downloadIcs(e: EventDetail, venueName: string) {
  const toUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = e.end_at as string;
  const start = e.start_at ?? end;
  const url = `${window.location.origin}${window.location.pathname}?id=${e.id}`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//tumgil//ko',
    'BEGIN:VEVENT',
    `UID:${e.id}@tumgil`,
    `DTSTAMP:${toUtc(new Date().toISOString())}`,
    `DTSTART:${toUtc(start)}`,
    `DTEND:${toUtc(end)}`,
    `SUMMARY:${e.title}`,
    `LOCATION:${venueName}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${e.title} 끝나기 30분 전. 틈길에서 덜 붐비는 귀갓길을 확인하세요.`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `${e.title}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const GAME = {
  before: { dot: '#9AA0AC', color: '#4A4F5C', label: '경기 전', head: '아직 시작하지 않았어요', guide: '경기가 시작되고 끝나는 대로 이 화면에서 알려드려요.' },
  live: { dot: '#C2281B', color: '#C2281B', label: '경기 중', head: '아직 경기가 진행 중이에요', guide: '끝나는 순간 관람객이 한꺼번에 나와요. 끝나면 바로 알려드릴게요.' },
  end: { dot: '#17171C', color: '#17171C', label: '경기 끝', head: '경기가 끝났어요', guide: '관람객이 한꺼번에 나오는 시간이라 주변 역이 붐빌 거예요.' },
};

/** 03-3 경기 상세 */
export function GameScreen() {
  const q = useSearchParams();
  const id = q.get('id') ?? '';
  const demo = demoState(q); // before | end
  const variant = demo === 'before' || demo === 'end' ? demo : undefined;
  const res = useLoad(() => getEvent(id, variant), [id, variant]);
  const { st, vn } = useRefs();
  const key = alertKey('game_end', id);
  const [on, setOn] = useState(false);
  useEffect(() => setOn(hasAlert(key)), [key]);

  if (res.status === 'loading') return <Loading />;
  if (res.status === 'error') return <LoadError code={res.code} lastUpdatedAt={res.lastUpdatedAt} onRetry={res.retry} />;
  const e = res.value.data;
  const g = GAME[e.game_state ?? 'before'];
  const toggle = async () => {
    if (!pushReady) return;
    if (!on && pushSupport() !== 'granted' && !(await requestPush())) return;
    if (!(await setAlert(key, !on, { kind: 'game_end', event_id: id }))) return;
    if (!on) track('notify_on', { kind: 'game_end', event_id: id });
    setOn(!on);
  };
  return (
    <main className="screen">
      <BackHeader href="/home/" />
      <section style={{ padding: '4px 24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 className="h1 big">{e.title}</h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge" style={{ background: '#FFF0E6', color: '#B54708' }}>
            경기
          </span>
          <span style={{ fontSize: 15, color: '#5F6573' }}>{AREA_LABEL[e.area] ?? '지역 정보 없음'}</span>
        </span>
      </section>
      <section className="card pad" style={{ marginTop: 16, gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: g.color }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: g.dot }} />
          {g.label}
        </span>
        <strong style={{ fontSize: 21 }}>{g.head}</strong>
        <span style={{ fontSize: 15, lineHeight: 1.55, color: '#4A4F5C' }}>{g.guide}</span>
        {e.game_state === 'live' &&
          (pushReady ? (
            <button type="button" aria-pressed={on} onClick={toggle} className={on ? 'btn secondary' : 'btn dark'} style={{ height: 48, borderRadius: 14, fontSize: 16, flex: 'none' }}>
              {on ? '경기가 끝나면 알려드릴게요' : '경기 끝나면 알림 받기'}
            </button>
          ) : (
            <button type="button" disabled aria-disabled="true" className="btn secondary" style={{ height: 48, borderRadius: 14, fontSize: 16, flex: 'none', cursor: 'default', opacity: 0.8 }}>
              경기 끝 알림은 준비 중이에요
            </button>
          ))}
      </section>
      <section className="card" style={{ marginTop: 12, padding: '6px 20px' }}>
        <dl className="dl">
          <dt>경기장</dt>
          <dd>{venueName(vn, e.venue_id)}</dd>
          <dt>날짜</dt>
          <dd>{dateLabel(e.date, true)}</dd>
          <dt>시작</dt>
          <dd>
            <Time iso={e.start_at} />
          </dd>
        </dl>
      </section>
      <SectionTitle>경기가 끝나면 주변 역은</SectionTitle>
      <section className="card">
        {e.after_end.end.stations.map((s) => (
          <Link key={s.station_id} className="row" href={`/station/?id=${s.station_id}`}>
            <LineStack lines={st[s.station_id]?.lines ?? []} />
            <span className="main">
              <span className="title">{stationName(st, s.station_id)}</span>
              <span className="sub">
                <Walk min={s.walk_min} />
              </span>
            </span>
            <LevelBadge level={s.level} />
          </Link>
        ))}
        {e.after_end.no_data_message && <p style={{ margin: 0, padding: '4px 20px 12px', fontSize: 14, color: '#5F6573' }}>{e.after_end.no_data_message}</p>}
      </section>
      {e.crossing_note && (
        <Link href={`/station/?id=${e.crossing_note.station_id}`} className="card row" style={{ marginTop: 12, width: 'auto' }}>
          <LineStack lines={st[e.crossing_note.station_id]?.lines ?? []} />
          <span className="main">
            <span className="title" style={{ fontSize: 16 }}>
              {e.crossing_note.title}
            </span>
            <span className="sub">{e.crossing_note.message}</span>
          </span>
          <Icon.chevron />
        </Link>
      )}
      <BottomBar>
        <Link href="/search/" className="btn primary">
          이 경기장에서 출발하기
        </Link>
      </BottomBar>
    </main>
  );
}

