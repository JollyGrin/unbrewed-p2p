/**
 * /pro launcher (unbrewed-p2p-1626). The page used to be a second copy of the
 * `/pro/game` picker whose choices were dropped on the way in; it is now a
 * front door + news board. These tests pin that it never asks a question the
 * lobby asks again (every play link carries at most one preset), that its feed
 * is the Pro changelog, that new and returning visitors get their own view,
 * and that the roster it summarises is the live LIST_HEROES reply (#462).
 *
 * They also keep the copy pins the old page earned: no future-tense product
 * language (#460), the sandbox escape hatch, and the checked bot deep dive.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProLanding } from "./ProLanding";
import type { HeroListing, HeroTier, LobbyListing } from "@/lib/pro/protocol";
import type { ChangelogEntry } from "@/lib/changelog/types";
import type { Tournament } from "@/lib/tournaments/types";
import { PRO_FEED_SEEN_KEY } from "@/lib/pro/launcherFeed";
import { QUICK_PLAY_TIMER_SECONDS } from "@/lib/pro/quickMatch";

const listing = (
  heroId: string,
  name: string,
  tier: HeroTier = "community",
  botTiers?: HeroListing["botTiers"],
): HeroListing => ({
  heroId,
  name,
  hp: 16,
  move: 3,
  reach: "MELEE",
  tier,
  deckSection: "community",
  ...(botTiers ? { botTiers } : {}),
});

let mockRosterState: { heroes: HeroListing[] | null; offline: boolean; lobbies?: LobbyListing[] | null };
let mockDebug = false;
let mockEntries: ChangelogEntry[] = [];
let mockTournaments: { ok: true; value: Tournament[] } | { ok: false; reason: "unavailable" };

// jsdom has no WebSocket, so the LIST_HEROES hook is mocked wholesale.
jest.mock("../../lib/pro/useProLiveRoster", () => ({
  useProLiveRosterState: () => mockRosterState,
}));
jest.mock("../../lib/changelog/entries", () => ({
  getChangelogEntries: () => mockEntries,
}));
jest.mock("../../lib/tournaments/api", () => ({
  listTournaments: () => Promise.resolve(mockTournaments),
}));
// The hero-preview modal probes the accounts API for the player's cosmetics (#623).
jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => ({ status: "guest", account: null }),
}));
jest.mock("next/router", () => ({
  useRouter: () => ({
    query: mockDebug ? { debug: "1" } : {},
    pathname: "/pro",
  }),
}));

const entry = (id: string, over: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  id,
  date: id.slice(0, 10),
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  tags: ["feature"],
  highlight: true,
  pro: true,
  ...over,
});

const DEFAULT_ENTRIES = [
  entry("2026-11-09-afton", {
    title: "William Afton joins the lab",
    tags: ["deck"],
    video: { slug: "william-afton" },
    cta: { label: "Play William Afton in Pro", href: "/pro" },
  }),
  entry("2026-11-08-quick-play", {
    title: "Quick Play: see who's here",
    video: { slug: "quick-play" },
    cta: { label: "Try Quick Match", href: "/pro/game" },
  }),
  entry("2026-11-01-bag", { title: "A sandbox-only change", pro: undefined }),
  entry("2026-10-31-xeno", { title: "The Xenomorph joins the lab", tags: ["deck"] }),
];

const DEFAULT_ROSTER = [
  listing("king-kong", "King Kong"),
  listing("the-mandalorian", "The Mandalorian"),
  listing("baba-yaga", "Baba Yaga"),
  listing("nancy-drew", "Nancy Drew", "lab"),
];

const tournament = (over: Partial<Tournament>): Tournament =>
  ({
    id: "t1",
    slug: "friday-duels",
    name: "Friday Duels",
    status: "signup",
    signupOpen: true,
    entryCount: 5,
    size: 8,
    ...over,
  }) as Tournament;

beforeEach(() => {
  mockRosterState = { heroes: DEFAULT_ROSTER, offline: false, lobbies: [] };
  mockDebug = false;
  mockEntries = DEFAULT_ENTRIES;
  mockTournaments = { ok: false, reason: "unavailable" };
  localStorage.clear();
});

const renderLanding = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChakraProvider>
        <ProLanding />
      </ChakraProvider>
    </QueryClientProvider>,
  );

const hrefOf = (name: RegExp | string) => screen.getByRole("link", { name }).getAttribute("href");
const playNav = () => screen.getByRole("navigation", { name: "Play" });

/** A browser that has played Pro before (recentRooms' recent-heroes key). */
const asReturning = (heroIds = ["king-kong"]) =>
  localStorage.setItem("unbrewed-pro-recent-heroes", JSON.stringify(heroIds));

