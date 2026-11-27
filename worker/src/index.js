const AREAS = Object.freeze({
  "olympic-park": "올림픽공원",
  "jamsil": "잠실 관광특구",
});

const CACHE_SECONDS = 300;
const SOURCE = "서울특별시 공공데이터 · 서울시 실시간 도시데이터";

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
