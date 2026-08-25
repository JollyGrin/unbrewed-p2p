/**
 * Cloud upload + share links on the replays browser (#567).
 *
 * The invariants worth pinning are the failure ones: a signed-out visitor and a
 * dead accounts API both leave this page exactly as it was before accounts
 * existed (no cloud section, no upload button), and the two server refusals a
 * user can actually hit — the 50-replay cap and the 2 MB size limit — surface
 * as readable toasts rather than a silent no-op.
 *
 * Nothing here polls the DOM (#598). Every request the component makes is a
 * jest mock that settles on the microtask queue, so "the page has caught up"
 * is a flush — see `settle()` — and every assertion below is a synchronous
 * query with no wall clock in the loop.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ReplaysBrowser } from "./ReplaysBrowser";
import type { ReplayBundle } from "@/lib/pro/protocol";
import { API_URL } from "@/lib/account/apiUrl";
import { CLOUD_REPLAY_CAP } from "@/lib/pro/replayCloud";
import { saveReplay } from "@/lib/pro/replayStore";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

/**
 * A router whose `query` each test can set before rendering, so the `?open=`
 * deep-link paths (#698) are exercised through the real effect. `replace` is a
 * spy: the fix both redirects a uuid to /share/replay and strips a resolved
 * `open` param, and both are `router.replace` calls.
 */
let routerQuery: Record<string, string> = {};
let replaced: unknown[] = [];

jest.mock("next/router", () => ({
  useRouter: () => ({
    isReady: true,
    pathname: "/pro/replays",
    query: routerQuery,
    replace: (...args: unknown[]) => {
      replaced.push(args[0]);
      return Promise.resolve(true);
    },
  }),
}));

jest.mock("../../components/Pro/ReplayScrubber", () => ({
  ReplayScrubber: () => <div>scrubber</div>,
}));

const bundle: ReplayBundle = {
  v: 1,
  engine: { schemaVersion: 1, dslVersion: "0.11.0" },
  config: {
    seed: 1,
    players: { p1: { heroId: "king-kong", hero: {}, cards: [] }, p2: { heroId: "thrall", hero: {}, cards: [] } },
    map: { schemaVersion: "1.0", id: "mended-drum", meta: { title: "The Mended Drum", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  },
  actionLog: [],
  meta: { winner: "p2", heroes: { p1: "king-kong", p2: "thrall" }, turns: 5, endedAt: 1_720_000_000_000, mapTitle: "The Mended Drum" },
};

const USER = { id: "u1", username: "JollyGrin", avatarUrl: null };

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

type Routes = {
  me?: Response;
  list?: Response;
  upload?: Response;
};

let routes: Routes;
let posted: unknown[];
let deleted: string[];
let copied: string[];

/** Route the endpoints this component touches; anything else 404s. */
const wireFetch = () => {
  posted = [];
  deleted = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const href = String(url);
    if (href.endsWith("/me")) return routes.me ?? reply(401, { user: null });
    if (href.endsWith("/replays") && init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)));
      return routes.upload ?? reply(201, { id: "the-id" });
    }
    if (href.endsWith("/replays")) return routes.list ?? reply(200, { replays: [] });
    if (init?.method === "DELETE") {
      deleted.push(href.split("/replays/")[1]);
      routes.list = reply(200, { replays: [] });
      return reply(204, null);
    }
    return reply(404, { error: "not_found" });
  }) as unknown as typeof fetch;
};

/**
 * Let the component finish reacting to its mocked requests.
 *
 * `act` drains the microtask queue and the effects those microtasks schedule,
 * to quiescence — one call covers the whole `/me` → signed-in → `GET /replays`
 * → rendered chain. Waiting this way instead of with `findBy*` is what makes
 * the suite deterministic under a loaded parallel `jest` run (#598): `findBy*`
 * retries its query against a real 1-second clock, and a single accessible-name
 * query over this Chakra-rendered page costs ~0.25 s even on an idle machine,
 * so under CPU contention one attempt can eat the entire budget and "time out"
 * on an element that was already in the DOM.
 */
const settle = () => act(async () => {});

const renderBrowser = () =>
  render(
    <ChakraProvider>
      <ReplaysBrowser />
    </ChakraProvider>,
  );

/**
 * Queried by label rather than by role+name: it is the same `aria-label`
 * either way, and `ByLabelText` is a couple of orders of magnitude cheaper
 * than computing accessible names for every button on the page.
 */
const uploadButton = () => screen.getByLabelText(/copy share link for King Kong vs Thrall/i);
const noUploadButton = () => screen.queryByLabelText(/copy share link for King Kong vs Thrall/i);

beforeEach(() => {
  routerQuery = {};
  replaced = [];
  window.localStorage.clear();
  __resetAccountStoreForTests();
  routes = { me: reply(200, { user: USER }) };
  wireFetch();
  copied = [];
  Object.assign(navigator, {
    clipboard: { writeText: (text: string) => { copied.push(text); return Promise.resolve(); } },
  });
  saveReplay(bundle);
});

