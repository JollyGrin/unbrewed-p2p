import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { PlayerId, PlayerView, ProMapDef, ViewPlayer } from "@/lib/pro/protocol";

/**
 * Cecil Palmer's BROADCAST pill on the HUD nameplate (issue #668 ↔ engine #456).
 *
 * The registry mapping is unit-tested in lib/pro/heroStateFlags.test.ts; what is
 * pinned HERE is that the plate actually renders it, and — the Cairne lesson, with
 * teeth — that it renders on the OPPONENT's plate too. This dial is not merely
 * informative to them: it is literally how far Cecil's attacks currently reach, so a
 * seat that cannot read it cannot tell which of its fighters are safe. RULING R8
 * says the count is public; "face down" in the rule card means UNEARNED.
 */

jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => ({ status: "guest", account: null }),
}));

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 4, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [],
};

const seat = (
  id: PlayerId,
  you: boolean,
  heroId: string,
  counters: Record<string, number>
): ViewPlayer => ({
  id,
  heroId,
  you,
  team: id,
  hand: you ? [] : undefined,
  handCount: 0,
  deckCount: 0,
  discard: [],
  ongoingScheme: null,
  hasCommitted: false,
  counters,
  flags: {},
  wonCombatThisTurn: false,
  lostCombatThisTurn: false,
  firstAttackThisTurn: false,
  playedACardThisTurn: false,
  tookDamageThisTurn: false,
});

const makeView = (players: ViewPlayer[], you: PlayerId): PlayerView => {
  const self = players.find((p) => p.id === you)!;
  return {
    you,
    phase: "PLAY",
    turnNumber: 1,
    activePlayer: you,
    actionsRemaining: 1,
    turnPhase: "ACTION_SELECT",
    maneuver: null,
    map: MAP,
    catalog: {},
    fighters: [],
    tokens: [],
    self: {
      id: self.id,
      heroId: self.heroId,
      hand: [],
      deckCount: 0,
      discard: [],
      ongoingScheme: null,
      committedCard: null,
      counters: self.counters,
      flags: {},
      wonCombatThisTurn: false,
      lostCombatThisTurn: false,
      firstAttackThisTurn: false,
      playedACardThisTurn: false,
      tookDamageThisTurn: false,
    },
    opponent: null,
    players,
    combat: null,
    prompt: null,
    winner: null,
  };
};

const renderHud = (view: PlayerView) =>
  render(
    <ChakraProvider>
      <ProHud
        view={view}
        status="open"
        roomId="room-1"
        resolveCard={() => null}
        resolveHero={() => null}
        labelFor={() => ""}
      />
    </ChakraProvider>
  );

describe("Cecil Palmer's BROADCAST pill on the HUD plates", () => {
  it("reads the dial on the OPPONENT's plate — that seat is the one in range", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, "king-kong", {}),
          seat("p2", false, "cecil-palmer", { BROADCAST: 3 }),
        ],
        "p1"
      )
    );
    expect(screen.getAllByText("BROADCAST 3/6").length).toBeGreaterThan(0);
  });

  it("reads the dial on its OWNER's own plate too", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, "cecil-palmer", { BROADCAST: 6 }),
          seat("p2", false, "king-kong", {}),
        ],
        "p1"
      )
    );
    expect(screen.getAllByText("BROADCAST 6/6").length).toBeGreaterThan(0);
  });

  it("shows NOTHING at 0 — an unearned dial is the opening state, not an event", () => {
    // The engine drops an emptied counter key, so both spellings of "no tokens"
    // reach the plate and both must be silent.
    renderHud(
      makeView(
        [
          seat("p1", true, "king-kong", {}),
          seat("p2", false, "cecil-palmer", { BROADCAST: 0 }),
        ],
        "p1"
      )
    );
    expect(screen.queryByText(/^BROADCAST /)).not.toBeInTheDocument();
    renderHud(
      makeView([seat("p1", true, "cecil-palmer", {}), seat("p2", false, "king-kong", {})], "p1")
    );
    expect(screen.queryByText(/^BROADCAST /)).not.toBeInTheDocument();
  });

  it("puts no dial on a hero that has none", () => {
    renderHud(
      makeView([seat("p1", true, "king-kong", {}), seat("p2", false, "thetis", {})], "p1")
    );
    expect(screen.queryByText(/^BROADCAST /)).not.toBeInTheDocument();
  });
});
