import type { Envelope } from './types';

/**
 * 데이터는 이 파일을 통해서만 불러와요 (frontend/CLAUDE.md 규칙).
 *
 * - NEXT_PUBLIC_API_BASE 가 있으면 실제 API(`{API_BASE}/stations/...?date=...`)를 불러요. 조건은 쿼리로 그대로 보내요.
 * - NEXT_PUBLIC_DATA_BASE 가 있으면 GitHub Pages 에 매일 발행되는 정적 JSON 파일(`{DATA_BASE}/events-2025-08-09.json`)을 읽어요.
 *   예: NEXT_PUBLIC_DATA_BASE=https://sang-mil.github.io/event-aware-maps/data
 * - 둘 다 없으면 public/mock/ 의 목업 JSON을 읽어요. 목업은 조건마다 파일 이름이 달라서, 없는 조건이면 '찾을 수 없음'이 돼요.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
const REALTIME_API_BASE = (
  process.env.NEXT_PUBLIC_REALTIME_API_BASE ?? 'https://event-aware-maps-live-api.sangmil6369.workers.dev'
).replace(/\/$/, '');
const DATA_BASE = (process.env.NEXT_PUBLIC_DATA_BASE ?? '').replace(/\/$/, '');
const CACHE_PREFIX = 'tumgil:cache:';

/** 실제 API 서버를 쓰는지 */
const usingApi = !!API_BASE;
/** 발행된 정적 JSON 파일을 읽는지 (API 서버가 있으면 서버가 먼저예요) */
export const usingStaticData = !usingApi && !!DATA_BASE;
/** 서울시 실시간 장소 정보를 Worker에서 읽는지 */
export const usingRealtimeApi = !!REALTIME_API_BASE;
/** 쓰기 API(피드백·알림)를 쓸 서버가 없는지. 정적 파일만 읽을 때도 서버는 없어요. */
export const usingMock = !usingApi;

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

export interface JsonFiles<T> {
  /** 목업 파일 이름. 예: `station-bangi-2025-08-09.json` */
  mock: string;
  /**
   * 발행된 정적 파일 이름. 예: `compare-olympic_park-2025-08-09-20.json`
   * - 문자열이면 `{DATA_BASE}/{이름}` 을 읽어요. 정적 파일 모드에서는 목업을 절대 대신 읽지 않아요.
   * - null 이면 발행되는 파일이 없는 조건이라 '지원하지 않는 조건'으로 처리해요.
   */
  data?: string | null;
  /**
   * 파일이 없을 때 돌려줄 '빈 결과'. 명세상 서버가 404 대신 빈 목록을 주는 API에만 써요
   * (예: 행사 없는 날 GET /events → events: []). 실제 API에서는 쓰지 않아요.
   */
  empty?: () => T;
  /** 정적 파일에서 파일이 없을 때(404) '찾을 수 없음' 대신 '지원하지 않는 조건'으로 보여줄지 */
  missingIsUnsupported?: boolean;
}

/**
 * @param apiPath 실제 API 경로와 쿼리. 예: `/stations/bangi/forecast?date=2025-08-09`
 * @param files 목업·정적 파일 이름
 */
export async function getJson<T>(apiPath: string, files: JsonFiles<T>): Promise<Loaded<T>> {
  const dataFile = files.data === undefined ? files.mock : files.data;
  if (usingStaticData && dataFile === null) throw new ApiError('unsupported', null);
  const fromData = usingStaticData;
  const url = usingApi ? `${API_BASE}${apiPath}` : fromData ? `${DATA_BASE}/${dataFile}` : `${BASE}/mock/${files.mock}`;
  const key = usingApi ? apiPath : fromData ? `data:${dataFile}` : files.mock;
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    return fromCacheOrThrow<T>(key);
  }
  if (res.status === 404) {
    if (!usingApi && files.empty) return { data: files.empty(), updatedAt: new Date().toISOString(), fromCache: false };
    if (fromData && files.missingIsUnsupported) throw new ApiError('unsupported', null);
    throw new ApiError('not_found', null);
  }
  if (res.status === 422) throw new ApiError('unsupported', null);
  if (!res.ok) return fromCacheOrThrow<T>(key);
  const body = (await res.json()) as Envelope<T>;
  writeCache(key, body);
  return { data: body.data, updatedAt: body.updated_at, fromCache: false };
}

/** 서울시 실시간 Worker 응답을 읽고, 실패하면 이 기기에 저장한 마지막 응답을 사용해요. */
export async function getRealtimeJson<T>(path: string): Promise<Loaded<T>> {
  const key = `realtime:${path}`;
  if (!REALTIME_API_BASE) return fromCacheOrThrow<T>(key);

  let res: Response;
  try {
    res = await fetch(`${REALTIME_API_BASE}${path}`, { cache: 'no-store' });
  } catch {
    return fromCacheOrThrow<T>(key);
  }
  if (!res.ok) return fromCacheOrThrow<T>(key);

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    return fromCacheOrThrow<T>(key);
  }
  const observedAt = (data as { crowd?: { observed_at?: string | null } })?.crowd?.observed_at;
  const updatedAt = observedAt || res.headers.get('X-Data-Retrieved-At') || new Date().toISOString();
  writeCache(key, { schema_version: 'realtime-v1', updated_at: updatedAt, data });
  return { data, updatedAt, fromCache: false };
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
