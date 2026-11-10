/**
 * GameShell's board reads "my deck" from the game context (issue #1563):
 * `deckFor?.(self)` when the provider offers it (offline / hotseat), the bag's
 * starred deck otherwise (online, /connect). Heavy children are stubbed; the
 * seams under test are what the shell hands the board seed, the token library
 * and the pickup panel.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { GameShell } from "./GameShell";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: { name: "me" } }),
}));
jest.mock("next/dynamic", () => () => () => null);

jest.mock("../BoardCanvas", () => ({
  BoardCanvas: (props: {
    tokens: { id: string; owner: string }[];
    onForeignCardClick: (t: { id: string; owner: string }) => void;
  }) => (
    <div data-testid="board">
      {props.tokens.map((t) => (
        <button key={t.id} onClick={() => props.onForeignCardClick(t)}>
          {`token ${t.id}`}
        </button>
      ))}
    </div>
  ),
}));
jest.mock("./index", () => ({
  HandContainer: () => null,
  HeaderContainer: () => null,
  ModalContainer: () => null,
}));
jest.mock("./game.layout", () => ({
  GameLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("./GameMenus/game-menus", () => ({
  GameMenusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("./CommandMenu/command-menu", () => ({ CommandMenu: () => null }));
jest.mock("./ActionLog/action-log", () => ({ ActionLog: () => null }));
jest.mock("./ReportBugButton", () => ({ ReportBugButton: () => null }));
jest.mock("./deck-open-warning.modal", () => ({ DeckOpenWarningDialog: () => null }));
jest.mock("./useDeckOpenWarning", () => ({
  useDeckOpenWarning: () => ({
    requestModal: jest.fn(),
    pendingWarning: false,
    confirmOpen: jest.fn(),
    cancelOpen: jest.fn(),
  }),
}));
jest.mock("../Positions/token-edit.panel", () => ({ TokenEditPanel: () => null }));
jest.mock("../Positions/card-token.panel", () => ({ CardTokenPanel: () => null }));
jest.mock("../Positions/card-peek", () => ({ CardPeek: () => null }));
jest.mock("../Positions/card-pickup.panel", () => ({
  CardPickupPanel: (props: { onPickup: () => void }) => (
    <button onClick={props.onPickup}>pickup panel</button>
  ),
}));
jest.mock("../../lib/icons/gameIcons", () => ({
  iconToSvg: () => null,
  useGameIcons: () => undefined,
}));
// The token library: expose the hero tokens and the save footer's deck.
jest.mock("../Positions/token-library.modal", () => ({
  TokenLibraryModal: (props: {
    heroTokens: { name: string }[];
    footer: React.ReactNode;
  }) => (
    <div>
      <div data-testid="hero-tokens">{props.heroTokens.map((h) => h.name).join(",")}</div>
      <div data-testid="footer">{props.footer}</div>
    </div>
  ),
}));
jest.mock("../Positions/save-tokens-to-deck", () => ({
  SaveTokensToDeck: (props: { deck: { id: string } }) => (
    <div data-testid="save-to">{props.deck.id}</div>
  ),
}));

const mkDeck = (id: string, hero: string) => ({
  id,
  name: hero,
  deck_data: {
    hero: { name: hero, tokenImageUrl: `https://img.example/${id}.png` },
    appearance: {},
  },
  savedTokens: [{ imageUrl: `https://img.example/${id}-saved.png`, size: 100 }],
});
const STARRED = mkDeck("starred", "Starred Hero");
const SEAT = mkDeck("seat", "Seat Hero");

jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({ starredDeck: mockStarred, updateDeck: jest.fn() }),
}));
let mockStarred: unknown;

let mockGame: Record<string, unknown>;
jest.mock("../../lib/contexts/WebGameProvider", () => ({
  useWebGame: () => mockGame,
  // Read by the hotseat hooks (board rotation); no provider = no hotseat.
  WebGameContext: jest.requireActual("react").createContext(undefined),
}));

const sendBlob = jest.fn();
const claimTableCard = jest.fn();
const logAction = jest.fn();

const baseGame = (extra: Record<string, unknown> = {}) => ({
  gamePositions: { content: {} },
  gameState: { content: { players: {} } },
  setPlayerPosition: { current: sendBlob },
  setPlayerState: () => jest.fn(),
  logAction,
  claimTableCard,
  ...extra,
});

beforeEach(() => {
  jest.useFakeTimers();
  sendBlob.mockClear();
  claimTableCard.mockClear();
  mockStarred = STARRED;
  mockGame = baseGame();
});
afterEach(() => jest.useRealTimers());

const seededFrom = () => {
  act(() => {
    jest.advanceTimersByTime(1600);
  });
  expect(sendBlob).toHaveBeenCalledTimes(1);
  return sendBlob.mock.calls[0][0].tokens.map((t: { imageUrl: string }) => t.imageUrl);
};

describe("GameShell — online path (no deckFor)", () => {
  it("seeds the board, hero tokens and save target from the starred deck", () => {
    render(<GameShell />);
    expect(seededFrom()).toContain("https://img.example/starred-saved.png");
    expect(screen.getByTestId("hero-tokens")).toHaveTextContent("Starred Hero");
    expect(screen.getByTestId("save-to")).toHaveTextContent("starred");
  });
});

describe("GameShell — hotseat (deckFor provided)", () => {
  const withSeatDeck = () => {
    const deckFor = jest.fn((name: string) => (name === "me" ? SEAT : undefined));
    mockGame = baseGame({
      deckFor,
      hotseat: { seats: ["me"], active: "me" },
    });
    return deckFor;
  };

  it("seeds the board from the seat's deck, not the starred one", () => {
    const deckFor = withSeatDeck();
    render(<GameShell />);
    const urls = seededFrom();
    expect(urls).toContain("https://img.example/seat-saved.png");
    expect(urls).not.toContain("https://img.example/starred-saved.png");
    expect(deckFor).toHaveBeenCalledWith("me");
  });

  it("offers the seat's hero tokens and saves loadouts onto the seat's deck", () => {
    withSeatDeck();
    render(<GameShell />);
    expect(screen.getByTestId("hero-tokens")).toHaveTextContent("Seat Hero");
    expect(screen.getByTestId("save-to")).toHaveTextContent("seat");
    expect(screen.getByTestId("save-to")).not.toHaveTextContent("starred");
  });

  it("falls back to the starred deck when deckFor has no deck for the seat", () => {
    mockGame = baseGame({ deckFor: () => undefined });
    render(<GameShell />);
    expect(screen.getByTestId("hero-tokens")).toHaveTextContent("Starred Hero");
    expect(screen.getByTestId("save-to")).toHaveTextContent("starred");
    expect(seededFrom()).toContain("https://img.example/starred-saved.png");
  });
});

describe("GameShell — foreign card pickup panel", () => {
  const foreignCard = {
    id: "opponent-1",
    x: 10,
    y: 10,
    card: { title: "Their Card" },
  };
  const gameWithForeign = () =>
    baseGame({
      gamePositions: { content: { me: { tokens: [] }, opponent: { tokens: [foreignCard] } } },
    });

  it("opens on a foreign card, claims it, and closes when the token disappears", () => {
    mockGame = gameWithForeign();
    const { rerender } = render(<GameShell />);
    act(() => screen.getByText("token opponent-1").click());
    act(() => screen.getByText("pickup panel").click());
    expect(claimTableCard).toHaveBeenCalledWith("opponent-1", "opponent");

    // The owner (the provider, offline) grants the claim: the token is gone.
    mockGame = baseGame({
      gamePositions: { content: { me: { tokens: [] }, opponent: { tokens: [] } } },
    });
    rerender(<GameShell />);
    expect(screen.queryByText("pickup panel")).toBeNull();
  });
});
