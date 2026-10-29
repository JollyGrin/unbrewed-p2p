// Cloudflare Worker: first-party reverse proxy for PostHog EU (issue #1438).
// Route it on t.unbrewed.xyz/*. Static assets go to eu-assets, everything else
// to eu.i.posthog.com. No key lives here; the browser/engine send their own.
const API_HOST = "eu.i.posthog.com";
const ASSET_HOST = "eu-assets.i.posthog.com";
const ALLOWED_ORIGINS = ["https://unbrewed.xyz", "https://www.unbrewed.xyz", "http://localhost:3000"];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    url.hostname = url.pathname.startsWith("/static/") ? ASSET_HOST : API_HOST;
    url.protocol = "https:";
    url.port = "";
    const headers = new Headers(request.headers);
    headers.set("Host", url.hostname);
    headers.delete("cookie");
    // Forward the visitor IP so PostHog geolocates them, not Cloudflare.
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) headers.set("X-Forwarded-For", ip);
    const upstream = await fetch(new Request(url.toString(), { method: request.method, headers, body: request.body }));
    const out = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
