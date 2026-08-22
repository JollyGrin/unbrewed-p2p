import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { PlayerId, PlayerView, ProMapDef, ViewPlayer } from "@/lib/pro/protocol";

/**
 * Skull Kid's TIME pill on the HUD nameplate (issue #663 ↔ engine #449).
 *
 * The registry mapping is unit-tested in lib/pro/heroStateFlags.test.ts; what is
 * pinned HERE is that the plate actually renders it, and — the Cairne lesson — that
 * it renders on the OPPONENT's plate too. The Clock Tower is aimed at the player who
 * does NOT own it: a clock only its owner can read is not a threat, it is a surprise.
 *
 * The second half is the suppression. `MITIGATION` is declared on the same hero and
 * arrives in the same `counters` map, but it is engine bookkeeping — non-zero only
 * between the mitigation discards and the damage inside one strike run. It must never
 * reach a plate.
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

describe("Skull Kid's TIME pill on the HUD plates", () => {
  it("reads the clock on the OPPONENT's plate — the seat the tower is aimed at", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, "king-kong", {}),
          seat("p2", false, "skull-kid", { TIME: 3, MITIGATION: 0 }),
        ],
        "p1"
      )
    );
    expect(screen.getAllByText("TIME 3/5").length).toBeGreaterThan(0);
  });

  it("reads the clock on its OWNER's own plate too", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, "skull-kid", { TIME: 4, MITIGATION: 0 }),
          seat("p2", false, "king-kong", {}),
        ],
        "p1"
      )
    );
    expect(screen.getAllByText("TIME 4/5").length).toBeGreaterThan(0);
  });

  it("still reads at 0 — the Clock Tower strike is when it matters most", () => {
    // The engine deletes a counter key at zero, so a striking seat arrives with NO
    // TIME key (live #449 room: `{ MITIGATION: 0 }`). That must read TIME 0/5, not
    // blank the pill at the one moment the clock is the whole story.
    renderHud(
      makeView(
        [
          seat("p1", true, "king-kong", {}),
          seat("p2", false, "skull-kid", { MITIGATION: 3 }),
        ],
        "p1"
      )
    );
    expect(screen.getAllByText("TIME 0/5").length).toBeGreaterThan(0);
  });

  it("never surfaces MITIGATION anywhere on the plates", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, "king-kong", {}),
          seat("p2", false, "skull-kid", { MITIGATION: 3 }),
        ],
        "p1"
      )
    );
    expect(screen.queryByText(/MITIGATION/i)).not.toBeInTheDocument();
  });

  it("puts no clock on a hero that has none", () => {
    renderHud(
      makeView(
        [seat("p1", true, "king-kong", {}), seat("p2", false, "thetis", {})],
        "p1"
      )
    );
    expect(screen.queryByText(/^TIME /)).not.toBeInTheDocument();
  });
});
