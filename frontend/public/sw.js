/* 틈길 서비스 워커
 * 1) 오프라인: 화면(HTML)과 화면 파일(JS·CSS·글꼴·이미지)을 기기에 저장해 두고, 연결이 끊기면 저장한 것을 보여줘요.
 *    데이터(JSON)는 앱이 직접 저장해 두고 "n분 전 정보"로 보여줘요(src/api/client.ts).
 * 2) 웹 푸시: 서버가 보낸 알림을 띄우고, 누르면 알림에 담긴 화면을 열어요(API 명세서 7.6).
 */
const VERSION = 'tumgil-v1';
const SCOPE = new URL(self.registration.scope).pathname; // 예: "/" 또는 "/event-aware-maps/"
const PAGES = ['', 'home/', 'onboarding/', 'station/', 'calendar/', 'events/', 'event/', 'game/', 'map/', 'search/', 'compare/', 'route/', 'install/', 'settings/', 'settings/privacy/', 'settings/terms/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PAGES.map((p) => SCOPE + p)))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return url.pathname.includes('/_next/static/') || url.pathname.includes('/brand/') || /\.(woff2|png|svg|css|js)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 다른 서버(API 등)는 앱이 직접 처리해요
  if (url.pathname.includes('/mock/')) return; // 데이터는 앱이 저장·표시해요

  // 화면 이동: 먼저 네트워크, 안 되면 저장한 화면 (주소의 ?id= 같은 값은 무시하고 같은 화면을 찾아요)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(async () => (await caches.match(url.pathname, { ignoreSearch: true })) || (await caches.match(SCOPE + 'home/')) || Response.error()),
    );
    return;
  }

  // 화면 파일: 저장한 것이 있으면 바로, 없으면 받아서 저장
  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// ── 웹 푸시 ───────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: '틈길', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '틈길';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: SCOPE + 'brand/icon-192.png',
      badge: SCOPE + 'brand/icon-192.png',
      tag: data.alert_id || data.type || undefined,
      data: { url: data.url || '', type: data.type || '' },
      lang: 'ko',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '';
  // 서버는 "/compare?..." 처럼 앱 안의 경로를 보내요. 하위 경로에 배포해도 맞게 붙여요.
  const target = new URL(SCOPE + path.replace(/^\//, ''), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
