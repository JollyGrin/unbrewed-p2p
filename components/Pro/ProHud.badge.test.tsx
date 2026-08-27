import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { PlayerId, PlayerView, ProMapDef, ViewPlayer } from "@/lib/pro/protocol";

/**
 * The HUD badge shelf (issues #577/#718, engine #347/#517).
 *
 * Badges are the first cosmetic the OPPONENT can see, which is the whole reason
 * they go on the wire — so the shelf has to render on both seats, from broadcast
 * state, not from `useAccount()` the way the avatar does.
 *
 * Three edges are worth pinning, and all three are about a list that arrives
 * from the other CLIENT rather than from any server we run:
 *
 *  - an id this build has no art for renders NOTHING, and the cluster closes up
 *    — a fallback glyph would let anyone put an arbitrary shape on your screen
 *    by inventing a string. (`/account` makes the opposite call, because there
 *    the API supplies the name and blurb to go with it.)
 *  - a claim of more than three is sliced to three, whatever the engine did;
 *  - wearing nothing costs the plate no height at all.
 *
 * Plus the one interaction rule the whole option was chosen for: the shelf sits
 * OUTSIDE the hero-rules tooltip trigger, so reading a badge and reading the
 * hero rules can never be the same gesture.
 */

let mockAccount: {
  status: string;
  account: { id: string; username: string; avatarUrl: string | null } | null;
} = { status: "guest", account: null };

jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => mockAccount,
}));

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: {
    title: "Test Map",
    minPlayers: 2,
    maxPlayers: 4,
    specialRules: false,
    imageUrl: "/test.png",
  },
  zones: [],
  spaces: [],
};

const seat = (
  id: PlayerId,
  you: boolean,
  over: { displayName?: string; badge?: string; badges?: string[] } = {},
): ViewPlayer => ({
  id,
  heroId: `${id}-hero`,
  you,
  ...over,
  team: id,
  hand: you ? [] : undefined,
  handCount: 0,
  deckCount: 0,
  discard: [],
  ongoingScheme: null,
  hasCommitted: false,
  counters: {},
  flags: {},
  wonCombatThisTurn: false,
  lostCombatThisTurn: false,
  firstAttackThisTurn: false,
  playedACardThisTurn: false,
  tookDamageThisTurn: false,
});

const makeView = (players: ViewPlayer[], you: PlayerId): PlayerView => ({
  you,
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: you,
  actionsRemaining: 1,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: MAP,
  catalog: {},
  fighters: [],
  tokens: [],
  self: {
    id: you,
    heroId: `${you}-hero`,
    hand: [],
    deckCount: 0,
    discard: [],
    ongoingScheme: null,
    committedCard: null,
    counters: {},
    flags: {},
    wonCombatThisTurn: false,
    lostCombatThisTurn: false,
    firstAttackThisTurn: false,
    playedACardThisTurn: false,
    tookDamageThisTurn: false,
  },
  opponent: null,
  players,
  combat: null,
  prompt: null,
  winner: null,
});

const renderHud = (view: PlayerView) =>
  render(
    <ChakraProvider>
      <ProHud
        view={view}
        status="open"
        roomId="room-1"
        resolveCard={() => null}
        resolveHero={() => null}
        labelFor={() => ""}
      />
    </ChakraProvider>,
  );

/** Distinct badge ids on screen. A plate renders its name block twice — the live
 *  plate and its collapsed hover-peek — so counting nodes would count double. */
const chipIds = () =>
  Array.from(
    new Set(
      screen
        .queryAllByTestId("plate-badges")
        .flatMap((shelf) =>
          within(shelf)
            .queryAllByTestId("badge-glyph")
            .map((node) => node.getAttribute("data-badge-id")),
        ),
    ),
  );

/** The ids of ONE seat's shelf, in the order they are drawn. */
const shelfOrder = (badgeId: string) => {
  const shelf = screen
    .queryAllByTestId("plate-badges")
    .find((node) =>
      within(node)
        .queryAllByTestId("badge-glyph")
        .some((glyph) => glyph.getAttribute("data-badge-id") === badgeId),
    );
  if (!shelf) throw new Error(`no shelf carrying "${badgeId}"`);
  return within(shelf)
    .queryAllByTestId("badge-glyph")
    .map((node) => node.getAttribute("data-badge-id"));
};

beforeEach(() => {
  mockAccount = { status: "guest", account: null };
});

