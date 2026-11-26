'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, getStations, getVenues, type Loaded, type Station, type Venue } from '@/api';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ok'; value: Loaded<T> }
  | { status: 'error'; lastUpdatedAt: string | null; retry: () => void };

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
        setState({ status: 'error', lastUpdatedAt: e instanceof ApiError ? e.cachedUpdatedAt : null, retry });
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
