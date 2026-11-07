/**
 * #1538: one paste bar, no method to choose. What the player pastes decides
 * which panel opens underneath, filled in; garbage gets the "not a deck we
 * recognise" line naming the three sites, and nothing is fetched.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ttsSave from "@/lib/labs/fixtures/tts-save.pink-panther.json";
import { AddDeckHub } from "./index";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, push: jest.fn() }) }));
// The panels keep their internals; here only the routing to them is under test.
jest.mock("./LabsPanel", () => ({
  LabsPanel: ({ link }: { link: string }) => <p>labs panel: {link}</p>,
}));
jest.mock("./CodePanel", () => ({
  CodePanel: ({ code }: { code: string }) => <p>code panel: {code}</p>,
}));
jest.mock("../Deck/AddJson", () => ({
  AddJson: ({ bundle }: { bundle: { decks: { name: string }[] } }) => (
    <p>json panel: {bundle.decks.map((d) => d.name).join(",")}</p>
  ),
}));
jest.mock("../ImageDeck", () => ({
  AddImageDeck: ({ initialTts }: { initialTts?: string }) => (
    <p>image panel: {initialTts ? "tts loaded" : "empty"}</p>
  ),
}));
jest.mock("../PopularDecks", () => ({ PopularDecks: () => <p>popular decks list</p> }));
jest.mock("../StarterDecks", () => ({ StarterDeckContainer: () => <p>starter decks list</p> }));

const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockClear();
  global.fetch = mockFetch as unknown as typeof fetch;
});

const renderHub = () =>
  render(
    <ChakraProvider>
      <AddDeckHub pushDeck={async () => true} setStar={() => {}} />
    </ChakraProvider>,
  );

const paste = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText("Paste a deck link, code or JSON"), {
    target: { value },
  });

describe("AddDeckHub paste bar", () => {
  it("an Unmatched Labs link opens the Labs panel with the link", () => {
    renderHub();
    paste("https://www.unmatchedlabs.com/shared/abc123def456abc123def456");
    expect(
      screen.getByText("labs panel: https://www.unmatchedlabs.com/shared/abc123def456abc123def456"),
    ).toBeInTheDocument();
  });

  it("an unmatched.cards URL and a bare code open the code panel with the code", () => {
    renderHub();
    paste("https://unmatched.cards/decks/p82X/versions/EZYf44");
    expect(screen.getByText("code panel: p82X")).toBeInTheDocument();
    paste("pk1x");
    expect(screen.getByText("code panel: pk1x")).toBeInTheDocument();
  });

  it("deck JSON and a backup bundle open the JSON panel", () => {
    renderHub();
    paste(JSON.stringify({ id: "a", name: "Alpha", deck_data: {} }));
    expect(screen.getByText("json panel: Alpha")).toBeInTheDocument();
    paste(JSON.stringify({ decks: [{ id: "a", name: "Alpha", deck_data: {} }, { id: "b", name: "Bravo", deck_data: {} }], maps: [] }));
    expect(screen.getByText("json panel: Alpha,Bravo")).toBeInTheDocument();
  });

  it("a Tabletop Simulator export, pasted or dropped as a file, opens the image panel loaded", async () => {
    renderHub();
    paste(JSON.stringify(ttsSave));
    expect(screen.getByText(/Tabletop Simulator export · \d+ unique cards/)).toBeInTheDocument();
    expect(screen.getByText("image panel: tts loaded")).toBeInTheDocument();

    paste("");
    expect(screen.queryByText(/image panel/)).not.toBeInTheDocument();
    const file = new File([JSON.stringify(ttsSave)], "club-deck.json", { type: "application/json" });
    file.text = async () => JSON.stringify(ttsSave);
    fireEvent.change(screen.getByTestId("paste-file"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("image panel: tts loaded")).toBeInTheDocument());
  });

  it("a the-unmatched.club page link asks for the TTS export instead of failing silently", () => {
    renderHub();
    paste("https://the-unmatched.club/decks/42");
    expect(screen.getByRole("alert")).toHaveTextContent(/export the deck for Tabletop Simulator/);
  });

  it("garbage: 'not a deck we recognise' naming the three sites, no panel, no fetch", () => {
    renderHub();
    paste("definitely not a deck");
    const line = screen.getByRole("alert");
    expect(line).toHaveTextContent("Not a deck we recognise");
    expect(screen.getByRole("link", { name: "unmatched.cards" })).toHaveAttribute(
      "href",
      "https://unmatched.cards/decks",
    );
    expect(screen.getByRole("link", { name: "Unmatched Labs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "the-unmatched.club" })).toBeInTheDocument();
    expect(screen.queryByText(/panel:/)).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("Popular and Starter decks open inline from the text links", () => {
    renderHub();
    fireEvent.click(screen.getByRole("button", { name: "Browse popular decks" }));
    expect(screen.getByText("popular decks list")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Starter decks" }));
    expect(screen.getByText("starter decks list")).toBeInTheDocument();
    expect(screen.queryByText("popular decks list")).not.toBeInTheDocument();
  });
});
