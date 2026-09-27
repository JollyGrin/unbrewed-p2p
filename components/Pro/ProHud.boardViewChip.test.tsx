/**
 * The board-view chip (tabletop board view phase 1) — same one-tap cycling
 * gesture and visibility rule as the combat-pace chip beside it: hidden
 * unless the caller wires `onToggleBoardView` (+ `boardView`), one click
 * calls it, no internal state of its own.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { PlayerId, PlayerView, ProMapDef } from "@/lib/pro/protocol";

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [],
};

const makeView = (you: PlayerId): PlayerView => ({
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
    id: you,
    heroId: `${you}-hero`,
    hand: [],
    deckCount: 0,
    discard: [],
    ongoingScheme: null,
    committedCard: null,
    counters: {},
    flags: {},
    wonCombatThisTurn: false,
    lostCombatThisTurn: false,
    firstAttackThisTurn: false,
    playedACardThisTurn: false,
    tookDamageThisTurn: false,
  },
  opponent: null,
  players: [],
  combat: null,
  prompt: null,
  winner: null,
});

describe("ProHud board-view chip", () => {
  it("is absent when the caller does not wire the toggle", () => {
    render(
      <ChakraProvider>
        <ProHud view={makeView("p1")} status="open" roomId="room-1" resolveCard={() => null} resolveHero={() => null} labelFor={() => ""} />
      </ChakraProvider>
    );
    expect(screen.queryByLabelText(/Board view:/)).toBeNull();
  });

  it("shows the current view and calls the toggle on click", () => {
    const onToggleBoardView = jest.fn();
    render(
      <ChakraProvider>
        <ProHud
          view={makeView("p1")}
          status="open"
          roomId="room-1"
          resolveCard={() => null}
          resolveHero={() => null}
          labelFor={() => ""}
          boardView="flat"
          onToggleBoardView={onToggleBoardView}
        />
      </ChakraProvider>
    );
    const chip = screen.getByLabelText(/Board view: Flat board/);
    expect(chip).toBeInTheDocument();
    fireEvent.click(chip);
    expect(onToggleBoardView).toHaveBeenCalledTimes(1);
  });

  it("reads 'Tabletop' once the caller reports the table view is active", () => {
    render(
      <ChakraProvider>
        <ProHud
          view={makeView("p1")}
          status="open"
          roomId="room-1"
          resolveCard={() => null}
          resolveHero={() => null}
          labelFor={() => ""}
          boardView="table"
          onToggleBoardView={() => undefined}
        />
      </ChakraProvider>
    );
    expect(screen.getByLabelText(/Board view: Tabletop/)).toBeInTheDocument();
  });

  // #914: on a map with a region the page draws the flat board whatever the
  // stored preference, so a click must not rewrite that preference unseen.
  it("says why and does not call the toggle while the view is locked", () => {
    const onToggleBoardView = jest.fn();
    render(
      <ChakraProvider>
        <ProHud
          view={makeView("p1")}
          status="open"
          roomId="room-1"
          resolveCard={() => null}
          resolveHero={() => null}
          labelFor={() => ""}
          boardView="flat"
          onToggleBoardView={onToggleBoardView}
          boardViewLockedHint="Tabletop can't show this map"
        />
      </ChakraProvider>
    );
    const chip = screen.getByLabelText(/Board view: Flat board\. Tabletop can't show this map/);
    expect(chip).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(chip);
    expect(onToggleBoardView).not.toHaveBeenCalled();
  });
});
