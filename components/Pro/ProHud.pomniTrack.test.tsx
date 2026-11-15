import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { CardInstanceId, PileEntry, PlayerId, PlayerView, ProMapDef, ViewFighter, ViewPlayer } from "@/lib/pro/protocol";

/**
 * POMNI's Adventure track on the HUD plates (issue #1623 ↔ engine #1056).
 *
 * The pile → track mapping is unit-tested in lib/pro/pileTracks.test.ts and the
 * EXILE / flag registry in lib/pro/heroStateFlags.test.ts. What is pinned HERE is
 * what a player actually sees on a plate: the track row on Pomni's seat from BOTH
 * sides of the table, none of her bookkeeping flags, and the removed-from-the-game
 * pill on the seat her Reward 2 emptied — worded so it cannot read as that
 * opponent's own pile.
 */

jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => ({ status: "guest", account: null }),
}));

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 4, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [],
};

const seat = (id: PlayerId, you: boolean, heroId: string, extra: Partial<ViewPlayer> = {}): ViewPlayer => ({
  id,
  heroId,
  you,
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
  ...extra,
});

const makeView = (players: ViewPlayer[], you: PlayerId): PlayerView => {
  const self = players.find((p) => p.id === you)!;
  return {
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
      id: self.id,
      heroId: self.heroId,
      hand: [],
      deckCount: 0,
      discard: [],
      ongoingScheme: null,
      committedCard: null,
      counters: self.counters,
      piles: self.piles,
      flags: self.flags,
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
  };
};

// The faces as the snapshot carries them (titles byte-exact, reward text with its
// own "Reward:" label).
const FACES: Record<string, { title: string; basicText: string }> = {
  "pomni/adventure-2": { title: "Adventure 2:President Pomni 2: Last stand", basicText: "Win a combat on defense." },
  "pomni/adventure-3": { title: "Adventure 3:night of the living Jax", basicText: "Attack twice in a single turn." },
  "pomni/adventure-5": {
    title: "Adventure 5: \nOvertime at Spudsy's Delivery Service",
    basicText: "At the end of your turn, discard a card.",
  },
  "pomni/reward-1": { title: "Reward 1", basicText: "Reward: Flip your charcter card. Pomni is a ranged fighter." },
  "pomni/reward-2": { title: "reward 2", basicText: "REWARD: On your turn, choose an opponent." },
};
const resolveCard = (instance: CardInstanceId): DeckImportCardType | null => {
  const face = FACES[instance.split("#")[0]];
  return face ? ({ ...face, type: "scheme", quantity: 1, boost: 0, value: null } as unknown as DeckImportCardType) : null;
};

const renderHud = (view: PlayerView) =>
  render(
    <ChakraProvider>
      <ProHud
        view={view}
        status="open"
        roomId="room-1"
        resolveCard={resolveCard}
        resolveHero={() => null}
        labelFor={(id: CardInstanceId) => `${id} (scheme)`}
      />
    </ChakraProvider>
  );

const A = (n: number) => `pomni/adventure-${n}#1`;
const R = (n: number) => `pomni/reward-${n}#1`;
const MID_GAME: Record<string, PileEntry[]> = {
  ADV_ACTIVE: [A(3)],
  ADV_PENDING: [A(4), A(5)],
  ADV_DONE: [R(1), R(2)],
  ADV_FLIPPED: [A(1), A(2)],
  ADV_REWARDS: [R(3), R(4), R(5)],
};
const ALL_FLAGS = { POMNI_ADV2_ONCE: true, POMNI_R2_SNOOZED: true, POMNI_R3_SNOOZED: true, POMNI_R4_USED: true };
const pomni = (id: PlayerId, you: boolean, piles = MID_GAME) => seat(id, you, "pomni", { piles, flags: ALL_FLAGS });

