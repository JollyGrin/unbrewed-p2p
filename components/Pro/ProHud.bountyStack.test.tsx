import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import {
  CardInstanceId,
  PlayerId,
  PlayerView,
  ProMapDef,
  ViewPlayer,
} from "@/lib/pro/protocol";

/**
 * Boba Fett's bounty stack on the HUD nameplates (issue #671 ↔ engine #477).
 *
 * The registry mapping is unit-tested in lib/pro/heroStateFlags.test.ts. What is
 * pinned HERE is the thing the ticket is actually about: the stack renders under
 * the OPPONENT'S plate, not Boba's. The engine tucks each BOUNTY card into the
 * VICTIM's `piles` (protocol v0.49.0 cross-player tuck) and records the tucker in
 * `pileControllers`, so getting this wrong does not blank a pill — it puts the
 * opponent's debuff on Boba's own plate and makes the whole deck read backwards.
 *
 * Also pinned: the INHIBITOR bounty's `DENY:DRAW` flag, which is what a denied
 * seat has instead of an explanation for the draw that did not happen.
 */

jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => ({ status: "guest", account: null }),
}));

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: {
    title: "Test Map",
    minPlayers: 2,
    maxPlayers: 4,
    specialRules: false,
    imageUrl: "/test.png",
  },
  zones: [],
  spaces: [],
};

const seat = (
  id: PlayerId,
  you: boolean,
  heroId: string,
  extra: Partial<ViewPlayer> = {}
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
  counters: {},
  flags: {},
  wonCombatThisTurn: false,
  lostCombatThisTurn: false,
  firstAttackThisTurn: false,
  playedACardThisTurn: false,
  tookDamageThisTurn: false,
  ...extra,
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
      piles: self.piles,
      pileControllers: self.pileControllers,
      flags: self.flags,
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
        labelFor={(id: CardInstanceId) => id}
      />
    </ChakraProvider>
  );

/** A bountied victim: the piles sit on THEIR seat, the cards are still Boba's. */
const bountied = (id: PlayerId, you: boolean, heroId: string, boba: PlayerId) =>
  seat(id, you, heroId, {
    piles: {
      BOUNTY_PAYMENT: [`${boba}/bounty-payment#1`],
      BOUNTY_CARBONITE: [`${boba}/bounty-carbonite#1`],
    },
    pileControllers: {
      BOUNTY_PAYMENT: { [`${boba}/bounty-payment#1`]: boba },
      BOUNTY_CARBONITE: { [`${boba}/bounty-carbonite#1`]: boba },
    },
  });

describe("Boba Fett's bounty stack on the HUD plates", () => {
  it("renders under the OPPONENT's nameplate when Boba has bountied them", () => {
    // You are Boba. The bounties you have played are on the other seat's plate,
    // because that is where the cards physically are.
    renderHud(
      makeView([seat("p1", true, "boba-fett"), bountied("p2", false, "king-kong", "p1")], "p1")
    );
    expect(screen.getAllByText("BOUNTY: PAYMENT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BOUNTY: CARBONITE").length).toBeGreaterThan(0);
  });

  it("renders on YOUR plate when you are the one carrying the bounties", () => {
    // The other side of the same wire: you are the victim, Boba is across the
    // table, and the pills are the only warning that Disintegration now hits for 6.
    renderHud(
      makeView([bountied("p1", true, "king-kong", "p2"), seat("p2", false, "boba-fett")], "p1")
    );
    expect(screen.getAllByText("BOUNTY: PAYMENT").length).toBeGreaterThan(0);
  });

  it("puts NOTHING on Boba's own plate — he hosts no bounty pile", () => {
    const { container } = renderHud(
      makeView([seat("p1", true, "boba-fett"), seat("p2", false, "king-kong")], "p1")
    );
    expect(container.textContent).not.toContain("BOUNTY:");
  });

  it("shows only the bounties actually tucked, one pill each", () => {
    renderHud(
      makeView([seat("p1", true, "boba-fett"), bountied("p2", false, "king-kong", "p1")], "p1")
    );
    // Two tucked, two absent. Each BOUNTY card is a singleton, so a pill is
    // presence — there is no "×2" state to render.
    expect(screen.queryByText("BOUNTY: INHIBITOR")).not.toBeInTheDocument();
    expect(screen.queryByText("BOUNTY: FLAMETHROWER")).not.toBeInTheDocument();
  });

  it("makes each pill an inspection affordance for its own pile", () => {
    // The zone is public, so this is a click target on EITHER seat's plate. What
    // the overlay then SAYS — including the cross-player credit that keeps a bounty
    // from reading as the victim's own card — is unit-tested on `pileCreditFor` in
    // lib/pro/heroStateFlags.test.ts; opening a Chakra modal under jsdom trips an
    // unrelated nwsapi selector bug in its focus lock.
    renderHud(
      makeView([seat("p1", true, "boba-fett"), bountied("p2", false, "king-kong", "p1")], "p1")
    );
    const pill = screen.getAllByText("BOUNTY: PAYMENT")[0];
    expect(pill).toHaveAttribute("role", "button");
    expect(pill).toHaveAttribute("title", "BOUNTY: PAYMENT — view the tucked cards");
  });

  it("names each bountied opponent's own stack in a 3-player game", () => {
    // ffa-3: two victims, two independent stacks, each under its own plate.
    renderHud(
      makeView(
        [
          seat("p1", true, "boba-fett"),
          bountied("p2", false, "king-kong", "p1"),
          seat("p3", false, "thetis", {
            piles: { BOUNTY_FLAMETHROWER: ["p1/bounty-flamethrower#1"] },
            pileControllers: { BOUNTY_FLAMETHROWER: { "p1/bounty-flamethrower#1": "p1" } },
          }),
        ],
        "p1"
      )
    );
    expect(screen.getAllByText("BOUNTY: PAYMENT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BOUNTY: FLAMETHROWER").length).toBeGreaterThan(0);
  });
});

describe("INHIBITOR — the DENY:DRAW action denial (engine #462)", () => {
  it("says so on the denied seat's plate", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, "boba-fett"),
          seat("p2", false, "king-kong", { flags: { "DENY:DRAW": true } }),
        ],
        "p1"
      )
    );
    expect(screen.getAllByText("NO DRAW").length).toBeGreaterThan(0);
  });

  it("is not hero-gated — the same pill works for the seat that is you", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, "thetis", { flags: { "DENY:TURN": true } }),
          seat("p2", false, "boba-fett"),
        ],
        "p1"
      )
    );
    expect(screen.getAllByText("TURN SKIPPED").length).toBeGreaterThan(0);
  });

  it("stays silent when no denial is live", () => {
    const { container } = renderHud(
      makeView(
        [
          seat("p1", true, "boba-fett"),
          seat("p2", false, "king-kong", { flags: { "DENY:DRAW": false } }),
        ],
        "p1"
      )
    );
    expect(container.textContent).not.toContain("NO DRAW");
  });
});
