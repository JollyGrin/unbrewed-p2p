import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { PlayerId, PlayerView, ProMapDef, ViewPlayer } from "@/lib/pro/protocol";

// Regression coverage for issue #227: PR #200 winner-gated the right-panel turn
// chips + waiting banner, but the gold "TURN" pill on the HUD player card still
// rendered after GAME_OVER (seen stuck on the viewer's card on the DEFEAT
// screen). The pill now shares the panel's no-winner gate (showLiveTurnChrome),
// so once `view.winner` is set no seat card shows TURN — duel AND multiplayer.

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 4, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [],
};

const seat = (id: PlayerId, you: boolean): ViewPlayer => ({
  id,
  heroId: `${id}-hero`,
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
});

const makeView = (opts: {
  seats: PlayerId[];
  you: PlayerId;
  activePlayer: PlayerId;
  winner: PlayerId | null;
}): PlayerView => {
  const players = opts.seats.map((id) => seat(id, id === opts.you));
  return {
    you: opts.you,
    phase: opts.winner ? "GAME_OVER" : "PLAY",
    turnNumber: 3,
    activePlayer: opts.activePlayer,
    actionsRemaining: 1,
    turnPhase: "ACTION_SELECT",
    maneuver: null,
    map: MAP,
    catalog: {},
    fighters: [],
    tokens: [],
    self: {
      id: opts.you,
      heroId: `${opts.you}-hero`,
      hand: [],
      deckCount: 0,
      discard: [],
      ongoingScheme: null,
      committedCard: null,
      counters: {},
      flags: {},
      wonCombatThisTurn: false,
    },
    opponent: null,
    players,
    combat: null,
    prompt: null,
    winner: opts.winner,
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
        labelFor={(card) => (card === "clone-troopers/elite-strategy#1" ? "Elite Strategy" : "")}
      />
    </ChakraProvider>,
  );

describe("ProHud TURN pill — winner gate (issue #227)", () => {
  describe("duel", () => {
    it("shows a TURN pill on the active seat while the game is live (no winner)", () => {
      renderHud(makeView({ seats: ["p1", "p2"], you: "p1", activePlayer: "p1", winner: null }));
      expect(screen.getByText("TURN")).toBeInTheDocument();
    });

    it("renders no TURN pill once a winner is set", () => {
      renderHud(makeView({ seats: ["p1", "p2"], you: "p1", activePlayer: "p1", winner: "p2" }));
      expect(screen.queryByText("TURN")).not.toBeInTheDocument();
    });
  });

  it("renders a public ongoing scheme chip and card label", () => {
    const ongoing = "clone-troopers/elite-strategy#1";
    const view = makeView({ seats: ["p1", "p2"], you: "p1", activePlayer: "p1", winner: null });
    view.self.ongoingScheme = ongoing;
    view.players = view.players.map((p) => (p.id === "p1" ? { ...p, ongoingScheme: ongoing } : p));

    renderHud(view);

    expect(screen.getByText("Elite Strategy")).toBeInTheDocument();
    expect(screen.getAllByText("ONGOING").length).toBeGreaterThan(0);
  });

  describe("multiplayer", () => {
    it("shows a TURN pill on the active seat while the game is live (no winner)", () => {
      renderHud(makeView({ seats: ["p1", "p2", "p3"], you: "p2", activePlayer: "p3", winner: null }));
      expect(screen.getByText("TURN")).toBeInTheDocument();
    });

    it("renders no TURN pill once a winner is set", () => {
      renderHud(makeView({ seats: ["p1", "p2", "p3"], you: "p2", activePlayer: "p3", winner: "p1" }));
      expect(screen.queryByText("TURN")).not.toBeInTheDocument();
    });
  });
});