describe("POMNI's Adventure track on the HUD plates", () => {
  it.each([
    ["the OPPONENT reading Pomni's plate", false],
    ["Pomni's own plate", true],
  ])("shows the active Adventure, its text, the whole track and the rewards held — %s", (_name, you) => {
    renderHud(makeView(you ? [pomni("p1", true), seat("p2", false, "darth-vader")] : [seat("p1", true, "darth-vader"), pomni("p2", false)], "p1"));
    const row = screen.getByTestId("pile-track-row");
    expect(within(row).getByTestId("pile-track-headline")).toHaveTextContent("Adventure 3");
    expect(within(row).getByText("night of the living Jax")).toBeInTheDocument();
    expect(within(row).getByTestId("pile-track-goal")).toHaveTextContent("Attack twice in a single turn.");
    expect([1, 2, 3, 4, 5].map((n) => within(row).getByTestId(`pile-track-pip-${n}`).getAttribute("data-state"))).toEqual([
      "held",
      "held",
      "active",
      "upcoming",
      "upcoming",
    ]);
    const held = within(row).getByTestId("pile-track-held");
    expect(within(held).getByText("R1")).toHaveAttribute("title", "Reward 1: Flip your charcter card. Pomni is a ranged fighter.");
    expect(within(held).getByText("R2")).toHaveAttribute("title", "Reward 2: On your turn, choose an opponent.");
    // the row opens the full track
    expect(row.tagName).toBe("BUTTON");
  });

  it("renders NONE of the bookkeeping flags and no raw pile key", () => {
    const { container } = renderHud(makeView([seat("p1", true, "darth-vader"), pomni("p2", false)], "p1"));
    expect(container.textContent).not.toMatch(/POMNI_|SNOOZED|ADV_|R4 USED|ADV2/);
  });

  it("between Adventures it says which one is next instead of going blank", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, "darth-vader"),
          // first lap: no POMNI_ADV2_ONCE latch yet, so 2 is simply the lowest left
          seat("p2", false, "pomni", {
            piles: { ADV_PENDING: [A(2), A(3)], ADV_DONE: [R(1)], ADV_FLIPPED: [A(1)], ADV_REWARDS: [R(2), R(3)] },
          }),
        ],
        "p1"
      )
    );
    const row = screen.getByTestId("pile-track-row");
    expect(within(row).getByTestId("pile-track-headline")).toHaveTextContent("Adventure 2 is next");
    expect(within(row).getByTestId("pile-track-goal")).toHaveTextContent("placed at the start of the turn");
  });

  it("keeps the newline / no-break space of Adventure 5's title out of the row", () => {
    renderHud(
      makeView([seat("p1", true, "darth-vader"), pomni("p2", false, { ADV_ACTIVE: [A(5)], ADV_REWARDS: [R(5)] })], "p1")
    );
    expect(within(screen.getByTestId("pile-track-row")).getByText("Overtime at Spudsy's Delivery Service")).toBeInTheDocument();
  });

  it("a hero with no track gets no row", () => {
    renderHud(makeView([seat("p1", true, "darth-vader"), seat("p2", false, "king-kong")], "p1"));
    expect(screen.queryByTestId("pile-track-row")).not.toBeInTheDocument();
  });

  it("Reward 2's removed cards sit on the VICTIM's plate and say Pomni removed them", () => {
    const exiled = { EXILE: ["darth-vader/form-v#2", "darth-vader/feint#1", "darth-vader/dash#3"] };
    // you are the victim
    const { unmount } = renderHud(makeView([seat("p1", true, "darth-vader", { piles: exiled }), pomni("p2", false)], "p1"));
    const pill = screen.getByText("🚫 3 BY POMNI");
    expect(pill).toHaveAttribute("aria-label", "REMOVED FROM THE GAME BY POMNI: 3");
    expect(pill).toHaveAttribute("role", "button");
    unmount();
    // you are Pomni: the same pill, on the opponent's plate — and nothing of the kind on yours
    renderHud(makeView([pomni("p1", true), seat("p2", false, "darth-vader", { piles: exiled })], "p1"));
    expect(screen.getAllByText("🚫 3 BY POMNI")).toHaveLength(1);
    expect(screen.queryByLabelText(/^REMOVED FROM THE GAME: /)).not.toBeInTheDocument();
  });

  // The #1624 review's regression: EXILE is not POMNI's pile alone.
  it("Kenshiro vs Darth Vader shows NO removed-from-the-game pill, on either plate", () => {
    const { container } = renderHud(
      makeView(
        [
          seat("p1", true, "darth-vader", { piles: { EXILE: ["darth-vader/form-v#2"] } }),
          seat("p2", false, "kenshiro", { piles: { EXILE: ["kenshiro/death-omen-star#1"] } }),
        ],
        "p1"
      )
    );
    expect(container.textContent).not.toMatch(/POMNI|🚫/);
    expect(screen.queryByLabelText(/REMOVED FROM THE GAME/)).not.toBeInTheDocument();
  });

  it("Pomni vs Kenshiro: both plates carry a NEUTRAL pill, neither says 'by Pomni'", () => {
    renderHud(
      makeView(
        [
          seat("p1", true, "kenshiro", { piles: { EXILE: ["kenshiro/death-omen-star#1", "kenshiro/feint#2"] } }),
          pomni("p2", false, { ...MID_GAME, EXILE: [R(3), "pomni/anxiety#1"] }),
        ],
        "p1"
      )
    );
    expect(screen.getAllByLabelText("REMOVED FROM THE GAME: 2")).toHaveLength(2);
    expect(screen.queryByText(/BY POMNI/)).not.toBeInTheDocument();
    // her track is still drawn: it is keyed on her hero and her card ids
    expect(screen.getByTestId("pile-track-row")).toBeInTheDocument();
  });

  it("her own removed cards (a used Reward 3, ricochet super move) read as a plain removed pile", () => {
    renderHud(
      makeView(
        [seat("p1", true, "darth-vader"), pomni("p2", false, { ...MID_GAME, EXILE: [R(3), "pomni/ricochet-super-move#1"] })],
        "p1"
      )
    );
    expect(screen.getByLabelText("REMOVED FROM THE GAME: 2")).toHaveTextContent("🚫 2");
    expect(screen.queryByText(/BY POMNI/)).not.toBeInTheDocument();
  });
});

