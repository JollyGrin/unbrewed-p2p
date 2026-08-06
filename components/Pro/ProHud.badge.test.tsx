import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { PlayerId, PlayerView, ProMapDef, ViewPlayer } from "@/lib/pro/protocol";

/**
 * HUD badge chips (issue #577, engine #347).
 *
 * The badge is the first cosmetic the OPPONENT can see, which is the whole
 * reason it goes on the wire — so the chip has to render on both seats, from
 * broadcast state, not from `useAccount()` the way the avatar does.
 *
 * The sharp edge is the unknown id. The engine deliberately never validates the
 * string (its catalog lives in the accounts API), so an id this build has no art
 * for renders NOTHING here: a fallback glyph would let any client put a shape on
 * your screen just by inventing a string. `/account` makes the opposite call,
 * because there the API supplies the name and blurb to go with it.
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
  over: { displayName?: string; badge?: string } = {},
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
        .queryAllByTestId("plate-badge")
        .map((node) => node.getAttribute("data-badge-id")),
    ),
  );

beforeEach(() => {
  mockAccount = { status: "guest", account: null };
});

describe("ProHud badge chips (issue #577)", () => {
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

    expect(screen.queryAllByTestId("plate-badge")).toHaveLength(0);
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
});