describe("ProHud badge shelf (issues #577/#718)", () => {
  it("renders a chip on BOTH seats when both wear one", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, { displayName: "Dean", badge: "first-win" }),
          seat("p2", false, { displayName: "JollyGrin", badge: "veteran" }),
        ],
        "p1",
      ),
    );

    expect(chipIds().sort()).toEqual(["first-win", "veteran"]);
  });

  it("renders your OWN badge from the wire, not from the local account", () => {
    // Unlike the avatar, the badge is public: your plate shows it because the
    // SEAT carries it, which is also the confirmation the opponent sees it.
    mockAccount = {
      status: "signed-in",
      account: { id: "u1", username: "Dean", avatarUrl: null },
    };

    renderHud(
      makeView([seat("p1", true, { badge: "streak-5" }), seat("p2", false)], "p1"),
    );

    expect(chipIds()).toEqual(["streak-5"]);
  });

  it("renders nothing for a seat wearing none, or an older server", () => {
    renderHud(makeView([seat("p1", true), seat("p2", false)], "p1"));

    // No shelf ROW at all — not an empty one. A plate with nothing worn has to
    // be exactly as tall as it was before the feature existed.
    expect(screen.queryAllByTestId("plate-badges")).toHaveLength(0);
    // The plates themselves are untouched — this is purely additive.
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Opponent").length).toBeGreaterThan(0);
  });

  it("renders NOTHING for an id it has no art for", () => {
    // The engine validates length and nothing else, so this is a string the
    // other client chose. No art, no chip — never a fallback shape.
    renderHud(
      makeView(
        [
          seat("p1", true, { badge: "first-win" }),
          seat("p2", false, { displayName: "JollyGrin", badge: "moon-walker" }),
        ],
        "p1",
      ),
    );

    expect(chipIds()).toEqual(["first-win"]);
    // The seat still reads normally — an unknown badge costs a chip, not a name.
    expect(screen.getAllByText("JollyGrin").length).toBeGreaterThan(0);
  });

  it("mixed room: one seat's chip, and no layout change for the other", () => {
    renderHud(
      makeView(
        [seat("p1", true), seat("p2", false, { badge: "bot-slayer" })],
        "p1",
      ),
    );

    expect(chipIds()).toEqual(["bot-slayer"]);
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Opponent").length).toBeGreaterThan(0);
  });

  it("keeps the chip beside a name that also carries an avatar", () => {
    // The avatar is local and the badge is broadcast; they share the name line
    // and must not knock each other out.
    mockAccount = {
      status: "signed-in",
      account: { id: "u1", username: "Dean", avatarUrl: "https://cdn/a.png" },
    };

    renderHud(
      makeView(
        [seat("p1", true, { displayName: "Dean", badge: "level-20" }), seat("p2", false)],
        "p1",
      ),
    );

    expect(chipIds()).toEqual(["level-20"]);
    expect(screen.getAllByTestId("plate-avatar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dean").length).toBeGreaterThan(0);
  });

  it("reads the badge off a duel view with no players array", () => {
    // Older/duel-shaped views build their seats from self/opponent; the badge
    // has to survive that path too or a plain duel loses both chips.
    const view = makeView([], "p1");
    view.self.badge = "regular";
    view.opponent = {
      id: "p2",
      heroId: "p2-hero",
      displayName: "JollyGrin",
      badge: "specialist",
      handCount: 0,
      deckCount: 0,
      discard: [],
      ongoingScheme: null,
      hasCommitted: false,
      counters: {},
      flags: {},
      wonCombatThisTurn: false,
      lostCombatThisTurn: false,
      firstAttackThisTurn: false,
      playedACardThisTurn: false,
      tookDamageThisTurn: false,
    };

    renderHud(view);

    expect(chipIds().sort()).toEqual(["regular", "specialist"]);
  });

  it("reads `badges` off a duel view too, not just the singular field", () => {
    const view = makeView([], "p1");
    view.self.badges = ["level-20", "streak-5"];
    view.opponent = {
      id: "p2",
      heroId: "p2-hero",
      displayName: "JollyGrin",
      badges: ["specialist"],
      handCount: 0,
      deckCount: 0,
      discard: [],
      ongoingScheme: null,
      hasCommitted: false,
      counters: {},
      flags: {},
      wonCombatThisTurn: false,
      lostCombatThisTurn: false,
      firstAttackThisTurn: false,
      playedACardThisTurn: false,
      tookDamageThisTurn: false,
    };

    renderHud(view);

    expect(chipIds().sort()).toEqual(["level-20", "specialist", "streak-5"]);
  });
});

