import * as WebPush from "@portable/web-push";

const APP_PATH = "/event/";
const DATA_BASE = "https://sang-mil.github.io/event-aware-maps/data";
const PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "web.push.apple.com",
  "updates.push.services.mozilla.com",
]);

function response(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

function validDeviceId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}

function validKey(value, min, max) {
  return typeof value === "string" && value.length >= min && value.length <= max && /^[A-Za-z0-9_+/=-]+$/.test(value);
}

function validSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") return false;
  try {
    const url = new URL(subscription.endpoint);
    const keys = subscription.keys;
    return url.protocol === "https:" && PUSH_HOSTS.has(url.hostname) &&
      validKey(keys?.p256dh, 80, 120) && validKey(keys?.auth, 16, 64);
  } catch {
    return false;
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseNotifyAt(value, now = Date.now()) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= now || time > now + 45 * 86_400_000) return null;
  return new Date(time).toISOString();
}

function makeId() {
  return crypto.randomUUID();
}

export async function handlePushRequest(request, env, url) {
  const alertId = url.pathname.match(/^\/api\/alerts\/([0-9a-f-]{36})$/i);
  const subscriptionId = url.pathname.match(/^\/api\/push\/subscriptions\/([A-Za-z0-9_-]{8,80})$/);
  const subscriptionPreferences = url.pathname.match(/^\/api\/push\/subscriptions\/([A-Za-z0-9_-]{8,80})\/preferences$/);
  const isHandled =
    (url.pathname === "/api/push/subscriptions" && request.method === "POST") ||
    (url.pathname === "/api/alerts" && request.method === "POST") ||
    (subscriptionId && request.method === "DELETE") ||
    (subscriptionPreferences && request.method === "PUT") ||
    (alertId && request.method === "DELETE");
  if (!isHandled) return null;

  const db = env.PUSH_DB;
  if (!db) return response({ error: "push_storage_not_configured" }, 503);

  if (url.pathname === "/api/push/subscriptions" && request.method === "POST") {
    const body = await readJson(request);
    if (!validDeviceId(body?.device_id) || !validSubscription(body?.subscription)) {
      return response({ error: "invalid_subscription" }, 400);
    }
    const prefs = body.preferences ?? { day_before: true, departure: false };
    if (typeof prefs.day_before !== "boolean" || typeof prefs.departure !== "boolean") {
      return response({ error: "invalid_preferences" }, 400);
    }
    const now = new Date().toISOString();
    try {
      await db.prepare(`
        INSERT INTO push_subscriptions (device_id, endpoint, p256dh, auth, day_before, departure, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          endpoint = excluded.endpoint,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          day_before = excluded.day_before,
          departure = excluded.departure,
          updated_at = excluded.updated_at
      `).bind(
        body.device_id,
        body.subscription.endpoint,
        body.subscription.keys.p256dh,
        body.subscription.keys.auth,
        Number(prefs.day_before),
        Number(prefs.departure),
        now,
        now,
      ).run();
    } catch {
      return response({ error: "subscription_conflict" }, 409);
    }
    return response({ ok: true });
  }

  if (subscriptionId && request.method === "DELETE") {
    await db.prepare("DELETE FROM push_subscriptions WHERE device_id = ?").bind(subscriptionId[1]).run();
    return response(null, 204);
  }

  if (subscriptionPreferences && request.method === "PUT") {
    const body = await readJson(request);
    if (typeof body?.day_before !== "boolean" || typeof body?.departure !== "boolean") {
      return response({ error: "invalid_preferences" }, 400);
    }
    const result = await db.prepare(`
      UPDATE push_subscriptions
      SET day_before = ?, departure = ?, updated_at = ?
      WHERE device_id = ?
    `).bind(Number(body.day_before), Number(body.departure), new Date().toISOString(), subscriptionPreferences[1]).run();
    if (!result.meta.changes) return response({ error: "subscription_not_found" }, 404);
    if (!body.departure) {
      await db.prepare("DELETE FROM alerts WHERE device_id = ? AND kind = 'departure'")
        .bind(subscriptionPreferences[1]).run();
    }
    return response({ ok: true });
  }

  if (url.pathname === "/api/alerts" && request.method === "POST") {
    const body = await readJson(request);
    const notifyAt = parseNotifyAt(body?.notify_at);
    const allowedKinds = new Set(["show_end", "game_end", "departure"]);
    if (!validDeviceId(body?.device_id) || !allowedKinds.has(body?.kind) || !notifyAt) {
      return response({ error: "invalid_alert" }, 400);
    }
    const eventId = typeof body.event_id === "string" && body.event_id.length <= 120 ? body.event_id : "";
    const stationId = typeof body.station_id === "string" && /^[a-z0-9_-]{1,80}$/.test(body.station_id) ? body.station_id : "";
    if ((body.kind === "departure" && !stationId) || (body.kind !== "departure" && !eventId)) {
      return response({ error: "invalid_alert_target" }, 400);
    }
    if (body.kind === "departure") {
      const subscription = await db.prepare("SELECT departure FROM push_subscriptions WHERE device_id = ?")
        .bind(body.device_id).first();
      if (!subscription) return response({ error: "subscription_not_found" }, 404);
      if (!subscription.departure) return response({ error: "departure_alerts_disabled" }, 409);
    }
    const id = makeId();
    const now = new Date().toISOString();
    try {
      const result = await db.prepare(`
        INSERT INTO alerts (id, device_id, kind, event_id, station_id, notify_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id, kind, event_id, station_id) DO UPDATE SET
          id = excluded.id,
          notify_at = excluded.notify_at,
          created_at = excluded.created_at
      `).bind(id, body.device_id, body.kind, eventId, stationId, notifyAt, now).run();
      if (!result.meta.changes) return response({ error: "subscription_not_found" }, 404);
    } catch {
      return response({ error: "alert_save_failed" }, 500);
    }
    const saved = await db.prepare(`
      SELECT id FROM alerts WHERE device_id = ? AND kind = ? AND event_id = ? AND station_id = ?
    `).bind(body.device_id, body.kind, eventId, stationId).first();
    return response({ alert_id: saved?.id ?? id }, 201);
  }

  if (alertId && request.method === "DELETE") {
    await db.prepare("DELETE FROM alerts WHERE id = ?").bind(alertId[1]).run();
    return response(null, 204);
  }
  return null;
}

