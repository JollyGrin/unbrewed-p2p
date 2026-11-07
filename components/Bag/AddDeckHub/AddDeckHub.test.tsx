/**
 * #1538: one paste bar, no method to choose. What the player pastes decides
 * which panel opens underneath, filled in; garbage gets the "not a deck we
 * recognise" line naming the three sites, and nothing is fetched.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ttsSave from "@/lib/labs/fixtures/tts-save.pink-panther.json";
import ripley from "@/lib/labs/fixtures/club-export.ellen-ripley.json";
import dope from "@/public/evergreen-decks/DOPE.json";
import { AddDeckHub } from "./index";

const mockTrack = jest.fn();
jest.mock("../../../lib/analytics", () => ({
  ...jest.requireActual("../../../lib/analytics"),
  track: (...a: unknown[]) => mockTrack(...a),
}));

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

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

/**
 * The club panel is the real one here (it is new in this PR): the hero link
 * is fetched through the API proxy, decoded, and lands in the same preview.
 */
describe("AddDeckHub paste bar · the-unmatched.club", () => {
  beforeEach(() => mockTrack.mockClear());

  it("a hero page link fetches through the proxy and lands in the preview with the table buttons", async () => {
    mockFetch.mockImplementation(async () => json(ripley));
    renderHub();
    paste("https://www.the-unmatched.club/c/heroes/ellen-ripley.2304");
    expect(screen.getByRole("status")).toHaveTextContent(/the-unmatched\.club deck 2304 · fetching/);
    await screen.findByTestId("deck-preview");
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/club\/heroes\/2304$/);
    expect(screen.getByRole("status")).toHaveTextContent(/the-unmatched\.club deck · by MrBrownieDL/);
    expect(screen.getByRole("heading", { name: "Ellen Ripley" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "▶ Solo table" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "⚔ Invite a friend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save for later/ })).toBeInTheDocument();
    expect(mockTrack).not.toHaveBeenCalledWith("deck_add_failed", expect.anything());
  });

  it("Save for later saves it with source the-unmatched.club", async () => {
    mockFetch.mockImplementation(async () => json(ripley));
    const pushDeck = jest.fn(async () => true);
    const setStar = jest.fn();
    render(
      <ChakraProvider>
        <AddDeckHub pushDeck={pushDeck} setStar={setStar} />
      </ChakraProvider>,
    );
    paste("https://the-unmatched.club/c/heroes/x.2304");
    await screen.findByTestId("deck-preview");
    fireEvent.click(screen.getByRole("button", { name: /Save for later/ }));
    await waitFor(() => expect(setStar).toHaveBeenCalledWith("club-2304"));
    expect(pushDeck).toHaveBeenCalledWith(
      expect.objectContaining({ id: "club-2304", name: "Ellen Ripley" }),
      expect.objectContaining({ source: "the-unmatched.club" }),
    );
  });

  it("404: no such deck, with the reason reported", async () => {
    mockFetch.mockImplementation(async () => json({ error: "not_found" }, 404));
    renderHub();
    paste("https://the-unmatched.club/c/heroes/nope.999999");
    const line = await screen.findByRole("alert");
    expect(line).toHaveTextContent(/No deck 999999 on the-unmatched\.club/);
    expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", { source: "the-unmatched.club", reason: 404 });
    expect(screen.queryByTestId("deck-preview")).not.toBeInTheDocument();
  });

  it("502, no network, or the proxy not deployed: falls back to the Tabletop Simulator export route, no crash", async () => {
    mockFetch.mockImplementation(async () => json({ error: "upstream" }, 502));
    const { unmount } = renderHub();
    paste("https://the-unmatched.club/c/heroes/x.2304");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn't reach the club right now: export the deck for Tabletop Simulator/,
    );
    expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", { source: "the-unmatched.club", reason: 502 });
    unmount();

    mockTrack.mockClear();
    mockFetch.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { unmount: unmount2 } = renderHub();
    paste("https://the-unmatched.club/c/heroes/x.2304");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't reach the club right now/);
    expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", { source: "the-unmatched.club", reason: "network" });
    unmount2();

    mockTrack.mockClear();
    mockFetch.mockImplementation(async () => json({ ok: false, code: "NOT_FOUND" }, 404));
    renderHub();
    paste("https://the-unmatched.club/c/heroes/x.2304");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't reach the club right now/);
    expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", {
      source: "the-unmatched.club",
      reason: "unavailable",
    });
  });

  it("a non-JSON answer at any status is the club being unavailable, not a missing deck (review)", async () => {
    for (const status of [200, 404]) {
      mockFetch.mockImplementation(async () =>
        Promise.resolve({
          ok: status < 400,
          status,
          json: async () => {
            throw new SyntaxError("Unexpected token <");
          },
        } as unknown as Response),
      );
      mockTrack.mockClear();
      const { unmount } = renderHub();
      paste("https://the-unmatched.club/c/heroes/x.2304");
      expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't reach the club right now/);
      expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", {
        source: "the-unmatched.club",
        reason: "unavailable",
      });
      unmount();
    }
  });

  it("a malformed club body is a parse error shown as 'no deck', never a crash (review)", async () => {
    const body = JSON.parse(JSON.stringify(ripley)) as typeof ripley;
    const data = body.nodes[0].data as unknown[];
    const root = data[0] as { cards: number };
    data[root.cards] = { not: "an array" };
    mockFetch.mockImplementation(async () => json(body));
    renderHub();
    paste("https://the-unmatched.club/c/heroes/x.2304");
    expect(await screen.findByRole("alert")).toHaveTextContent(/No deck 2304 on the-unmatched\.club/);
    expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", {
      source: "the-unmatched.club",
      reason: "parse_error",
    });
  });
});

