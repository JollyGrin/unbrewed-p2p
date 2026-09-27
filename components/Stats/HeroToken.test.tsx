/**
 * HeroToken fallbacks (#935): art when the snapshot has a real token, the
 * initials disc when it has none (Nancy Drew), when it's a known stub
 * (Specter Knight) or when the image fails — and one snapshot fetch per hero
 * no matter how many tokens show it.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { HeroToken } from "./HeroToken";

const SNAPSHOTS: Record<string, unknown> = {
  "/evergreen-decks/lDOM.json": {
    deck_data: { hero: { tokenImageUrl: "https://unbrewed.xyz/evergreen-decks/art/lDOM/token-mandalorian.webp" } },
  },
  "/evergreen-decks/nPnv.json": { deck_data: { hero: {} } },
  "/evergreen-decks/xBvn.json": {
    deck_data: { hero: { tokenImageUrl: "/evergreen-decks/art/xBvn/token-specter-knight.webp" } },
  },
};

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn(async (url: string) => {
    const body = SNAPSHOTS[url];
    return { ok: !!body, status: body ? 200 : 404, json: async () => body };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const renderTokens = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChakraProvider>{ui}</ChakraProvider>
    </QueryClientProvider>,
  );

/** The one token on screen reaches `state`; `name` is its accessible name. */
const stateOf = async (name: string, state: string) =>
  waitFor(() => {
    const token = screen.getByTestId("hero-token");
    expect(token.getAttribute("data-token-state")).toBe(state);
    expect(screen.getByRole("img", { name })).toBe(token);
  });

describe("HeroToken", () => {
  it("draws the snapshot's art, root-relative", async () => {
    renderTokens(<HeroToken heroId="the-mandalorian" size={64} />);
    await stateOf("The Mandalorian token", "image");
    expect(screen.getByRole("img", { name: "The Mandalorian token" })).toHaveAttribute(
      "src",
      "/evergreen-decks/art/lDOM/token-mandalorian.webp",
    );
  });

  it("falls back to initials when the deck has no token (Nancy Drew)", async () => {
    renderTokens(<HeroToken heroId="nancy-drew" />);
    await stateOf("Nancy Drew token", "initials");
    expect(screen.getByText("ND")).toBeInTheDocument();
  });

  it("falls back to initials for the Specter Knight stub", async () => {
    renderTokens(<HeroToken heroId="specter-knight" />);
    await stateOf("Specter Knight token", "initials");
    expect(screen.getByText("SK")).toBeInTheDocument();
  });

  it("falls back to initials when the image fails to load", async () => {
    renderTokens(<HeroToken heroId="the-mandalorian" />);
    await stateOf("The Mandalorian token", "image");
    fireEvent.error(screen.getByRole("img", { name: "The Mandalorian token" }));
    await stateOf("The Mandalorian token", "initials");
    expect(screen.getByText("TM")).toBeInTheDocument();
  });

  it("falls back to initials for an unknown hero without fetching", async () => {
    renderTokens(<HeroToken heroId="brand-new-hero" heroName="Brand New" />);
    await stateOf("Brand New token", "initials");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches one snapshot per hero however many tokens show it", async () => {
    renderTokens(
      <>
        <HeroToken heroId="the-mandalorian" size={36} />
        <HeroToken heroId="the-mandalorian" size={72} />
        <HeroToken heroId="the-mandalorian" size={200} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole("img", { name: "The Mandalorian token" })[0].tagName).toBe("IMG"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
