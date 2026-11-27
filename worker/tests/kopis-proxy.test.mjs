import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

const env = {
  KOPIS_API_KEY: "TEST-SERVICE-KEY",
  KOPIS_PROXY_TOKEN: "TEST-PROXY-TOKEN",
};

function request(path, token = env.KOPIS_PROXY_TOKEN) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return new Request(`https://worker.test${path}`, { headers });
}

test("KOPIS proxy rejects missing configuration and bad tokens", async () => {
  const missing = await worker.fetch(request("/api/kopis/pblprfr"), {});
  assert.equal(missing.status, 503);

  const unauthorized = await worker.fetch(request("/api/kopis/pblprfr", "wrong"), env);
  assert.equal(unauthorized.status, 401);
});

test("KOPIS proxy validates the fixed endpoint and never returns the service key", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls += 1;
    const upstream = new URL(input);
    assert.equal(upstream.origin, "https://kopis.or.kr");
    assert.equal(upstream.pathname, "/openApi/restful/pblprfr");
    assert.equal(upstream.searchParams.get("service"), env.KOPIS_API_KEY);
    assert.equal(upstream.searchParams.get("stdate"), "20261201");
    return new Response(`<root><service>${env.KOPIS_API_KEY}</service></root>`, {
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  };

  try {
    const invalid = await worker.fetch(
      request("/api/kopis/pblprfr?service=attacker&stdate=20261201&eddate=20261207&cpage=1&rows=10&signgucode=11&signgucodesub=1171"),
      env,
    );
    assert.equal(invalid.status, 400);
    assert.equal(calls, 0);

    const response = await worker.fetch(
      request("/api/kopis/pblprfr?stdate=20261201&eddate=20261207&cpage=1&rows=10&signgucode=11&signgucodesub=1171"),
      env,
    );
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(body.includes(env.KOPIS_API_KEY), false);
    assert.match(body, /\[redacted\]/);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("KOPIS proxy rejects invalid dates, oversized ranges, and arbitrary paths", async () => {
  const invalidDate = await worker.fetch(
    request("/api/kopis/pblprfr?stdate=20260230&eddate=20260302&cpage=1&rows=10&signgucode=11&signgucodesub=1171"),
    env,
  );
  assert.equal(invalidDate.status, 400);

  const oversized = await worker.fetch(
    request("/api/kopis/pblprfr?stdate=20261201&eddate=20270105&cpage=1&rows=10&signgucode=11&signgucodesub=1171"),
    env,
  );
  assert.equal(oversized.status, 400);

  const arbitrary = await worker.fetch(request("/api/kopis/anything"), env);
  assert.equal(arbitrary.status, 400);
});
