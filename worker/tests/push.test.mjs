import test from "node:test";
import assert from "node:assert/strict";
import { handlePushRequest, handleScheduled, sendDueAlerts, STATION_NAMES } from "../src/push.js";

function fakeDb({ departure = 0, dueResults = [] } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) { call.values = values; return this; },
        async run() { return { meta: { changes: 1 } }; },
        async first() { return sql.includes("SELECT departure") ? { departure } : null; },
        async all() { return { results: sql.includes("SELECT a.id") ? dueResults : [] }; },
      };
    },
  };
}

function request(path, method, body) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("departure alert requires the device preference to be enabled", async () => {
  const db = fakeDb({ departure: 0 });
  const response = await handlePushRequest(request("/api/alerts", "POST", {
    device_id: "device_12345678",
    kind: "departure",
    station_id: "jamsil_saenae",
    notify_at: new Date(Date.now() + 60_000).toISOString(),
  }), { PUSH_DB: db }, new URL("https://worker.test/api/alerts"));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "departure_alerts_disabled" });
});

test("turning departure alerts off removes their pending server reservations", async () => {
  const db = fakeDb();
  const response = await handlePushRequest(request("/api/push/subscriptions/device_12345678/preferences", "PUT", {
    day_before: true,
    departure: false,
  }), { PUSH_DB: db }, new URL("https://worker.test/api/push/subscriptions/device_12345678/preferences"));

  assert.equal(response.status, 200);
  assert.ok(db.calls.some(({ sql, values }) => sql.includes("DELETE FROM alerts") && values[0] === "device_12345678"));
});

test("scheduled-alert query selects attempts and excludes disabled departure subscriptions", async () => {
  const db = fakeDb();
  await sendDueAlerts({ PUSH_DB: db, VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private" }, Date.now());
  const query = db.calls.find(({ sql }) => sql.includes("SELECT a.id"))?.sql ?? "";
  assert.match(query, /a\.attempts/);
  assert.match(query, /s\.departure = 1/);
});

test("station labels use the canonical IDs sent by the frontend", () => {
  assert.equal(STATION_NAMES.sports_complex, "종합운동장역");
  assert.equal(STATION_NAMES.jamsil_saenae, "잠실새내역");
  assert.equal(STATION_NAMES.jamsil, undefined);
  assert.equal(STATION_NAMES.jamsilsaenae, undefined);
});

test("day-before schedule runs at 18:00 KST and not at 09:00 KST", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return Response.json({ data: { events: [] } });
  };
  try {
    const db = fakeDb();
    const env = { PUSH_DB: db, VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private" };
    await handleScheduled({ cron: "0-50/10 * * * *", scheduledTime: Date.parse("2026-11-28T00:00:00Z") }, env);
    assert.equal(requested.length, 0);
    await handleScheduled({ cron: "0-50/10 * * * *", scheduledTime: Date.parse("2026-11-28T09:00:00Z") }, env);
    // 09:00 UTC is 18:00 in Seoul; it should fetch the next day's event list.
    assert.equal(requested.length, 1);
    assert.match(requested[0], /events-2026-11-29\.json$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
