/**
 * The figure-style dropdown (unbrewed-p2p-953) on BOTH HUDs: a labelled
 * native select on desktop, a titled radio group in the phone's Game menu.
 * One control, listing exactly the offered styles, no cycling chip left.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { ProMobileMenu } from "./ProMobileHud";
import type { FigureStyle } from "@/lib/pro/figures";
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

const desktop = (props: { figureStyle?: FigureStyle; figureStyles?: FigureStyle[]; onChooseFigureStyle?: (s: FigureStyle) => void }) =>
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

describe("desktop HUD figure-style select", () => {
  it("is a labelled select offering exactly the board's styles, current one selected", () => {
    desktop({ figureStyle: "3d", figureStyles: ["3d", "open", "token"], onChooseFigureStyle: jest.fn() });
    const select = screen.getByRole("combobox", { name: "Heroes as" }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["3D minis", "Minis", "Tokens"]);
    expect(select.value).toBe("3d");
    // No cycling chip left behind.
    expect(screen.queryByLabelText(/Click to switch/)).toBeNull();
  });

  it("choosing an option (keyboard or mouse: a native change) reports that style", () => {
    const onChooseFigureStyle = jest.fn();
    desktop({ figureStyle: "3d", figureStyles: ["3d", "open", "token"], onChooseFigureStyle });
    fireEvent.change(screen.getByRole("combobox", { name: "Heroes as" }), { target: { value: "token" } });
    expect(onChooseFigureStyle).toHaveBeenCalledWith("token");
  });

  it("is absent when the board offers no choice", () => {
    desktop({ figureStyle: "token", figureStyles: [], onChooseFigureStyle: jest.fn() });
    expect(screen.queryByRole("combobox", { name: "Heroes as" })).toBeNull();
    desktop({});
    expect(screen.queryByRole("combobox", { name: "Heroes as" })).toBeNull();
  });
});

describe("phone Game menu figure-style group", () => {
  const openMenu = (props: { figureStyle?: FigureStyle; figureStyles?: FigureStyle[]; onChooseFigureStyle?: (s: FigureStyle) => void }) => {
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
    return screen.queryAllByRole("menuitemradio", { hidden: true });
  };

  it("lists the offered styles as radio items, the current one checked, and reports a pick", () => {
    const onChooseFigureStyle = jest.fn();
    const items = openMenu({ figureStyle: "open", figureStyles: ["3d", "open", "token"], onChooseFigureStyle });
    expect(items.map((el) => el.textContent)).toEqual(["3D minis", "Minis", "Tokens"]);
    expect(items.map((el) => el.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    fireEvent.click(items[0]);
    expect(onChooseFigureStyle).toHaveBeenCalledWith("3d");
    expect(screen.queryAllByRole("menuitem", { hidden: true }).some((el) => el.textContent?.startsWith("Heroes —"))).toBe(false);
  });

  it("is absent when the board offers no choice", () => {
    expect(openMenu({})).toEqual([]);
  });
});
