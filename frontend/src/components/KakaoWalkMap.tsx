'use client';

import { useEffect, useRef, useState } from 'react';

type KakaoLatLng = new (lat: number, lng: number) => unknown;
type KakaoMapInstance = { setBounds(bounds: unknown): void };
type KakaoMaps = {
  LatLng: KakaoLatLng;
  LatLngBounds: new () => { extend(point: unknown): void };
  Map: new (container: HTMLElement, options: { center: unknown; level: number }) => KakaoMapInstance;
  Marker: new (options: { map: KakaoMapInstance; position: unknown }) => unknown;
  CustomOverlay: new (options: { map: KakaoMapInstance; position: unknown; content: HTMLElement; yAnchor?: number }) => unknown;
  Polyline: new (options: { map: KakaoMapInstance; path: unknown[]; strokeWeight: number; strokeColor: string; strokeOpacity: number; strokeStyle: string }) => unknown;
  load(callback: () => void): void;
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

type Props = {
  path: [number, number][];
  origin: string;
  destination: string;
};

/** Map display only: route coordinates and walking time come from the published precomputation. */
export function KakaoWalkMap({ path, origin, destination }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing-key' | 'failed'>('loading');
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ?? '';

  useEffect(() => {
    if (!container.current || path.length < 2) {
      setState('failed');
      return;
    }
    if (!key) {
      setState('missing-key');
      return;
    }
    let cancelled = false;
    const draw = () => window.kakao?.maps.load(() => {
      if (cancelled || !container.current || !window.kakao) return;
      container.current.replaceChildren();
      const maps = window.kakao.maps;
      const coords = path.map(([lng, lat]) => new maps.LatLng(lat, lng));
      const bounds = new maps.LatLngBounds();
      coords.forEach((point) => bounds.extend(point));
      const map = new maps.Map(container.current, { center: coords[0], level: 4 });
      new maps.Polyline({ map, path: coords, strokeWeight: 5, strokeColor: '#4E3DBC', strokeOpacity: 0.9, strokeStyle: 'solid' });
      new maps.Marker({ map, position: coords[0] });
      new maps.Marker({ map, position: coords[coords.length - 1] });
      map.setBounds(bounds);
      setState('ready');
    });

    if (window.kakao?.maps) {
      draw();
    } else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-tumgil-kakao-map]');
      if (existing) {
        existing.addEventListener('load', draw, { once: true });
        existing.addEventListener('error', () => !cancelled && setState('failed'), { once: true });
      } else {
        const script = document.createElement('script');
        script.dataset.tumgilKakaoMap = 'true';
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
        script.async = true;
        script.onload = draw;
        script.onerror = () => !cancelled && setState('failed');
        document.head.appendChild(script);
      }
    }
    return () => { cancelled = true; };
  }, [key, path]);

  if (state === 'missing-key') return <div role="status" className="card pad">카카오 지도 키가 연결되지 않았어요. 도보 경로 지도는 표시할 수 없습니다.</div>;
  if (state === 'failed' && path.length < 2) return <div role="status" className="card pad">표시할 도보 경로 데이터가 없습니다.</div>;
  return (
    <div style={{ margin: '0 16px' }}>
      <div ref={container} aria-label={`${origin}에서 ${destination}까지 도보 경로 지도`} role="img" style={{ height: 260, borderRadius: 20, overflow: 'hidden', background: '#EEF0F3' }} />
      {state === 'failed' && <p role="status" className="na">지도를 불러오지 못했습니다. 발행된 도보 시간 정보는 아래에 표시합니다.</p>}
      {state === 'ready' && <p style={{ margin: '6px 4px', fontSize: 12, color: '#5F6573' }}>지도: Kakao Map</p>}
    </div>
  );
}

type Place = { id: string; name: string; x: number; y: number };
type Route = { venue_id: string; path: [number, number][] };
type StationMarker = { line: string | null; level: string };