async function sendToSubscription(row, payload, env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  try {
    const result = await WebPush.send({
      subscription: { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      payload: JSON.stringify(payload),
      vapid: {
        subject: env.VAPID_SUBJECT || "https://event-aware-maps.pages.dev",
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      },
      ttl: 3600,
    });
    if (result.kind === "gone") {
      await env.PUSH_DB.prepare("DELETE FROM push_subscriptions WHERE device_id = ?").bind(row.device_id).run();
      return false;
    }
    return result.kind === "sent";
  } catch {
    return false;
  }
}

export const STATION_NAMES = Object.freeze({
  olympic_park: "올림픽공원역",
  bangi: "방이역",
  mongchontoseong: "몽촌토성역",
  hanseong_baekje: "한성백제역",
  sports_complex: "종합운동장역",
  jamsil_saenae: "잠실새내역",
});

export async function sendDueAlerts(env, scheduledTime = Date.now()) {
  const db = env.PUSH_DB;
  if (!db || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const now = new Date(scheduledTime).toISOString();
  const retryBefore = new Date(scheduledTime - 10 * 60 * 1000).toISOString();
  const expiredBefore = new Date(scheduledTime - 6 * 60 * 60 * 1000).toISOString();
  await db.prepare("DELETE FROM alerts WHERE notify_at < ?").bind(expiredBefore).run();
  const due = await db.prepare(`
    SELECT a.id, a.device_id, a.kind, a.event_id, a.station_id, a.attempts,
      s.endpoint, s.p256dh, s.auth
    FROM alerts a JOIN push_subscriptions s ON s.device_id = a.device_id
    WHERE a.notify_at <= ? AND a.attempts < 6
      AND (a.kind <> 'departure' OR s.departure = 1)
      AND (a.last_attempt_at IS NULL OR a.last_attempt_at <= ?)
    ORDER BY a.notify_at LIMIT 5
  `).bind(now, retryBefore).all();

  for (const row of due.results ?? []) {
    const attempt = row.attempts + 1;
    await db.prepare("UPDATE alerts SET attempts = ?, last_attempt_at = ? WHERE id = ?")
      .bind(attempt, now, row.id).run();
    const isDeparture = row.kind === "departure";
    const payload = isDeparture
      ? {
          alert_id: row.id,
          title: "곧 출발할 시간이에요",
          body: `${STATION_NAMES[row.station_id] ?? "선택한 역"} 귀가 정보를 확인해 보세요.`,
          url: `/station/?id=${encodeURIComponent(row.station_id)}`,
        }
      : {
          alert_id: row.id,
          title: row.kind === "game_end" ? "경기가 곧 끝나요" : "공연이 곧 끝나요",
          body: "주변 역 혼잡도와 덜 붐비는 귀갓길을 확인해 보세요.",
          url: `${APP_PATH}?id=${encodeURIComponent(row.event_id)}&from=noti`,
        };
    const sent = await sendToSubscription(row, payload, env);
    if (sent) await db.prepare("DELETE FROM alerts WHERE id = ?").bind(row.id).run();
    else if (attempt >= 6) await db.prepare("DELETE FROM alerts WHERE id = ?").bind(row.id).run();
  }
}

function kstDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function kstHour(date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(date).find((entry) => entry.type === "hour")?.value;
}

async function sendDayBeforeAlerts(env, scheduledTime = Date.now()) {
  const db = env.PUSH_DB;
  if (!db || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const eventDate = new Date(`${kstDate(new Date(scheduledTime))}T00:00:00+09:00`);
  eventDate.setUTCDate(eventDate.getUTCDate() + 1);
  const date = kstDate(eventDate);
  const keepAfter = kstDate(new Date(scheduledTime - 30 * 86_400_000));
  await db.prepare("DELETE FROM event_day_deliveries WHERE event_date < ?").bind(keepAfter).run();
  let list;
  try {
    const response = await fetch(`${DATA_BASE}/events-${date}.json`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return;
    const payload = await response.json();
    list = payload?.data?.events ?? payload?.events;
  } catch {
    return;
  }
  if (!Array.isArray(list)) return;
  const events = list.filter((event) => event?.type === "show" && event.status !== "canceled" &&
    event.id && ["olympic_park", "jamsil"].includes(event.area));
  if (!events.length) return;
  const subs = await db.prepare("SELECT device_id FROM push_subscriptions WHERE day_before = 1").all();
  const inserts = [];
  for (const sub of subs.results ?? []) {
    for (const event of events) {
      inserts.push(db.prepare(`
        INSERT OR IGNORE INTO event_day_deliveries (device_id, event_id, event_date)
        VALUES (?, ?, ?)
      `).bind(sub.device_id, event.id, date));
    }
  }
  for (let index = 0; index < inserts.length; index += 100) {
    await db.batch(inserts.slice(index, index + 100));
  }

  const retryBefore = new Date(scheduledTime - 10 * 60 * 1000).toISOString();
  const pending = await db.prepare(`
    SELECT d.device_id, d.event_id, d.event_date, d.attempts,
      s.endpoint, s.p256dh, s.auth
    FROM event_day_deliveries d
    JOIN push_subscriptions s ON s.device_id = d.device_id
    WHERE d.event_date = ? AND d.sent_at IS NULL AND d.attempts < 6
      AND s.day_before = 1
      AND (d.last_attempt_at IS NULL OR d.last_attempt_at <= ?)
    ORDER BY d.device_id, d.event_id LIMIT 5
  `).bind(date, retryBefore).all();
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const now = new Date(scheduledTime).toISOString();
  for (const row of pending.results ?? []) {
    const event = eventsById.get(row.event_id);
    if (!event) continue;
    const attempt = row.attempts + 1;
    await db.prepare(`
      UPDATE event_day_deliveries SET attempts = ?, last_attempt_at = ?
      WHERE device_id = ? AND event_id = ? AND event_date = ?
    `).bind(attempt, now, row.device_id, row.event_id, row.event_date).run();
    const sent = await sendToSubscription(row, {
      alert_id: `${event.id}:${date}`,
      title: "내일 공연이 있어요",
      body: `${event.title} 일정이 있어요. 주변 역과 귀가 정보를 미리 확인해 보세요.`,
      url: `${APP_PATH}?id=${encodeURIComponent(event.id)}&from=noti`,
    }, env);
    if (sent) {
      await db.prepare(`
        UPDATE event_day_deliveries SET sent_at = ?
        WHERE device_id = ? AND event_id = ? AND event_date = ?
      `).bind(now, row.device_id, row.event_id, row.event_date).run();
    }
  }
}

export async function handleScheduled(controller, env) {
  if (!env.PUSH_DB) return;
  if (controller.cron === "* * * * *") await sendDueAlerts(env, controller.scheduledTime);
  if (controller.cron === "0-50/10 * * * *" && kstHour(new Date(controller.scheduledTime)) === "18") {
    await sendDayBeforeAlerts(env, controller.scheduledTime);
  }
}
