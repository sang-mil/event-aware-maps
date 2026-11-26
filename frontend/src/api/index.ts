import { getJson } from './client';
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
export { ApiError } from './client';
export type { Loaded } from './client';

// ── 읽기 API (API 명세서 3~6장) ──────────────────────────────

export const getStations = () => getJson<Station[]>('stations.json');
export const getVenues = () => getJson<Venue[]>('venues.json');

/** GET /events?date= */
export const getEvents = (date: string) => getJson<EventList>(`events-${date}.json`);

/**
 * GET /events/{id}
 * `variant`는 시안의 상태(E6 시간 변경, E7 취소, 경기 전/끝)를 미리 보기 위한 목업 전용 값이에요.
 */
export const getEvent = (id: string, variant?: string) =>
  getJson<EventDetail>(`event-${id}${variant ? `-${variant}` : ''}.json`);

/** GET /calendar?month= */
export const getCalendar = (month: string) => getJson<CalendarMonth>(`calendar-${month}.json`);

/** GET /forecast?date= */
export const getForecast = (date: string) => getJson<Forecast>(`forecast-${date}.json`);

/** GET /stations/{id}/forecast?date= */
export const getStationForecast = (id: string, date: string) =>
  getJson<StationForecast>(`station-${id}-${date}.json`);

/** GET /routes/compare  (late: E4 막차 임박 시안) */
export const getCompare = (params: { fromType: string; fromId: string; to: string; departAt: string; late?: boolean }) =>
  getJson<Compare>(params.late ? 'compare-late.json' : 'compare.json');

/** GET /routes/{option_id} */
export const getRoute = (optionId: string) => getJson<RouteDetail>(`route-${optionId}.json`);

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
