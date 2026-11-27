import { getJson, getRealtimeJson, qs, usingMock, usingRealtimeApi } from './client';
import type {
  CalendarMonth,
  Compare,
  EventDetail,
  EventList,
  Forecast,
  RouteDetail,
  RealtimeAreaId,
  RealtimeCrowd,
  Station,
  StationForecast,
  Venue,
  WalkRoutes,
} from './types';

export * from './types';
export { ApiError, usingMock, usingRealtimeApi, usingStaticData } from './client';
export type { ApiErrorCode, Loaded } from './client';

// ── 읽기 API (API 명세서 3~6장) ──────────────────────────────
// 첫 번째 인자는 실제 API 경로, 두 번째는 같은 조건의 목업·정적 파일 이름이에요.
// 정적 파일(GitHub Pages data/) 이름 규칙은 목업과 거의 같고, 다른 곳만 `data`에 따로 적어요.

// 정적 파일 모드에서는 목업을 절대 대신 쓰지 않아요. 파일이 없으면 화면이 '정보 없음'으로 보여줘요.
export const getStations = () => getJson<Station[]>('/stations', { mock: 'stations.json' });
export const getVenues = () => getJson<Venue[]>('/venues', { mock: 'venues.json' });

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCoordinate = (v: unknown): v is [number, number] => Array.isArray(v) && isNum(v[0]) && isNum(v[1]);

/**
 * walk-routes.json 형식 확인. 최상위 places·routes 가 배열이 아니면 null(읽지 못함)을 돌려줘요.
 * 좌표가 숫자가 아닌 장소·경로 점은 지도를 깨뜨리지 않게 빼고 보여줘요(값을 고치거나 지어내지 않아요).
 */
export function readWalkRoutes(raw: unknown): WalkRoutes | null {
  const d = raw as Partial<WalkRoutes> | null | undefined;
  if (!d || !Array.isArray(d.places) || !Array.isArray(d.routes)) return null;
  const places = d.places.filter((p) => p && typeof p.id === 'string' && isNum(p.x) && isNum(p.y));
  const routes = d.routes
    .filter((r) => r && typeof r.venue_id === 'string' && typeof r.station_id === 'string' && Array.isArray(r.path))
    .map((r) => ({ ...r, path: r.path.filter(isCoordinate) }));
  const stationRoutes = Array.isArray(d.station_routes)
    ? d.station_routes
        .filter((r) => r && typeof r.from_station_id === 'string' && typeof r.to_station_id === 'string')
        .map((r) => ({ ...r, path: Array.isArray(r.path) ? r.path.filter(isCoordinate) : undefined }))
    : [];
  return { ...(d as WalkRoutes), places, routes, station_routes: stationRoutes };
}

/** 사전 발행한 공연장→역 도보 경로. 파일이 없으면 없는 데이터로 처리합니다. */
export const getWalkRoutes = () => getJson<WalkRoutes>('/walk-routes', {
  mock: 'walk-routes.json',
  data: 'walk-routes.json',
  forceStatic: true,
  unwrapped: true, // envelope 없이 최상위에 places·routes 가 있는 파일이에요
});

/** GET /events?date= */
export const getEvents = (date: string) =>
  // 행사 없는 날은 서버가 200과 events: [] 를 줘요(명세 4.2). 그날 파일이 없을 때도 똑같이 빈 목록으로 다뤄요.
  getJson<EventList>(`/events${qs({ date })}`, {
    mock: `events-${date}.json`,
    empty: () => ({ date, events: [], next_event: null }),
  });

/**
 * GET /events/{id}
 * `variant`는 시안의 상태(E6 시간 변경, E7 취소, 경기 전/끝)를 미리 보기 위한 목업 전용 값이에요. 실제 API에는 보내지 않아요.
 * 정적 파일은 event-{id}.json 이에요. 파일이 없으면 '찾을 수 없음'이 돼요.
 */
