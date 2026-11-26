'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { alertKey, getStationForecast, hasAlert, setAlert } from '@/api';
import { BackHeader, BottomBar, Headline, LevelBadge, LineBadge, LineStack, Loading, Offline, SectionTitle, StaleNotice, Walk } from '@/components/ui';
import { DEMO_TODAY, LEVEL, dateLabel, requestPush, pushSupport, track } from '@/lib/app';
import { useLoad, useRefs } from '@/lib/useLoad';

/** 02 · 02-1 역 상세, 02-2 · 02-3 고른 날짜, E3 혼잡 정보가 없는 역 */
export function Station() {
  const q = useSearchParams();
  const id = q.get('id') ?? 'olympic_park';
  const pickedDate = q.get('date'); // 캘린더에서 들어오면 날짜가 있어요
  const date = pickedDate ?? DEMO_TODAY;
  const back = pickedDate ? '/calendar/' : '/home/';
  const res = useLoad(() => getStationForecast(id, date), [id, date]);
  const { st } = useRefs();
  const [on, setOn] = useState(false);
  const key = alertKey('departure', `${id}:${date}`);
  useEffect(() => {
    setOn(hasAlert(key));
    track('station_view', { station_id: id, from: pickedDate ? 'calendar' : 'home' });
  }, [key, id, pickedDate]);

  if (res.status === 'loading') return <Loading />;
  if (res.status === 'error') return <Offline lastUpdatedAt={res.lastUpdatedAt} onRetry={res.retry} />;
  const f = res.value.data;
  const station = st[id];
  const dayLabel = pickedDate ? dateLabel(pickedDate) : '오늘';
  const max = Math.max(1, ...f.slots.map((s) => s.expected ?? 0));

  // E3 혼잡 정보가 없는 역
  if (f.no_data) {
    return (
      <main className="screen">
        <BackHeader href={back} />
        <section className="intro">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {station?.lines.map((l) => <LineBadge key={l} line={l} size={28} />)}
            <span style={{ fontSize: 17, fontWeight: 700, marginLeft: 4 }}>{station?.name}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="t" style={{ fontSize: 15, color: '#5F6573' }}>
              {dayLabel} {Number(f.focus_hour)}시 예상
            </span>
            <LevelBadge level="no_data" />
          </span>
          <h1 className="h1" style={{ marginTop: 4 }}>
            아직 이 역의
            <br />
            혼잡 정보가 없어요
          </h1>
          <p className="lead">{f.no_data.message}</p>
        </section>
        <SectionTitle>혼잡 정보가 있는 가까운 역</SectionTitle>
        <section className="card">
          {f.no_data.nearby.map((n) => (
            <Link key={n.station_id} className="row" href={`/station/?id=${n.station_id}`}>
              <LineStack lines={st[n.station_id]?.lines ?? ['5']} />
              <span className="main">
                <span className="title">{st[n.station_id]?.name}</span>
                <span className="sub">
                  <Walk min={n.walk_min} />
                </span>
              </span>
              <LevelBadge level={n.level} />
            </Link>
          ))}
        </section>
      </main>
    );
  }

  const notifyHour = f.notify_hour ? Number(f.notify_hour) : null;
  const toggle = async () => {
    if (!on && pushSupport() !== 'granted') {
      const ok = await requestPush();
      if (!ok) return;
    }
    await setAlert(key, !on);
    if (!on) track('notify_on', { kind: 'departure', station_id: id });
    setOn(!on);
  };

  return (
    <main className="screen">
      <BackHeader href={back} />
      {res.value.fromCache && <StaleNotice updatedAt={res.value.updatedAt} />}
      <section className="intro">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {station?.lines.map((l) => <LineBadge key={l} line={l} size={28} />)}
          <span style={{ fontSize: 17, fontWeight: 700, marginLeft: 4 }}>{station?.name}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="t" style={{ fontSize: 15, color: '#5F6573' }}>
            {dayLabel} {Number(f.focus_hour)}시대 예상
          </span>
          <LevelBadge level={f.focus_level} />
        </span>
        {f.headline && <Headline highlight={f.headline.highlight} text={f.headline.text} />}
        {f.description && <p className="lead">{f.description}</p>}
      </section>

      {f.alternatives.length > 0 && (
        <>
          <SectionTitle>{f.alternatives_title}</SectionTitle>
          <section className="card">
            {f.alternatives.map((a) => (
              <Link key={a.station_id} className="row" href={`/station/?id=${a.station_id}${pickedDate ? `&date=${pickedDate}` : ''}`}>
                <LineBadge line={st[a.station_id]?.lines[0] ?? '5'} />
                <span className="main">
                  <span className="title">{st[a.station_id]?.name}</span>
                  <span className="sub">
                    <Walk min={a.walk_min} />, {a.message}
                  </span>
                </span>
                <LevelBadge level={a.level} />
              </Link>
            ))}
          </section>
        </>
      )}

      <SectionTitle>시간대별 예상 승차</SectionTitle>
      <section className="card">
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {f.slots.map((s) => (
            <li key={s.hour} style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 14, alignItems: 'center', padding: '12px 20px' }}>
              <span className="t" style={{ fontSize: 16, fontWeight: 700, color: '#4A4F5C' }}>
                {Number(s.hour)}시
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(((s.expected ?? 0) / max) * 100)}%`, background: LEVEL[s.level].fg }} />
                </span>
                <span style={{ fontSize: 14, color: '#5F6573' }}>
                  {s.message} <span className="sr">{LEVEL[s.level].label}</span>
                  {s.recommended && <b style={{ marginLeft: 6, color: '#4E3DBC' }}>추천</b>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <BottomBar>
        {notifyHour !== null ? (
          <>
            <Link href="/search/" className="btn secondary">
              길찾기
            </Link>
            <button type="button" aria-pressed={on} onClick={toggle} className={on ? 'btn secondary' : 'btn primary'} style={{ flex: 2 }}>
              {on ? `${notifyHour}시에 알려드릴게요` : `${notifyHour}시에 알림 받기`}
            </button>
          </>
        ) : (
          <Link href="/search/" className="btn primary">
            {station?.name}으로 길찾기
          </Link>
        )}
      </BottomBar>
    </main>
  );
}
