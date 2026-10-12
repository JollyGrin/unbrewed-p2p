/**
 * #1408 — Forfeit lives in the HUD's top-right Game menu, not beside the
 * dock's actions: hidden unless the caller wires `onForfeit`, and reaching it
 * takes opening the menu first (a misclick on a chip cannot end the game).
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { PlayerView } from "@/lib/pro/protocol";

const view = {
  you: "p1",
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: "p1",
  actionsRemaining: 1,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: { schemaVersion: "1", id: "m", meta: { title: "M", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/m.png" }, zones: [], spaces: [] },
  catalog: {},
  fighters: [],
  tokens: [],
  self: {
    id: "p1", heroId: "h", hand: [], deckCount: 0, discard: [], ongoingScheme: null, committedCard: null,
    counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false,
    playedACardThisTurn: false, tookDamageThisTurn: false,
  },
  opponent: null,
  players: [],
  combat: null,
  prompt: null,
  winner: null,
} as unknown as PlayerView;

const hud = (onForfeit?: () => void) =>
  render(
    <ChakraProvider>
      <ProHud view={view} status="open" roomId="r" resolveCard={() => null} resolveHero={() => null} labelFor={() => ""} onForfeit={onForfeit} />
    </ChakraProvider>,
  );

describe("ProHud — Forfeit in the Game menu (#1408)", () => {
  it("offers no Game menu when FORFEIT is not wired", () => {
    hud();
    expect(screen.queryByLabelText("Game menu")).toBeNull();
  });

  it("does nothing on the chip itself; Forfeit fires only from the opened menu", () => {
    const onForfeit = jest.fn();
    hud(onForfeit);
    expect(screen.queryByText(/Forfeit/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Game menu"));
    expect(onForfeit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Forfeit…"));
    expect(onForfeit).toHaveBeenCalledTimes(1);
  });
});
