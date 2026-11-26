import { getJson, qs } from './client';
import type {
  CalendarMonth,
  Compare,
  EventDetail,
  EventList,
  Forecast,
  RouteDetail,
  Station,
  StationForecast,
  Venue,
} from './types';

export * from './types';
export { ApiError, usingMock } from './client';
export type { ApiErrorCode, Loaded } from './client';

// ── 읽기 API (API 명세서 3~6장) ──────────────────────────────
// 첫 번째 인자는 실제 API 경로, 두 번째는 같은 조건의 목업 파일이에요.

export const getStations = () => getJson<Station[]>('/stations', 'stations.json');
export const getVenues = () => getJson<Venue[]>('/venues', 'venues.json');

/** GET /events?date= */
export const getEvents = (date: string) => getJson<EventList>(`/events${qs({ date })}`, `events-${date}.json`);

/**
 * GET /events/{id}
 * `variant`는 시안의 상태(E6 시간 변경, E7 취소, 경기 전/끝)를 미리 보기 위한 목업 전용 값이에요. 실제 API에는 보내지 않아요.
 */
export const getEvent = (id: string, variant?: string) =>
  getJson<EventDetail>(`/events/${encodeURIComponent(id)}`, `event-${id}${variant ? `-${variant}` : ''}.json`);

/** GET /calendar?month= */
export const getCalendar = (month: string) => getJson<CalendarMonth>(`/calendar${qs({ month })}`, `calendar-${month}.json`);

/** GET /forecast?date= */
export const getForecast = (date: string) => getJson<Forecast>(`/forecast${qs({ date })}`, `forecast-${date}.json`);

/** GET /stations/{id}/forecast?date= */
export const getStationForecast = (id: string, date: string) =>
  getJson<StationForecast>(`/stations/${encodeURIComponent(id)}/forecast${qs({ date })}`, `station-${id}-${date}.json`);

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

/**
 * GET /routes/compare
 * 목업은 출발지와 출발 시간대마다 파일이 따로 있어요: compare-{from_id}-{시}.json
 * `late`는 E4 막차 임박 시안을 보기 위한 목업 전용 값이에요.
 */
export const getCompare = (p: CompareParams, late = false) => {
  const hour = p.departAt.slice(11, 13);
  return getJson<Compare>(`/routes/compare${compareQuery(p)}`, `compare-${p.fromId}-${hour}${late ? '-late' : ''}.json`);
};

/** GET /routes/{option_id} — 비교와 같은 조건을 함께 보내요 */
export const getRoute = (optionId: string, p: CompareParams) =>
  getJson<RouteDetail>(`/routes/${encodeURIComponent(optionId)}${compareQuery(p)}`, `route-${p.fromId}-${optionId}.json`);

// ── 쓰기 API (API 명세서 7~8장) ──────────────────────────────
// 백엔드 서버가 아직 없어서, 지금은 기기에만 기록해요. 서버가 생기면 fetch 로 바꿔요.

const LOCAL_ALERTS = 'tumgil:alerts';

export type AlertKind = 'show_end' | 'game_end' | 'departure';

function readAlerts(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_ALERTS) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function alertKey(kind: AlertKind, target: string) {
  return `${kind}:${target}`;
}

export function hasAlert(key: string) {
  return readAlerts().includes(key);
}

/** POST /alerts · DELETE /alerts/{id} */
export async function setAlert(key: string, on: boolean) {
  const next = readAlerts().filter((k) => k !== key);
  if (on) next.push(key);
  try {
    window.localStorage.setItem(LOCAL_ALERTS, JSON.stringify(next));
  } catch {
    /* 무시 */
  }
}

/** PUT /push/subscriptions/{device_id}/preferences */
export async function savePreferences(prefs: { day_before: boolean; departure: boolean }) {
  try {
    window.localStorage.setItem('tumgil:prefs', JSON.stringify(prefs));
  } catch {
    /* 무시 */
  }
}

export function loadPreferences(): { day_before: boolean; departure: boolean } {
  try {
    const raw = window.localStorage.getItem('tumgil:prefs');
    if (raw) return JSON.parse(raw);
  } catch {
    /* 무시 */
  }
  return { day_before: true, departure: false };
}

/** POST /feedback — 누가 답했는지 알 수 없게 기기 id는 보내지 않아요 */
export async function postFeedback(body: {
  station_id: string;
  date: string;
  hour: string;
  predicted_level: string;
  answer: 'relaxed' | 'normal' | 'crowded' | 'not_used';
  event_id: string | null;
}) {
  if (process.env.NODE_ENV !== 'production') console.info('[POST /feedback]', body);
}
