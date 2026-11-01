/**
 * `invite_link_copied` (#1513) from the in-game room chip (desktop HUD) and the
 * mobile menu's "Copy join link".
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { ProMobileMenu } from "./ProMobileHud";
import { PlayerView, ProMapDef } from "@/lib/pro/protocol";
import { resetGrowthAnalytics } from "@/lib/growthAnalytics";

const track = jest.fn();
jest.mock("../../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [],
};

const view = {
  you: "p1",
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: "p1",
  actionsRemaining: 1,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: MAP,
  catalog: {},
  fighters: [],
  tokens: [],
  self: {
    id: "p1",
    heroId: "p1-hero",
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
} as unknown as PlayerView;

const writeText = jest.fn().mockResolvedValue(undefined);

beforeAll(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

beforeEach(() => {
  writeText.mockClear();
  track.mockClear();
  resetGrowthAnalytics();
});

describe("invite_link_copied (pro)", () => {
  it("desktop room chip", async () => {
    render(
      <ChakraProvider>
        <ProHud view={view} status="open" roomId="room-1" resolveCard={() => null} resolveHero={() => null} labelFor={() => ""} />
      </ChakraProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText("room room-1"));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/pro/game?room=room-1`);
    expect(track).toHaveBeenCalledWith("invite_link_copied", { mode: "pro" });
  });

  it("mobile menu item", async () => {
    render(
      <ChakraProvider>
        <ProMobileMenu status="open" roomId="room-1" />
      </ChakraProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByLabelText("Game menu"));
    });
    const item = screen
      .getAllByRole("menuitem", { hidden: true })
      .find((el) => el.textContent?.startsWith("Copy join link"));
    await act(async () => {
      fireEvent.click(item!);
    });
    expect(track).toHaveBeenCalledWith("invite_link_copied", { mode: "pro" });
  });
});
