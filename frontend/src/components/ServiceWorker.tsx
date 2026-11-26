'use client';

import { useEffect } from 'react';
import { BASE } from '@/lib/app';

/** 서비스 워커(public/sw.js)를 등록해요. 오프라인 표시와 웹 푸시에 필요해요. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return; // 개발 중에는 저장된 화면 때문에 헷갈리지 않게 꺼 둬요
    navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).catch(() => undefined);
  }, []);
  return null;
}
