/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import vm from "vm";

/**
 * public/irl-sw.js (issue #801) run for real inside a vm, against an
 * in-memory Cache Storage and a scripted network. The worker is plain JS with
 * no bundler, so this is the only thing standing between a typo in it and
 * every installed phone.
 */
const SOURCE = fs.readFileSync(
  path.join(__dirname, "../../public/irl-sw.js"),
  "utf8",
);
const ORIGIN = "https://unbrewed.xyz";
const DECK_API = "https://engine.unbrewed.xyz/api/unmatched-deck/";

type Req = { url: string; method?: string; mode?: string; destination?: string };
type Key = string | Req;

const hrefOf = (key: Key) =>
  new URL(typeof key === "string" ? key : key.url, ORIGIN).href;

/** Enough of an opaque response: status 0, never `ok`. */
const opaque = (): any => ({ type: "opaque", ok: false, status: 0, clone: opaque });

class FakeCache {
  entries: { href: string; res: any }[] = [];
  private index = (key: Key) => this.entries.findIndex((e) => e.href === hrefOf(key));
  async match(key: Key) {
    const i = this.index(key);
    return i < 0 ? undefined : this.entries[i].res.clone();
  }
  async put(key: Key, res: any) {
    // Same as Cache Storage: a put replaces, and the entry moves to the end.
    await this.delete(key);
    this.entries.push({ href: hrefOf(key), res });
  }
  async delete(key: Key) {
    const i = this.index(key);
    if (i >= 0) this.entries.splice(i, 1);
    return i >= 0;
  }
  async keys() {
    return this.entries.map((e) => ({ url: e.href }));
  }
  hrefs() {
    return this.entries.map((e) => e.href.replace(ORIGIN, ""));
  }
}

type Route = (init?: RequestInit) => any;

