/*
 * IRL Mode offline worker (issue #801) — a table in a basement has no signal.
 *
 * Registered ONLY by pages/irl.tsx, as `/irl-sw.js?v=<APP_COMMIT>` with
 * `{ scope: "/irl" }`: narrower than its own directory, so it controls /irl
 * and nothing else — /game, /pro, /bag and / are never touched. It still sees
 * every subresource the /irl page fetches (chunks, fonts, cross-origin card
 * art), which is all it takes for the tray to survive a reload with no
 * network. Game STATE already survives on its own (#798 keeps the pool in
 * localStorage); this worker only keeps the ASSETS.
 *
 * Plain JS, no bundler, no workbox. Three caches:
 *   irl-<sha>   the shell HTML, /_next/static chunks, fonts. One per deploy;
 *               `activate` deletes every other irl-<sha>.
 *   irl-decks   deck JSON, network-first — a deck edited on unmatched.cards
 *               still shows up while online.
 *   irl-art     card art, cache-first. Mostly opaque cross-origin responses,
 *               whose size the page can't see, so the cap is an ENTRY count.
 * Decks and art are not per deploy: they don't change when the app does, and
 * purging them on every deploy would strand every deck not reopened since.
 *
 * KILL SWITCH — if this worker ever misbehaves, replace this whole file with
 * the line below; every installed client heals on its next online load (the
 * worker clears every irl-* cache and unregisters itself):
 *
 *   self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("irl-")).map((k) => caches.delete(k)))).then(() => self.registration.unregister())));
 */

const params = new URL(self.location.href).searchParams;
const VERSION = params.get("v") || "dev";
// `next dev` chunks are neither hashed nor immutable: leave /_next/* alone.
const DEV = params.has("dev");

const SHELL_CACHE = `irl-${VERSION}`;
const DECK_CACHE = "irl-decks";
const ART_CACHE = "irl-art";
const KEEP = [SHELL_CACHE, DECK_CACHE, ART_CACHE];

// A 30-card deck plus its cardback is ~35 images; the cap is for people who
// cycle decks.
const ART_MAX_ENTRIES = 300;
const DECK_MAX_ENTRIES = 100;
// One bar of signal hangs a fetch far longer than it fails one: past this,
// a network-first request settles for the cached copy.
const NETWORK_TIMEOUT_MS = 4000;

const SHELL = "/irl";

// Assets a shell (or its CSS) names directly: chunks, local fonts, and the
// Google Fonts files Next inlines into the HTML at build.
const ASSET_RE =
  /\/_next\/static\/[^"'()\s\\]+|\/fonts\/[^"'()\s\\]+|https:\/\/fonts\.gstatic\.com\/[^"'()\s\\]+/g;

const assetUrls = (text) => [...new Set(text.match(ASSET_RE) || [])];

// Never cache a non-2xx response; an opaque one (status 0) is fine.
const cacheable = (res) => res.ok || res.type === "opaque";

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("irl-") && !KEEP.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const handler = route(event.request);
  if (handler) event.respondWith(handler(event.request));
});

// The page hands over the art (and deck JSON) of the deck it just opened, so
// a card first drawn offline still has a face.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "irl:warm") return;
  event.waitUntil(
    Promise.all([
      warm(ART_CACHE, data.art, ART_MAX_ENTRIES, { mode: "no-cors" }),
      warm(DECK_CACHE, data.decks, DECK_MAX_ENTRIES, {}),
    ]),
  );
});

/** Which strategy answers this request — `null` passes it straight through. */
function route(request) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate") {
    const isShell = url.pathname === SHELL || url.pathname === `${SHELL}/`;
    return sameOrigin && isShell ? shellNetworkFirst : null;
  }
  if (sameOrigin && url.pathname.startsWith("/_next/")) {
    return !DEV && url.pathname.startsWith("/_next/static/") ? cacheFirst : null;
  }
  if (request.destination === "image") return artCacheFirst;
  if (
    request.destination === "font" ||
    (sameOrigin && url.pathname.startsWith("/fonts/"))
  ) {
    return cacheFirst;
  }
  if (isDeckJson(url, sameOrigin)) return deckNetworkFirst;
  return null;
}

