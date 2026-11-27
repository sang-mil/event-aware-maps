const AREAS = Object.freeze({
  "olympic-park": "올림픽공원",
  "jamsil": "잠실 관광특구",
});

const CACHE_SECONDS = 300;
const SOURCE = "서울특별시 공공데이터 · 서울시 실시간 도시데이터";
const KOPIS_API = "https://kopis.or.kr/openApi/restful";

function normalizeCityData(payload) {
  const city = payload?.CITYDATA;
  const population = city?.LIVE_PPLTN_STTS;
  if (!city || typeof city !== "object") return null;

  const crowd = Array.isArray(population)
    ? population[0]
    : population && typeof population === "object"
      ? population
      : city;
  const pick = (key) => {
    const value = crowd?.[key];
    return typeof value === "string" || typeof value === "number" ? value : null;
  };

  return {
    area: {
      name: typeof city.AREA_NM === "string" ? city.AREA_NM : null,
      code: typeof city.AREA_CD === "string" ? city.AREA_CD : null,
    },
    crowd: {
      level: pick("AREA_CONGEST_LVL"),
      message: pick("AREA_CONGEST_MSG"),
      population_min: pick("AREA_PPLTN_MIN"),
      population_max: pick("AREA_PPLTN_MAX"),
      observed_at: pick("PPLTN_TIME"),
    },
    source: SOURCE,
  };
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": status === 200 ? `public, max-age=${CACHE_SECONDS}` : "no-store",
      ...extraHeaders,
    },
  });
}

function kopisResponse(body, status = 200, contentType = "application/xml; charset=utf-8") {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validDate(value) {
  if (!/^\d{8}$/.test(value ?? "")) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isValidKopisRequest(url, match) {
  const [, resource, id] = match;
  if (id) {
    if (url.search) return false;
    return resource === "pblprfr" ? /^PF\d{6,}$/.test(id) : /^FC\d{6}$/.test(id);
  }
  if (resource !== "pblprfr") return false;
  const allowed = new Set(["stdate", "eddate", "cpage", "rows", "signgucode", "signgucodesub"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return false;
  }
  const start = url.searchParams.get("stdate");
  const end = url.searchParams.get("eddate");
  const page = url.searchParams.get("cpage");
  const rows = url.searchParams.get("rows");
  if (!validDate(start) || !validDate(end) || !/^\d{1,3}$/.test(page ?? "") || Number(page) < 1 || Number(page) > 999) return false;
  if (!/^\d{1,3}$/.test(rows ?? "") || Number(rows) < 1 || Number(rows) > 100) return false;
  if (url.searchParams.get("signgucode") !== "11" || url.searchParams.get("signgucodesub") !== "1171") return false;
  const startDay = Date.UTC(Number(start.slice(0, 4)), Number(start.slice(4, 6)) - 1, Number(start.slice(6, 8)));
  const endDay = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(4, 6)) - 1, Number(end.slice(6, 8)));
  const span = (endDay - startDay) / 86_400_000 + 1;
  return span > 0 && span <= 31;
}

async function fetchKopis(request, env) {
  if (!env.KOPIS_API_KEY || !env.KOPIS_PROXY_TOKEN) {
    return jsonResponse({ error: "service_not_configured" }, 503);
  }
  if (request.headers.get("Authorization") !== `Bearer ${env.KOPIS_PROXY_TOKEN}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/kopis\/(pblprfr|prfplc)(?:\/([A-Z0-9]+))?$/);
  if (!match || !isValidKopisRequest(url, match)) {
    return jsonResponse({ error: "invalid_kopis_request" }, 400);
  }

  const upstreamPath = `/${match[1]}${match[2] ? `/${match[2]}` : ""}`;
  const upstreamUrl = new URL(`${KOPIS_API}${upstreamPath}`);
  for (const [name, value] of url.searchParams) upstreamUrl.searchParams.set(name, value);
  upstreamUrl.searchParams.set("service", env.KOPIS_API_KEY);

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/xml, text/xml" },
      signal: AbortSignal.timeout(15_000),
      redirect: "manual",
    });
  } catch {
    return jsonResponse({ error: "upstream_unavailable" }, 502);
  }

  if (!upstream.ok) {
    return jsonResponse({ error: "upstream_error", status: upstream.status }, upstream.status);
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("xml") && !contentType.includes("text/plain")) {
    return jsonResponse({ error: "invalid_upstream_response" }, 502);
  }

  let body;
  try {
    body = await upstream.text();
  } catch {
    return jsonResponse({ error: "invalid_upstream_response" }, 502);
  }
  const encodedKey = encodeURIComponent(env.KOPIS_API_KEY);
  body = body.replaceAll(env.KOPIS_API_KEY, "[redacted]").replaceAll(encodedKey, "[redacted]");
  if (!body.trimStart().startsWith("<")) {
    return jsonResponse({ error: "invalid_upstream_response" }, 502);
  }
  return kopisResponse(body);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    if (url.pathname.startsWith("/api/kopis/")) {
      return fetchKopis(request, env);
    }

    const match = url.pathname.match(/^\/api\/realtime\/([a-z-]+)$/);
    const areaName = match ? AREAS[match[1]] : undefined;
    if (!areaName) {
      return jsonResponse({ error: "unknown_area" }, 404);
    }

    if (!env.SEOUL_CITYDATA_KEY) {
      return jsonResponse({ error: "service_not_configured" }, 503);
    }

    // The upstream API requires HTTP and places the key in the URL path.
    // Never log this URL or return upstream error bodies, which may echo it.
    const upstreamUrl = new URL(
      `/${encodeURIComponent(env.SEOUL_CITYDATA_KEY)}/json/citydata/1/5/${encodeURIComponent(areaName)}`,
      "http://openapi.seoul.go.kr:8088",
    );
    const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
      });
    } catch {
      return jsonResponse({ error: "upstream_unavailable" }, 502);
    }

    if (!upstream.ok) {
      return jsonResponse({ error: "upstream_error", status: upstream.status }, 502);
    }

    if (!upstream.headers.get("content-type")?.includes("json")) {
      return jsonResponse({ error: "invalid_upstream_response" }, 502);
    }

    let payload;
    try {
      payload = await upstream.json();
    } catch {
      return jsonResponse({ error: "invalid_upstream_response" }, 502);
    }

    const data = normalizeCityData(payload);
    if (!data) {
      return jsonResponse({ error: "invalid_upstream_response" }, 502);
    }

    const response = jsonResponse(data, 200, {
      "Access-Control-Expose-Headers": "X-Data-Source, X-Data-Retrieved-At",
      "X-Data-Source": SOURCE,
      "X-Data-Retrieved-At": new Date().toISOString(),
    });
    await cache.put(cacheKey, response.clone());
    return response;
  },
};