// Protocol v40 / engine #1059: the plate's move chip reads the engine's current move.
describe("plate move chip — ViewFighter.move", () => {
  const printed = { name: "POMNI", hp: 13, move: 2, isRanged: false } as unknown as ReturnType<
    React.ComponentProps<typeof ProHud>["resolveHero"]
  >;
  const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
    id: "p2/hero",
    owner: "p2",
    kind: "HERO",
    name: "POMNI",
    space: "s1",
    tailSpace: null,
    hp: 13,
    maxHp: 13,
    reach: "MELEE",
    size: "NORMAL",
    defeated: false,
    ...over,
  });
  const renderWith = (fighters: ViewFighter[]) =>
    render(
      <ChakraProvider>
        <ProHud
          view={{ ...makeView([seat("p1", true, "darth-vader"), pomni("p2", false)], "p1"), fighters }}
          status="open"
          roomId="room-1"
          resolveCard={resolveCard}
          resolveHero={(id) => (id === "pomni" ? printed : null)}
          labelFor={(id: CardInstanceId) => id}
        />
      </ChakraProvider>
    );
  const pomniChip = () => screen.getAllByTestId("plate-move").find((el) => el.textContent !== "–")!;

  it("an older server (no move on the view) still shows the printed move, unmarked", () => {
    renderWith([fighter({})]);
    expect(pomniChip()).toHaveTextContent("2");
    expect(pomniChip().parentElement).not.toHaveAttribute("data-move-changed");
  });

  it("Reward 4: shows 4, marked as changed, and says until when", () => {
    renderWith([fighter({ move: 4, statuses: [{ kind: "MOVE_SET", expiresAtTurn: 9, expiresAt: "END" }] })]);
    expect(pomniChip()).toHaveTextContent("4");
    const chip = pomniChip().parentElement!;
    expect(chip).toHaveAttribute("data-move-changed");
    expect(chip).toHaveAttribute("title", "Move 4 — changed from its printed value, until the end of turn 9");
  });

  it("back at the printed 2 nothing is marked", () => {
    renderWith([fighter({ move: 2, statuses: [] })]);
    expect(pomniChip()).toHaveTextContent("2");
    expect(pomniChip().parentElement).not.toHaveAttribute("data-move-changed");
  });

  it("a 'cannot move' 0 shows as 0; a sidekick's changed move gets its own reading", () => {
    renderWith([
      fighter({ move: 0, statuses: [{ kind: "MOVE_SET", expiresAtTurn: 4, expiresAt: "END" }] }),
      fighter({ id: "p2/sidekick-1", kind: "SIDEKICK", name: "JAX", hp: 7, maxHp: 7, move: 0, statuses: [{ kind: "MOVE_SET", expiresAtTurn: 4, expiresAt: "END" }] }),
    ]);
    expect(pomniChip()).toHaveTextContent("0");
    expect(screen.getByTestId("plate-sidekick-move")).toHaveTextContent("0");
  });

  it("an unchanged sidekick row shows no move at all", () => {
    renderWith([fighter({ move: 2 }), fighter({ id: "p2/sidekick-1", kind: "SIDEKICK", name: "JAX", move: 2 })]);
    expect(screen.queryByTestId("plate-sidekick-move")).not.toBeInTheDocument();
  });
});