function isDeckJson(url, sameOrigin) {
  // lib/evergreenDecks.ts#DEFAULT_DECK_API, whichever host it points at.
  if (url.pathname.includes("/api/unmatched-deck/")) return true;
  return (
    sameOrigin && /^\/(top-decks|evergreen-decks)\/[^/]+\.json$/.test(url.pathname)
  );
}

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  const res = await fetch(SHELL, { cache: "no-cache" });
  // A redirected response can't answer a navigation: never keep one as the shell.
  if (!res.ok || res.redirected) {
    throw new Error(`irl-sw: shell answered ${res.status}`);
  }
  const html = await res.clone().text();
  await cache.put(SHELL, res);
  // Not just the shell: on the first load after a deploy the page's new
  // chunks arrive through the OLD worker, into the OLD cache — which this
  // worker's `activate` is about to delete. Best effort, one asset at a time
  // failing never fails the install.
  const nested = await Promise.all(
    assetUrls(html).map((url) => precacheAsset(cache, url)),
  );
  await Promise.all(
    [...new Set(nested.flat())].map((url) => precacheAsset(cache, url)),
  );
}

/** Cache one asset; a stylesheet answers with the fonts it names. */
async function precacheAsset(cache, url) {
  try {
    if (await cache.match(url)) return [];
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = url.endsWith(".css") ? await res.clone().text() : "";
    await cache.put(url, res);
    return assetUrls(text);
  } catch {
    return [];
  }
}

async function put(cache, key, res, max) {
  try {
    // A re-put moves the entry to the end of keys(), which makes keys()
    // least-recently-used first.
    await cache.put(key, res);
    if (!max) return;
    const keys = await cache.keys();
    const excess = keys.length - max;
    if (excess > 0) {
      await Promise.all(keys.slice(0, excess).map((k) => cache.delete(k)));
    }
  } catch {
    // Storage full or the body failed mid-read: serve it uncached.
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (cacheable(res)) await put(cache, request, res.clone());
  return res;
}

async function artCacheFirst(request) {
  const cache = await caches.open(ART_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  // An opaque entry can answer an <img> (no-cors), never a CORS request.
  if (cached && (cached.type !== "opaque" || request.mode === "no-cors")) {
    await put(cache, request, cached.clone(), ART_MAX_ENTRIES);
    return cached;
  }
  const res = await fetch(request);
  if (cacheable(res)) await put(cache, request, res.clone(), ART_MAX_ENTRIES);
  return res;
}

/**
 * Network first, the cached copy when the network fails — or stalls past
 * NETWORK_TIMEOUT_MS, if there is a cached copy to settle for.
 */
async function networkFirst(fetchNetwork, cacheName, key, max) {
  const cache = await caches.open(cacheName);
  const network = fetchNetwork().then(async (res) => {
    if (res.ok) await put(cache, key, res.clone(), max);
    return res;
  });
  const cached = await cache.match(key);
  if (!cached) return network;
  let timer;
  const stalled = new Promise((resolve) => {
    timer = setTimeout(() => resolve(cached.clone()), NETWORK_TIMEOUT_MS);
  });
  return Promise.race([network.catch(() => cached), stalled]).finally(() =>
    clearTimeout(timer),
  );
}

function shellNetworkFirst(request) {
  // Revalidate rather than trust the HTTP cache: GitHub Pages serves HTML
  // with a 10-minute max-age, and the shell is what names the chunks — a
  // stale one keeps registering the previous deploy's worker. A redirect
  // comes back opaque (never cached) for the browser to follow.
  const revalidate = () =>
    fetch(request.url, {
      cache: "no-cache",
      credentials: "same-origin",
      redirect: "manual",
    });
  return networkFirst(revalidate, SHELL_CACHE, SHELL);
}

function deckNetworkFirst(request) {
  return networkFirst(() => fetch(request), DECK_CACHE, request, DECK_MAX_ENTRIES);
}

/** Fetch each url not yet cached, a few at a time; failures are skipped. */
async function warm(cacheName, urls, max, init) {
  if (!Array.isArray(urls)) return;
  const cache = await caches.open(cacheName);
  const hrefs = [];
  for (const url of urls.slice(0, max)) {
    try {
      const href = new URL(url, self.location.origin).href;
      if (/^https?:/.test(href)) hrefs.push(href);
    } catch {
      // not a URL — skip it
    }
  }
  const queue = [...new Set(hrefs)];
  const worker = async () => {
    for (let href = queue.shift(); href; href = queue.shift()) {
      try {
        if (await cache.match(href, { ignoreVary: true })) continue;
        const res = await fetch(href, init);
        if (cacheable(res)) await put(cache, href, res, max);
      } catch {
        // offline or a dead link: that face renders without art
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}