export const getEvent = (id: string, variant?: string) =>
  getJson<EventDetail>(`/events/${encodeURIComponent(id)}`, {
    mock: `event-${id}${variant ? `-${variant}` : ''}.json`,
    data: `event-${id}.json`,
  });

/** GET /calendar?month= — 그 달 파일이 없으면 '찾을 수 없음'이고, 캘린더가 '이 달은 데이터가 없어요'로 보여줘요 */
export const getCalendar = (month: string) => getJson<CalendarMonth>(`/calendar${qs({ month })}`, { mock: `calendar-${month}.json` });

/** GET /forecast?date= */
export const getForecast = (date: string) => getJson<Forecast>(`/forecast${qs({ date })}`, { mock: `forecast-${date}.json` });

/** 서울시 실시간 장소 인구 혼잡도. 역 승차량 예측과 별도로 보여줘요. */
export const getRealtimeCrowd = (area: RealtimeAreaId) => getRealtimeJson<RealtimeCrowd>(`/api/realtime/${area}`);

/** GET /stations/{id}/forecast?date= */
export const getStationForecast = (id: string, date: string) =>
  getJson<StationForecast>(`/stations/${encodeURIComponent(id)}/forecast${qs({ date })}`, { mock: `station-${id}-${date}.json` });

export interface CompareParams {
  fromType: 'venue' | 'station';
  fromId: string;
  toStationId: string;
  /** ISO 시각. 예: 2025-08-09T20:00:00+09:00 */
  departAt: string;
}

function compareQuery(p: CompareParams) {
  return qs({ from_type: p.fromType, from_id: p.fromId, to_station_id: p.toStationId, depart_at: p.departAt });
}

/** 올림픽공원 지역 공연장. 귀가 비교 파일은 지역(olympic_park) 단위로 발행돼요. */
const OLYMPIC_PARK_VENUES = ['kspo_dome', 'olympic_hall', 'ticketlink_live_arena', 'woori_art_hall', 'muse_live', 'grass_88'];

/**
 * 정적 파일의 출발 지역. 지금은 올림픽공원 지역(올림픽공원역·그 지역 공연장)만 발행돼요.
 * 다른 출발지는 null → '지원하지 않는 조건'.
 */
function compareArea(p: CompareParams): string | null {
  if (p.fromType === 'station') return p.fromId === 'olympic_park' ? 'olympic_park' : null;
  return OLYMPIC_PARK_VENUES.includes(p.fromId) ? 'olympic_park' : null;
}

/** 정적 파일 이름 앞부분: compare-olympic_park-2025-08-09-20 */
function compareStem(p: CompareParams): string | null {
  const area = compareArea(p);
  return area ? `${area}-${p.departAt.slice(0, 10)}-${p.departAt.slice(11, 13)}` : null;
}

/**
 * GET /routes/compare
 * 목업은 출발지와 출발 시간대마다 파일이 따로 있어요: compare-{from_id}-{시}.json
 * 정적 파일은 compare-{지역}-{날짜}-{시}.json 이고, 발행된 시간대(19~23시) 밖은 '지원하지 않는 조건'이에요.
 * `late`는 E4 막차 임박 시안을 보기 위한 목업 전용 값이에요.
 */
export const getCompare = (p: CompareParams, late = false) => {
  const hour = p.departAt.slice(11, 13);
  const stem = compareStem(p);
  return getJson<Compare>(`/routes/compare${compareQuery(p)}`, {
    mock: `compare-${p.fromId}-${hour}${late ? '-late' : ''}.json`,
    data: stem && `compare-${stem}.json`,
    missingIsUnsupported: true,
  });
};

/** GET /routes/{option_id} — 비교와 같은 조건을 함께 보내요 */
export const getRoute = (optionId: string, p: CompareParams) => {
  const stem = compareStem(p);
  return getJson<RouteDetail>(`/routes/${encodeURIComponent(optionId)}${compareQuery(p)}`, {
    mock: `route-${p.fromId}-${optionId}.json`,
    data: stem && `route-${stem}-${optionId}.json`,
    missingIsUnsupported: true,
  });
};

