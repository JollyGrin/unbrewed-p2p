import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { PlayerId, PlayerView, ProMapDef, ViewPlayer } from "@/lib/pro/protocol";

/**
 * HUD nameplates for the accounts epic (issue #568). The unit-level fallback
 * rules live in lib/pro/playerIdentity.test.ts; what's pinned HERE is that the
 * HUD actually reads the seat's broadcast `displayName`, and — the part that
 * matters for a mixed room — that a seat WITHOUT one still renders today's
 * "You"/"Opponent"/seat-id label instead of a blank plate.
 *
 * The avatar is local-only by design: it comes from `useAccount()` on this
 * machine and never crosses the wire, so it may appear on your own plate and
 * must never appear on the opponent's.
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
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 4, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [],
};

const seat = (id: PlayerId, you: boolean, displayName?: string): ViewPlayer => ({
  id,
  heroId: `${id}-hero`,
  you,
  ...(displayName ? { displayName } : {}),
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

beforeEach(() => {
  mockAccount = { status: "guest", account: null };
});

describe("ProHud nameplates — broadcast display names (issue #568)", () => {
  it("renders both players' names when both seats claimed one", () => {
    renderHud(
      makeView([seat("p1", true, "Dean"), seat("p2", false, "JollyGrin")], "p1"),
    );

    expect(screen.getAllByText("Dean").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JollyGrin").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Opponent")).toHaveLength(0);
    expect(screen.queryAllByText("You")).toHaveLength(0);
  });

  it("falls back to today's labels when neither seat claimed a name", () => {
    renderHud(makeView([seat("p1", true), seat("p2", false)], "p1"));

    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Opponent").length).toBeGreaterThan(0);
  });

  it("mixed room: the signed-in seat shows its name, the guest keeps the label", () => {
    renderHud(makeView([seat("p1", true, "Dean"), seat("p2", false)], "p1"));

    expect(screen.getAllByText("Dean").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Opponent").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("You")).toHaveLength(0);
  });

  it("mixed room, seen from the GUEST's side: the opponent's name shows, you stay 'You'", () => {
    renderHud(makeView([seat("p1", false, "Dean"), seat("p2", true)], "p2"));

    expect(screen.getAllByText("Dean").length).toBeGreaterThan(0);
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
  });

  it("multiplayer: an unnamed seat falls back to its seat id, not 'Opponent'", () => {
    renderHud(
      makeView(
        [seat("p1", true), seat("p2", false, "Ana"), seat("p3", false)],
        "p1",
      ),
      );

    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    expect(screen.getAllByText("P3").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Opponent")).toHaveLength(0);
  });
});

describe("ProHud nameplate avatar — local only (issue #568)", () => {
  it("shows no plate avatar for a guest", () => {
    renderHud(makeView([seat("p1", true), seat("p2", false)], "p1"));
    expect(screen.queryAllByTestId("plate-avatar")).toHaveLength(0);
  });

  it("puts the signed-in player's avatar on their OWN plate only", () => {
    mockAccount = {
      status: "signed-in",
      account: { id: "u1", username: "Dean", avatarUrl: "https://cdn/a.png" },
    };

    renderHud(
      makeView([seat("p1", true, "Dean"), seat("p2", false, "JollyGrin")], "p1"),
    );

    // Every plate avatar on screen is OURS — the opponent's name arrives over
    // the wire, but their picture deliberately does not. (A plate renders its
    // name block twice: the live plate and its collapsed hover-peek.)
    const avatars = screen.getAllByTestId("plate-avatar");
    expect(avatars.length).toBeGreaterThan(0);
    avatars.forEach((img) => expect(img).toHaveAttribute("src", "https://cdn/a.png"));
  });

  it("renders no avatar when the signed-in account has none set", () => {
    mockAccount = {
      status: "signed-in",
      account: { id: "u1", username: "Dean", avatarUrl: null },
    };

    renderHud(makeView([seat("p1", true, "Dean"), seat("p2", false)], "p1"));

    expect(screen.queryAllByTestId("plate-avatar")).toHaveLength(0);
    expect(screen.getAllByText("Dean").length).toBeGreaterThan(0);
  });
});
