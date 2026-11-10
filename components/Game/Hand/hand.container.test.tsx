/**
 * HandContainer's auto-init deals the seat's deck (issue #1563): `deckFor`
 * from the game context when present, the bag's starred deck otherwise.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, render } from "@testing-library/react";
import { WebGameContext } from "../../../lib/contexts/WebGameProvider";
import { HandContainer } from "./hand.container";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: { name: "me" } }),
}));
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mkDeck = (id: string, hero: string) => ({
  id,
  name: hero,
  deck_data: {
    name: hero,
    appearance: {},
    hero: { name: hero, hp: 10, move: 2, isRanged: false, specialAbility: "" },
    sidekick: { name: "", hp: null, isRanged: false, quantity: 0, quote: "" },
    cards: [{ title: `${hero} card`, quantity: 8, imageUrl: "https://x/c.png" }],
  },
});
const STARRED = mkDeck("starred", "Starred Hero");
const SEAT = mkDeck("seat", "Seat Hero");

jest.mock("../../../lib/bag/useBag", () => ({
  useBagDecks: () => ({ starredDeck: STARRED }),
}));

const setPool = jest.fn();
const mount = (ctx?: Record<string, unknown>, pool?: unknown) =>
  render(
    <ChakraProvider>
      <WebGameContext.Provider value={ctx as never}>
        <HandContainer
          setModal={jest.fn()}
          gameState={
            { content: { players: { me: { pool } } } } as never
          }
          setPlayerState={() => setPool}
          logAction={jest.fn()}
        />
      </WebGameContext.Provider>
    </ChakraProvider>,
  );

const dealtHero = () => {
  act(() => {
    jest.advanceTimersByTime(600);
  });
  expect(setPool).toHaveBeenCalledTimes(1);
  return setPool.mock.calls[0][0].pool.hero.name;
};

beforeEach(() => {
  jest.useFakeTimers();
  setPool.mockClear();
});
afterEach(() => jest.useRealTimers());

it("deals the starred deck with no provider fields (online path)", () => {
  mount(undefined);
  expect(dealtHero()).toBe("Starred Hero");
});

it("deals the starred deck when the provider has no deckFor", () => {
  mount({});
  expect(dealtHero()).toBe("Starred Hero");
});

it("deals the seat's deck when deckFor provides one", () => {
  const deckFor = jest.fn((name: string) => (name === "me" ? SEAT : undefined));
  mount({ deckFor });
  expect(dealtHero()).toBe("Seat Hero");
  expect(deckFor).toHaveBeenCalledWith("me");
});

it("falls back to the starred deck when deckFor has nothing for the seat", () => {
  mount({ deckFor: () => undefined });
  expect(dealtHero()).toBe("Starred Hero");
});

it("deals nothing when the seat already has a pool", () => {
  mount({ deckFor: () => SEAT }, { hand: [] });
  act(() => {
    jest.advanceTimersByTime(600);
  });
  expect(setPool).not.toHaveBeenCalled();
});