const STATION_IDS = new Set(['olympic_park', 'bangi', 'mongchontoseong', 'sports_complex', 'jamsil_saenae', 'hanseong_baekje']);

/** Actual map overview with provider-returned venue/station coordinates and published walking paths. */
export function KakaoOverviewMap({
  places,
  routes,
  selectedVenueId,
  stationMarkers,
  onSelectVenue,
  onSelectStation,
}: {
  places: Place[];
  routes: Route[];
  selectedVenueId: string | null;
  stationMarkers: Record<string, StationMarker>;
  onSelectVenue: (id: string) => void;
  onSelectStation: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing-key' | 'missing-data' | 'failed'>('loading');
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ?? '';

  useEffect(() => {
    if (places.length === 0) {
      setState('missing-data');
      return;
    }
    if (!container.current) return;
    if (!key) {
      setState('missing-key');
      return;
    }
    let cancelled = false;
    const draw = () => window.kakao?.maps.load(() => {
      if (cancelled || !container.current || !window.kakao) return;
      const maps = window.kakao.maps;
      const points = places.map((place) => new maps.LatLng(place.y, place.x));
      const bounds = new maps.LatLngBounds();
      points.forEach((point) => bounds.extend(point));
      const map = new maps.Map(container.current, { center: points[0], level: 6 });
      map.setBounds(bounds);
      places.forEach((place) => {
        const station = STATION_IDS.has(place.id);
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', station ? `${place.name}, ${stationMarkers[place.id]?.level ?? '혼잡 정보 없음'}` : `${place.name}, 공연장 선택`);
        button.style.cssText = `border:0;border-radius:12px;background:#fff;padding:7px 10px;box-shadow:0 2px 8px #17171c33;font:600 13px sans-serif;white-space:nowrap;color:${station ? '#1F5FAF' : '#17171C'};cursor:pointer;`;
        button.textContent = station ? `${stationMarkers[place.id]?.line ? `${stationMarkers[place.id].line}호선 · ` : ''}${place.name} · ${stationMarkers[place.id]?.level ?? '정보 없음'}` : place.name;
        button.addEventListener('click', () => station ? onSelectStation(place.id) : onSelectVenue(place.id));
        new maps.CustomOverlay({ map, position: new maps.LatLng(place.y, place.x), content: button, yAnchor: 1.1 });
      });

      routes.filter((route) => route.venue_id === selectedVenueId && route.path.length > 1).forEach((route) => {
        const path = route.path.map(([lng, lat]) => new maps.LatLng(lat, lng));
        new maps.Polyline({ map, path, strokeWeight: 5, strokeColor: '#4E3DBC', strokeOpacity: 0.9, strokeStyle: 'solid' });
      });
      setState('ready');
    });

    if (window.kakao?.maps) draw();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-tumgil-kakao-map]');
      if (existing) {
        existing.addEventListener('load', draw, { once: true });
        existing.addEventListener('error', () => !cancelled && setState('failed'), { once: true });
      } else {
        const script = document.createElement('script');
        script.dataset.tumgilKakaoMap = 'true';
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
        script.async = true;
        script.onload = draw;
        script.onerror = () => !cancelled && setState('failed');
        document.head.appendChild(script);
      }
    }
    return () => { cancelled = true; };
  }, [key, places, routes, selectedVenueId, stationMarkers, onSelectVenue, onSelectStation]);

  if (state === 'missing-data') return <div role="status" className="card pad" style={{ margin: 16 }}>지도 위치 데이터가 아직 발행되지 않았어요.</div>;
  if (state === 'missing-key') return <div role="status" className="card pad" style={{ margin: 16 }}>카카오 지도 키가 연결되지 않았어요.</div>;
  return <div ref={container} role="application" aria-label="공연장과 지하철역 지도" style={{ position: 'absolute', inset: 0, background: '#EEF0F3' }}>{state === 'failed' && <span role="status" className="card pad" style={{ display: 'inline-block', margin: 16 }}>지도를 불러오지 못했습니다.</span>}</div>;
}
