import { act, render } from "@testing-library/react";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { PositionBlob } from "@/components/Positions/position.type";
import { OfflineGameProvider } from "@/lib/contexts/OfflineGameProvider";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { PlayerState } from "@/lib/gamesocket/message";
import { readStarredDeck } from "@/lib/sandbox/initGame";

/**
 * Hotseat on the offline provider (issue #1562): a second local seat, which
 * seat the writers act for, per-seat decks, and local card handoff. The
 * one-seat path must stay exactly what /offline and /irl had before.
 */

jest.mock("next/router", () => ({ useRouter: () => ({ query: { name: "offline" } }) }));

jest.mock("../../lib/sandbox/initGame", () => ({
  ...jest.requireActual("../../lib/sandbox/initGame"),
  readStarredDeck: jest.fn(),
}));

const deck = (hero: string): DeckImportType =>
  ({
    id: `deck-${hero}`,
    family_id: `deck-${hero}`,
    name: `${hero} deck`,
    note: "",
    user: "test",
    deck_data: {
      name: `${hero} deck`,
      appearance: {},
      hero: { name: hero, hp: 15, move: 2, isRanged: false, specialAbility: "" },
      sidekick: { name: "", hp: null, isRanged: false, quantity: 0, quote: "" },
      cards: [{ title: `${hero} card`, quantity: 6, imageUrl: `https://img/${hero}.png` }],
    },
  }) as any;

const ALICE = deck("Alice");
const BOB = deck("Bob");
const CAROL = deck("Carol");

type Game = ReturnType<typeof useWebGame>;

const setup = () => {
  let game!: Game;
  const Probe = () => {
    game = useWebGame();
    return null;
  };
  render(
    <OfflineGameProvider>
      <Probe />
    </OfflineGameProvider>,
  );
  return {
    game: () => game,
    players: () => (game.gameState?.content as any).players as Record<string, PlayerState>,
    positions: () => game.gamePositions?.content as Record<string, PositionBlob>,
  };
};

const titles = (cards: { title: string }[] | null | undefined) => (cards ?? []).map((c) => c.title);
const allCards = (pool: PoolType | undefined) => [
  ...titles(pool?.hand),
  ...titles(pool?.deck),
  ...titles(pool?.discard),
];
const logTexts = (ps: PlayerState | undefined) => (ps?.actionLog ?? []).map((e) => e.text);

