/**
 * The public share landing (#567). What it pins:
 *  - the load path is fetch → structural gate → the engine's POST /replay, so a
 *    shared bundle passes exactly the validation an imported one does;
 *  - a tampered or rejected bundle lands on an error card, never a crash or a
 *    half-rendered board;
 *  - the page works with the `replays` beta flag OFF, because a link is usually
 *    the recipient's first contact with replays.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ReplayShareLanding, sharedReplayIdFromPath } from "./ReplayShareLanding";
import type { ReplayBundle } from "@/lib/pro/protocol";
import { listReplays } from "@/lib/pro/replayStore";

// The scrubber itself is covered by #122's tests; stub it so these cases stay
// about loading and validation. (Relative specifier — the repo's jest setup
// resolves aliases for imports, not for jest.mock factories.)
jest.mock("../../components/Pro/ReplayScrubber", () => ({
  ReplayScrubber: ({ onExit }: { onExit: () => void }) => (
    <button onClick={onExit}>scrubber</button>
  ),
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

const EXPANSION = { ok: true, steps: [], catalog: {}, actionLog: [] };

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

let shareReply: Response;
let engineReply: Response;
let engineCalls: unknown[];

/** One mock for both hops: the public share read, then the engine validation. */
const wireFetch = () => {
  engineCalls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/share/replays/")) return shareReply;
    engineCalls.push(JSON.parse(String(init?.body ?? "null")));
    return engineReply;
  }) as unknown as typeof fetch;
};

const renderLanding = (id: string | null = "the-id") =>
  render(
    <ChakraProvider>
      <ReplayShareLanding id={id} />
    </ChakraProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  shareReply = reply(200, { id: "the-id", title: null, bundle, createdAt: "2026-08-05T12:00:00.000Z" });
  engineReply = reply(200, EXPANSION);
  wireFetch();
});

describe("ReplayShareLanding", () => {
  it("validates the shared bundle through the engine, then offers the scrubber", async () => {
    renderLanding();

    expect(await screen.findByRole("button", { name: /watch replay/i })).toBeInTheDocument();
    // Validated the same way an imported bundle is: POST the bundle to /replay.
    expect(engineCalls).toEqual([bundle]);
    // Falls back to a label built from the bundle when the upload had no title.
    expect(screen.getByText(/King Kong vs Thrall/)).toBeInTheDocument();
  });

  it("prefers the uploader's title when there is one", async () => {
    shareReply = reply(200, { id: "the-id", title: "Grand final, game 3", bundle, createdAt: "" });
    wireFetch();

    renderLanding();

    expect(await screen.findByText("Grand final, game 3")).toBeInTheDocument();
  });

  it("works with the replays beta flag switched off", async () => {
    window.localStorage.setItem("flag-replays", "off");

    renderLanding();

    expect(await screen.findByRole("button", { name: /watch replay/i })).toBeInTheDocument();
  });

  it("opens the scrubber and comes back to the landing on exit", async () => {
    renderLanding();

    fireEvent.click(await screen.findByRole("button", { name: /watch replay/i }));
    fireEvent.click(screen.getByRole("button", { name: "scrubber" }));

    expect(await screen.findByRole("button", { name: /watch replay/i })).toBeInTheDocument();
  });

  it("saves the replay to the local store on demand", async () => {
    renderLanding();

    fireEvent.click(await screen.findByRole("button", { name: /save to my device/i }));

    await waitFor(() => expect(listReplays()).toHaveLength(1));
    expect(listReplays()[0].heroes).toEqual(["king-kong", "thrall"]);
    expect(screen.getByRole("button", { name: /saved to this device/i })).toBeInTheDocument();
  });

  it("shows a not-found card for a deleted or unknown id", async () => {
    shareReply = reply(404, { error: "not_found" });
    wireFetch();

    renderLanding();

    expect(await screen.findByText(/replay not found/i)).toBeInTheDocument();
    expect(engineCalls).toEqual([]);
  });

  it("shows a validation error (not a crash) for a tampered bundle", async () => {
    shareReply = reply(200, { id: "the-id", title: null, bundle: { v: 1, engine: {}, config: {} }, createdAt: "" });
    wireFetch();

    renderLanding();

    expect(await screen.findByText(/corrupted/i)).toBeInTheDocument();
    // The structural gate caught it before the engine round-trip.
    expect(engineCalls).toEqual([]);
    expect(screen.queryByRole("button", { name: /watch replay/i })).toBeNull();
  });

  it("surfaces the engine's own rejection of an illegal action log", async () => {
    engineReply = reply(400, { ok: false, message: "action 3 is illegal for king-kong" });
    wireFetch();

    renderLanding();

    expect(await screen.findByText(/action 3 is illegal/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /watch replay/i })).toBeNull();
  });

  it("keeps spinning while the router has not produced an id yet", () => {
    renderLanding(null);

    expect(screen.getByText(/loading shared replay/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // The static export serves 404.html for these URLs; pages/404.tsx uses this
  // to render the landing in place rather than the "Whoops!" copy.
  describe("sharedReplayIdFromPath (the GitHub Pages 404 rescue)", () => {
    it.each([
      ["/share/replay/11111111-2222-3333-4444-555555555555", "11111111-2222-3333-4444-555555555555"],
      ["/share/replay/abc?utm=discord", "abc"],
      ["/share/replay/a%20b", "a b"],
    ])("reads the id out of %s", (path, id) => {
      expect(sharedReplayIdFromPath(path)).toBe(id);
    });

    it.each(["/", "/404", "/share/replay", "/share/replay/a/b", "/pro/replays", "/online/lobby/user"])(
      "leaves %s alone",
      (path) => {
        expect(sharedReplayIdFromPath(path)).toBeNull();
      },
    );
  });

  it("reports an unreachable API without throwing", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    renderLanding();

    expect(await screen.findByText(/couldn't reach the account service/i)).toBeInTheDocument();
  });
});