const boot = (search = "?v=abc123") => {
  const listeners: Record<string, (event: any) => void> = {};
  const store = new Map<string, FakeCache>();
  const routes: Record<string, Route> = {};
  const net = { offline: false };
  const fetch = jest.fn(async (input: Key, init?: RequestInit) => {
    if (net.offline) throw new TypeError("Failed to fetch");
    const route = routes[hrefOf(input)];
    if (!route) throw new TypeError(`no route for ${hrefOf(input)}`);
    return route(init);
  });
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new FakeCache());
      return store.get(name)!;
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  const self = {
    location: new URL(`/irl-sw.js${search}`, ORIGIN),
    addEventListener: (type: string, fn: (event: any) => void) => {
      listeners[type] = fn;
    },
    skipWaiting: jest.fn(async () => undefined),
    clients: { claim: jest.fn(async () => undefined) },
  };
  vm.runInContext(
    SOURCE,
    vm.createContext({ self, caches, fetch, URL, setTimeout, clearTimeout }),
  );

  /** Dispatch an extendable event and wait for everything it extended. */
  const extend = async (type: string, fields: object = {}) => {
    const waits: Promise<unknown>[] = [];
    listeners[type]({ ...fields, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  /** Dispatch a fetch; undefined means the worker passed it through. */
  const request = (req: Req): Promise<any> | undefined => {
    let responded: Promise<any> | undefined;
    listeners.fetch({
      request: { method: "GET", mode: "no-cors", destination: "", ...req },
      respondWith: (p: Promise<any>) => {
        responded = p;
      },
    });
    return responded;
  };
  const cache = (name: string) => store.get(name) ?? new FakeCache();
  return { self, store, routes, net, fetch, extend, request, cache };
};

const SHELL_HTML = `<!DOCTYPE html><html><head>
<style data-href="https://fonts.googleapis.com/css2?family=Space+Grotesk">@font-face{font-family:'Space Grotesk';src:url(https://fonts.gstatic.com/s/spacegrotesk/v22/a.woff2) format('woff2')}</style>
<link rel="preload" href="/_next/static/css/app.css" as="style"/><link rel="stylesheet" href="/_next/static/css/app.css"/>
<script src="/_next/static/chunks/main-1.js" defer=""></script><script src="/_next/static/chunks/pages/irl-2.js" defer=""></script>
<script src="/_next/static/build1/_buildManifest.js" defer=""></script></head><body></body></html>`;
const APP_CSS = `@font-face{font-family:bebas;src:url(/fonts/BebasNeueRegular.otf)}`;

const html = (body = SHELL_HTML) => () => new Response(body, { status: 200 });
const text = (body = "x", status = 200) => () => new Response(body, { status });

/** A booted worker whose network serves a whole /irl shell. */
const bootShell = (search?: string) => {
  const sw = boot(search);
  Object.assign(sw.routes, {
    [`${ORIGIN}/irl`]: html(),
    [`${ORIGIN}/_next/static/css/app.css`]: text(APP_CSS),
    [`${ORIGIN}/_next/static/chunks/main-1.js`]: text("main"),
    [`${ORIGIN}/_next/static/chunks/pages/irl-2.js`]: text("irl"),
    [`${ORIGIN}/_next/static/build1/_buildManifest.js`]: text("manifest"),
    [`${ORIGIN}/fonts/BebasNeueRegular.otf`]: text("otf"),
    ["https://fonts.gstatic.com/s/spacegrotesk/v22/a.woff2"]: text("woff2"),
  });
  return sw;
};

describe("irl-sw install / activate", () => {
  it("precaches the shell, the chunks it names and the fonts, then skips waiting", async () => {
    const sw = bootShell();
    await sw.extend("install");
    expect(sw.cache("irl-abc123").hrefs().sort()).toEqual(
      [
        "/_next/static/build1/_buildManifest.js",
        "/_next/static/chunks/main-1.js",
        "/_next/static/chunks/pages/irl-2.js",
        "/_next/static/css/app.css",
        "/fonts/BebasNeueRegular.otf",
        "/irl",
        "https://fonts.gstatic.com/s/spacegrotesk/v22/a.woff2",
      ].sort(),
    );
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("still installs when one named asset is missing", async () => {
    const sw = bootShell();
    delete sw.routes[`${ORIGIN}/_next/static/chunks/main-1.js`];
    await sw.extend("install");
    expect(sw.cache("irl-abc123").hrefs()).toContain("/irl");
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("fails the install when the shell itself doesn't answer 2xx", async () => {
    const sw = boot();
    sw.routes[`${ORIGIN}/irl`] = text("gone", 404);
    await expect(sw.extend("install")).rejects.toThrow(/404/);
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("deletes every other deploy's cache, keeps decks + art + foreign caches, then claims", async () => {
    const sw = boot();
    for (const name of ["irl-old999", "irl-abc123", "irl-decks", "irl-art", "pro-cache"]) {
      sw.store.set(name, new FakeCache());
    }
    await sw.extend("activate");
    expect([...sw.store.keys()].sort()).toEqual(
      ["irl-abc123", "irl-art", "irl-decks", "pro-cache"].sort(),
    );
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it("names the deploy cache after ?v= (and 'dev' without one)", async () => {
    const sw = bootShell("");
    await sw.extend("install");
    expect(sw.store.has("irl-dev")).toBe(true);
  });
});

describe("irl-sw fetch routing", () => {
  const navigate = (url: string) => ({ url, mode: "navigate", destination: "document" });

  it("serves /irl network-first, refreshing the cached shell, and falls back to it offline", async () => {
    const sw = boot();
    sw.routes[`${ORIGIN}/irl?deckId=lQz7`] = html("<p>fresh</p>");
    const online = await sw.request(navigate(`${ORIGIN}/irl?deckId=lQz7`));
    expect(await online.text()).toBe("<p>fresh</p>");
    expect(sw.cache("irl-abc123").hrefs()).toEqual(["/irl"]);
    // Past the HTTP cache: GitHub Pages' 10-minute max-age would otherwise
    // hand back the previous deploy's shell (and so its worker) after a deploy.
    expect(sw.fetch).toHaveBeenCalledWith(
      `${ORIGIN}/irl?deckId=lQz7`,
      expect.objectContaining({ cache: "no-cache", redirect: "manual" }),
    );

    sw.net.offline = true;
    const offline = await sw.request(navigate(`${ORIGIN}/irl?deckId=other&name=offline`));
    expect(await offline.text()).toBe("<p>fresh</p>");
  });

  it("settles for the cached shell when the network stalls", async () => {
    jest.useFakeTimers();
    try {
      const sw = boot();
      const shell = new FakeCache();
      await shell.put("/irl", new Response("cached"));
      sw.store.set("irl-abc123", shell);
      sw.routes[`${ORIGIN}/irl`] = () => new Promise(() => undefined); // one bar
      const pending = sw.request(navigate(`${ORIGIN}/irl`))!;
      await jest.advanceTimersByTimeAsync(4000);
      expect(await (await pending).text()).toBe("cached");
    } finally {
      jest.useRealTimers();
    }
  });

  it("an offline navigation with no cached shell fails like the network did", async () => {
    const sw = boot();
    sw.net.offline = true;
    await expect(sw.request(navigate(`${ORIGIN}/irl`))).rejects.toThrow(TypeError);
  });

  it("passes through other navigations, POSTs, and everything it has no rule for", () => {
    const sw = boot();
    expect(sw.request(navigate(`${ORIGIN}/game`))).toBeUndefined();
    expect(sw.request(navigate(`${ORIGIN}/irl-something`))).toBeUndefined();
    expect(
      sw.request({ url: `${DECK_API}lQz7`, method: "POST", destination: "" }),
    ).toBeUndefined();
    expect(sw.request({ url: "https://api.unbrewed.xyz/me", mode: "cors" })).toBeUndefined();
    expect(
      sw.request({ url: "https://cdn.counter.dev/script.js", destination: "script" }),
    ).toBeUndefined();
    expect(sw.request({ url: `${ORIGIN}/_next/data/b/irl.json` })).toBeUndefined();
  });

  it("serves /_next/static and fonts cache-first", async () => {
    const sw = bootShell();
    const chunk = { url: `${ORIGIN}/_next/static/chunks/main-1.js`, destination: "script" };
    const font = {
      url: "https://fonts.gstatic.com/s/spacegrotesk/v22/a.woff2",
      mode: "cors",
      destination: "font",
    };
    await sw.request(chunk);
    await sw.request(font);
    sw.net.offline = true;
    expect(await (await sw.request(chunk)).text()).toBe("main");
    expect(await (await sw.request(font)).text()).toBe("woff2");
    expect(sw.fetch).toHaveBeenCalledTimes(2);
  });

  it("never caches a non-2xx response", async () => {
    const sw = boot();
    sw.routes[`${ORIGIN}/_next/static/chunks/gone.js`] = text("nope", 404);
    sw.routes[`${DECK_API}nope`] = text("nope", 500);
    const res = await sw.request({ url: `${ORIGIN}/_next/static/chunks/gone.js` });
    expect(res.status).toBe(404);
    await sw.request({ url: `${DECK_API}nope`, mode: "cors" });
    expect(sw.cache("irl-abc123").hrefs()).toEqual([]);
    expect(sw.cache("irl-decks").hrefs()).toEqual([]);
  });

  it("serves deck JSON network-first with a cache fallback", async () => {
    const sw = boot();
    let version = 1;
    sw.routes[`${DECK_API}lQz7`] = () => new Response(`{"v":${version}}`);
    sw.routes[`${ORIGIN}/top-decks/lQz7.json`] = text("{}");
    const api = { url: `${DECK_API}lQz7`, mode: "cors" };

    expect(await (await sw.request(api)).text()).toBe('{"v":1}');
    version = 2; // edited on unmatched.cards: online still sees it
    expect(await (await sw.request(api)).text()).toBe('{"v":2}');
    await sw.request({ url: `${ORIGIN}/top-decks/lQz7.json`, mode: "cors" });

    sw.net.offline = true;
    expect(await (await sw.request(api)).text()).toBe('{"v":2}');
    expect(sw.cache("irl-decks").hrefs()).toEqual([
      `${DECK_API}lQz7`,
      "/top-decks/lQz7.json",
    ]);
  });

  it("serves art cache-first, keeps opaque responses, and evicts least-recently-used past 300", async () => {
    const sw = boot();
    const img = (n: number) => ({ url: `https://i.imgur.com/${n}.jpg`, destination: "image" });
    for (let n = 0; n <= 300; n++) sw.routes[img(n).url] = opaque;
    sw.routes[`${ORIGIN}/evergreen-decks/art/1Y5J/cardback.webp`] = text("webp");

    for (let n = 0; n < 300; n++) await sw.request(img(n));
    await sw.request(img(0)); // a hit: 0 is now the most recently used
    await sw.request(img(300)); // one past the cap evicts the oldest: 1
    const hrefs = sw.cache("irl-art").hrefs();
    expect(hrefs).toHaveLength(300);
    expect(hrefs).toContain("https://i.imgur.com/0.jpg");
    expect(hrefs).not.toContain("https://i.imgur.com/1.jpg");

    // Same-origin art (evergreen decks) rides the same cache, not the deck one.
    await sw.request({
      url: `${ORIGIN}/evergreen-decks/art/1Y5J/cardback.webp`,
      destination: "image",
    });
    expect(sw.cache("irl-art").hrefs()).toContain("/evergreen-decks/art/1Y5J/cardback.webp");

    sw.net.offline = true;
    expect((await sw.request(img(0))).type).toBe("opaque");
  });

  it("never answers a CORS image request with an opaque entry", async () => {
    const sw = boot();
    const url = "https://i.imgur.com/cors.jpg";
    let served: any = opaque;
    sw.routes[url] = () => served();
    await sw.request({ url, destination: "image" });
    served = () => new Response("cors body");
    const res = await sw.request({ url, mode: "cors", destination: "image" });
    expect(await res.text()).toBe("cors body");
  });

  it("leaves /_next/* alone under next dev", async () => {
    const sw = boot("?v=abc123&dev=1");
    expect(sw.request({ url: `${ORIGIN}/_next/static/chunks/main.js` })).toBeUndefined();
  });
});

describe("irl-sw warm message", () => {
  it("caches the opened deck's art (no-cors) and JSON, skipping what's cached or not a URL", async () => {
    const sw = boot();
    sw.routes["https://i.imgur.com/a.jpg"] = opaque;
    sw.routes[`${ORIGIN}/evergreen-decks/art/x.webp`] = text("webp");
    sw.routes[`${DECK_API}lQz7`] = text("{}");
    const art = new FakeCache();
    await art.put("https://i.imgur.com/cached.jpg", opaque());
    sw.store.set("irl-art", art);

    await sw.extend("message", {
      data: {
        type: "irl:warm",
        art: [
          "https://i.imgur.com/a.jpg",
          "https://i.imgur.com/a.jpg",
          "https://i.imgur.com/cached.jpg",
          "/evergreen-decks/art/x.webp",
          "https://i.imgur.com/dead.jpg",
          "data:image/png;base64,AAAA",
        ],
        decks: [`${DECK_API}lQz7`],
      },
    });

    expect(sw.cache("irl-art").hrefs().sort()).toEqual(
      [
        "/evergreen-decks/art/x.webp",
        "https://i.imgur.com/a.jpg",
        "https://i.imgur.com/cached.jpg",
      ].sort(),
    );
    expect(sw.cache("irl-decks").hrefs()).toEqual([`${DECK_API}lQz7`]);
    const fetched = sw.fetch.mock.calls.map(([input, init]) => [hrefOf(input), init]);
    expect(fetched).toContainEqual(["https://i.imgur.com/a.jpg", { mode: "no-cors" }]);
    expect(fetched.map(([href]) => href)).not.toContain("https://i.imgur.com/cached.jpg");
  });

  it("ignores messages that aren't a warm", async () => {
    const sw = boot();
    await sw.extend("message", { data: { type: "something-else", art: ["https://x/y.jpg"] } });
    await sw.extend("message", { data: null });
    expect(sw.fetch).not.toHaveBeenCalled();
  });
});