describe("ProLanding — framing", () => {
  it("badges the page OPEN BETA and names it in the h1", () => {
    renderLanding();
    expect(screen.getByText("OPEN BETA")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Unbrewed Pro");
  });

  it("uses no future-tense product language anywhere on the page", () => {
    const { container } = renderLanding();
    const copy = container.textContent ?? "";
    for (const banned of [/in development/i, /upcoming/i, /eventually/i, /one day/i]) {
      expect(copy).not.toMatch(banned);
    }
  });

  it("keeps the sandbox escape hatch and the deck-request channel", () => {
    renderLanding();
    expect(screen.getByText(/trusts you with the rulebook/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#pro-deck-request" })).toBeInTheDocument();
  });

  it("no longer carries the dead picker: no seat strip, no board tiles, no announcer", () => {
    const { container } = renderLanding();
    const copy = container.textContent ?? "";
    expect(copy).not.toMatch(/Stage select|Choose your fighter|ENTER THE ARENA|import map JSON/i);
  });
});

describe("ProLanding — doors into the lobby", () => {
  it("PLAY goes to the lobby with no presets", () => {
    renderLanding();
    expect(within(playNav()).getByRole("link", { name: "PLAY" })).toHaveAttribute("href", "/pro/game");
  });

  it("every play link carries at most one preset", () => {
    renderLanding();
    for (const link of within(playNav()).getAllByRole("link")) {
      const query = (link.getAttribute("href") ?? "").split("?")[1] ?? "";
      expect(query.split("&").filter(Boolean).length).toBeLessThanOrEqual(1);
    }
  });

  it("sends a new player to the Easy bot", () => {
    renderLanding();
    expect(within(playNav()).getByRole("link", { name: /vs Bot/ })).toHaveAttribute("href", "/pro/game?vs=ai-easy");
    expect(hrefOf("Play your first game →")).toBe("/pro/game?vs=ai-easy");
  });

  it("arms Quick Match and says how many are waiting", () => {
    mockRosterState = {
      ...mockRosterState,
      lobbies: [
        { roomId: "a", heroId: "king-kong", heroName: "King Kong", ageMs: 1, turnTimerSeconds: QUICK_PLAY_TIMER_SECONDS },
        { roomId: "b", heroId: "king-kong", heroName: "King Kong", ageMs: 1, formatId: "ffa-3" },
      ],
    };
    renderLanding();
    const quick = within(playNav()).getByRole("link", { name: /Quick Match/ });
    expect(quick).toHaveAttribute("href", "/pro/game?quick=1");
    expect(quick).toHaveTextContent("1 waiting right now");
  });

  it("keeps ?debug on every internal play link", () => {
    mockDebug = true;
    renderLanding();
    for (const link of within(playNav()).getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/debug=1/);
    }
  });
});

describe("ProLanding — new vs returning visitors", () => {
  it("shows a first-time visitor the intro and the 'New to Pro?' card", () => {
    renderLanding();
    expect(screen.getByText("A referee for every game")).toBeInTheDocument();
    expect(screen.getByText("New to Pro?")).toBeInTheDocument();
    expect(screen.queryByText("Jump back in")).not.toBeInTheDocument();
  });

  it("leads a returning player with the newest update and their recent fighters", async () => {
    asReturning(["king-kong", "not-served-any-more"]);
    renderLanding();
    expect(await screen.findByText("Jump back in")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "William Afton joins the lab" })).toBeInTheDocument();
    // the deck entry's "/pro" CTA would loop back here: it goes to the lobby
    const banner = screen.getByRole("region", { name: /NEW FIGHTER/ });
    expect(within(banner).getByRole("link", { name: "Play William Afton in Pro →" })).toHaveAttribute("href", "/pro/game");
    // only fighters the server still serves
    const again = screen.getAllByRole("link", { name: /Play again/ });
    expect(again).toHaveLength(1);
    expect(again[0]).toHaveAttribute("href", "/pro/game?hero=king-kong");
    expect(screen.getByText(/bookmark \/pro\/game/)).toBeInTheDocument();
  });

  it("lets a returning player flip between the featured updates", async () => {
    asReturning();
    renderLanding();
    fireEvent.click(await screen.findByRole("button", { name: "Show update 2 of 2" }));
    expect(screen.getByRole("heading", { level: 2, name: "Quick Play: see who's here" })).toBeInTheDocument();
  });
});

