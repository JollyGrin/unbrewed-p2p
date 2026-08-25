/**
 * What the scrubber shows for each cross-version verification state (#701 ↔
 * engine #509), against the real component — the transport bar, the timeline and
 * the action-log dock are the things that must not lie about how much of a game
 * is there.
 *
 * Mounted the way the pro page-level tests mount things (QueryClientProvider +
 * the render-fuzz polyfills): the scrubber pulls deck art through react-query,
 * which resolves to nothing here and falls back to text chips — art is a
 * nicety, and none of these assertions touch it. The HUD also probes the
 * accounts API on mount, so `mount` flushes to quiescence rather than leaving a
 * state update to land mid-assertion (#598).
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { theme } from "@/styles/style";
import { ReplayScrubber } from "./ReplayScrubber";
import { installPolyfills } from "@/scripts/renderFuzz/domEnv";
import type { Action, ReplayExpansion, ReplayStep, ReplayStepPlayer } from "@/lib/pro/protocol";

installPolyfills();

const seat = (heroId: string): ReplayStepPlayer => ({
  heroId,
  hand: [],
  deckCount: 10,
  discard: [],
  committedCard: null,
  counters: {},
});

const step = (index: number, turnNumber: number): ReplayStep => ({
  index,
  phase: "PLAY",
  turnNumber,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  fighters: [],
  tokens: [],
  combat: null,
  prompt: null,
  winner: null,
  players: { p1: seat("king-kong"), p2: seat("thrall") },
});

/** Six actions played; `stepCount` frames came back for them. */
const expansion = (stepCount: number, over: Partial<ReplayExpansion> = {}): ReplayExpansion =>
  ({
    ok: true,
    engine: { schemaVersion: 5, dslVersion: "0.64.0" },
    meta: { winner: null, heroes: { p1: "king-kong", p2: "thrall" }, turns: 6, endedAt: 1, mapTitle: "The Mended Drum" },
    map: {
      schemaVersion: "1.0",
      id: "mended-drum",
      meta: { title: "The Mended Drum", minPlayers: 2, maxPlayers: 2, specialRules: false },
      zones: [],
      spaces: [],
    },
    catalog: {},
    heroes: { p1: "king-kong", p2: "thrall" },
    steps: Array.from({ length: stepCount }, (_, i) => step(i, Math.min(6, i + 1))),
    finalHash: "hash",
    actionLog: Array.from({ length: 6 }, (_, i) => ({ type: "MANEUVER", player: `p${(i % 2) + 1}` })) as Action[],
    ...over,
  }) as ReplayExpansion;

const mount = async (exp: ReplayExpansion) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChakraProvider theme={theme}>
        <ReplayScrubber expansion={exp} />
      </ChakraProvider>
    </QueryClientProvider>,
  );
  await act(async () => {});
};

beforeEach(() => {
  // Signed out, without reaching for the network: the HUD's account probe is
  // irrelevant here and an unmocked fetch would be a real DNS lookup.
  global.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({ user: null }) })) as unknown as typeof fetch;
});

const timeline = () => screen.getByLabelText("Replay timeline") as HTMLInputElement;
const actionRows = () => screen.getAllByText(/maneuver$/i);

describe("ReplayScrubber verification states", () => {
  it("says nothing about verification for a pre-#509 response", async () => {
    await mount(expansion(7));

    expect(screen.getByText(/REPLAY · GOD VIEW/)).toBeInTheDocument();
    expect(screen.queryByText(/verified across engine versions/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    // Whole game: 7 frames for 6 actions.
    expect(timeline().max).toBe("6");
    expect(actionRows()).toHaveLength(6);
  });

  it("badges a digest-verified replay but changes nothing else", async () => {
    await mount(expansion(7, {
      verification: "digest-verified",
      recordedEngine: { schemaVersion: 2, dslVersion: "0.17.0" },
    }));

    expect(screen.getByLabelText("verified across engine versions")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(timeline().max).toBe("6");
    expect(actionRows()).toHaveLength(6);
  });

  it("explains a divergence and clamps the transport to the verified frames", async () => {
    // Diverged at turn 4: three frames survived (turns 1–3).
    await mount(expansion(3, {
      verification: "diverged",
      divergedAtTurn: 4,
      recordedEngine: { schemaVersion: 2, dslVersion: "0.17.0" },
    }));

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/stops early/i);
    expect(banner).toHaveTextContent(/from turn 4/);
    expect(banner).toHaveTextContent(/Showing turns 1 to 3/);

    // The scrubber ends at the last verified frame…
    expect(timeline().max).toBe("2");
    expect(screen.getByText("0 / 2")).toBeInTheDocument();
    // …and the action log lists only the actions those frames cover, not all six.
    expect(actionRows()).toHaveLength(2);
    // Jump-to-turn offers no turn past the truncation either.
    expect(screen.getByRole("option", { name: "turn 3" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "turn 4" })).toBeNull();
  });

  it("shows the explanation instead of an empty board when nothing verified", async () => {
    await mount(expansion(0, { verification: "diverged", divergedAtTurn: 1 }));

    expect(screen.getByRole("status")).toHaveTextContent(/no turns left/i);
    // No transport at all — there is nothing to scrub.
    expect(screen.queryByLabelText("Replay timeline")).toBeNull();
  });
});
