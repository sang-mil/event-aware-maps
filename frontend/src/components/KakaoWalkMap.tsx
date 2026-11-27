'use client';

import { useEffect, useRef, useState } from 'react';

type KakaoLatLng = new (lat: number, lng: number) => unknown;
type KakaoMapInstance = { setBounds(bounds: unknown): void };
type KakaoMaps = {
  LatLng: KakaoLatLng;
  LatLngBounds: new () => { extend(point: unknown): void };
  Map: new (container: HTMLElement, options: { center: unknown; level: number }) => KakaoMapInstance;
  Marker: new (options: { map: KakaoMapInstance; position: unknown }) => unknown;
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
