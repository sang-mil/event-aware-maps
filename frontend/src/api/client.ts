import type { Envelope } from './types';

/**
 * 데이터는 이 파일을 통해서만 불러와요 (frontend/CLAUDE.md 규칙).
 *
 * 지금은 백엔드가 없어서 public/mock/ 안의 목업 JSON을 읽어요.
 * 실제 API가 생기면 NEXT_PUBLIC_API_BASE 를 정하고 apiPath() 의 경로 규칙만 바꾸면 돼요.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const CACHE_PREFIX = 'tumgil:cache:';

export class ApiError extends Error {
  constructor(
    message: string,
    public cachedUpdatedAt: string | null,
  ) {
    super(message);
  }
}

export interface Loaded<T> {
  data: T;
  updatedAt: string;
  /** 연결이 안 돼서 기기에 저장해 둔 마지막 값을 보여주는 중인지 */
  fromCache: boolean;
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

export async function getJson<T>(file: string): Promise<Loaded<T>> {
  try {
    const res = await fetch(`${BASE}/mock/${file}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Envelope<T>;
    writeCache(file, body);
    return { data: body.data, updatedAt: body.updated_at, fromCache: false };
  } catch (err) {
    const cached = readCache<T>(file);
    if (cached) return { data: cached.data, updatedAt: cached.updated_at, fromCache: true };
    throw new ApiError(err instanceof Error ? err.message : 'load failed', lastAnyUpdatedAt());
  }
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
