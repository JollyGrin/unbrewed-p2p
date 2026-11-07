/**
 * #1512: every /bag add path reports its `source` (pushDeck turns that into
 * `deck_added`, see lib/bag/useBag.test.tsx) and its fetch/parse failures as
 * `deck_add_failed` with a reason class, never message text.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReactNode } from "react";

import { CodePanel } from "./AddDeckHub/CodePanel";
import { AddJson } from "./Deck/AddJson";
import { StarterDeckContainer } from "./StarterDecks";
import { PopularDecks } from "./PopularDecks";
import { AddImageDeck } from "./ImageDeck";
import { BagBulkContainer } from "./Bulk";
import { POPULAR_DECKS } from "@/lib/constants/top-decks";

const mockTrack = jest.fn();
jest.mock("../../lib/analytics", () => ({
  ...jest.requireActual("../../lib/analytics"),
  track: (...a: unknown[]) => mockTrack(...a),
}));

jest.mock("react-hot-toast", () => {
  const toast: any = () => {};
  toast.success = jest.fn();
  toast.error = jest.fn();
  return { toast };
});

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, push: jest.fn() }) }));

// Card art is beside the point here.
jest.mock("./Deck/DeckCards", () => ({ DeckCards: () => null }));
jest.mock("../CardFactory/Card", () => ({ Card: () => null }));

const mockUnmatched = {
  data: undefined as unknown,
  error: undefined as unknown,
  deckId: undefined as string | undefined,
};
jest.mock("../../lib/hooks/useUnmatchedDeck", () => ({
  useUnmatchedDeck: () => ({
    data: mockUnmatched.data,
    error: mockUnmatched.error,
    deckId: mockUnmatched.deckId,
    isLoading: false,
    setDeckId: () => {},
  }),
}));

jest.mock("./StarterDecks/useStarterDecks", () => ({
  useStarterDecks: () => [{ status: "success", data: { id: "s1", name: "Thrall" } }],
}));

const mockFetchDeck = jest.fn();
jest.mock("../../lib/evergreenDecks", () => ({
  ...jest.requireActual("../../lib/evergreenDecks"),
  fetchDeckById: (id: string) => mockFetchDeck(id),
}));

const mockPushDeck = jest.fn(async (..._a: unknown[]) => true);
const mockImportDecks = jest.fn(async (decks: unknown[]) => decks.length);
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({
    decks: [],
    star: "",
    pushDeck: mockPushDeck,
    setStar: () => {},
    importDecks: mockImportDecks,
  }),
  useBagMaps: () => ({ data: [], importMaps: async () => 0 }),
}));
jest.mock("../../lib/account/useAccount", () => ({ useAccount: () => ({ status: "guest" }) }));
jest.mock("../../lib/hooks/useGenericImport", () => ({ useGenericImport: () => ({}) }));
jest.mock("./Account", () => ({ AccountBagPanel: () => null }));

const wrap = (node: ReactNode) => render(<ChakraProvider>{node}</ChakraProvider>);
const DECK = { id: "abc", name: "Custom Name", deck_data: { hero: { name: "Thrall" }, cards: [] } };

beforeEach(() => {
  mockTrack.mockClear();
  mockPushDeck.mockClear();
  mockUnmatched.data = undefined;
  mockUnmatched.error = undefined;
  mockUnmatched.deckId = undefined;
});

describe("CodePanel", () => {
  it("saves with source code", async () => {
    mockUnmatched.data = DECK;
    mockUnmatched.deckId = "abc";
    const pushDeck = jest.fn(async (..._a: unknown[]) => true);
    wrap(<CodePanel code="abc" pushDeck={pushDeck} setStar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save for later" }));
    await waitFor(() => expect(pushDeck).toHaveBeenCalled());
    expect(pushDeck.mock.calls[0][1]).toMatchObject({ source: "code" });
  });

  const NOT_FOUND = { response: { status: 404 }, message: "Request failed with status code 404" };

  it("reports a complete code that fails, once, by HTTP status", () => {
    mockUnmatched.error = NOT_FOUND;
    mockUnmatched.deckId = "zzzz";
    const { rerender } = wrap(<CodePanel code="zzzz" pushDeck={jest.fn()} setStar={() => {}} />);
    rerender(
      <ChakraProvider>
        <CodePanel code="zzzz" pushDeck={jest.fn()} setStar={() => {}} />
      </ChakraProvider>,
    );
    expect(mockTrack.mock.calls).toEqual([["deck_add_failed", { source: "code", reason: 404 }]]);
  });

  it("reports nothing while a partial code is still being typed", () => {
    mockUnmatched.error = NOT_FOUND;
    const panel = () => (
      <ChakraProvider>
        <CodePanel code={mockUnmatched.deckId ?? ""} pushDeck={jest.fn()} setStar={() => {}} />
      </ChakraProvider>
    );
    mockUnmatched.deckId = "p";
    const { rerender } = render(panel());
    for (const partial of ["pk", "pk1", "labs:"]) {
      mockUnmatched.deckId = partial;
      rerender(panel());
    }
    expect(mockTrack).not.toHaveBeenCalled();
  });
});

describe("AddJson (#1538)", () => {
  it("saves a single pasted deck with source json", async () => {
    wrap(<AddJson bundle={{ decks: [DECK as any], maps: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Save for later" }));
    await waitFor(() => expect(mockPushDeck).toHaveBeenCalled());
    expect(mockPushDeck.mock.calls[0][1]).toMatchObject({ source: "json" });
  });

  it("imports a multi-deck bundle as one bulk deck_added", async () => {
    const decks = [1, 2].map((n) => ({ id: `d${n}`, name: `Mine ${n}`, deck_data: {} })) as any[];
    wrap(<AddJson bundle={{ decks, maps: [] }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Import 2 new items/ }));
    });
    expect(mockTrack.mock.calls).toEqual([["deck_added", { source: "bulk", deck_count: 2 }]]);
  });
});

it("StarterDeckContainer adds with source starter", () => {
  const pushDeck = jest.fn(async () => true);
  wrap(<StarterDeckContainer pushDeck={pushDeck} />);
  fireEvent.click(screen.getByRole("button", { name: /Thrall/ }));
  expect(pushDeck).toHaveBeenCalledWith({ id: "s1", name: "Thrall" }, { source: "starter" });
});

describe("PopularDecks", () => {
  const first = POPULAR_DECKS.find((d) => d.tier !== "reflavored" && d.tier !== "lab")!;
  const tile = () => screen.getByText(first.name);

  it("adds with source popular", async () => {
    mockFetchDeck.mockResolvedValueOnce(DECK);
    const pushDeck = jest.fn(async () => true);
    wrap(<PopularDecks pushDeck={pushDeck} setStar={() => {}} />);
    fireEvent.click(tile());
    await waitFor(() => expect(pushDeck).toHaveBeenCalledWith(DECK, { source: "popular" }));
  });

  it("reports a failed fetch", async () => {
    mockFetchDeck.mockRejectedValueOnce({ response: { status: 503 } });
    wrap(<PopularDecks pushDeck={jest.fn()} setStar={() => {}} />);
    fireEvent.click(tile());
    await waitFor(() =>
      expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", { source: "popular", reason: 503 }),
    );
  });
});

describe("AddImageDeck", () => {
  it("reports an unreadable TTS export as a parse error (tts)", () => {
    wrap(<AddImageDeck />);
    fireEvent.change(screen.getByPlaceholderText(/paste the TTS JSON/), {
      target: { value: "{not json" },
    });
    expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", {
      source: "tts",
      reason: "parse_error",
    });
  });

  it("saves an image-URL deck with source image", async () => {
    wrap(<AddImageDeck />);
    fireEvent.click(screen.getByRole("button", { name: "Image URLs" }));
    fireEvent.change(screen.getByPlaceholderText(/raw.githubusercontent/), {
      target: { value: "https://example.com/a.png, 2, Quickdraw" },
    });
    const name = screen.getByText("Deck name").parentElement!.querySelector("input")!;
    fireEvent.change(name, { target: { value: "My Secret Brew" } });
    // the same three actions as a fetched deck (#1538 review)
    expect(screen.getByRole("button", { name: "▶ Solo table" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "⚔ Invite a friend" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save for later/ }));
    await waitFor(() => expect(mockPushDeck).toHaveBeenCalled());
    expect(mockPushDeck.mock.calls[0][1]).toEqual({ source: "image" });
    expect((mockPushDeck.mock.calls[0][0] as { name: string }).name).toBe("My Secret Brew");
  });
});

describe("BagBulkContainer", () => {
  it("sends one deck_added for the whole import, with the count", async () => {
    wrap(<BagBulkContainer />);
    const decks = [1, 2, 3].map((n) => ({ id: `d${n}`, name: `Mine ${n}`, deck_data: {} }));
    fireEvent.change(screen.getByPlaceholderText(/paste backup JSON/), {
      target: { value: JSON.stringify({ decks, maps: [] }) },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Import 3 new items/ }));
    });
    expect(mockTrack.mock.calls).toEqual([["deck_added", { source: "bulk", deck_count: 3 }]]);
  });

  it("reports blocked_author when every new deck is by a blocked author", async () => {
    mockImportDecks.mockResolvedValueOnce(0);
    wrap(<BagBulkContainer />);
    const decks = [{ id: "j1", name: "Death", user: "JOWEE", deck_data: {} }];
    fireEvent.change(screen.getByPlaceholderText(/paste backup JSON/), {
      target: { value: JSON.stringify({ decks, maps: [] }) },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Import 1 new item/ }));
    });
    expect(mockTrack.mock.calls).toEqual([
      ["deck_add_failed", { source: "bulk", reason: "blocked_author" }],
    ]);
  });
});
