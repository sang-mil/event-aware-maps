'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, checkPushServer, getStations, getVenues, getWalkRoutes, readWalkRoutes, type ApiErrorCode, type Loaded, type Station, type Venue } from '@/api';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ok'; value: Loaded<T> }
  | { status: 'error'; code: ApiErrorCode; lastUpdatedAt: string | null; retry: () => void };

/** 화면에서 API 를 부를 때 쓰는 공통 훅. 실패하면 E5 화면을 보여줄 수 있게 상태를 돌려줘요. */
export function useLoad<T>(fn: () => Promise<Loaded<T>>, deps: unknown[]): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fn()
      .then((value) => !cancelled && setState({ status: 'ok', value }))
      .catch((e: unknown) => {
        if (cancelled) return;
        const err = e instanceof ApiError ? e : null;
        setState({ status: 'error', code: err?.code ?? 'offline', lastUpdatedAt: err?.cachedUpdatedAt ?? null, retry });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return state;
}

/** 역·공연장 이름표. 화면 곳곳에서 id → 이름으로 바꿀 때 써요. */
export function useRefs() {
  const stations = useLoad(getStations, []);
  const venues = useLoad(getVenues, []);
  const st: Record<string, Station> = {};
  const vn: Record<string, Venue> = {};
  if (stations.status === 'ok') stations.value.data.forEach((s) => (st[s.id] = s));
  if (venues.status === 'ok') venues.value.data.forEach((v) => (vn[v.id] = v));
  const ready = stations.status === 'ok' && venues.status === 'ok';
  return { st, vn, ready, venues: venues.status === 'ok' ? venues.value.data : [] };
}

/**
 * 공연장 → 역 도보 시간(분). 백엔드가 미리 계산해 발행한 walk-routes.json 에서 찾아요.
 * 경로가 없으면 null 이고, 화면은 "도보 시간 정보 없음"으로 보여줘요(값을 지어내지 않아요).
 */
export function useWalkMin() {
  const walks = useLoad(getWalkRoutes, []);
  const data = walks.status === 'ok' ? readWalkRoutes(walks.value.data) : null;
  return (venueId: string | null | undefined, stationId: string): number | null =>
    venueId ? data?.routes.find((r) => r.venue_id === venueId && r.station_id === stationId)?.walk_min ?? null : null;
}

/** 역 상세의 혼잡 대안 역 사이 도보 시간(분). 역 순서를 지켜 공개된 사전 계산 경로를 찾아요. */
export function useStationWalkMin() {
  const walks = useLoad(getWalkRoutes, []);
  const data = walks.status === 'ok' ? readWalkRoutes(walks.value.data) : null;
  return (fromStationId: string, toStationId: string): number | null =>
    data?.station_routes?.find((r) => r.from_station_id === fromStationId && r.to_station_id === toStationId)?.walk_min ?? null;
}

/** 알림을 실제로 쓸 수 있는지. 푸시 설정이 있고 서버도 준비됐을 때만 true (확인 전에는 false). */
export function usePushReady(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    checkPushServer().then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}
