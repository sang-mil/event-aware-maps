import type { Envelope } from './types';

/**
 * 데이터는 이 파일을 통해서만 불러와요 (frontend/CLAUDE.md 규칙).
 *
 * - NEXT_PUBLIC_API_BASE 가 있으면 실제 API(`{API_BASE}/stations/...?date=...`)를 불러요. 조건은 쿼리로 그대로 보내요.
 * - 없으면 public/mock/ 의 목업 JSON을 읽어요. 목업은 조건마다 파일 이름이 달라서, 없는 조건이면 '찾을 수 없음'이 돼요.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
const CACHE_PREFIX = 'tumgil:cache:';

export const usingMock = !API_BASE;

/** offline: 연결 오류(E5) · not_found: 없는 역·행사, 또는 목업이 없는 조건 · unsupported: 지원하지 않는 시간대(422) */
export type ApiErrorCode = 'offline' | 'not_found' | 'unsupported';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public cachedUpdatedAt: string | null,
  ) {
    super(code);
  }
}

export interface Loaded<T> {
  data: T;
  updatedAt: string;
  /** 연결이 안 돼서 기기에 저장해 둔 마지막 값을 보여주는 중인지 */
  fromCache: boolean;
}

/** 쿼리 문자열 만들기. 빈 값은 빼요. */
export function qs(params: Record<string, string | null | undefined>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

function readCache<T>(key: string): Envelope<T> | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as Envelope<T>) : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: Envelope<T>) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* 저장 공간이 없어도 화면은 계속 보여줘요 */
  }
}

/**
 * @param apiPath 실제 API 경로와 쿼리. 예: `/stations/bangi/forecast?date=2025-08-09`
 * @param mockFile 목업 파일 이름. 예: `station-bangi-2025-08-09.json`
 */
export async function getJson<T>(apiPath: string, mockFile: string): Promise<Loaded<T>> {
  const url = usingMock ? `${BASE}/mock/${mockFile}` : `${API_BASE}${apiPath}`;
  const key = usingMock ? mockFile : apiPath;
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    return fromCacheOrThrow<T>(key);
  }
  if (res.status === 404) throw new ApiError('not_found', null);
  if (res.status === 422) throw new ApiError('unsupported', null);
  if (!res.ok) return fromCacheOrThrow<T>(key);
  const body = (await res.json()) as Envelope<T>;
  writeCache(key, body);
  return { data: body.data, updatedAt: body.updated_at, fromCache: false };
}

function fromCacheOrThrow<T>(key: string): Loaded<T> {
  const cached = readCache<T>(key);
  if (cached) return { data: cached.data, updatedAt: cached.updated_at, fromCache: true };
  throw new ApiError('offline', lastAnyUpdatedAt());
}

/** E5 화면에 "마지막으로 받은 정보는 00:00 기준" 을 보여주기 위한 값 */
function lastAnyUpdatedAt(): string | null {
  try {
    let latest: string | null = null;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      const v = JSON.parse(window.localStorage.getItem(k) ?? 'null') as Envelope<unknown> | null;
      if (v && (!latest || v.updated_at > latest)) latest = v.updated_at;
    }
    return latest;
  } catch {
    return null;
  }
}
