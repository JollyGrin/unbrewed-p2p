/**
 * /pro landing (#460, #462). The page used to sell a future product — an "IN
 * DEVELOPMENT" badge, "one day fight an AI", a roadmap of already-shipped
 * steps. It now sells the playable game, so these tests pin the things that
 * would quietly regress it: the retired future-tense vocabulary, the seat
 * strip driving the Play-vs-AI CTA's `?vs=` preset, and locked decks staying
 * out of the roster grid.
 *
 * They also pin the roster's SOURCE (#462): the live LIST_HEROES reply, not an
 * intersection with the hand-kept POPULAR_DECKS list. The regression that
 * motivated it — prod advertising "14 battle-ready" while the server served 15
 * — is only catchable by driving the mocked roster, so every roster test does.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProLanding } from "./ProLanding";
import type { HeroListing, HeroTier } from "@/lib/pro/protocol";

/** A LIST_HEROES row. Stats are irrelevant here; the id/name/tier are not. */
const listing = (
  heroId: string,
  name: string,
  tier: HeroTier = "community",
): HeroListing => ({
  heroId,
  name,
  hp: 16,
  move: 3,
  reach: "MELEE",
  tier,
  deckSection: "community",
});

/** The roster the mocked socket "replies" with — reassigned per test. */
let mockRosterState: { heroes: HeroListing[] | null; offline: boolean };
let mockDebug = false;

// jsdom has no WebSocket, so the LIST_HEROES hook is mocked wholesale.
jest.mock("../../lib/pro/useProLiveRoster", () => ({
  useProLiveRosterState: () => mockRosterState,
}));
jest.mock("next/router", () => ({
  useRouter: () => ({
    query: mockDebug ? { debug: "1" } : {},
    pathname: "/pro",
  }),
}));

// A realistic default: heroes the tile list knows, one lab-tier hero, all with
// POPULAR_DECKS entries.
const DEFAULT_ROSTER = [
  listing("king-kong", "King Kong"),
  listing("the-mandalorian", "The Mandalorian"),
  listing("baba-yaga", "Baba Yaga"),
  listing("nancy-drew", "Nancy Drew", "lab"),
];

beforeEach(() => {
  mockRosterState = { heroes: DEFAULT_ROSTER, offline: false };
  mockDebug = false;
});

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
    const tile = screen.getByRole("link", { name: /King Kong/ });
    expect(tile).toHaveAttribute("href", "/pro/game?hero=king-kong");
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

/**
 * The heart of #462. Before it, /pro started from POPULAR_DECKS and intersected
 * with the server; a hero the server served but no tile described was invisible,
 * and two hand-kept maps (FALLBACK_READY, IN_THE_LAB) drifted from reality.
 */
describe("ProLanding — the server roster IS the roster", () => {
  it("renders a served hero that no deck entry describes, using the server name", () => {
    mockRosterState = {
      heroes: [...DEFAULT_ROSTER, listing("sherlock-holmes", "Sherlock Holmes")],
      offline: false,
    };
    renderLanding();

    // No POPULAR_DECKS entry and no DECK_HERO_IDS mapping exists for this hero —
    // it must still reach the grid, named and launchable, with zero frontend edits.
    const tile = screen.getByRole("link", { name: /Sherlock Holmes/ });
    expect(tile).toHaveAttribute("href", "/pro/game?hero=sherlock-holmes");
    expect(within(tile).getByText("PLAY NOW")).toBeInTheDocument();
  });

  it("splits ready vs lab on the server's tier, and counts what it renders", () => {
    renderLanding();
    // DEFAULT_ROSTER: 3 community + 1 lab.
    expect(screen.getByText("3 battle-ready · 1 in the lab")).toBeInTheDocument();
    expect(screen.getAllByText("PLAY NOW")).toHaveLength(3);
    expect(screen.getByText("IN THE LAB")).toBeInTheDocument();
    // Nancy Drew is lab-tier server-side: an inspect-only tile, not a link.
    expect(screen.queryByRole("link", { name: /Nancy Drew/ })).not.toBeInTheDocument();
  });

  it("follows the server when a hero's tier changes, with no frontend edit", () => {
    // Same hero, promoted out of the lab. Nothing else in the app changes.
    mockRosterState = {
      heroes: [listing("nancy-drew", "Nancy Drew", "community")],
      offline: false,
    };
    renderLanding();
    expect(screen.getByText("1 battle-ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nancy Drew/ })).toBeInTheDocument();
  });

  it("keeps a served hero out of the challengers queue", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /challengers approaching/i }));
    // Every grid fighter is served, so none of them may also be "approaching".
    for (const name of ["King Kong", "The Mandalorian", "Baba Yaga", "Nancy Drew"]) {
      expect(screen.getAllByText(name)).toHaveLength(1);
    }
    // ...while a deck the server does not serve is exactly what the drawer holds.
    // (chips carry the full deck title, as they always have)
    expect(screen.getByText(/^Voldemort/)).toBeInTheDocument();
  });

  it("shows debug-only heroes the server reveals under ?debug, starred", () => {
    mockDebug = true;
    mockRosterState = {
      heroes: [
        listing("king-taranis", "King Taranis", "reflavored"),
        listing("king-taranis-spice", "King Taranis", "spice"),
      ],
      offline: false,
    };
    renderLanding();

    // Both tiles render (the server, not the client, decides debug visibility),
    // and the reflavored baseline is starred apart from its spice replacement.
    expect(screen.getByText("2 battle-ready")).toBeInTheDocument();
    expect(screen.getByText("King Taranis ★")).toBeInTheDocument();
    expect(screen.getByText("King Taranis")).toBeInTheDocument();
    // Debug survives the hop into the game.
    expect(screen.getByRole("link", { name: /King Taranis ★/ })).toHaveAttribute(
      "href",
      "/pro/game?hero=king-taranis&debug=1",
    );
  });
});

describe("ProLanding — before and without a roster", () => {
  it("shows skeletons, not a stale hero list, before the server replies", () => {
    mockRosterState = { heroes: null, offline: false };
    const { container } = renderLanding();

    expect(screen.getByText(/loading roster/i)).toBeInTheDocument();
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThan(0);
    // No fighter is claimed ready while the roster is unknown.
    expect(screen.queryByText("PLAY NOW")).not.toBeInTheDocument();
    expect(screen.queryByText(/battle-ready/)).not.toBeInTheDocument();
    // And no challengers drawer either — "not served" is unknowable right now.
    expect(
      screen.queryByRole("button", { name: /challengers approaching/i }),
    ).not.toBeInTheDocument();
  });

  it("degrades gracefully when the socket never connects", () => {
    mockRosterState = { heroes: null, offline: true };
    renderLanding();

    expect(screen.getByText(/roster offline/i)).toBeInTheDocument();
    expect(screen.getByText(/couldn't reach the referee server/i)).toBeInTheDocument();
    // The CTAs are untouched: the game page runs its own LIST_HEROES.
    expect(primaryCta()).toHaveAttribute("href", "/pro/game?vs=ai-medium");
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
