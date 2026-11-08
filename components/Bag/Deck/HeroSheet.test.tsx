/**
 * Hero sheet (#1576). Roster rules carried over from the old HeroCard:
 * #749 — a solo hero's blank API sidekick stub renders no sidekick;
 * #500 — extraCharacters rows survive.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { mockDeck } from "../../../_mocks_/deck";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { deckComposition, HeroSheet } from "./HeroSheet";

// jsdom can't run Chakra's modal focus-lock selectors; the editors have their own coverage.
jest.mock("./EditCardback", () => ({
  EditCardbackModal: () => <p>cardback editor</p>,
}));

const make = (
  over: Partial<DeckImportType["deck_data"]> = {},
  top: Partial<DeckImportType> = {},
) =>
  ({
    ...mockDeck,
    note: "",
    user: "Lusk",
    ...top,
    deck_data: {
      ...mockDeck.deck_data,
      hero: {
        name: "Goldhorn",
        hp: 9,
        move: 3,
        isRanged: false,
        specialAbility: "Bloom tokens.",
      },
      sidekick: { name: "", hp: null, quantity: 0, isRanged: false, quote: "" },
      extraCharacters: undefined,
      ...over,
    },
  }) as DeckImportType;

const renderSheet = (deck: DeckImportType, onSave?: () => void) =>
  render(
    <ChakraProvider>
      <HeroSheet deck={deck} onSave={onSave} />
    </ChakraProvider>,
  );

describe("HeroSheet", () => {
  it("solo hero: name, stats, labelled ability, no sidekick", () => {
    renderSheet(make());
    expect(
      screen.getByRole("heading", { name: "Goldhorn" }),
    ).toBeInTheDocument();
    expect(screen.getByText("solo fighter")).toBeInTheDocument();
    expect(screen.getByText("melee")).toBeInTheDocument();
    expect(screen.getByText("SPECIAL ABILITY")).toBeInTheDocument();
    expect(screen.getByText(/Bloom tokens\./)).toBeInTheDocument();
    expect(screen.queryByLabelText("sidekick")).toBeNull();
  });

  it("a fielded sidekick replaces the solo chip", () => {
    renderSheet(
      make({
        sidekick: {
          name: "Merlin",
          hp: 5,
          quantity: 1,
          isRanged: true,
          quote: "",
        },
      }),
    );
    expect(screen.queryByText("solo fighter")).toBeNull();
    expect(screen.getByText("Merlin")).toBeInTheDocument();
    expect(screen.getByLabelText("sidekick")).toBeInTheDocument();
  });

  it("extraCharacters render as rows, blank ones dropped", () => {
    renderSheet(
      make({
        extraCharacters: [
          {
            hero: {
              name: "Skeleton",
              hp: 1,
              move: 2,
              isRanged: false,
              specialAbility: "Rattles.",
            },
            sidekick: {
              name: "Sidekick",
              hp: null,
              quantity: 0,
              isRanged: false,
              quote: "",
            },
          },
          {
            hero: {
              name: "",
              hp: 0,
              move: 0,
              isRanged: false,
              specialAbility: "",
            },
            sidekick: {
              name: "Sidekick",
              hp: null,
              quantity: 0,
              isRanged: false,
              quote: "",
            },
          },
        ],
      }),
    );
    expect(screen.getByText("Skeleton")).toBeInTheDocument();
    expect(screen.getByText("Rattles.")).toBeInTheDocument();
    expect(screen.getAllByText(/melee|ranged/)).toHaveLength(2);
  });

  it("clamps notes behind an expander and keeps links clickable", () => {
    renderSheet(make({}, { note: "Lore https://example.com/x here" }));
    const toggle = screen.getByRole("button", { name: /Read the deck notes/ });
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: /Hide the deck notes/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "https://example.com/x" }),
    ).toHaveAttribute("href", "https://example.com/x");
  });

  it("no notes: no expander", () => {
    renderSheet(make());
    expect(screen.queryByRole("button", { name: /deck notes/ })).toBeNull();
  });

  it("Hero info only on image decks; Tokens carries the count; both need onSave", () => {
    const { unmount } = renderSheet(
      make(
        {},
        { tags: ["image-deck"], savedTokens: [{} as never, {} as never] },
      ),
      jest.fn(),
    );
    expect(
      screen.getByRole("button", { name: "Hero info" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tokens (2)" }),
    ).toBeInTheDocument();
    unmount();
    renderSheet(make({}, { tags: ["image-deck"] }));
    expect(screen.queryByRole("button", { name: "Hero info" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tokens/ })).toBeNull();
  });

  it("cardback portrait opens the cardback editor", () => {
    renderSheet(make(), jest.fn());
    fireEvent.click(screen.getByRole("button", { name: "Change cardback" }));
    expect(screen.getByText("cardback editor")).toBeInTheDocument();
  });

  it("composition is weighted by quantity and skips hero/rule cards", () => {
    const base = mockDeck.deck_data.cards[0];
    const { counts, total, unique } = deckComposition([
      { ...base, type: "attack", quantity: 3 },
      { ...base, type: "scheme", quantity: 2 },
      { ...base, type: "attack", quantity: 1, isCharacterCard: true },
    ]);
    expect(counts).toEqual({ attack: 3, versatile: 0, defence: 0, scheme: 2 });
    expect(total).toBe(5);
    expect(unique).toBe(2);
    renderSheet(
      make({
        cards: [
          { ...base, type: "attack", quantity: 3 },
          { ...base, type: "scheme", quantity: 2 },
        ],
      }),
    );
    expect(screen.getByText("3 attack")).toBeInTheDocument();
    expect(screen.getByText("2 scheme")).toBeInTheDocument();
    expect(screen.getByText("5 cards · 2 unique")).toBeInTheDocument();
  });
});