describe("ProLanding — what's new", () => {
  it("lists Pro changelog entries only", () => {
    renderLanding();
    const feed = screen.getByRole("region", { name: /What's new/ });
    expect(within(feed).getByText("The Xenomorph joins the lab")).toBeInTheDocument();
    expect(within(feed).queryByText("A sandbox-only change")).not.toBeInTheDocument();
    expect(within(feed).getAllByRole("listitem")).toHaveLength(3);
    expect(hrefOf("All updates →")).toBe("/changelog");
  });

  it("flags what's new since the last visit", async () => {
    localStorage.setItem(PRO_FEED_SEEN_KEY, "2026-10-31-xeno");
    renderLanding();
    expect(await screen.findByText("2 NEW")).toBeInTheDocument();
  });

  it("flags nothing on a first visit", () => {
    renderLanding();
    expect(screen.queryByText(/\d NEW$/)).not.toBeInTheDocument();
  });
});

describe("ProLanding — the roster summary is the server's roster", () => {
  it("counts battle-ready and lab fighters off the live reply", () => {
    renderLanding();
    expect(screen.getAllByText(/3 battle-ready · 1 in the lab/).length).toBeGreaterThan(0);
  });

  it("lists every served fighter once, including one no deck entry describes", () => {
    mockRosterState = { ...mockRosterState, heroes: [...DEFAULT_ROSTER, listing("brand-new", "Brand New Hero ")] };
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: "See all 5 →" }));
    const list = screen.getByRole("list", { name: "All fighters" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(list).getByText("Brand New Hero")).toBeInTheDocument();
  });

  it("stars debug-only heroes the server reveals under ?debug", () => {
    mockDebug = true;
    mockRosterState = { ...mockRosterState, heroes: [listing("old-kong", "King Kong", "reflavored")] };
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: "See all 1 →" }));
    expect(screen.getByText("King Kong ★")).toBeInTheDocument();
  });

  it("says so plainly when the socket never connects", () => {
    mockRosterState = { heroes: null, offline: true };
    renderLanding();
    expect(screen.getByText(/Couldn't reach the referee server/)).toBeInTheDocument();
  });

  it("shows the bot ladder the server advertises", () => {
    mockRosterState = {
      ...mockRosterState,
      heroes: [listing("king-kong", "King Kong", "community", ["easy", "medium", "hard", "expert", "jevx3"])],
    };
    renderLanding();
    expect(screen.getByText("Prodigy")).toBeInTheDocument();
    expect(screen.getByText("Expert")).toBeInTheDocument();
  });

  it("offers only the always-on tiers when the server advertises none", () => {
    renderLanding();
    expect(screen.queryByText("Prodigy")).not.toBeInTheDocument();
    expect(screen.getByText("Hard")).toBeInTheDocument();
  });
});

describe("ProLanding — tournaments", () => {
  it("lists open events with a way in", async () => {
    mockTournaments = {
      ok: true,
      value: [
        tournament({}),
        tournament({ id: "t2", slug: "done", name: "Finished Cup", status: "complete", signupOpen: false }),
      ],
    };
    renderLanding();
    expect(await screen.findByText("Friday Duels")).toBeInTheDocument();
    expect(screen.queryByText("Finished Cup")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "JOIN" }).getAttribute("href")).toMatch(/friday-duels/);
  });

  it("pitches running your own when nothing is open or the api is down", async () => {
    renderLanding();
    await act(async () => {});
    expect(screen.getByRole("link", { name: "Create one →" })).toHaveAttribute("href", "/tournaments?new=1");
  });
});

describe("ProLanding — the bot ladder as it actually ships", () => {
  it("sells Expert as a live alpha tier, not a future upgrade", () => {
    const { container } = renderLanding();
    const copy = container.textContent ?? "";
    expect(screen.getByText(/challenge Expert, an alpha search bot/)).toBeInTheDocument();
    expect(screen.getByText("BOT TRAINING")).toBeInTheDocument();
    expect(screen.getByText(/Expert is live \(alpha\)/)).toBeInTheDocument();
    expect(copy).not.toMatch(/gauntlet/i);
    expect(copy).not.toMatch(/next brain/i);
  });

  it("keeps the six-beat 'how the bots work' deep dive on the page", () => {
    renderLanding();
    const section = screen.getByRole("region", { name: "How the bots actually work" });
    expect(within(section).getByText(/no LLM, no cloud model/i)).toBeInTheDocument();
    expect(within(section).getAllByRole("listitem")).toHaveLength(6);
    expect(within(section).getByText(/determinization/)).toBeInTheDocument();
    expect(within(section).getByText(/about 7 times in 10/)).toBeInTheDocument();
  });

  it("opens the explainer from the Bots card", async () => {
    renderLanding();
    const details = screen.getByText("About Unbrewed Pro").closest("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "How they work →" }));
    await waitFor(() => expect(details.open).toBe(true));
  });

  it("never claims Expert carries its search tree between moves", () => {
    const { container } = renderLanding();
    expect(container.textContent ?? "").not.toMatch(/between moves|last turn/i);
  });
});
