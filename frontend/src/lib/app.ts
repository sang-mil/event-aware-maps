'use client';

import { useEffect, useState } from 'react';
import { subscribePush, usingMock, usingStaticData, type Level } from '@/api';

/** 2025 시안 목업과 과거 관측 자료에서 사용할 기본 날짜·시각 */
export const DEMO_TODAY = '2025-08-09';
export const DEMO_QUIET_DAY = '2025-08-16';
export const DEMO_NOW_MIN = 20 * 60;
export const DEMO_MONTH = '2025-08';

function kstDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** 이 기기에 선택해 둔 과거 2025 관측 날짜. 서버로 보내지 않아요. */
export function replayDate(): string | null {
  if (!usingStaticData || typeof window === 'undefined') return null;
  const fromUrl = new URLSearchParams(window.location.search).get('replay');
  if (fromUrl && isReplayDate(fromUrl)) {
    setReplayDate(fromUrl);
    return fromUrl;
  }
  const saved = store<string>('replayDate');
  return saved && isReplayDate(saved) ? saved : null;
}

/** 실제 자료 모드에서는 한국의 오늘 날짜를 사용하고, 과거 재생은 사용자가 고른 경우에만 켜요. */
export function today(): string {
  if (usingStaticData) {
    if (typeof window === 'undefined') return DEMO_TODAY;
    return replayDate() ?? kstDate();
  }
  if (usingMock || typeof window === 'undefined') return DEMO_TODAY;
  return kstDate();
}

/**
 * 2025 리플레이: 발행된 실제 데이터는 2025년 것뿐이라, 그 해의 하루를 '오늘'로 골라 다시 봐요.
 * 주소에 `?replay=2025-08-16` 을 붙이거나 화면 위 안내 띠에서 고르면 기기에만 저장돼요(서버로 보내지 않아요).
 */
/**
 * 시안 미리보기 상태(?state=...)를 읽어요. 실제 데이터 모드에서는 시안용 예시가 보이지 않게 항상 null 이에요.
 */
export const demoState = (q: { get(k: string): string | null }) => (usingStaticData ? null : q.get('state'));

export const REPLAY_MIN = '2025-01-01';
export const REPLAY_MAX = '2025-12-31';
const isReplayDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= REPLAY_MIN && d <= REPLAY_MAX;
export function setReplayDate(date: string) {
  if (isReplayDate(date)) store('replayDate', date);
}
export function clearReplayDate() {
  try {
    window.localStorage.removeItem('tumgil:replayDate');
    const url = new URL(window.location.href);
    url.searchParams.delete('replay');
    window.history.replaceState({}, '', url);
  } catch {
    /* 저장소를 쓸 수 없어도 오늘 날짜로 계속 볼 수 있어요 */
  }
}
/** 위치를 쓸 수 없을 때(E1)의 기준. "올림픽공원 기준으로 보여드려요" */
export const DEFAULT_ORIGIN_STATION = 'olympic_park';
/** 한국 시각 기준 지금(분). 시간 선택이 10분 단위라 10분 단위로 내려요. */
function kstNowMin(): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + Math.floor(m / 10) * 10;
}

/**
 * 지금 시각(분). 실제 데이터(발행 파일·API)를 쓸 때는 실제 한국 시각,
 * 목업(디자인 시안 미리보기)일 때만 시안의 20:00 이에요.
 */
export const nowMin = () => (usingStaticData || !usingMock ? kstNowMin() : DEMO_NOW_MIN);

/**
 * 화면에 보여줄 시각. 지금 시각의 예상이 있으면 지금, 없으면(예: 낮 2시) 그날 행사가 끝나는 시간대(focus_hour)를 보여줘요.
 * fallback 이 true 면 화면에 "지금은 예상이 없어 OO시대를 보여드려요"라고 알려요.
 */
export function viewTime(now: number, f: { supported_hours: string[]; focus_hour: string }): { min: number; fallback: boolean } {
  if (f.supported_hours.includes(hourKey(now))) return { min: now, fallback: false };
  const focus = f.supported_hours.includes(f.focus_hour) ? f.focus_hour : f.supported_hours[0];
  return focus ? { min: Number(focus) * 60, fallback: true } : { min: now, fallback: false };
}
export const hourKey = (min: number) => pad(Math.floor(min / 60) % 24);
/** 날짜 + 분 → 오프셋이 붙은 ISO 시각 (API 명세서 2.1) */
export const isoAt = (date: string, min: number) => `${date}T${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}:00+09:00`;

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const asset = (p: string) => `${BASE}${p}`;

