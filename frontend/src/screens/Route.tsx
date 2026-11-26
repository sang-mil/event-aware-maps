'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCompare, getEvents, getForecast, getRoute, type CompareOption, type CompareParams } from '@/api';
import {
  BackHeader,
  BottomBar,
  LoadError,
  Headline,
  Icon,
  LevelBadge,
  LineBadge,
  Loading,
  Offline,
  Ph,
  SectionTitle,
  StaleNotice,
  TabBar,
  Time,
  TimeSheet,
  Walk,
} from '@/components/ui';
import { DEFAULT_ORIGIN_STATION, LEVEL, fmtMin, fmtNum, hourKey, isoAt, nowMin, sessionList, store, today, track } from '@/lib/app';
import { useLoad, useRefs } from '@/lib/useLoad';

/** 지도 위 배치 (지도 API를 정하기 전 개략도, 390px 화면 기준 좌표) */
const MAP_STATIONS: { id: string; x: number; y: number }[] = [
  { id: 'olympic_park', x: 214, y: 410 },
  { id: 'bangi', x: 196, y: 452 },
  { id: 'mongchontoseong', x: 150, y: 206 },
  { id: 'sports_complex', x: 16, y: 390 },
  { id: 'hanseong_baekje', x: 36, y: 474 },
];
const MAP_VENUES: { id: string; x: number; y: number }[] = [
  { id: 'kspo_dome', x: 220, y: 236 },
  { id: 'olympic_hall', x: 250, y: 284 },
  { id: 'jamsil_baseball', x: 24, y: 280 },
];

