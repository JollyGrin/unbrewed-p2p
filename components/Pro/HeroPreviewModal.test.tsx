/**
 * Hero-preview modal — the LARGE (two-space) pre-match signal.
 *
 * Every in-game surface derives "is this fighter large?" from live data
 * (ViewFighter.tailSpace), so a newly converted LARGE hero inherits the badge
 * and the rule line for free. This modal cannot: no pre-match field carries
 * size, so it reads a hand-maintained LARGE_HERO_IDS set — and a hand-maintained
 * set silently rots. King Kong shipped missing from it (issue #549): LARGE in
 * the engine, in the Pro roster on this client, and yet his preview showed no
 * badge and no rule line, so a player picking him first met the 2-space reach
 * mid-match. There was no test on this file at all, which is exactly how that
 * went unnoticed.
 *
 * So these pin the two branches, per hero id: a LARGE hero renders BOTH the
 * badge and the shared blurb; a NORMAL hero renders neither. The copy assertion
 * imports LARGE_FIGHTER_BLURB rather than restating it — the wording is pinned
 * once, in lib/pro/largeReach.test.ts, and shared with three other surfaces.
 */
import "@testing-library/jest-dom";
import { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeroPreviewModal } from "./HeroPreviewModal";
import { LARGE_FIGHTER_BLURB } from "@/lib/pro/largeReach";

// Chakra's modal focus trap probes the DOM with `:not(:disabled):not([disabled])`,
// which the nwsapi bundled with jsdom 20 rejects as invalid. The trap is not what
// this suite is testing, so stub it out and render the modal contents plainly
// (same workaround as components/Game/Header/map.modal.test.tsx).
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Both hooks are network-backed (deck snapshot JSON + the balance digest) and
// neither is under test here. `data: null` is a real state for both — the modal
// falls back to `quickStats` for the header, which is all the badge needs.
jest.mock("../../lib/pro/useDeckPreview", () => ({
  useDeckPreview: () => ({ data: null, isLoading: false }),
}));
jest.mock("../../lib/pro/useDeckStats", () => ({
  useDeckStats: () => ({ data: null }),
}));

const QUICK_STATS = { hp: 20, move: 2, reach: "MELEE" as const };

const open = (heroId: string, heroName: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChakraProvider>
        <HeroPreviewModal
          isOpen
          onClose={() => {}}
          deckId="deck-id"
          heroName={heroName}
          heroId={heroId}
          quickStats={QUICK_STATS}
        />
      </ChakraProvider>
    </QueryClientProvider>
  );
};

describe("HeroPreviewModal — LARGE fighter signal", () => {
  it("badges Triceratops and prints the shared rule line", () => {
    open("triceratops", "Triceratops");
    expect(screen.getByText("LARGE — 2 spaces")).toBeInTheDocument();
    expect(screen.getByText(LARGE_FIGHTER_BLURB)).toBeInTheDocument();
  });

  // The regression this file exists for: Kong is LARGE in the engine and ships
  // in the Pro roster here (HERO_DECK_IDS "king-kong" -> "kdKM"), but was absent
  // from LARGE_HERO_IDS, so his preview was silently the NORMAL one.
  it("badges King Kong and prints the shared rule line", () => {
    open("king-kong", "King Kong");
    expect(screen.getByText("LARGE — 2 spaces")).toBeInTheDocument();
    expect(screen.getByText(LARGE_FIGHTER_BLURB)).toBeInTheDocument();
  });

  it("shows neither badge nor rule line for a NORMAL hero", () => {
    open("baba-yaga", "Baba Yaga");
    expect(screen.queryByText("LARGE — 2 spaces")).not.toBeInTheDocument();
    expect(screen.queryByText(LARGE_FIGHTER_BLURB)).not.toBeInTheDocument();
  });

  // A preview opened from a not-yet-converted community tile has no server hero
  // id at all; the set can't be consulted, and guessing LARGE would be worse
  // than staying quiet.
  it("stays quiet when the hero id is unknown", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ChakraProvider>
          <HeroPreviewModal
            isOpen
            onClose={() => {}}
            deckId="deck-id"
            heroName="Some Community Deck"
            quickStats={QUICK_STATS}
          />
        </ChakraProvider>
      </QueryClientProvider>
    );
    expect(screen.queryByText("LARGE — 2 spaces")).not.toBeInTheDocument();
    expect(screen.queryByText(LARGE_FIGHTER_BLURB)).not.toBeInTheDocument();
  });

  // Batman's Batmobile is the LARGE fighter in that deck, not Batman. The set is
  // hero-keyed, so it CANNOT express that — see the registry's docblock. Pinned
  // so a future "Kong-style fix" doesn't add "batman" and badge the wrong body.
  it("does not badge Batman, whose LARGE fighter is the sidekick", () => {
    open("batman", "Batman");
    expect(screen.queryByText("LARGE — 2 spaces")).not.toBeInTheDocument();
    expect(screen.queryByText(LARGE_FIGHTER_BLURB)).not.toBeInTheDocument();
  });
});