// ── 쓰기 API (API 명세서 7~8장) ──────────────────────────────
// 쓰기는 실제 서버가 있어야 해요. 서버가 없으면(목업) 아무것도 저장하지 않고, 화면은 "준비 중"으로 보여줘요.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** 피드백 같은 쓰기 API를 쓸 수 있는지 (서버 주소가 있을 때) */
export const serverReady = !usingMock;
/** 웹 푸시 알림을 실제로 보낼 수 있는지 (서버 주소 + 푸시 공개 키가 있을 때) */
export const pushReady = serverReady && !!VAPID_KEY;

async function send(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

function local<T>(key: string, value?: T): T | null {
  try {
    if (value !== undefined) {
      if (value === null) window.localStorage.removeItem(`tumgil:${key}`);
      else window.localStorage.setItem(`tumgil:${key}`, JSON.stringify(value));
      return value;
    }
    const raw = window.localStorage.getItem(`tumgil:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** 사람을 알 수 없는 기기 id. 알림을 묶는 데만 써요(명세 7.2). */
function deviceId(): string {
  let id = local<string>('deviceId');
  if (!id) id = local('deviceId', `d_${crypto.randomUUID()}`)!;
  return id;
}

/** POST /push/subscriptions — 알림 권한을 받은 뒤 이 기기의 푸시 구독을 서버에 등록해요 */
export async function subscribePush(): Promise<boolean> {
  if (!pushReady || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_KEY }));
    await send('POST', '/push/subscriptions', { device_id: deviceId(), subscription: sub.toJSON() });
    return true;
  } catch {
    return false;
  }
}

export type AlertKind = 'show_end' | 'game_end' | 'departure';

export function alertKey(kind: AlertKind, target: string) {
  return `${kind}:${target}`;
}

/** 이 기기가 등록한 알림 예약 (화면 다시 열 때 버튼 상태를 맞추는 용도). 서버가 없으면 항상 꺼짐. */
export function hasAlert(key: string) {
  if (!pushReady) return false;
  return !!(local<Record<string, string>>('alerts') ?? {})[key];
}

/** POST /alerts · DELETE /alerts/{id}. 실패하면 false 를 돌려주고 버튼은 바뀌지 않아요. */
export async function setAlert(
  key: string,
  on: boolean,
  body: { kind: AlertKind; event_id?: string; station_id?: string; notify_at?: string },
): Promise<boolean> {
  if (!pushReady) return false;
  const map = local<Record<string, string>>('alerts') ?? {};
  try {
    if (on) {
      const res = (await send('POST', '/alerts', { device_id: deviceId(), ...body })) as { alert_id?: string } | null;
      map[key] = res?.alert_id ?? key;
    } else if (map[key]) {
      await send('DELETE', `/alerts/${encodeURIComponent(map[key])}`);
      delete map[key];
    }
    local('alerts', map);
    return true;
  } catch {
    return false;
  }
}

/** 알림 설정. 설정 화면 값은 기기에 두고, 서버가 있으면 서버에도 보내요(PUT .../preferences). */
export async function savePreferences(prefs: { day_before: boolean; departure: boolean }) {
  local('prefs', prefs);
  if (pushReady) await send('PUT', `/push/subscriptions/${deviceId()}/preferences`, prefs).catch(() => undefined);
}

export function loadPreferences(): { day_before: boolean; departure: boolean } {
  return local<{ day_before: boolean; departure: boolean }>('prefs') ?? { day_before: true, departure: false };
}

/** POST /feedback — 누가 답했는지 알 수 없게 기기 id는 보내지 않아요. 서버가 없으면 false. */
export async function postFeedback(body: {
  station_id: string;
  date: string;
  hour: string;
  predicted_level: string;
  answer: 'relaxed' | 'normal' | 'crowded' | 'not_used';
  event_id: string | null;
}): Promise<boolean> {
  if (!serverReady) return false;
  return send('POST', '/feedback', body)
    .then(() => true)
    .catch(() => false);
}
