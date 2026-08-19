/**
 * Hero-preview modal — the "Show my upgrades" toggle (#623, epic #610).
 *
 * This modal is the surface a player checks BEFORE and AFTER spending on
 * /collection, so the things it must not get wrong are the things that would
 * either lie to them or take the preview away:
 *
 *  - a MIXED loadout paints per SET, at the right tier, through the REAL
 *    `CardRim`/`FighterTokenRim` components — a mock gradient here would pass
 *    while the table drew something else;
 *  - toggling OFF is a true before/after: every rim leaves the DOM;
 *  - a GUEST gets no toggle and costs no extra request;
 *  - an API that errors gets no toggle and an otherwise UNCHANGED modal — this
 *    preview works for not-yet-converted community decks and must never depend
 *    on an account service to render;
 *  - a rim switched off on /collection is not previewed, or that switch would
 *    look broken.
 *
 * The deck is the real frozen Kenshiro snapshot (an IMAGE deck, so the
 * thumbnails take the `ImageFace` path and need no canvas), which is also what
 * makes the card keys here the genuine `norm(title)` keys.
 */
import "@testing-library/jest-dom";
import { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";

import { HeroPreviewModal } from "./HeroPreviewModal";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

// Chakra's modal focus trap probes the DOM with `:not(:disabled):not([disabled])`,
// which the nwsapi bundled with jsdom 20 rejects as invalid (same workaround as
// HeroPreviewModal.test.tsx).
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/** The real frozen snapshot the modal would fetch — same file /pro reads. */
const KENSHIRO = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "public/evergreen-decks/6rDz.json"),
    "utf8",
  ),
).deck_data;

// Relative paths, not the `@/` alias: SWC rewrites alias *imports*, but leaves
// a `jest.mock()` string argument alone.
jest.mock("../../lib/pro/useDeckPreview", () => ({
  useDeckPreview: () => ({ data: KENSHIRO, isLoading: false }),
}));
jest.mock("../../lib/pro/useDeckStats", () => ({
  useDeckStats: () => ({ data: null }),
}));

const CONSTANTS = {
  cardTierCosts: [50, 150, 400, 1000],
  tokenRimThresholds: [250, 750, 2000, 5000],
};

/** A MIXED deck — two sets bought at different tiers, thirteen untouched. */
const heroBlock = (over: Record<string, unknown> = {}) => ({
  heroId: "kenshiro",
  earned: 900,
  spent: 200,
  adjusted: 0,
  available: 700,
  cards: [
    { key: "feint", tier: 1 },
    { key: "hokuto: bone demolisher", tier: 3 },
  ],
  tokenRim: { unlockedTier: 2, enabled: true },
  ...over,
});

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

let calls: string[] = [];

interface Routes {
  me?: Response;
  cosmetics?: Response | "throw";
}

