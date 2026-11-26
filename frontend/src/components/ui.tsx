'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Level } from '@/api';
import { LEVEL, LINE, asset, hhmm } from '@/lib/app';

// ── 아이콘 (선 아이콘, 장식용은 aria-hidden) ───────────────────

const P = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Icon = {
  back: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" {...P} strokeWidth={2} aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  chevron: ({ color = '#9AA0AC' }: { color?: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" {...P} stroke={color} strokeWidth={2.2} aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  ),
  down: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" {...P} strokeWidth={2.2} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  up: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" {...P} strokeWidth={2.2} aria-hidden="true">
      <path d="M6 15l6-6 6 6" />
    </svg>
  ),
  gear: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" {...P} strokeWidth={1.9} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  pin: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" {...P} strokeWidth={1.9} aria-hidden="true" style={{ flex: 'none', color: '#5F6573' }}>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  search: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" {...P} strokeWidth={2} aria-hidden="true" style={{ color: '#5F6573' }}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  swap: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P} strokeWidth={2} aria-hidden="true">
      <path d="M7 4v16M7 4L4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />
    </svg>
  ),
  clock: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" {...P} strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  calendar: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P} strokeWidth={1.9} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  bell: ({ off = false, filled = false }: { off?: boolean; filled?: boolean }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.9} aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10 20a2 2 0 0 0 4 0" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  ),
  close: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P} strokeWidth={2} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  wifiOff: () => (
    <svg width="26" height="26" viewBox="0 0 24 24" {...P} strokeWidth={1.9} aria-hidden="true">
      <path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.3a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />
    </svg>
  ),
  walk: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P} strokeWidth={2} aria-hidden="true">
      <circle cx="13" cy="4" r="2" />
      <path d="M9 21l2-6 3 3v3M7 12l3-4 4 1 2 3h3M10 8l-1 5" />
    </svg>
  ),
  external: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" {...P} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  ),
};

// ── 작은 표시 요소 ─────────────────────────────────────────

/** 아직 확인하지 않은 값(점선 칸). 값이 있으면 그 값을 보여줘요. */
export function Ph({ children, value }: { children: ReactNode; value?: ReactNode }) {
  if (value !== undefined && value !== null && value !== '') return <span className="t">{value}</span>;
  return <span className="ph t">{children}</span>;
}

export const Walk = ({ min }: { min: number | null | undefined }) => (
  <>
    도보 <Ph value={min != null ? `${min}분` : null}>00분</Ph>
  </>
);

export const Time = ({ iso }: { iso: string | null | undefined }) => <Ph value={hhmm(iso ?? null)}>00:00</Ph>;

export function LineBadge({ line, size = 40 }: { line: string; size?: number }) {
  const c = LINE[line] ?? { bg: '#9AA0AC', fg: '#FFFFFF' };
  return (
    <span
      className="t line"
      style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: size >= 36 ? 15 : size >= 28 ? 12 : 11 }}
    >
      <span aria-hidden="true">{line}</span>
      <span className="sr">{line}호선</span>
    </span>
  );
}

/** 대표 노선 원 + 두 번째 노선을 오른쪽 아래에 작게 */
export function LineStack({ lines }: { lines: string[] }) {
  return (
    <span style={{ position: 'relative', flex: 'none', width: 40, height: 40 }}>
      <LineBadge line={lines[0]} />
      {lines[1] && (
        <span style={{ position: 'absolute', right: -5, bottom: -5, borderRadius: '50%', border: '2px solid #FFFFFF', display: 'flex' }}>
          <LineBadge line={lines[1]} size={22} />
        </span>
      )}
    </span>
  );
}

export function LevelBadge({ level }: { level: Level }) {
  const l = LEVEL[level];
  return (
    <span className="badge" style={{ background: l.bg, color: l.fg }}>
      {l.label}
    </span>
  );
}

export function KindChip({ type, size = 40 }: { type: 'show' | 'game'; size?: number }) {
  const show = type === 'show';
  return (
    <span
      className="kind"
      style={{ width: size, height: size, background: show ? '#E8F0FB' : '#FFF0E6', color: show ? '#1F5FAF' : '#B54708' }}
    >
      {show ? '공연' : '경기'}
    </span>
  );
}

export function Headline({ highlight, text, size = 24 }: { highlight: string | null; text: string; size?: number }) {
  return (
    <h1 className="h1" style={{ fontSize: size }}>
      {highlight && <span className="accent">{highlight}</span>}
      {text}
    </h1>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {right}
    </div>
  );
}

// ── 화면 틀 ───────────────────────────────────────────────

export function BackHeader({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <Link href={href} aria-label="뒤로" className="icon-btn">
        <Icon.back />
      </Link>
      {children}
    </header>
  );
}

