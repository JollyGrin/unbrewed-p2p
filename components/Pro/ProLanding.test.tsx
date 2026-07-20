/**
 * /pro landing (#460). The page used to sell a future product — an "IN
 * DEVELOPMENT" badge, "one day fight an AI", a roadmap of already-shipped
 * steps. It now sells the playable game, so these tests pin the things that
 * would quietly regress it: the retired future-tense vocabulary, the seat
 * strip driving the Play-vs-AI CTA's `?vs=` preset, and locked decks staying
 * out of the roster grid.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProLanding } from "./ProLanding";

// The landing opens a LIST_HEROES socket; jsdom has no WebSocket. Returning null
// (as the hook does before the server replies) exercises the FALLBACK_READY path.
jest.mock("../../lib/pro/useProLiveRoster", () => ({
  useProLiveRoster: () => null,
}));
jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, pathname: "/pro" }),
}));

// The hero-preview modal the roster tiles open runs a react-query fetch.
const renderLanding = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChakraProvider>
        <ProLanding />
      </ChakraProvider>
    </QueryClientProvider>,
  );

/** The primary (gold) CTA — the only link whose label ends in an arrow. */
const primaryCta = () => screen.getByRole("link", { name: /→$/ });

describe("ProLanding — retired 'in development' framing", () => {
  it("badges the page OPEN BETA", () => {
    renderLanding();
    expect(screen.getByText("OPEN BETA")).toBeInTheDocument();
    expect(screen.queryByText(/in development/i)).not.toBeInTheDocument();
  });

  it("uses no future-tense product language anywhere on the page", () => {
    const { container } = renderLanding();
    const copy = container.textContent ?? "";
    for (const banned of [/in development/i, /upcoming/i, /eventually/i, /one day/i]) {
      expect(copy).not.toMatch(banned);
    }
  });

  it("keeps the sandbox escape hatch", () => {
    renderLanding();
    expect(screen.getByText(/trusts you with the rulebook/i)).toBeInTheDocument();
  });
});

describe("ProLanding — seat strip drives the Play-vs-AI CTA", () => {
  it("defaults to a medium bot", () => {
    renderLanding();
    expect(primaryCta()).toHaveTextContent(/play vs ai/i);
    expect(primaryCta()).toHaveAttribute("href", "/pro/game?vs=ai-medium");
  });

  it("re-targets the CTA when a difficulty chip is picked", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: "AI·H" }));
    expect(primaryCta()).toHaveAttribute("href", "/pro/game?vs=ai-hard");

    fireEvent.click(screen.getByRole("button", { name: "AI·E" }));
    expect(primaryCta()).toHaveAttribute("href", "/pro/game?vs=ai-easy");
  });

  it("falls back to the plain create flow when the seat is human", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: "Hum" }));
    expect(primaryCta()).toHaveAttribute("href", "/pro/game");
    expect(primaryCta()).toHaveTextContent(/create a room/i);
  });

  it("always offers the friend flow alongside it", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: /challenge a friend/i })).toHaveAttribute(
      "href",
      "/pro/game",
    );
  });
});

describe("ProLanding — roster", () => {
  it("counts capability, never 'X of Y ready'", () => {
    const { container } = renderLanding();
    // "battle-ready" appears twice by design: the hero subline and this counter.
    expect(screen.getByText(/^\d+ battle-ready/)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\d+ of \d+ ready/);
  });

  it("hides locked decks behind a challengers-approaching drawer", () => {
    renderLanding();
    const toggle = screen.getByRole("button", { name: /challengers approaching/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/prioritised by demand/i)).toBeInTheDocument();
  });

  it("links a battle-ready fighter straight into a match", () => {
    renderLanding();
    // King Kong ships in FALLBACK_READY, so it renders as a ready tile.
    const tile = screen.getByRole("link", { name: /King Kong/ });
    expect(tile).toHaveAttribute("href", expect.stringContaining("/pro/game?hero="));
    expect(within(tile).getByText("PLAY NOW")).toBeInTheDocument();
  });

  it("announces the hovered fighter", () => {
    renderLanding();
    // (the hero copy also says "pick a fighter and go" — match the announcer's own line)
    expect(screen.getByText(/gold tiles jump straight into a match/i)).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole("link", { name: /King Kong/ }).firstChild!);
    expect(screen.getByText(/KING KONG IS READY — CLICK TO ENTER THE ARENA/)).toBeInTheDocument();
  });
});

describe("ProLanding — sections that replaced the roadmap", () => {
  it("shows parallel mode cards, not a numbered sequence", () => {
    const { container } = renderLanding();
    expect(screen.getByText("Pick your mode")).toBeInTheDocument();
    expect(screen.getByText("Bots at three levels")).toBeInTheDocument();
    expect(screen.queryByText("The road to the arena")).not.toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\b01\b/);
  });

  it("shows stage select with the five visible boards and a custom-map tile", () => {
    renderLanding();
    expect(screen.getByText("Stage select")).toBeInTheDocument();
    expect(screen.getByText("The Mended Drum")).toBeInTheDocument();
    expect(screen.getByText("+ import map JSON")).toBeInTheDocument();
    // The synthetic playtest arena stays out of the user-facing stage row.
    expect(screen.queryByText(/Playtest Arena/)).not.toBeInTheDocument();
  });

  it("shows the honest what's-next list", () => {
    renderLanding();
    expect(screen.getByText("What's next")).toBeInTheDocument();
    expect(screen.getByText("MATCHMAKING")).toBeInTheDocument();
  });

  it("links the previously-unlinked scenarios page", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: /scenarios/i })).toHaveAttribute(
      "href",
      "/pro/scenarios",
    );
  });
});
