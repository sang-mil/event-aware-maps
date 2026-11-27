// 틈길 API 명세서 v0.1 초안의 응답 형태예요. 백엔드와 확정되면 여기를 바꿔요.

export type Level = 'relaxed' | 'normal' | 'crowded' | 'no_data';

/** 서울시 실시간 도시데이터 Worker가 현재 장소 혼잡 정보만 추려 보낸 응답 */
export type RealtimeAreaId = 'olympic-park' | 'jamsil';

export interface RealtimeCrowd {
  area: { name: string | null; code: string | null };
  crowd: {
    level: string | null;
    message: string | null;
    population_min: string | number | null;
    population_max: string | number | null;
    observed_at: string | null;
  };
  source: string;
}

export interface Envelope<T> {
  schema_version: string;
  updated_at: string;
  data: T;
}

export interface Station {
  id: string;
  name: string;
  lines: string[];
  lat: number | null;
  lng: number | null;
  has_data: boolean;
  data_lines: string[];
}

export interface Venue {
  id: string;
  name: string;
  area: 'olympic_park' | 'jamsil';
  lat: number | null;
  lng: number | null;
  nearby_stations: { station_id: string; walk_min: number | null }[];
}

export interface WalkRoutePlace {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface WalkRoute {
  venue_id: string;
  station_id: string;
  distance_m: number | null;
  walk_min: number | null;
  path: [number, number][];
  landing_url: string | null;
}

export interface WalkRoutes {
  schema_version: string;
  updated_at: string;
  attribution: string;
  places: WalkRoutePlace[];
  routes: WalkRoute[];
}

export interface Slot {
  hour: string;
  expected: number | null;
  baseline: number | null;
  ratio: number | null;
  level: Level;
  message: string;
  recommended: boolean;
}

export interface Headline {
  highlight: string | null;
  text: string;
}

export interface EventItem {
  id: string;
  type: 'show' | 'game';
  title: string;
  venue_id: string | null;
  area: 'olympic_park' | 'jamsil';
  date: string;
  start_at: string | null;
  end_at: string | null;
  end_at_source: 'scheduled' | 'estimated' | null;
  status: 'scheduled' | 'changed' | 'canceled';
  change: { prev_end_at: string | null; new_end_at: string | null; changed_at: string } | null;
  game_state: 'before' | 'live' | 'end' | null;
  nearest_station: { station_id: string; level: Level } | null;
  linkable: boolean;
}

export interface EventList {
  date: string;
  events: EventItem[];
  next_event: { id: string | null; title: string | null; venue_id: string | null; date: string | null } | null;
}

export interface AfterEndStation {
  station_id: string;
  level: Level;
  message: string | null;
  walk_min: number | null;
}

export interface EventDetail extends EventItem {
  after_end: {
    end: { hour_label: string | null; stations: AfterEndStation[] };
    later?: { hour_label: string | null; stations: AfterEndStation[] };
    no_data_message?: string;
  };
  same_day: {
    id: string;
    title: string;
    venue_id: string | null;
    start_at: string | null;
    end_at: string | null;
    /** 선택 필드(백엔드 #31). estimated 면 끝 시각에 (추정)을 붙여요. 없거나 null 이면 붙이지 않아요. */
    end_at_source?: 'scheduled' | 'estimated' | null;
    type: 'show' | 'game';
  }[];
  crossing_note: { station_id: string; title: string; message: string } | null;
}

export interface CalendarMonth {
  month: string;
  days: {
    date: string;
    has_show: boolean;
    has_game: boolean;
    count: number;
    by_venue: Record<string, { show?: boolean; game?: boolean }>;
    by_area: Record<string, { show?: boolean; game?: boolean }>;
  }[];
}

export interface Forecast {
  date: string;
  day_label: string;
  has_event: boolean;
  /** 그날 가장 중요한 시간대(행사가 끝나는 시간대). 캘린더의 '근처 역, 20시대 예상'에 써요. */
  focus_hour: string;
  supported_hours: string[];
  summaries: Record<string, Headline & { best_station_id: string | null }>;
  /** 시간대별 역 순서. 서버가 정해서 내려줘요(화면은 순서를 바꾸지 않아요). */
  ranking: Record<string, string[]>;
  stations: { station_id: string; slots: Slot[] }[];
}

export interface StationForecast {
  station_id: string;
  date: string;
  focus_hour: string;
  focus_level: Level;
  headline: Headline | null;
  description: string | null;
  slots: Slot[];
  alternatives_title: string | null;
  alternatives: { station_id: string; level: Level; walk_min: number | null; message: string }[];
  notify_hour: string | null;
  no_data: { message: string; nearby: { station_id: string; level: Level; walk_min: number | null }[] } | null;
}

export interface CompareOption {
  id: string;
  kind: 'walk_to_other' | 'board_now' | 'wait_later';
  recommended: boolean;
  title: string;
  subtitle: string;
  station_id: string;
  board_hour: string;
  walk_min: number | null;
  expected: number | null;
  level: Level;
  compare_message: string;
}

export interface Compare {
  condition_label: { to_name: string | null; hour_label: string };
  headline: Headline;
  last_train: { at: string | null; minutes_left: number | null; imminent: boolean } | null;
  options: CompareOption[];
}

export interface RouteDetail {
  option_id: string;
  board_station_id: string;
  to_station_id: string | null;
  walk_min: number | null;
  distance_km: number | null;
  arrive_at: string | null;
  last_train_at: string | null;
  level: Level;
  message: string;
  steps: { type: 'start' | 'walk' | 'board'; title: string; detail: string | null; exit_no: string | null; direction: string | null }[];
  compare: { hour: string; items: { station_id: string; expected: number }[]; note: string };
  map_links: unknown;
}
