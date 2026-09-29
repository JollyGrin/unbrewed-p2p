import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { elliotDeck, labsDeck } from "@/lib/tableplace/fixtures/decks";
import type { TablePlaceError } from "@/lib/tableplace/api";
import { TablePage } from "./TablePage";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, isReady: true }),
}));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("../Connect/SelectedDeck", () => ({
  SelectedDeckContainer: () => null,
}));
jest.mock("../DeckLink/DeckLinkHold", () => ({
  DeckLinkHold: () => null,
}));
jest.mock("./OpponentPicker", () => ({ OpponentPicker: () => null }));
jest.mock("../../lib/hooks/useDeckLink", () => ({
  useDeckLink: () => ({ held: undefined, failed: undefined }),
}));

const mockValidate = jest.fn();
jest.mock("../../lib/tableplace/api", () => ({
  ...jest.requireActual("../../lib/tableplace/api"),
  validateLobby: (...a: unknown[]) => mockValidate(...a),
}));

const mockMaps = [{ imgUrl: "/m1.webp" }, { imgUrl: "/m2.webp" }];
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({
    decks: [],
    starredDeck: mockDecks.mine,
    setStar: jest.fn(),
    isLoading: false,
  }),
  useBagMaps: () => ({ data: mockMaps }),
}));
jest.mock("./useOpponentDeck", () => ({
  useOpponentDeck: () => ({ deck: mockDecks.theirs }),
}));
jest.mock("./useImageSize", () => ({
  useImageSize: () => ({
    size: { width: 1000, height: 800 },
    isLoading: false,
    failed: false,
  }),
}));

const mockDecks: { mine?: unknown; theirs?: unknown } = {};

const err = (over: Partial<TablePlaceError>): TablePlaceError => ({
  status: 400,
  code: "missing_deck_slot",
  message: "Pack 'x' (seat 0) is missing deck slot 'deck'.",
  retryable: false,
  ...over,
});

const createTable = async () => {
  const button = screen.getByTestId("create") as HTMLButtonElement;
  // A click on a disabled button is a silent no-op: make sure it's live.
  await waitFor(() => expect(button.disabled).toBe(false), { timeout: 5000 });
  fireEvent.click(button);
  return screen.findByTestId("api-error", {}, { timeout: 5000 });
};

const setup = () => {
  // Fresh decks each test: nothing carries over from an earlier one.
  mockDecks.mine = labsDeck();
  mockDecks.theirs = elliotDeck();
  render(<TablePage />);
  fireEvent.change(screen.getByTestId("map"), {
    target: { value: "/m1.webp" },
  });
};

describe("TablePage — create flow error box (issue #1061)", () => {
  afterEach(() => mockValidate.mockReset());

  it("a non-retryable 4xx shows friendly copy, the API message in <details>, and report links", async () => {
    mockValidate.mockResolvedValue({ ok: false, error: err({}) });
    setup();
    const box = await createTable();
    expect(box.textContent).toContain(
      "We couldn't lay out this table. That's a bug on our side.",
    );
    const details = box.querySelector("details");
    expect(details?.textContent).toContain("missing deck slot");
    expect(box.querySelector("p")?.textContent).not.toContain("missing deck");
    expect(
      [...box.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ).toEqual([
      "https://github.com/JollyGrin/unbrewed-p2p/issues/new",
      "https://discord.gg/qPxHFjwkNN",
    ]);
  });

  it("a retryable failure shows the API message and the retry copy, not the bug copy", async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      error: err({
        status: 0,
        code: "timeout",
        message: "table.place didn't answer.",
        retryable: true,
      }),
    });
    setup();
    const box = await createTable();
    expect(box.textContent).toContain("table.place didn't answer.");
    expect(box.textContent).toContain("Try again once you're back online.");
    expect(box.textContent).not.toContain("bug on our side");
  });

  it("clears the error when the composed table changes", async () => {
    mockValidate.mockResolvedValue({ ok: false, error: err({}) });
    setup();
    await createTable();
    fireEvent.change(screen.getByTestId("map"), {
      target: { value: "/m2.webp" },
    });
    await waitFor(() => expect(screen.queryByTestId("api-error")).toBeNull());
  });
});
