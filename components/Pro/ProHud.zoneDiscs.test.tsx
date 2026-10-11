/**
 * The zone-disc toggle (unbrewed-p2p-1395) on BOTH HUDs: a chip in the
 * desktop cluster, an item in the phone's Game menu. Present only when the
 * page offers it (the tabletop view), one tap flips it.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { ProMobileMenu } from "./ProMobileHud";
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

type Props = { zoneDiscs?: boolean; onToggleZoneDiscs?: () => void };

const desktop = (props: Props) =>
  render(
    <ChakraProvider>
      <ProHud
        view={makeView("p1")}
        status="open"
        roomId="room-1"
        resolveCard={() => null}
        resolveHero={() => null}
        labelFor={() => ""}
        {...props}
      />
    </ChakraProvider>
  );

describe("desktop HUD zone-disc chip", () => {
  it("is a pressable chip reading the current state, off by default", () => {
    desktop({ zoneDiscs: false, onToggleZoneDiscs: jest.fn() });
    const chip = screen.getByRole("button", { name: "Zone discs: off. Click to switch." });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveTextContent("Zone discs");
  });

  it("one click reports the toggle, and the chip reads ON once it is", () => {
    const onToggleZoneDiscs = jest.fn();
    const { rerender } = desktop({ zoneDiscs: false, onToggleZoneDiscs });
    fireEvent.click(screen.getByRole("button", { name: "Zone discs: off. Click to switch." }));
    expect(onToggleZoneDiscs).toHaveBeenCalledTimes(1);
    rerender(
      <ChakraProvider>
        <ProHud
          view={makeView("p1")}
          status="open"
          roomId="room-1"
          resolveCard={() => null}
          resolveHero={() => null}
          labelFor={() => ""}
          zoneDiscs
          onToggleZoneDiscs={onToggleZoneDiscs}
        />
      </ChakraProvider>
    );
    expect(screen.getByRole("button", { name: "Zone discs: on. Click to switch." })).toHaveAttribute("aria-pressed", "true");
  });

  it("is absent when the page does not offer it (the flat board)", () => {
    desktop({});
    expect(screen.queryByRole("button", { name: /Zone discs/ })).toBeNull();
    desktop({ zoneDiscs: true });
    expect(screen.queryByRole("button", { name: /Zone discs/ })).toBeNull();
  });
});

describe("phone Game menu zone-disc item", () => {
  const openMenu = (props: Props) => {
    render(
      <ChakraProvider>
        <ProMobileMenu status="open" roomId={null} boardView="table" onToggleBoardView={() => {}} {...props} />
      </ChakraProvider>
    );
    act(() => {
      fireEvent.click(screen.getByLabelText("Game menu"));
    });
    // Chakra keeps an opened MenuList visibility:hidden in jsdom (see the
    // chakra-menu-jsdom memo): query hidden and match on text.
    return screen.queryAllByRole("menuitem", { hidden: true }).filter((el) => el.textContent?.startsWith("Zone discs"));
  };

  it("lists the state and reports a tap", () => {
    const onToggleZoneDiscs = jest.fn();
    const items = openMenu({ zoneDiscs: false, onToggleZoneDiscs });
    expect(items.map((el) => el.textContent)).toEqual(["Zone discs — off"]);
    fireEvent.click(items[0]);
    expect(onToggleZoneDiscs).toHaveBeenCalledTimes(1);
  });

  it("reads ON when the discs are painted", () => {
    expect(openMenu({ zoneDiscs: true, onToggleZoneDiscs: jest.fn() }).map((el) => el.textContent)).toEqual(["Zone discs — on"]);
  });

  it("is absent when the page does not offer it", () => {
    expect(openMenu({})).toEqual([]);
  });
});
