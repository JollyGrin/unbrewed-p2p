/**
 * The public share landing (#567). What it pins:
 *  - the load path is fetch → structural gate → the engine's POST /replay, so a
 *    shared bundle passes exactly the validation an imported one does;
 *  - a tampered or rejected bundle lands on an error card, never a crash or a
 *    half-rendered board;
 *  - the page works with the `replays` beta flag OFF, because a link is usually
 *    the recipient's first contact with replays;
 *  - and since #701, that a stored `frames` blob is played WITHOUT asking the
 *    engine (the whole point: a public link that survives engine releases),
 *    while a frames-less bundle still takes the engine path and reports what
 *    came back — verified, truncated, or refused outright.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ReplayShareLanding, sharedReplayIdFromPath } from "./ReplayShareLanding";
import type { ReplayBundle, ReplayExpansion, ReplayStep } from "@/lib/pro/protocol";
import { listReplays, loadReplay } from "@/lib/pro/replayStore";
import { framesFromExpansion } from "@/lib/pro/replayFrames";

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

const step = (index: number, turnNumber: number) =>
  ({ index, turnNumber }) as unknown as ReplayStep;

const EXPANSION = { ok: true, steps: [step(0, 1), step(1, 1)], catalog: {}, actionLog: [] };

/** A fully-expanded set of frames, as `shareReplayLink` embeds at upload. */
const FRAMES = framesFromExpansion(bundle, {
  ok: true,
  engine: { schemaVersion: 1, dslVersion: "0.11.0" },
  meta: bundle.meta,
  map: bundle.config.map,
  catalog: {},
  heroes: bundle.meta.heroes,
  steps: [step(0, 1), step(1, 1), step(2, 2)],
  finalHash: "hash",
} as ReplayExpansion);

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

  // --- verification states (#701 ↔ engine #509) ------------------------------

  it("badges a replay the engine verified across versions", async () => {
    engineReply = reply(200, {
      ...EXPANSION,
      verification: "digest-verified",
      recordedEngine: { schemaVersion: 1, dslVersion: "0.11.0" },
    });
    wireFetch();

    renderLanding();

    expect(await screen.findByLabelText(/verified across engine versions/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch replay/i })).toBeEnabled();
  });

  it("explains a truncated replay before you press play, and still lets you", async () => {
    engineReply = reply(200, {
      ...EXPANSION,
      verification: "diverged",
      divergedAtTurn: 4,
      recordedEngine: { schemaVersion: 1, dslVersion: "0.11.0" },
    });
    wireFetch();

    renderLanding();

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(/stops early/i);
    expect(banner).toHaveTextContent(/from turn 4/);
    expect(screen.getByText(/5 turns played, 3 playable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch replay/i })).toBeEnabled();
  });

  it("offers no Watch button when the divergence left no frames", async () => {
    engineReply = reply(200, { ...EXPANSION, steps: [], verification: "diverged", divergedAtTurn: 1 });
    wireFetch();

    renderLanding();

    expect(await screen.findByRole("status")).toHaveTextContent(/no turns left/i);
    expect(screen.getByRole("button", { name: /watch replay/i })).toBeDisabled();
  });

  it("names the old-bundle refusal for what it is", async () => {
    engineReply = reply(400, {
      ok: false,
      code: "VERSION_MISMATCH",
      message: "Recorded on an older engine version and can't be faithfully replayed.",
    });
    wireFetch();

    renderLanding();

    expect(await screen.findByText(/too old to replay/i)).toBeInTheDocument();
    expect(screen.getByText(/can't be faithfully replayed/i)).toBeInTheDocument();
  });

  // --- frames-at-upload (#701) ----------------------------------------------

  describe("stored frames", () => {
    beforeEach(() => {
      shareReply = reply(200, {
        id: "the-id",
        title: null,
        bundle: { ...bundle, frames: FRAMES },
        createdAt: "",
      });
      wireFetch();
    });

    it("plays the frames frozen in at upload without asking the engine", async () => {
      renderLanding();

      expect(await screen.findByRole("button", { name: /watch replay/i })).toBeInTheDocument();
      // The whole point: no /replay round-trip, so an engine that has moved on
      // can no longer break this link.
      expect(engineCalls).toEqual([]);
    });

    it("falls back to the engine when the frames are unusable", async () => {
      shareReply = reply(200, {
        id: "the-id",
        title: null,
        bundle: { ...bundle, frames: { v: 1, steps: [] } },
        createdAt: "",
      });
      wireFetch();

      renderLanding();

      expect(await screen.findByRole("button", { name: /watch replay/i })).toBeInTheDocument();
      expect(engineCalls).toEqual([{ ...bundle, frames: { v: 1, steps: [] } }]);
    });

    it("carries the frames' own truncation notice through to the recipient", async () => {
      shareReply = reply(200, {
        id: "the-id",
        title: null,
        bundle: { ...bundle, frames: { ...FRAMES, verification: "diverged", divergedAtTurn: 4 } },
        createdAt: "",
      });
      wireFetch();

      renderLanding();

      expect(await screen.findByRole("status")).toHaveTextContent(/from turn 4/);
      expect(engineCalls).toEqual([]);
    });

    it("keeps the frames out of localStorage when saving to this device", async () => {
      renderLanding();

      fireEvent.click(await screen.findByRole("button", { name: /save to my device/i }));

      await waitFor(() => expect(listReplays()).toHaveLength(1));
      const saved = loadReplay(listReplays()[0].id) as ReplayBundle & { frames?: unknown };
      expect(saved.frames).toBeUndefined();
      expect(saved.actionLog).toEqual(bundle.actionLog);
    });
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