// ── 혼잡 단계와 노선 ──────────────────────────────────────

export const LEVEL: Record<Level, { label: string; bg: string; fg: string; dot: string; rank: number }> = {
  relaxed: { label: '여유', bg: '#E2F5E9', fg: '#156B37', dot: '#1E8A47', rank: 1 },
  normal: { label: '보통', bg: '#FFF2D1', fg: '#8A5300', dot: '#B57A00', rank: 2 },
  crowded: { label: '혼잡', bg: '#FDE8E6', fg: '#C2281B', dot: '#C2281B', rank: 3 },
  no_data: { label: '정보 없음', bg: '#EEF0F3', fg: '#5F6573', dot: '#9AA0AC', rank: 9 },
};

export const LINE: Record<string, { bg: string; fg: string }> = {
  '2': { bg: '#2F9E44', fg: '#17171C' },
  '5': { bg: '#8B50A4', fg: '#FFFFFF' },
  '8': { bg: '#C8306E', fg: '#FFFFFF' },
  '9': { bg: '#BDA35C', fg: '#17171C' },
};

// ── 시간 표시 ────────────────────────────────────────────

export const pad = (n: number) => String(n).padStart(2, '0');
export const fmtMin = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const fmtNum = (n: number) => n.toLocaleString('ko-KR');

/** ISO 시각 → "20:30". 모르면 null */
export function hhmm(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function dateLabel(date: string, withYear = false) {
  const [y, m, d] = date.split('-').map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${withYear ? `${y}년 ` : ''}${m}월 ${d}일 (${dow})`;
}

// ── 기기에만 저장하는 값 ──────────────────────────────────

export function store<T>(key: string, value?: T): T | null {
  try {
    if (value !== undefined) {
      window.localStorage.setItem(`tumgil:${key}`, JSON.stringify(value));
      return value;
    }
    const raw = window.localStorage.getItem(`tumgil:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** 최근 검색은 앱을 닫으면 지워져야 해서 sessionStorage 에 둬요 (FR-54) */
export function sessionList(key: string, add?: string): string[] {
  try {
    const list = JSON.parse(window.sessionStorage.getItem(`tumgil:${key}`) ?? '[]') as string[];
    if (add === undefined) return list;
    const next = [add, ...list.filter((x) => x !== add)].slice(0, 5);
    window.sessionStorage.setItem(`tumgil:${key}`, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

// ── 기기 권한 상태 ─────────────────────────────────────────

export type PushSupport = 'granted' | 'default' | 'denied' | 'unsupported';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'default';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission as PushSupport;
}

export function isIphone() {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** 위치 권한이 허용돼 있는지. 확인할 수 없으면 false (E1: 올림픽공원 기준) */
export function useLocationGranted(): boolean | null {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!navigator.permissions) {
      setGranted(store<boolean>('locationGranted') ?? false);
      return;
    }
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((s) => !cancelled && setGranted(s.state === 'granted'))
      .catch(() => !cancelled && setGranted(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return granted;
}

export function requestLocation(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(false);
    // 위치는 기기 안에서만 써요. 서버로 보내지 않아요.
    navigator.geolocation.getCurrentPosition(
      () => {
        store('locationGranted', true);
        resolve(true);
      },
      () => resolve(false),
      { timeout: 10000 },
    );
  });
}

/** 알림 권한을 묻고, 허용되면 이 기기의 푸시 구독을 서버에 등록해요(서버가 있을 때만). */
export async function requestPush(): Promise<boolean> {
  if (pushSupport() === 'unsupported') return false;
  const r = await Notification.requestPermission();
  if (r !== 'granted') return false;
  await subscribePush();
  return true;
}

// ── 측정 이벤트 (PRD 10장) ─────────────────────────────────

export function track(name: string, props: Record<string, unknown> = {}) {
  // TODO(BE): POST /analytics/events. 개인을 알 수 있는 값은 넣지 않아요.
  if (process.env.NODE_ENV !== 'production') console.info('[track]', name, props);
}