beforeEach(() => {
  jest.useFakeTimers();
  (readStarredDeck as jest.Mock).mockReturnValue(ALICE);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("one seat (no addSeat): unchanged /offline and /irl behaviour", () => {
  it("exposes hotseat with only the first seat, and writes go to `offline`", () => {
    const t = setup();
    expect(t.game().hotseat?.seats).toEqual(["offline"]);
    expect(t.game().hotseat?.active).toBe("offline");
    expect(t.players()).toEqual({ offline: { pool: undefined } });
    expect(t.positions()).toEqual({});

    act(() => t.game().logAction("hello"));
    act(() => t.game().setPlayerPosition.current({ color: "red", tokens: [] }));
    expect(Object.keys(t.players())).toEqual(["offline"]);
    expect(t.players().offline.actionLog).toEqual([
      { seq: 1, at: expect.any(Number), text: "hello" },
    ]);
    expect(t.positions()).toEqual({ offline: { color: "red", tokens: [] } });
  });

  it("New game wipes to the starred deck with one log line, as before", () => {
    const t = setup();
    act(() => t.game().logAction("old"));
    act(() => t.game().requestGameReset());

    expect(Object.keys(t.players())).toEqual(["offline"]);
    expect(t.players().offline.actionLog).toEqual([
      { seq: 1, at: expect.any(Number), text: "New game started by offline" },
    ]);
    expect(t.players().offline.pool?.hero.name).toBe("Alice");
    expect(Object.keys(t.positions())).toEqual(["offline"]);
    expect(t.game().resetStatus.epoch).toBe(1);
  });

  it("Change my deck is still a full reseed solo", () => {
    const t = setup();
    act(() => t.game().logAction("old"));
    act(() => t.game().switchDeck(BOB));
    expect(t.players().offline.pool?.hero.name).toBe("Bob");
    expect(logTexts(t.players().offline)).toEqual(["Switched to Bob"]);
    expect(t.game().deckFor?.("offline")).toBe(BOB);
  });

  it("deckFor the first seat falls back to the starred deck it auto-inits from", () => {
    const t = setup();
    expect(t.game().deckFor?.("offline")).toBe(ALICE);
    expect(t.game().deckFor?.("opponent")).toBeUndefined();
  });
});

describe("addSeat", () => {
  it("seeds the opponent's pool and board eagerly, without waiting on any timer", () => {
    const t = setup();
    act(() => t.game().hotseat!.addSeat(BOB));

    expect(t.game().hotseat?.seats).toEqual(["offline", "opponent"]);
    expect(t.game().hotseat?.active).toBe("offline");
    const pool = t.players().opponent.pool!;
    expect(pool.hero.name).toBe("Bob");
    expect(pool.hand).toHaveLength(1);
    expect(t.positions().opponent.tokens).toHaveLength(1);
    expect(t.positions().opponent.tokens[0].id).toMatch(/^opponent/);
    expect(t.game().deckFor?.("opponent")).toBe(BOB);
    expect(logTexts(t.players().offline)).toEqual(["Added Bob as opponent"]);
    // The first seat is untouched — its hand still auto-inits as before.
    expect(t.players().offline.pool).toBeUndefined();
  });

  it("holds one opponent at most", () => {
    const t = setup();
    act(() => t.game().hotseat!.addSeat(BOB));
    act(() => t.game().hotseat!.addSeat(CAROL));
    expect(t.game().hotseat?.seats).toEqual(["offline", "opponent"]);
    expect(t.players().opponent.pool?.hero.name).toBe("Bob");
  });

  it("removeSeat drops the opponent and hands control back to the first seat", () => {
    const t = setup();
    act(() => t.game().hotseat!.addSeat(BOB));
    act(() => t.game().hotseat!.setActive("opponent"));
    act(() => t.game().hotseat!.removeSeat("opponent"));
    act(() => t.game().hotseat!.removeSeat("offline")); // never removable

    expect(t.game().hotseat?.seats).toEqual(["offline"]);
    expect(t.game().hotseat?.active).toBe("offline");
    expect(Object.keys(t.players())).toEqual(["offline"]);
    expect(t.positions().opponent).toBeUndefined();
    expect(t.game().deckFor?.("opponent")).toBeUndefined();
  });
});

describe("setActive", () => {
  it("routes setPlayerState, setPlayerPosition and logAction to the active seat", () => {
    const t = setup();
    act(() => t.game().hotseat!.addSeat(BOB));
    act(() => t.game().hotseat!.setActive("opponent"));
    expect(t.game().hotseat?.active).toBe("opponent");

    const before = t.players().offline;
    const pool = { ...t.players().opponent.pool!, hand: [] };
    act(() => t.game().setPlayerState()({ pool }));
    act(() => t.game().logAction("opponent moved"));
    act(() => t.game().setPlayerPosition.current({ color: "blue", tokens: [] }));

    expect(t.players().opponent.pool?.hand).toEqual([]);
    expect(logTexts(t.players().opponent)).toEqual(["opponent moved"]);
    expect(t.positions().opponent).toEqual({ color: "blue", tokens: [] });
    expect(t.players().offline).toBe(before);

    act(() => t.game().hotseat!.setActive("offline"));
    act(() => t.game().logAction("back to me"));
    expect(logTexts(t.players().offline)).toEqual(["Added Bob as opponent", "back to me"]);
  });

  it("ignores a seat that does not exist", () => {
    const t = setup();
    act(() => t.game().hotseat!.setActive("opponent"));
    expect(t.game().hotseat?.active).toBe("offline");
  });
});

describe("reset and switch with two seats", () => {
  it("New game reseeds every seat from its own deck", () => {
    const t = setup();
    act(() => t.game().hotseat!.addSeat(BOB));
    act(() => t.game().hotseat!.setActive("opponent"));
    act(() => t.game().logAction("mid-game"));
    act(() => t.game().setPlayerPosition.current({ color: "blue", tokens: [] }));
    act(() => t.game().requestGameReset());

    expect(t.players().offline.pool?.hero.name).toBe("Alice");
    expect(t.players().opponent.pool?.hero.name).toBe("Bob");
    expect(allCards(t.players().opponent.pool).every((c) => c === "Bob card")).toBe(true);
    expect(logTexts(t.players().offline)).toEqual(["New game started by opponent"]);
    expect(t.players().opponent.actionLog).toBeUndefined();
    expect(t.positions().offline.tokens).toHaveLength(1);
    expect(t.positions().opponent.tokens).toHaveLength(1);
    expect(t.game().hotseat?.seats).toEqual(["offline", "opponent"]);
  });

  it("Change my deck reseeds the active seat only", () => {
    const t = setup();
    act(() => t.game().hotseat!.addSeat(BOB));
    act(() => t.game().requestGameReset());
    const firstSeat = t.players().offline;
    const firstBoard = t.positions().offline;

    act(() => t.game().hotseat!.setActive("opponent"));
    act(() => t.game().switchDeck(CAROL));

    expect(t.players().opponent.pool?.hero.name).toBe("Carol");
    expect(logTexts(t.players().opponent)).toEqual(["Switched to Carol"]);
    expect(t.players().offline).toBe(firstSeat);
    expect(t.positions().offline).toBe(firstBoard);
    expect(t.game().deckFor?.("opponent")).toBe(CAROL);

    // …and the next New game keeps the opponent on their new deck.
    act(() => t.game().requestGameReset());
    expect(t.players().opponent.pool?.hero.name).toBe("Carol");
  });
});

describe("local card handoff", () => {
  const twoSeats = () => {
    const t = setup();
    act(() => t.game().hotseat!.addSeat(BOB));
    act(() => t.game().requestGameReset()); // both seats now have pools
    return t;
  };

  it.each([
    ["hand", (p: PoolType) => p.hand],
    ["discard", (p: PoolType) => p.discard],
    ["deckTop", (p: PoolType) => p.deck!.slice(-1)],
    ["deckBottom", (p: PoolType) => p.deck!.slice(0, 1)],
  ] as const)("a transfer moves the card straight into the recipient's %s", (zone, pick) => {
    const t = twoSeats();
    const mine = t.players().offline.pool!;
    const card = mine.hand[0];
    const handBefore = mine.hand.length;
    const recipientBefore = allCards(t.players().opponent.pool).length;

    // HandContainer splices the card out of the giver's pool, then offers it.
    const after = { ...mine, hand: mine.hand.slice(1) };
    act(() => t.game().offerCardTransfer("opponent", zone, card, after));

    expect(t.players().offline.pool!.hand).toHaveLength(handBefore - 1);
    expect(pick(t.players().opponent.pool!)).toContainEqual(card);
    expect(allCards(t.players().opponent.pool)).toHaveLength(recipientBefore + 1);
    expect(logTexts(t.players().opponent)).toEqual(["Received a card from offline"]);
  });

  it("claiming another seat's card token moves its card to my hand and drops the token", () => {
    const t = twoSeats();
    const card = t.players().opponent.pool!.hand[0];
    act(() => t.game().hotseat!.setActive("opponent"));
    act(() =>
      t.game().setPlayerPosition.current({
        color: "blue",
        tokens: [
          { id: "opponent-disc", x: 1, y: 1 },
          { id: "opponent-card", x: 2, y: 2, card },
        ],
      }),
    );
    act(() => t.game().hotseat!.setActive("offline"));
    const handBefore = t.players().offline.pool!.hand.length;

    act(() => t.game().claimTableCard("opponent-card", "opponent"));

    expect(t.players().offline.pool!.hand).toHaveLength(handBefore + 1);
    expect(t.players().offline.pool!.hand).toContainEqual(card);
    expect(t.positions().opponent).toEqual({
      color: "blue",
      tokens: [{ id: "opponent-disc", x: 1, y: 1 }],
    });
    expect(logTexts(t.players().opponent)).toEqual(["offline picked up a card from the table"]);

    // Claiming again (token gone) or a token with no card is a no-op.
    const snapshot = t.players();
    act(() => t.game().claimTableCard("opponent-card", "opponent"));
    act(() => t.game().claimTableCard("opponent-disc", "opponent"));
    expect(t.players()).toBe(snapshot);
  });

  it("a transfer to a seat with no pool yet returns the card to the giver", () => {
    const t = setup();
    act(() => t.game().hotseat!.addSeat(BOB));
    act(() => t.game().hotseat!.setActive("opponent"));
    const mine = t.players().opponent.pool!;
    const card = mine.hand[0];
    act(() =>
      t.game().offerCardTransfer("offline", "hand", card, { ...mine, hand: mine.hand.slice(1) }),
    );
    expect(t.players().opponent.pool!.hand).toEqual([card]);
    expect(t.players().offline.pool).toBeUndefined();
  });
});
