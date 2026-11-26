'use client';

import { useEffect, useState } from 'react';
import type { Level } from '@/api';

/**
 * 시안은 2025년 8월 9일(토) 20:00 을 "지금"으로 그렸어요.
 * 목업 데이터도 그날 것만 있어서, 실제 데이터가 연동되기 전까지는 이 값을 오늘로 써요.
 */
export const DEMO_TODAY = '2025-08-09';
export const DEMO_QUIET_DAY = '2025-08-16';
export const DEMO_NOW_MIN = 20 * 60;
export const DEMO_MONTH = '2025-08';

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

export async function requestPush(): Promise<boolean> {
  if (pushSupport() === 'unsupported') return false;
  const r = await Notification.requestPermission();
  // TODO(BE): 허용되면 서비스 워커로 구독을 만들어 POST /push/subscriptions 로 보내요.
  return r === 'granted';
}

// ── 측정 이벤트 (PRD 10장) ─────────────────────────────────

export function track(name: string, props: Record<string, unknown> = {}) {
  // TODO(BE): POST /analytics/events. 개인을 알 수 있는 값은 넣지 않아요.
  if (process.env.NODE_ENV !== 'production') console.info('[track]', name, props);
}