const wire = (routes: Routes = {}) => {
  const fetchMock = jest.fn(async (url: string) => {
    calls.push(url);
    if (url === `${API_URL}/me`) {
      return routes.me ?? reply(200, { user: { id: "u1", username: "Dean" } });
    }
    if (url === `${API_URL}/me/cosmetics`) {
      if (routes.cosmetics === "throw") throw new Error("network down");
      return (
        routes.cosmetics ?? reply(200, { heroes: [heroBlock()], constants: CONSTANTS })
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

/** Opens the modal for `heroId`; omit it for a community deck with none. */
const openModal = async (heroId?: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ChakraProvider>
        <HeroPreviewModal
          isOpen
          onClose={() => {}}
          deckId="6rDz"
          heroName="Kenshiro"
          heroId={heroId}
        />
      </ChakraProvider>
    </QueryClientProvider>,
  );
  // Flush the /me probe and the cosmetics read that chains off it — several
  // microtask ticks (fetch -> json -> publish -> effect -> fetch -> json), all
  // inside act so the store's listener updates don't land outside one.
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  return view;
};

/**
 * The tier painted on one card SET's cell, or null for base art. Cells carry
 * `data-card-key`, the `norm(title)` key the API and the art snapshot share.
 */
const cardRim = (key: string): string | null =>
  document
    .querySelector(`[data-card-key="${key}"] [data-cosmetic-rim]`)
    ?.getAttribute("data-cosmetic-rim") ?? null;

/**
 * The tier on the hero portrait. `FighterTokenRim` renders a DIV while
 * `CardRim` renders an SVG `<g>`, which is what separates the two here.
 */
const portraitRim = (): string | null =>
  document
    .querySelector("div[data-cosmetic-rim]")
    ?.getAttribute("data-cosmetic-rim") ?? null;

const anyRim = () => document.querySelectorAll("[data-cosmetic-rim]").length;

const toggle = () => screen.getByLabelText("Show my upgrades");

beforeEach(() => {
  calls = [];
  __resetAccountStoreForTests();
});
// Drain any probe/read still in flight INSIDE act before the next test remounts:
// `useAccount`'s store is module-level, so a promise settling after this test
// would publish into the next one's mount outside an act() window.
afterEach(async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  jest.resetAllMocks();
});

describe("a signed-in player with upgrades on this hero", () => {
  it("shows the toggle on by default and paints the owned tiers per set", async () => {
    wire();
    await openModal("kenshiro");

    await waitFor(() => expect(screen.getByTestId("hero-preview-upgrades")).toBeInTheDocument());
    expect(toggle()).toBeChecked();

    // Mixed: two sets bought at different tiers, the rest base art.
    expect(cardRim("feint")).toBe("bronze");
    expect(cardRim("hokuto: bone demolisher")).toBe("gold");
    expect(cardRim("nunchaku")).toBeNull();
    expect(cardRim("skirmish")).toBeNull();
    // unlockedTier 2, switched on -> the silver rim on the hero token.
    expect(portraitRim()).toBe("silver");
  });

  it("toggling off returns the base render, and back on restores it", async () => {
    wire();
    await openModal("kenshiro");
    await waitFor(() => expect(screen.getByTestId("hero-preview-upgrades")).toBeInTheDocument());
    expect(anyRim()).toBeGreaterThan(0);

    fireEvent.click(toggle());
    expect(toggle()).not.toBeChecked();
    // A true before/after: not one rim left anywhere in the modal.
    expect(anyRim()).toBe(0);
    expect(portraitRim()).toBeNull();
    // The toggle itself survives — it is how they get back.
    expect(screen.getByTestId("hero-preview-upgrades")).toHaveAttribute("data-showing", "off");

    fireEvent.click(toggle());
    expect(cardRim("feint")).toBe("bronze");
    expect(portraitRim()).toBe("silver");
  });

  it("does not preview a token rim the player switched off on /collection", async () => {
    wire({
      cosmetics: reply(200, {
        heroes: [heroBlock({ tokenRim: { unlockedTier: 2, enabled: false } })],
        constants: CONSTANTS,
      }),
    });
    await openModal("kenshiro");

    await waitFor(() => expect(screen.getByTestId("hero-preview-upgrades")).toBeInTheDocument());
    // Cards are unaffected by the token pref — only the token is hidden.
    expect(cardRim("feint")).toBe("bronze");
    expect(portraitRim()).toBeNull();
  });

  // A telemetry outage answers 503 WITH the stored ledger (lib/account/cosmetics
  // (1)); a player's bought upgrades must not appear to evaporate. The token rim
  // still goes quiet, because `unlockedTier: null` means "we couldn't confirm".
  it("still previews bought card rims from a 503's degraded ledger", async () => {
    wire({
      cosmetics: reply(503, {
        heroes: [
          heroBlock({
            earned: null,
            available: null,
            tokenRim: { unlockedTier: null, enabled: true },
          }),
        ],
        constants: CONSTANTS,
      }),
    });
    await openModal("kenshiro");

    await waitFor(() => expect(screen.getByTestId("hero-preview-upgrades")).toBeInTheDocument());
    expect(cardRim("feint")).toBe("bronze");
    expect(portraitRim()).toBeNull();
  });
});

describe("when there is nothing to show", () => {
  it("gives a guest no toggle, no rims, and no extra request", async () => {
    const fetchMock = wire({ me: reply(401, {}) });
    await openModal("kenshiro");

    await waitFor(() => expect(screen.getByText("Kenshiro")).toBeInTheDocument());
    expect(screen.queryByTestId("hero-preview-upgrades")).not.toBeInTheDocument();
    expect(anyRim()).toBe(0);
    // The standing epic rule: a guest costs exactly one request.
    expect(calls).toEqual([`${API_URL}/me`]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders the modal unchanged when the cosmetics API errors", async () => {
    wire({ cosmetics: "throw" });
    await openModal("kenshiro");

    await waitFor(() => expect(calls).toContain(`${API_URL}/me/cosmetics`));
    expect(screen.queryByTestId("hero-preview-upgrades")).not.toBeInTheDocument();
    expect(anyRim()).toBe(0);
    // The preview itself is untouched — cards and all.
    expect(screen.getByText("Cards (16)")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-card-key]").length).toBe(16);
  });

  it("gives a hero with nothing bought no toggle", async () => {
    wire({
      cosmetics: reply(200, {
        heroes: [heroBlock({ cards: [], tokenRim: { unlockedTier: 0, enabled: true } })],
        constants: CONSTANTS,
      }),
    });
    await openModal("kenshiro");

    await waitFor(() => expect(calls).toContain(`${API_URL}/me/cosmetics`));
    expect(screen.queryByTestId("hero-preview-upgrades")).not.toBeInTheDocument();
    expect(anyRim()).toBe(0);
  });

  // A not-yet-converted community tile has no server hero id at all; there is
  // no row to look up and nothing to preview, but the modal must still render.
  it("gives a deck with no hero id no toggle", async () => {
    wire();
    await openModal();

    await waitFor(() => expect(screen.getByText("Kenshiro")).toBeInTheDocument());
    expect(screen.queryByTestId("hero-preview-upgrades")).not.toBeInTheDocument();
    expect(anyRim()).toBe(0);
  });
});