/** The old "From URL" import (review): a link on no known site is fetched. */
describe("AddDeckHub paste bar · a link that serves deck JSON", () => {
  const text = (body: string, status = 200) =>
    Promise.resolve({ ok: status < 400, status, text: async () => body } as unknown as Response);

  it("deck JSON at a URL opens the JSON panel on the body", async () => {
    mockFetch.mockImplementation(async () => text(JSON.stringify(dope)));
    renderHub();
    paste("https://example.com/decks/jason.json");
    expect(screen.getByRole("status")).toHaveTextContent(/Fetching that link/);
    await waitFor(() => expect(screen.getByText("json panel: Jason Voorhees")).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/decks/jason.json");
  });

  it("a TTS export at a URL opens the image panel loaded", async () => {
    mockFetch.mockImplementation(async () => text(JSON.stringify(ttsSave)));
    renderHub();
    paste("https://example.com/export.json");
    await waitFor(() => expect(screen.getByText("image panel: tts loaded")).toBeInTheDocument());
  });

  it("a page that isn't deck JSON is 'not a deck we recognise'; a failed fetch says so", async () => {
    mockFetch.mockImplementation(async () => text("<!doctype html><p>hi</p>"));
    const { unmount } = renderHub();
    paste("https://example.com/whatever");
    expect(await screen.findByRole("alert")).toHaveTextContent("Not a deck we recognise");
    unmount();

    mockFetch.mockImplementation(async () => text("nope", 404));
    renderHub();
    paste("https://example.com/missing.json");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't fetch that link \(404\)/);
    expect(screen.queryByText(/panel:/)).not.toBeInTheDocument();
  });
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

  it("a the-unmatched.club link that names no deck says which link to paste", () => {
    renderHub();
    paste("https://the-unmatched.club/decks/42");
    expect(screen.getByRole("alert")).toHaveTextContent(/Paste the hero.s page link/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("garbage: 'not a deck we recognise' naming the three sites, no panel, no fetch", () => {
    renderHub();
    for (const word of ["hello", "Medusa", "garbage"]) {
      paste(word);
      expect(screen.getByRole("alert")).toHaveTextContent("Not a deck we recognise");
      expect(screen.queryByText(/panel:/)).not.toBeInTheDocument();
    }
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