describe("ReplaysBrowser cloud upload", () => {
  it("uploads with the local replay's label and copies the share link", async () => {
    renderBrowser();
    await settle();

    fireEvent.click(uploadButton());
    await settle();

    expect(posted).toHaveLength(1);
    expect(posted[0]).toEqual({ title: "King Kong vs Thrall — The Mended Drum", bundle });
    expect(copied).toEqual([`${window.location.origin}/share/replay/the-id`]);
    expect(screen.getByText("Share link copied")).toBeInTheDocument();
  });

  it("toasts a friendly message when the 50-replay cap is reached", async () => {
    routes.upload = reply(409, { error: "cap_reached", cap: CLOUD_REPLAY_CAP });
    wireFetch();

    renderBrowser();
    await settle();

    fireEvent.click(uploadButton());
    await settle();

    expect(screen.getByText("Cloud replays are full")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`cloud replays are full \\(${CLOUD_REPLAY_CAP}\\)`, "i")),
    ).toBeInTheDocument();
    expect(copied).toEqual([]);
  });

  it("toasts a friendly message when the replay is over the 2 MB limit", async () => {
    routes.upload = reply(413, { error: "too_large", limit: 2097152 });
    wireFetch();

    renderBrowser();
    await settle();

    fireEvent.click(uploadButton());
    await settle();

    expect(screen.getByText("Couldn't upload that replay")).toBeInTheDocument();
    expect(screen.getByText(/over 2 MB/)).toBeInTheDocument();
  });

  it("lists the user's cloud replays with the cap, and deletes one", async () => {
    routes.list = reply(200, {
      replays: [{ id: "cloud-1", title: "Grand final", bytes: 2048, createdAt: "2026-08-05T12:00:00.000Z" }],
    });
    wireFetch();

    renderBrowser();
    await settle();

    expect(screen.getByText("My cloud replays")).toBeInTheDocument();
    expect(screen.getByText(`1/${CLOUD_REPLAY_CAP}`)).toBeInTheDocument();
    expect(screen.getByText("Grand final")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/copy share link for Grand final/i));
    expect(copied).toEqual([`${window.location.origin}/share/replay/cloud-1`]);

    fireEvent.click(screen.getByLabelText(/delete Grand final from the cloud/i));
    await settle();

    expect(deleted).toEqual(["cloud-1"]);
    expect(screen.queryByText("Grand final")).toBeNull();
    expect(screen.getByText(`0/${CLOUD_REPLAY_CAP}`)).toBeInTheDocument();
  });

  it("shows nothing cloud-related to a signed-out visitor", async () => {
    routes.me = reply(401, { user: null });
    wireFetch();

    renderBrowser();
    await settle();

    // The local list still renders — guest behaviour is unchanged.
    expect(screen.getByText(/The Mended Drum/)).toBeInTheDocument();
    expect(screen.queryByText("My cloud replays")).toBeNull();
    expect(noUploadButton()).toBeNull();
  });

  it("behaves exactly as before when the accounts API is unreachable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    renderBrowser();
    await settle();

    expect(screen.getByText(/The Mended Drum/)).toBeInTheDocument();
    expect(screen.queryByText("My cloud replays")).toBeNull();
    expect(noUploadButton()).toBeNull();
  });

  it("hides the upload button when the listing call fails even though /me worked", async () => {
    routes.list = reply(500, { error: "boom" });
    wireFetch();

    renderBrowser();
    await settle();

    expect(screen.getByText(/The Mended Drum/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/replays`, expect.anything());
    expect(noUploadButton()).toBeNull();
  });
});

/**
 * `?open=<id>` is a localStorage deep-link, not a share link (#698). A player
 * copied one out of the address bar, sent it, and the recipient got a blank
 * page: the miss was a silent no-op. These pin the three outcomes.
 */
describe("ReplaysBrowser ?open= deep-links", () => {
  /** The id `saveReplay(bundle)` filed the fixture under. */
  const savedId = () => JSON.parse(window.localStorage.getItem("unbrewed:pro:replays:index")!)[0].id;

  it("explains the miss when the id isn't saved in this browser", async () => {
    routerQuery = { open: "r80279f0e" };

    renderBrowser();
    await settle();

    expect(screen.getByRole("status")).toHaveTextContent(/isn't saved in this browser/i);
    expect(screen.getByRole("status")).toHaveTextContent(/share link/i);
    expect(screen.getByRole("status")).toHaveTextContent(/\.json/i);
    // Not a redirect, and the page still works underneath the notice.
    expect(replaced).toEqual([]);
    expect(screen.getByText(/The Mended Drum/)).toBeInTheDocument();
  });

  it("explains the miss for an id that is neither shape", async () => {
    routerQuery = { open: "totally-bogus" };

    renderBrowser();
    await settle();

    expect(screen.getByRole("status")).toHaveTextContent(/isn't saved in this browser/i);
    expect(replaced).toEqual([]);
  });

  it("routes a uuid to the public share landing instead of missing locally", async () => {
    routerQuery = { open: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" };

    renderBrowser();
    await settle();

    expect(replaced).toEqual(["/share/replay/3f2504e0-4f89-11d3-9a0c-0305e82c3301"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("opens a saved replay and strips the local-only param from the URL", async () => {
    const id = savedId();
    routerQuery = { open: id };
    // The scrubber renders off the engine's expansion; /replay is the gate.
    const inner = global.fetch as unknown as jest.Mock;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/replay")) return reply(200, { ok: true, steps: [], catalog: {} });
      return inner(url, init);
    }) as unknown as typeof fetch;

    renderBrowser();
    await settle();

    expect(screen.getByText("scrubber")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(replaced).toEqual([{ pathname: "/pro/replays", query: {} }]);
  });

  it("keeps the param when the replay fails to open, so nothing lies about success", async () => {
    const id = savedId();
    routerQuery = { open: id };
    const inner = global.fetch as unknown as jest.Mock;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/replay")) return reply(500, { error: "boom" });
      return inner(url, init);
    }) as unknown as typeof fetch;

    renderBrowser();
    await settle();

    expect(screen.queryByText("scrubber")).toBeNull();
    expect(replaced).toEqual([]);
  });
});
