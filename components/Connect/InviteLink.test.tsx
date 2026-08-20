import "@testing-library/jest-dom";
import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { InviteLink } from "./InviteLink";

/**
 * Issue #640: the "Bundle a deck for them" select used `version_id` as the
 * option value, and version ids are NOT unique in the bag — every committed
 * newly minted evergreen deck ships "evergreen-1" and every TTS import
 * gets "1". Picking
 * the second deck with a shared version snapped the controlled <select> back
 * to the first one, and the copied link carried an ambiguous deckId.
 */

jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const deck = (id: string, name: string, version_id: string): DeckImportType =>
  ({ id, name, version_id }) as unknown as DeckImportType;

// two decks that share a version_id, exactly like the bag in the report
const clones = deck("clone-troopers", "The Clone Troopers", "evergreen-1");
const xeno = deck("xenomorph", "Xenomorph", "evergreen-1");

const writeText = jest.fn().mockResolvedValue(undefined);

const Harness = ({ lobby = "my-lobby" }: { lobby?: string }) => {
  const gidRef = createRef<HTMLInputElement>();
  return (
    <ChakraProvider>
      <input ref={gidRef} defaultValue={lobby} readOnly />
      <InviteLink
        lobby={lobby}
        decks={[clones, xeno]}
        activeServer="https://server.test"
        gidRef={gidRef}
      />
    </ChakraProvider>
  );
};

const renderInvite = () => {
  const view = render(<Harness />);
  fireEvent.click(screen.getByText("＋ Invite a friend with a link"));
  return view;
};

const select = () =>
  screen.getByLabelText(
    "Bundle a deck for them (optional):",
  ) as HTMLSelectElement;

beforeAll(() => {
  Object.defineProperty(window, "location", {
    value: { origin: "https://unbrewed.test" },
    writable: true,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

beforeEach(() => writeText.mockClear());

describe("InviteLink — bundle a deck (issue #640)", () => {
  it("keeps the second same-version deck selected", () => {
    renderInvite();

    // options are keyed by the deck's unique id, not the shared version_id
    expect([...select().options].map((o) => o.value)).toEqual([
      "",
      "clone-troopers",
      "xenomorph",
    ]);

    fireEvent.change(select(), { target: { value: "xenomorph" } });
    expect(select().value).toBe("xenomorph");
  });

  it("copies a link carrying that deck's id", async () => {
    renderInvite();
    fireEvent.change(select(), { target: { value: "xenomorph" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Copy Invite Link"));
    });

    const url = new URL(writeText.mock.calls[0][0]);
    expect(url.pathname).toBe("/join");
    expect(url.searchParams.get("gid")).toBe("my-lobby");
    expect(url.searchParams.get("deckId")).toBe("xenomorph");
  });

  it("omits deckId when the host lets the friend choose", async () => {
    renderInvite();

    await act(async () => {
      fireEvent.click(screen.getByText("Copy Invite Link"));
    });

    const url = new URL(writeText.mock.calls[0][0]);
    expect(url.searchParams.has("deckId")).toBe(false);
  });

  it("collapses back to the disabled button when the lobby is cleared", () => {
    const { rerender } = renderInvite();
    expect(select()).toBeInTheDocument();

    rerender(<Harness lobby="" />);
    expect(
      screen.getByText("Name a lobby above to invite a friend"),
    ).toBeInTheDocument();
  });
});