/** 04 길찾기 탭 · 지도 */
export function MapScreen() {
  const fc = useLoad(() => getForecast(today()), []);
  const ev = useLoad(() => getEvents(today()), []);
  const { st, vn } = useRefs();
  const [sel, setSel] = useState<string | null>(null);
  if (fc.status === 'loading' || ev.status === 'loading') return <Loading />;
  if (fc.status === 'error') return <LoadError code={fc.code} lastUpdatedAt={fc.lastUpdatedAt} onRetry={fc.retry} />;
  if (ev.status === 'error') return <LoadError code={ev.code} lastUpdatedAt={ev.lastUpdatedAt} onRetry={ev.retry} />;

  const hour = hourKey(nowMin()); // 지금 출발할 때의 예상
  const f = fc.value.data;
  const levelOf = (id: string) => f.stations.find((s) => s.station_id === id)?.slots.find((s) => s.hour === hour)?.level ?? 'no_data';
  const best = f.summaries[hour]?.best_station_id;
  const top = (f.ranking[hour] ?? []).filter((id) => levelOf(id) !== 'no_data').slice(0, 2);
  const selEvent = sel ? ev.value.data.events.find((e) => e.venue_id === sel) : undefined;
  const selVenue = sel ? vn[sel] : undefined;

  return (
    <main className="screen" style={{ background: '#EEF0F3', minHeight: '100dvh', overflow: 'hidden', paddingBottom: 0 }}>
      <h1 className="sr">길찾기</h1>
      <div style={{ position: 'relative', height: 'calc(100dvh - 76px)', minHeight: 600 }}>
        <svg aria-hidden="true" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <path d="M-20 430 C 120 410, 200 400, 420 470" stroke="#C9B6D6" strokeWidth="6" fill="none" />
          <path d="M-20 520 C 100 470, 200 430, 420 380" stroke="#E2D7B4" strokeWidth="6" fill="none" />
          <ellipse cx="260" cy="240" rx="120" ry="80" fill="#DCEBDD" />
        </svg>
        <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 2 }}>
          <Link href="/search/" style={{ height: 52, borderRadius: 16, background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', boxShadow: '0 2px 10px rgba(23,23,28,0.12)' }}>
            <Icon.search />
            <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: '#5F6573' }}>어디로 가세요?</span>
          </Link>
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 12px', borderRadius: 10, background: '#FFFFFF', fontSize: 13, color: '#4A4F5C' }}>
            <span style={{ fontWeight: 700, color: '#17171C' }}>{Number(hour)}시대 예상</span>
            {(['crowded', 'normal', 'relaxed', 'no_data'] as const).map((l) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: LEVEL[l].dot }} />
                {LEVEL[l].label}
              </span>
            ))}
          </div>
        </div>
        <span style={{ position: 'absolute', left: 226, top: 182, fontSize: 13, fontWeight: 700, color: '#2E6B3D' }}>올림픽공원</span>
        <span style={{ position: 'absolute', left: 28, top: 252, fontSize: 13, fontWeight: 700, color: '#4A4F5C' }}>잠실종합운동장</span>
        <span style={{ position: 'absolute', right: 16, top: 130, fontSize: 12, color: '#4A4F5C', background: '#FFFFFF', padding: '3px 8px', borderRadius: 8 }}>지도 API 연동 전 개략도</span>
        {MAP_VENUES.map((v) => {
          const e = ev.value.data.events.find((x) => x.venue_id === v.id);
          const game = e?.type === 'game';
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={sel === v.id}
              onClick={() => setSel(v.id)}
              style={{ position: 'absolute', left: v.x, top: v.y, height: 44, padding: '0 12px 0 6px', borderRadius: 14, border: 0, background: '#FFFFFF', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: `0 1px 3px rgba(23,23,28,0.16), inset 0 0 0 ${sel === v.id ? 2 : 0}px #17171C` }}
            >
              <span style={{ width: 32, height: 32, borderRadius: 9, background: game ? '#FFF0E6' : '#E8F0FB', color: game ? '#B54708' : '#1F5FAF', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {game ? '경' : '공'}
              </span>
              {vn[v.id]?.name}
            </button>
          );
        })}
        {MAP_STATIONS.map((p) => {
          const s = st[p.id];
          if (!s) return null;
          const l = LEVEL[levelOf(p.id)];
          return (
            <Link
              key={p.id}
              href={`/station/?id=${p.id}`}
              aria-label={`${s.name}, ${s.lines[0]}호선, ${l.label}`}
              style={{ position: 'absolute', left: p.x, top: p.y, height: 32, padding: '0 4px', borderRadius: 16, background: '#FFFFFF', boxShadow: '0 1px 3px rgba(23,23,28,0.16)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              <span aria-hidden="true" style={{ display: 'flex' }}>
                <LineBadge line={s.lines[0]} size={24} />
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</span>
              <span style={{ height: 24, padding: '0 8px', borderRadius: 12, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', background: l.bg, color: l.fg }}>{l.label}</span>
            </Link>
          );
        })}
        <section aria-live="polite" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '10px 20px 16px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 -4px 16px rgba(23,23,28,0.08)', zIndex: 3 }}>
          <span className="grabber" aria-hidden="true" />
          {!sel ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>{best ? `${st[best]?.name ?? ''}이 가장 덜 붐빌 거예요` : '주변 역 예상이에요'}</h2>
                <span style={{ fontSize: 14, color: '#5F6573' }}>{Number(hour)}시대에 출발할 때의 예상이에요</span>
              </div>
              <div>
                {top.map((id) => (
                  <Link key={id} className="row" href={`/station/?id=${id}`} style={{ minHeight: 60, padding: '4px' }}>
                    <LineBadge line={st[id]?.lines[0] ?? '5'} size={36} />
                    <span className="main" style={{ gap: 2 }}>
                      <span className="title" style={{ fontSize: 16 }}>
                        {st[id]?.name}
                      </span>
                      <span className="sub">
                        <Walk min={null} />
                        {id === best && (
                          <>
                            , <b className="best">가장 덜 붐빔</b>
                          </>
                        )}
                      </span>
                    </span>
                    <LevelBadge level={levelOf(id)} />
                  </Link>
                ))}
              </div>
              <span style={{ fontSize: 13, color: '#5F6573' }}>지도에서 공연장을 누르면 그곳에서 출발할 수 있어요</span>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selEvent && (
                    <span className="badge" style={{ alignSelf: 'flex-start', background: selEvent.type === 'game' ? '#FFF0E6' : '#E8F0FB', color: selEvent.type === 'game' ? '#B54708' : '#1F5FAF' }}>
                      {selEvent.type === 'game' ? '경기' : '공연'}
                    </span>
                  )}
                  <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>{selEvent?.title ?? selVenue?.name}</h2>
                  <span style={{ fontSize: 14, color: '#5F6573' }}>
                    {selVenue?.name}, 가까운 역 {st[selVenue?.nearby_stations[0]?.station_id ?? '']?.name ?? '확인 중'}
                  </span>
                </div>
                <button type="button" onClick={() => setSel(null)} aria-label="선택 해제" className="icon-btn" style={{ margin: '-6px -10px 0 0', color: '#5F6573' }}>
                  <Icon.close />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {selEvent && (
                  <Link href={selEvent.type === 'game' ? `/game/?id=${selEvent.id}` : `/event/?id=${selEvent.id}&from=map`} className="btn secondary" style={{ height: 52, fontSize: 16 }}>
                    행사 정보
                  </Link>
                )}
                <Link href={`/search/?venue=${sel}${selEvent ? `&event=${selEvent.id}` : ''}`} className="btn primary" style={{ height: 52, fontSize: 16, flex: 1.4 }}>
                  이 공연장에서 출발
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
      <TabBar active="map" />
    </main>
  );
}

const SEARCH_VENUES = ['kspo_dome', 'olympic_hall', 'ticketlink_live_arena', 'jamsil_baseball', 'jamsil_arena'];

/** 04-1 귀갓길 찾기, 04-1-1 출발 시간, 04-2 공연장에서 출발 */
export function Search() {
  const q = useSearchParams();
  const router = useRouter();
  const venueParam = q.get('venue') || '';
  const eventParam = q.get('event') || '';
  const { st, vn } = useRefs();
  const [from, setFrom] = useState(venueParam);
  const [to, setTo] = useState('');
  const now = nowMin();
  const [when, setWhen] = useState(now);
  const [sheet, setSheet] = useState(q.get('state') === 'time');
  const [recents, setRecents] = useState<string[]>([]);
  const fc = useLoad(() => getForecast(today()), []);
  const supported = fc.status === 'ok' ? fc.value.data.supported_hours : [];
  useEffect(() => setRecents(sessionList('recent')), []);
  useEffect(() => setFrom(venueParam), [venueParam]);
  // 역 상세에서 [길찾기]로 오면 그 역을 도착지로 채워요
  const toParam = q.get('to');
  const toName = toParam ? st[toParam]?.name : undefined;
  useEffect(() => {
    if (toName) setTo(toName);
  }, [toName]);

  const fromLabel = from ? vn[from]?.name ?? from : '현재 위치';
  const matches = to.trim() ? Object.values(st).filter((s) => s.name.includes(to.trim())) : [];
  const go = (dest: string) => {
    if (dest) setRecents(sessionList('recent', dest));
    const p = new URLSearchParams({
      from_type: from ? 'venue' : 'station',
      // 현재 위치는 기기 안에서 가까운 역 id로 바꿔서 보내요(위치는 서버로 보내지 않아요).
      // 좌표 데이터가 아직 없어서, 지금은 E1과 같은 올림픽공원 기준 역을 써요.
      from_id: from || DEFAULT_ORIGIN_STATION,
      to: dest,
      depart: isoAt(today(), when),
      from: eventParam ? 'event' : 'search',
    });
    // 들어온 공연과 출발지를 그대로 넘겨요. 고른 공연장이 그 공연의 공연장일 때만 공연을 이어 줘요.
    if (eventParam && from === venueParam) p.set('event', eventParam);
    router.push(`/compare/?${p.toString()}`);
  };

  return (
    <main className="screen">
      <BackHeader href={eventParam ? `/event/?id=${eventParam}` : '/map/'} />
      <section className="intro" style={{ paddingBottom: 16 }}>
        <h1 className="h1 big">귀갓길 찾기</h1>
      </section>
      <form
        aria-label="출발지와 도착지"
        className="card pad"
        style={{ gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          go(matches[0]?.id ?? to);
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 52, borderRadius: 14, background: '#F4F5F7', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
              <label htmlFor="from" style={{ flex: 'none', width: 30, fontSize: 14, fontWeight: 700, color: '#5F6573' }}>
                출발
              </label>
              <input id="from" type="text" value={fromLabel} readOnly style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', fontSize: 16, fontWeight: 700, background: 'transparent' }} />
            </div>
            <div style={{ height: 52, borderRadius: 14, background: '#F4F5F7', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
              <label htmlFor="to" style={{ flex: 'none', width: 30, fontSize: 14, fontWeight: 700, color: '#5F6573' }}>
                도착
              </label>
              <input id="to" type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="역이나 장소 검색" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', fontSize: 16, fontWeight: 500, background: 'transparent' }} />
            </div>
          </div>
          <button type="button" aria-label="출발지와 도착지 바꾸기" className="icon-btn" style={{ borderRadius: 12, color: '#4A4F5C' }} onClick={() => setFrom('')}>
            <Icon.swap />
          </button>
        </div>
        {matches.length > 0 && (
          <div>
            {matches.slice(0, 4).map((s) => (
              <button key={s.id} type="button" className="row" style={{ minHeight: 52, padding: '4px 6px', cursor: 'pointer' }} onClick={() => go(s.id)}>
                <LineBadge line={s.lines[0]} size={28} />
                <span className="main">
                  <span className="title" style={{ fontSize: 16 }}>
                    {s.name}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
          <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-label={`출발 시간 바꾸기, 지금은 ${when === now ? '지금 출발' : `${fmtMin(when)} 출발`}`} className="chip">
            {when === now ? '지금 출발' : `${fmtMin(when)} 출발`}
          </button>
          <span style={{ fontSize: 14, color: '#5F6573' }}>누르면 출발 시간을 바꿀 수 있어요</span>
        </div>
      </form>

      <div className="section-title" style={{ justifyContent: 'flex-start' }}>
        <h2>최근 검색</h2>
        <span style={{ fontSize: 13, color: '#5F6573' }}>앱을 닫으면 지워져요</span>
      </div>
      <section className="card">
        {recents.length === 0 ? (
          <p style={{ margin: 0, padding: '16px 20px', fontSize: 15, color: '#5F6573' }}>아직 검색한 곳이 없어요</p>
        ) : (
          recents.map((r) => (
            <button key={r} type="button" className="row" style={{ minHeight: 60, cursor: 'pointer' }} onClick={() => go(r)}>
              <span className="tile" aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', background: '#EEF0F3', color: '#5F6573' }}>
                <Icon.clock />
              </span>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{st[r]?.name ?? r}</span>
            </button>
          ))
        )}
      </section>

      <SectionTitle>공연장에서 출발하기</SectionTitle>
      <section className="card pad">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SEARCH_VENUES.map((id) => (
            <button key={id} type="button" aria-pressed={from === id} onClick={() => setFrom(from === id ? '' : id)} className="chip">
              {vn[id]?.name ?? id}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 14, color: '#5F6573' }}>아직 공연장 안이라면 출발지를 공연장으로 바꿔 보세요</span>
      </section>
      <BottomBar>
        <button type="button" className="btn primary" onClick={() => go(matches[0]?.id ?? to)}>
          길찾기
        </button>
      </BottomBar>
      <TimeSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="언제 출발할까요?"
        sub="시와 분을 직접 맞춰요"
        value={when}
        now={now}
        min={now}
        max={24 * 60 - 10}
        hint={(h) => (supported.includes(hourKey(h * 60)) ? `${h}시대 혼잡 예상으로 비교해요` : `${h}시대 혼잡 정보는 아직 준비 중이에요`)}
        confirmLabel={(v, isNow) => (isNow ? '지금 출발로 정하기' : `${fmtMin(v)} 출발로 정하기`)}
        onConfirm={(v) => {
          setWhen(v);
          setSheet(false);
          track('time_set', { screen: 'search', time: fmtMin(v) });
        }}
      />
    </main>
  );
}

/** 비교·경로 화면이 같은 조건을 주소로 주고받아요 */
function readCompareParams(q: URLSearchParams): CompareParams {
  return {
    fromType: q.get('from_type') === 'venue' ? 'venue' : 'station',
    fromId: q.get('from_id') || DEFAULT_ORIGIN_STATION,
    toStationId: q.get('to') ?? '',
    departAt: q.get('depart') || isoAt(today(), nowMin()),
  };
}

/** 04-3 귀가 방법 비교 (+ E4 막차 임박) */
export function Compare() {
  const q = useSearchParams();
  const from = q.get('from') ?? 'search';
  const late = q.get('state') === 'late'; // E4 시안 미리보기용 (목업 전용)
  const eventId = q.get('event');
  const params = readCompareParams(q);
  const key = q.toString();
  const res = useLoad(() => getCompare(params, late), [key]);
  const events = useLoad(() => getEvents(params.departAt.slice(0, 10)), [params.departAt.slice(0, 10)]);
  const { st, vn } = useRefs();
  useEffect(() => {
    if (res.status === 'ok') track('compare_view', { from, last_train_imminent: !!res.value.data.last_train?.imminent });
  }, [res.status, from]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchBack = `/search/${params.fromType === 'venue' ? `?venue=${params.fromId}${eventId ? `&event=${eventId}` : ''}` : ''}`;
  const back = from === 'noti' ? '/home/' : searchBack;
  if (res.status === 'loading') return <Loading />;
  if (res.status === 'error') return <LoadError code={res.code === 'not_found' ? 'unsupported' : res.code} lastUpdatedAt={res.lastUpdatedAt} onRetry={res.retry} back={back} />;
  const c = res.value.data;
  const [rec, ...others] = c.options;
  const origin = params.fromType === 'venue' ? vn[params.fromId]?.name ?? '출발지' : '현재 위치';
  const toName = c.condition_label.to_name ?? st[params.toStationId]?.name ?? null;
  const event = eventId && events.status === 'ok' ? events.value.data.events.find((e) => e.id === eventId) ?? null : null;

  const pick = (o: CompareOption) => {
    track('option_pick', { option_kind: o.kind, recommended: o.recommended });
    // 다음에 앱을 열면 묻는 피드백(01-2). 공연에서 들어온 경우에만 공연을 함께 기록해요.
    store('pendingFeedback', {
      station_id: o.station_id,
      station_name: st[o.station_id]?.name ?? '',
      event_id: event?.id ?? null,
      event_title: event?.title ?? null,
      date: params.departAt.slice(0, 10),
      hour: o.board_hour,
      level: o.level,
    });
  };
  const routeHref = (o: CompareOption) => `/route/?option=${o.id}&${key}`;

  return (
    <main className="screen">
      <BackHeader href={back} />
      {res.value.fromCache && <StaleNotice updatedAt={res.value.updatedAt} />}
      <section style={{ padding: '4px 24px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 15, color: '#5F6573' }}>
          {origin}에서 <Ph value={toName}>OO역</Ph>까지, {c.condition_label.hour_label}
        </span>
        <Headline highlight={c.headline.highlight} text={c.headline.text} />
      </section>
      {c.last_train?.imminent && (
        <div role="alert" className="alert red" style={{ margin: '0 16px 12px' }}>
          <strong>
            막차까지 <Ph value={c.last_train.minutes_left != null ? `${c.last_train.minutes_left}분` : null}>00분</Ph> 남았어요
          </strong>
          <span>막차가 가까워 기다리는 방법은 뺐어요. 바로 출발하세요.</span>
        </div>
      )}
      {rec && (
        <Link
          href={routeHref(rec)}
          onClick={() => pick(rec)}
          style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 20px', borderRadius: 24, background: '#FFFFFF', border: '2px solid #4E3DBC' }}
        >
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#4E3DBC' }}>추천</span>
              <span style={{ fontSize: 21, fontWeight: 700 }}>{rec.title}</span>
              <span style={{ fontSize: 14, color: '#5F6573' }}>
                {rec.subtitle}, <Walk min={rec.walk_min} />
              </span>
            </span>
            <LevelBadge level={rec.level} />
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, color: '#5F6573' }}>{rec.compare_message}</span>
            <span className="t" style={{ fontSize: 24, fontWeight: 800 }}>
              {rec.expected != null ? fmtNum(rec.expected) : <Ph>000</Ph>}
              <span style={{ fontSize: 14, fontWeight: 500, color: '#5F6573' }}>명 예상</span>
            </span>
          </span>
        </Link>
      )}
      <SectionTitle>다른 방법</SectionTitle>
      <section className="card">
        {others.map((o) => (
          <Link key={o.id} className="row" href={routeHref(o)} onClick={() => pick(o)}>
            <span className="main">
              <span className="title">{o.title}</span>
              <span className="sub">
                {o.subtitle}, {o.compare_message}
              </span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <LevelBadge level={o.level} />
              {o.expected != null && (
                <span className="t" style={{ fontSize: 13, color: '#5F6573' }}>
                  {fmtNum(o.expected)}명
                </span>
              )}
            </span>
          </Link>
        ))}
      </section>
      <p className="note">역에서 탄 사람 수로 본 예상이라 열차 안과는 다를 수 있어요</p>
    </main>
  );
}

/** 04-4 경로 상세 */
export function RouteScreen() {
  const q = useSearchParams();
  const option = q.get('option') ?? '';
  const params = readCompareParams(q);
  const back = new URLSearchParams(q.toString());
  back.delete('option');
  const res = useLoad(() => getRoute(option, params), [q.toString()]);
  const { st, vn } = useRefs();
  const [app, setApp] = useState<'naver' | 'kakao'>('naver');
  const [walked, setWalked] = useState(false);
  if (res.status === 'loading') return <Loading />;
  if (res.status === 'error') return <LoadError code={res.code} lastUpdatedAt={res.lastUpdatedAt} onRetry={res.retry} back={`/compare/?${back.toString()}`} />;
  const r = res.value.data;
  const board = st[r.board_station_id];
  const originName = params.fromType === 'venue' ? vn[params.fromId]?.name ?? '출발지' : '현재 위치';
  const toName = r.to_station_id ? st[r.to_station_id]?.name : params.toStationId ? st[params.toStationId]?.name : null;
  const hourLabel = `${Number(params.departAt.slice(11, 13))}시대 출발`;
  const max = Math.max(1, ...r.compare.items.map((i) => i.expected));
  // TODO: 좌표가 정해지면 각 지도 앱의 길찾기 링크로 바꿔요. 지금은 역 이름 검색으로 열어요.
  const mapUrl = (name: string) =>
    app === 'naver' ? `https://map.naver.com/p/search/${encodeURIComponent(name)}` : `https://map.kakao.com/link/search/${encodeURIComponent(name)}`;
  const appName = app === 'naver' ? '네이버지도' : '카카오맵';
  const steps = [
    { n: '1', title: `${board?.name}까지 걷기`, sub: walked ? '도보 길 안내를 열었어요' : `도보 길찾기, 도착은 ${board?.name}`, active: !walked, onClick: () => setWalked(true) },
    { n: '2', title: `${board?.name}에서 지하철 타기`, sub: `대중교통 길찾기, 출발은 ${board?.name}`, active: walked, onClick: () => undefined },
  ];

  return (
    <main className="screen">
      <BackHeader href={`/compare/?${back.toString()}`} />
      <div role="img" aria-label={`지도 영역: ${originName}에서 ${board?.name}까지 걷는 길`} style={{ margin: '0 16px', height: 220, borderRadius: 20, background: '#EEF0F3', position: 'relative', overflow: 'hidden' }}>
        <svg aria-hidden="true" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <path d="M80 110 C 140 130, 200 150, 270 168" stroke="#4E3DBC" strokeWidth="4" strokeDasharray="2 8" strokeLinecap="round" fill="none" />
        </svg>
        <span style={{ position: 'absolute', left: 40, top: 86, fontSize: 13, fontWeight: 700, background: '#FFFFFF', padding: '3px 8px', borderRadius: 8 }}>{originName}</span>
        <span style={{ position: 'absolute', left: 244, top: 158, fontSize: 13, fontWeight: 700, background: '#FFFFFF', padding: '3px 8px', borderRadius: 8 }}>{board?.name}</span>
        <span style={{ position: 'absolute', right: 10, top: 10, fontSize: 12, color: '#4A4F5C', background: '#FFFFFF', padding: '3px 8px', borderRadius: 8 }}>지도 API 연동 영역</span>
      </div>
      <section style={{ padding: '20px 24px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 className="h1 big">
          {board?.name}까지
          <br />
          <Walk min={r.walk_min} />
        </h1>
        <p className="lead">
          {board?.name}에서 {board?.lines[0]}호선 타고 <Ph value={toName}>OO역</Ph>까지 가요
        </p>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <LevelBadge level={r.level} />
          <span style={{ fontSize: 14, color: '#5F6573' }}>{r.message}</span>
        </span>
      </section>
      <section className="card" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {[
          ['도착 예상', <Time key="a" iso={r.arrive_at} />],
          ['거리', <Ph key="d" value={r.distance_km != null ? `${r.distance_km}km` : null}>0.0km</Ph>],
          ['막차', <Time key="l" iso={r.last_train_at} />],
        ].map(([label, v]) => (
          <div key={label as string} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 16px' }}>
            <span style={{ fontSize: 13, color: '#5F6573' }}>{label}</span>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </section>
      <SectionTitle>이동 경로</SectionTitle>
      <ol className="card" style={{ padding: '18px 20px 14px', listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
        {r.steps.map((s, i) => {
          const last = i === r.steps.length - 1;
          return (
            <li key={i} style={{ display: 'flex', gap: 14 }}>
              <div aria-hidden="true" style={{ width: 28, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {s.type === 'board' ? (
                  <LineBadge line={s.detail ?? board?.lines[0] ?? '5'} size={28} />
                ) : s.type === 'walk' ? (
                  <Icon.walk />
                ) : (
                  <span style={{ width: 14, height: 14, borderRadius: '50%', border: '3px solid #17171C', marginTop: 4 }} />
                )}
                {!last && <span style={{ flex: 1, width: 2, minHeight: 36, background: 'repeating-linear-gradient(#17171C 0 4px, transparent 4px 9px)' }} />}
              </div>
              <div style={{ paddingBottom: last ? 0 : 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{s.type === 'start' ? `${originName}에서 출발` : s.title}</span>
                <span style={{ fontSize: 14, lineHeight: 1.5, color: '#5F6573' }}>
                  {s.type === 'start' && hourLabel}
                  {s.type === 'walk' && (
                    <>
                      <Walk min={r.walk_min} />, 추천 출구와 동선은 <Ph>현장 확인 후 입력</Ph>
                    </>
                  )}
                  {s.type === 'board' && (
                    <>
                      <Ph value={s.exit_no}>0</Ph>번 출구, <Ph value={s.direction}>OO</Ph> 방면
                    </>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <SectionTitle>{Number(r.compare.hour)}시대 예상 승차 비교</SectionTitle>
      <section className="card pad" style={{ gap: 14 }}>
        {r.compare.items.map((it) => (
          <div key={it.station_id} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 64px', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, color: it.station_id === r.board_station_id ? '#17171C' : '#4A4F5C', fontWeight: it.station_id === r.board_station_id ? 700 : 400 }}>{st[it.station_id]?.name}</span>
            <span className="bar" aria-hidden="true">
              <span style={{ width: `${Math.round((it.expected / max) * 100)}%`, background: it.expected === max ? '#C2281B' : '#8A5300' }} />
            </span>
            <span className="t" style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {fmtNum(it.expected)}명
            </span>
          </div>
        ))}
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#5F6573' }}>{r.compare.note}</p>
      </section>
      <BottomBar column>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, padding: '0 4px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#4A4F5C' }}>지도 앱에서 순서대로 열어요</span>
          <button type="button" className="chip" style={{ fontSize: 14, padding: '0 12px' }} aria-label={`지도 앱 바꾸기, 지금은 ${appName}`} onClick={() => setApp(app === 'naver' ? 'kakao' : 'naver')}>
            {appName}
          </button>
        </div>
        {steps.map((s) => (
          <a
            key={s.n}
            href={mapUrl(board?.name ?? '')}
            target="_blank"
            rel="noreferrer"
            onClick={s.onClick}
            style={{ height: 60, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: s.active ? '#4E3DBC' : '#FFFFFF', color: s.active ? '#FFFFFF' : '#17171C' }}
          >
            <span className="t tile" style={{ width: 26, height: 26, borderRadius: '50%', fontSize: 14, fontWeight: 700, background: s.active ? '#FFFFFF' : '#EEF0F3', color: s.active ? '#4E3DBC' : '#17171C' }}>
              {s.n}
            </span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{s.title}</span>
              <span style={{ fontSize: 13, color: s.active ? '#E4E0FB' : '#5F6573' }}>{s.sub}</span>
            </span>
            <Icon.external />
          </a>
        ))}
      </BottomBar>
    </main>
  );
}
