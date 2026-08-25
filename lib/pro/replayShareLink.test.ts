/**
 * "Copy share link" with frames-at-upload (#701).
 *
 * The share is the product; the frames are insurance. So the cases worth pinning
 * are the ones where the insurance can't be had — a refusing engine, an
 * unreachable one, a payload too fat for the 2 MB cap — because in every one of
 * them the link must still be minted and copied, exactly as it was before #701.
 */
import { shareReplayLink } from "./replayShareLink";
import { MAX_UPLOAD_BYTES } from "./replayCloud";
import { readFrames } from "./replayFrames";
import type { ReplayBundle, ReplayExpansion, ReplayStep } from "./protocol";

const step = (index: number, turnNumber: number) =>
  ({ index, turnNumber, filler: "x".repeat(64) }) as unknown as ReplayStep;

const bundle: ReplayBundle = {
  v: 1,
  engine: { schemaVersion: 5, dslVersion: "0.64.0" },
  config: {
    seed: 1,
    players: { p1: { heroId: "king-kong", hero: {}, cards: [] }, p2: { heroId: "thrall", hero: {}, cards: [] } },
    map: { schemaVersion: "1.0", id: "mended-drum", meta: { title: "The Mended Drum", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  },
  actionLog: [{ type: "MANEUVER", player: "p1" }, { type: "END_MANEUVER", player: "p1" }] as ReplayBundle["actionLog"],
  meta: { winner: "p1", heroes: { p1: "king-kong", p2: "thrall" }, turns: 2, endedAt: 1, mapTitle: "The Mended Drum" },
};

const expansion = (over: Partial<ReplayExpansion> = {}): ReplayExpansion =>
  ({
    ok: true,
    engine: bundle.engine,
    meta: bundle.meta,
    map: bundle.config.map,
    catalog: {},
    heroes: bundle.meta.heroes,
    steps: [step(0, 1), step(1, 1), step(2, 2)],
    finalHash: "hash",
    ...over,
  }) as ReplayExpansion;

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

let engineReply: Response | Error;
let uploaded: Array<{ title: string | null; bundle: unknown }>;
let copied: string[];

const wireFetch = () => {
  uploaded = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const href = String(url);
    if (href.endsWith("/replay")) {
      if (engineReply instanceof Error) throw engineReply;
      return engineReply;
    }
    if (href.endsWith("/replays") && init?.method === "POST") {
      uploaded.push(JSON.parse(String(init.body)));
      return reply(201, { id: "the-uuid" });
    }
    return reply(404, { error: "not_found" });
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  copied = [];
  engineReply = reply(200, expansion());
  wireFetch();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: (t: string) => { copied.push(t); return Promise.resolve(); } },
  });
});

describe("shareReplayLink", () => {
  it("expands once and uploads the frames inside the bundle", async () => {
    const res = await shareReplayLink(bundle);

    expect(res.ok).toBe(true);
    expect(res.ok && res.framesIncluded).toBe(true);
    expect(res.ok && res.url).toContain("/share/replay/the-uuid");
    expect(copied).toEqual([res.ok ? res.url : ""]);

    // The frames travel INSIDE the bundle, so the api stores them opaquely.
    expect(uploaded).toHaveLength(1);
    const frames = readFrames(uploaded[0].bundle as never);
    expect(frames?.steps).toHaveLength(3);
    expect(frames?.actionLog).toHaveLength(2);
    // …and the bundle itself is unchanged beside them.
    expect((uploaded[0].bundle as ReplayBundle).actionLog).toHaveLength(2);
    expect(uploaded[0].title).toBe("King Kong vs Thrall — The Mended Drum");
  });

  it("passes a truncated expansion through, verification and all", async () => {
    engineReply = reply(
      200,
      expansion({
        steps: [step(0, 1), step(1, 1)],
        verification: "diverged",
        divergedAtTurn: 2,
        recordedEngine: { schemaVersion: 2, dslVersion: "0.17.0" },
      }),
    );
    wireFetch();

    await shareReplayLink(bundle);

    const frames = readFrames(uploaded[0].bundle as never);
    expect(frames?.verification).toBe("diverged");
    expect(frames?.divergedAtTurn).toBe(2);
    expect(frames?.steps).toHaveLength(2);
  });

  it("still shares the link when the engine refuses to expand the bundle", async () => {
    engineReply = reply(400, { ok: false, code: "VERSION_MISMATCH", message: "recorded on an older engine" });
    wireFetch();

    const res = await shareReplayLink(bundle);

    expect(res.ok).toBe(true);
    expect(res.ok && res.framesIncluded).toBe(false);
    // Exactly the pre-#701 payload: the bundle, no frames.
    expect(readFrames(uploaded[0].bundle as never)).toBeNull();
    expect(copied).toHaveLength(1);
  });

  it("still shares the link when the engine can't be reached at all", async () => {
    engineReply = new TypeError("Failed to fetch");
    wireFetch();

    const res = await shareReplayLink(bundle);

    expect(res.ok).toBe(true);
    expect(res.ok && res.framesIncluded).toBe(false);
    expect(readFrames(uploaded[0].bundle as never)).toBeNull();
  });

  it("drops the frames rather than the share when they wouldn't fit the size cap", async () => {
    // One absurd step, so bundle+frames blows the 2 MB cap while the bundle alone
    // is a couple of KB.
    engineReply = reply(200, expansion({
      steps: [{ index: 0, turnNumber: 1, filler: "y".repeat(MAX_UPLOAD_BYTES) } as unknown as ReplayStep],
    }));
    wireFetch();

    const res = await shareReplayLink(bundle);

    expect(res.ok).toBe(true);
    expect(res.ok && res.framesIncluded).toBe(false);
    expect(readFrames(uploaded[0].bundle as never)).toBeNull();
  });

  it("reports an upload refusal without pretending a link exists", async () => {
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/replay")) return reply(200, expansion());
      if (init?.method === "POST") return reply(409, { error: "cap_reached" });
      return reply(404, {});
    }) as unknown as typeof fetch;

    const res = await shareReplayLink(bundle);

    expect(res.ok).toBe(false);
    expect(!res.ok && res.title).toBe("Cloud replays are full");
    expect(copied).toEqual([]);
  });
});