describe("ProHud badge shelf — three worn (issue #718)", () => {
  it("draws all three, in the wearer\'s order, on both plates", () => {
    // Order is the whole point of the picker: slot 1 is the disc in front.
    renderHud(
      makeView(
        [
          seat("p1", true, { badges: ["level-20", "streak-5", "bot-slayer"] }),
          seat("p2", false, { badges: ["veteran", "specialist"] }),
        ],
        "p1",
      ),
    );

    expect(shelfOrder("level-20")).toEqual([
      "level-20",
      "streak-5",
      "bot-slayer",
    ]);
    expect(shelfOrder("veteran")).toEqual(["veteran", "specialist"]);
  });

  it("slices a claim of more than three down to three", () => {
    // The engine slices too, but the array reached it from the other CLIENT —
    // so a hand-rolled one that skipped the cap gets three discs, not nine.
    renderHud(
      makeView(
        [
          seat("p1", true, {
            badges: [
              "level-20",
              "streak-5",
              "bot-slayer",
              "veteran",
              "specialist",
              "regular",
            ],
          }),
          seat("p2", false),
        ],
        "p1",
      ),
    );

    expect(shelfOrder("level-20")).toEqual([
      "level-20",
      "streak-5",
      "bot-slayer",
    ]);
  });

  it("drops an id it has no art for and CLOSES UP, leaving no gap", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, { badges: ["level-20", "moon-walker", "bot-slayer"] }),
          seat("p2", false),
        ],
        "p1",
      ),
    );

    expect(shelfOrder("level-20")).toEqual(["level-20", "bot-slayer"]);
  });

  it("prefers `badges` over the singular field an older server still sends", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, { badge: "regular", badges: ["level-20", "veteran"] }),
          seat("p2", false),
        ],
        "p1",
      ),
    );

    expect(shelfOrder("level-20")).toEqual(["level-20", "veteran"]);
  });

  it("falls back to the singular field when the array is absent or empty", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, { badge: "regular", badges: [] }),
          seat("p2", false),
        ],
        "p1",
      ),
    );

    expect(chipIds()).toEqual(["regular"]);
  });
});

describe("ProHud badge shelf — reading them (issue #718)", () => {
  const openShelf = () => {
    // The live plate\'s shelf is the interactive one; the collapsed hover-peek
    // renders the same row without a popover.
    const trigger = screen
      .getAllByTestId("plate-badges")
      .find((node) => node.getAttribute("role") === "button")!;
    fireEvent.click(trigger);
    return trigger;
  };

  it("names each worn badge and says what it is", () => {
    renderHud(
      makeView(
        [seat("p1", true, { badges: ["first-win", "bot-slayer"] }), seat("p2", false)],
        "p1",
      ),
    );

    openShelf();

    const rows = screen.getAllByTestId("badge-readout");
    expect(rows.map((row) => row.getAttribute("data-badge-id"))).toEqual([
      "first-win",
      "bot-slayer",
    ]);
    // Name AND blurb — the point of putting `blurb` in BADGE_ART is that the
    // HUD has no API catalog row for the opponent\'s badges.
    expect(within(rows[0]).getByText("First Blood")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Won their first game")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Beat the expert bot")).toBeInTheDocument();
  });

  it("is a click target that never starts a plate drag", () => {
    // The plate's title bar starts a framer-motion drag on the pointerdown that
    // reaches it. The shelf swallows its own, exactly as FlagChip does for the
    // pile pills — so no ancestor handler, the drag starter included, runs.
    const outer = jest.fn();
    render(
      <ChakraProvider>
        <div onPointerDown={outer}>
          <ProHud
            view={makeView(
              [seat("p1", true, { badges: ["first-win"] }), seat("p2", false)],
              "p1",
            )}
            status="open"
            roomId="room-1"
            resolveCard={() => null}
            resolveHero={() => null}
            labelFor={() => ""}
          />
        </div>
      </ChakraProvider>,
    );

    const trigger = screen
      .getAllByTestId("plate-badges")
      .find((node) => node.getAttribute("role") === "button")!;
    fireEvent.pointerDown(trigger);
    expect(outer).not.toHaveBeenCalled();

    // The control: an ordinary press on the plate DOES propagate, which is what
    // makes the plate draggable in the first place.
    fireEvent.pointerDown(screen.getAllByTestId("plate-name-line")[0]);
    expect(outer).toHaveBeenCalled();
  });

  it("shows nothing to read until it is clicked", () => {
    renderHud(
      makeView([seat("p1", true, { badges: ["first-win"] }), seat("p2", false)], "p1"),
    );

    expect(screen.queryAllByTestId("badge-readout")).toHaveLength(0);
  });

  it("leaves the hero-rules tooltip alone — it is outside that trigger", () => {
    renderHud(
      makeView([seat("p1", true, { badges: ["first-win"] }), seat("p2", false)], "p1"),
    );

    const trigger = screen
      .getAllByTestId("plate-badges")
      .find((node) => node.getAttribute("role") === "button")!;
    // The tooltip wraps the NAME LINE; the shelf is a later sibling of it,
    // under the same name block. If this ever changes, clicking a badge would
    // start opening hero rules.
    expect(trigger.closest("[data-testid='plate-name-line']")).toBeNull();
    expect(within(trigger).queryByText("You")).toBeNull();
  });
});