export function TabBar({ active }: { active: 'home' | 'map' | 'calendar' }) {
  const tabs = [
    { id: 'home', href: '/home/', label: '홈', d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
    { id: 'map', href: '/map/', label: '길찾기', d: 'M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z' },
    { id: 'calendar', href: '/calendar/', label: '캘린더', d: '' },
  ] as const;
  return (
    <nav aria-label="주요 메뉴" className="tabbar">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Link key={t.id} href={t.href} aria-current={on ? 'page' : undefined} style={{ color: on ? '#4E3DBC' : '#5F6573' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" {...P} fill="currentColor" fillOpacity={on ? 0.16 : 0} strokeWidth={1.9} aria-hidden="true">
              {t.id === 'calendar' ? (
                <>
                  <rect x="3" y="5" width="18" height="16" rx="3" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </>
              ) : (
                <path d={t.d} />
              )}
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomBar({ children, column = false }: { children: ReactNode; column?: boolean }) {
  return (
    <>
      <div className={column ? 'bottombar-space tall' : 'bottombar-space'} aria-hidden="true" />
      <div className="bottombar" style={{ flexDirection: column ? 'column' : 'row' }}>
        {children}
      </div>
    </>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap">
      <button type="button" className="sheet-dim" aria-label="닫기" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label={title} id={id} className="sheet">
        <span className="grabber" aria-hidden="true" />
        {children}
      </section>
    </div>
  );
}

/** 시와 분을 직접 맞추는 시트 (01-1, 04-1-1) */
export function TimeSheet(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub: string;
  value: number;
  now: number;
  min: number;
  max: number;
  hint: (hour: number) => string;
  confirmLabel: (v: number, isNow: boolean) => string;
  onConfirm: (v: number) => void;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => {
    if (props.open) setDraft(props.value);
  }, [props.open, props.value]);
  const set = (v: number) => setDraft(Math.min(Math.max(v, props.min), props.max));
  const hh = Math.floor(draft / 60);
  const stepBtn = (label: string, onClick: () => void, up: boolean) => (
    <button type="button" className="step" aria-label={label} onClick={onClick}>
      {up ? <Icon.up /> : <Icon.down />}
    </button>
  );
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>{props.title}</h2>
        <span style={{ fontSize: 14, color: '#5F6573' }}>{props.sub}</span>
      </div>
      <div role="group" aria-label={props.title} className="time-picker">
        <div className="col">
          {stepBtn('한 시간 늦게', () => set(draft + 60), true)}
          <output className="t" aria-live="polite" aria-label="시">
            {String(hh % 24).padStart(2, '0')}
          </output>
          {stepBtn('한 시간 일찍', () => set(draft - 60), false)}
        </div>
        <span aria-hidden="true" style={{ fontSize: 36, fontWeight: 700, color: '#5F6573' }}>
          :
        </span>
        <div className="col">
          {stepBtn('10분 늦게', () => set(draft + 10), true)}
          <output className="t" aria-live="polite" aria-label="분">
            {String(draft % 60).padStart(2, '0')}
          </output>
          {stepBtn('10분 일찍', () => set(draft - 10), false)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          ['지금', 0],
          ['30분 뒤', 30],
          ['1시간 뒤', 60],
        ].map(([label, add]) => (
          <button key={label} type="button" className="quick" onClick={() => set(props.now + (add as number))}>
            {label}
          </button>
        ))}
      </div>
      <span style={{ fontSize: 14, lineHeight: 1.5, color: '#5F6573' }}>{props.hint(hh)}</span>
      <button type="button" className="btn primary" onClick={() => props.onConfirm(draft)}>
        {props.confirmLabel(draft, draft === props.now)}
      </button>
    </Sheet>
  );
}

// ── 불러오는 중 · 연결 오류 ──────────────────────────────────

export function Loading() {
  return (
    <div className="loading" role="status" aria-live="polite">
      불러오는 중이에요
    </div>
  );
}

/** E5 연결 오류 */
export function Offline({ lastUpdatedAt, onRetry }: { lastUpdatedAt: string | null; onRetry: () => void }) {
  return (
    <main className="screen">
      <header className="topbar" style={{ padding: '0 24px' }}>
        <img src={asset('/brand/wordmark.png')} alt="틈길" style={{ height: 22, width: 'auto' }} />
      </header>
      <section style={{ padding: '120px 24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="tile" style={{ width: 56, height: 56, borderRadius: 16, background: '#FFFFFF', color: '#4A4F5C' }}>
          <Icon.wifiOff />
        </span>
        <h1 className="h1" style={{ fontSize: 30, marginTop: 8 }}>
          정보를
          <br />
          불러오지 못했어요
        </h1>
        <p className="lead">
          인터넷 연결을 확인하고 다시 시도해 주세요. 마지막으로 받은 정보는 <Time iso={lastUpdatedAt} /> 기준이에요.
        </p>
      </section>
      <BottomBar>
        <button type="button" className="btn primary" onClick={onRetry}>
          다시 시도
        </button>
      </BottomBar>
    </main>
  );
}

/** 연결이 안 돼 기기에 저장한 값을 보여줄 때 (frontend/CLAUDE.md: 마지막 캐시와 "n분 전 데이터") */
export function StaleNotice({ updatedAt }: { updatedAt: string }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000));
    setLabel(mins < 60 ? `${mins}분 전` : `${hhmm(updatedAt)} 기준`);
  }, [updatedAt]);
  return (
    <div role="status" className="stale">
      연결이 안 돼서 {label} 정보를 보여드려요
    </div>
  );
}
