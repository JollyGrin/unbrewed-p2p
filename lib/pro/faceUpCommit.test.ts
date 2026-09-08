/**
 * Commit-time FACE-UP play (issue #772 ↔ engine #555, DSL v0.78.0).
 *
 * The wire carries no `faceUp` marker on the view card, so the whole feature hangs
 * off one inference — `stage === 'COMMIT_DEFENSE'` + an attacker card with an
 * ORDINARY instance id — and off every consumer that used to read "attackerCard
 * became non-null" as "the cards are revealed". Both halves are pinned here, in the
 * same file, because the risk is not that the badge fails to draw: it is that the
 * inference quietly reclassifies a SUB-ATTACK or a LINKED effect attack (which have
 * been arriving pre-reveal since v0.17.0 / v32) and changes a shipped flow.
 *
 * Every "unchanged" case below is that regression guard. No shipped deck declares
 * `faceUp`, so until one does, this whole feature must be invisible.
 */
import { dockRows, cardAffordances, describeAction } from "./actionDock";
import { combatHasRevealed } from "./combatStrike";
import { LINKED_CARD_SUFFIX } from "./effectAttack";
import {
  FACE_UP_BADGE,
  faceUpCommitter,
  isFaceUpPreRevealAttack,
  isHandCombatCard,
} from "./faceUpCommit";
import { diffFxEvents } from "./fxEvents";
import { diffViews, enrichLines, EnrichContext } from "./gameLog";
import {
  Action,
  CardInstanceId,
  CardMeta,
  GameEvent,
  PlayerId,
  PlayerView,
  ViewCombat,
  ViewCombatCard,
  ViewFighter,
  ViewPlayer,
} from "./protocol";

// --- fixtures (same shape as gameLog.test.ts / fxEvents.test.ts) -------------

const HAND_CARD = "hero-a/crushing-blow#2";
const SUB_ATTACK = "sub-attack:p1/hero";
const LINKED = `hero-a/seismic-charge${LINKED_CARD_SUFFIX}`;

const face = (instance: CardInstanceId, effectiveValue = 5): ViewCombatCard => ({
  instance,
  role: "ATTACK",
  boosts: [],
  effectiveValue,
});

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "King Taranis",
  space: "s1",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

const combat = (over: Partial<ViewCombat>): ViewCombat => ({
  attackerPlayer: "p1",
  defenderPlayer: "p2",
  attacker: "p1/hero",
  target: "p2/hero",
  stage: "COMMIT_ATTACK",
  attackerCard: null,
  defenderCard: null,
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
  ...over,
});

const view = (over: Partial<PlayerView>): PlayerView => ({
  you: "p1",
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: { schemaVersion: "1", id: "m", meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  catalog: {},
  fighters: [fighter({}), fighter({ id: "p2/hero", owner: "p2", name: "Thrall", space: "s2" })],
  tokens: [],
  self: { id: "p1", heroId: "king-taranis", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  opponent: { id: "p2", heroId: "thrall", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  players: [],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

const CATALOG: Record<string, CardMeta> = {
  "hero-a/crushing-blow": { title: "Crushing Blow", type: "attack", value: 5, boost: 1 },
};

const cardLabel = (c: CardInstanceId) => c.split("#")[0].split("/").pop() ?? c;

const ctx = (you = "p1"): EnrichContext => ({
  you,
  label: cardLabel,
  seat: (p) => (p === you ? "You" : "Opponent"),
  fighter: (id) => id.split("/").pop() ?? id,
});

const texts = (lines: { text: string }[]) => lines.map((l) => l.text);

// --- the inference ----------------------------------------------------------

describe("the face-up inference (the one shared id-grammar test)", () => {
  it("reads a pre-reveal HAND card at COMMIT_DEFENSE as played face up", () => {
    expect(
      isFaceUpPreRevealAttack(combat({ stage: "COMMIT_DEFENSE", attackerCard: face(HAND_CARD) })),
    ).toBe(true);
  });

  it("never reads a SUB-ATTACK or a LINKED effect attack as face up", () => {
    // Both have been arriving pre-reveal for releases; misclassifying either would
    // badge a shipped flow and re-time its reveal beat.
    for (const instance of [SUB_ATTACK, LINKED]) {
      expect(isHandCombatCard(instance)).toBe(false);
      expect(
        isFaceUpPreRevealAttack(combat({ stage: "COMMIT_DEFENSE", attackerCard: face(instance) })),
      ).toBe(false);
    }
    expect(isHandCombatCard(HAND_CARD)).toBe(true);
  });

  it("is false with no card, and false once the stage moves past COMMIT_DEFENSE", () => {
    expect(isFaceUpPreRevealAttack(null)).toBe(false);
    expect(isFaceUpPreRevealAttack(combat({ stage: "COMMIT_DEFENSE" }))).toBe(false);
    expect(
      isFaceUpPreRevealAttack(combat({ stage: "DURING", attackerCard: face(HAND_CARD) })),
    ).toBe(false);
  });

  it("names the seat whose card is face up — the attacker, never the defender", () => {
    const v = view({ combat: combat({ stage: "COMMIT_DEFENSE", attackerCard: face(HAND_CARD) }) });
    expect(faceUpCommitter(v)).toBe("p1");
    expect(faceUpCommitter(view({ combat: null }))).toBeNull();
  });
});

// --- the attacker's own commit state ----------------------------------------

describe("the attacker's own seat state", () => {
  const faceUpView = view({
    // What the engine actually sends: `committedCard` stays NULL for a face-up
    // commit — the card is public on the combat instead.
    self: { ...view({}).self, committedCard: null },
    combat: combat({ stage: "COMMIT_DEFENSE", attackerCard: face(HAND_CARD) }),
  });

  it("counts as committed even though committedCard is null", () => {
    // The seat projection the HUD plate, the log and the feel layer all share.
    expect(faceUpCommitter(faceUpView)).toBe(faceUpView.self.id);
  });

  it("fires the COMMIT beat, not the reveal beat, when the card lands face up", () => {
    const before = view({ combat: combat({ stage: "COMMIT_ATTACK" }) });
    const fx = diffFxEvents(before, faceUpView, []);
    expect(fx).toContainEqual({ type: "commit" });
    expect(fx.find((e) => e.type === "reveal")).toBeUndefined();
  });

  it("fires the REVEAL beat when the stage finally leaves COMMIT_DEFENSE", () => {
    // The slot never changes from null to non-null here, which is exactly why the
    // old `!prev.attackerCard` test could not see this moment at all.
    const revealed = view({
      combat: combat({
        stage: "DURING",
        attackerCard: face(HAND_CARD),
        defenderCard: { instance: "hero-b/block#1", role: "DEFENSE", boosts: [], effectiveValue: 2 },
      }),
    });
    expect(diffFxEvents(faceUpView, revealed, [])).toContainEqual({ type: "reveal", count: 2 });
  });

  it("counts a THIRD seat's face-up commit too (ffa/2v2 seats arrive whole)", () => {
    // A >2p seat's ViewPlayer comes off the wire as-is, so the per-field fix on
    // self/opponent cannot reach it — the correction has to be applied to the seat map.
    const seat = (id: PlayerId, you: boolean): ViewPlayer => ({
      id, heroId: `fixture-${id}`, you, handCount: 5, deckCount: 10, discard: [],
      hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false,
      lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false,
      tookDamageThisTurn: false,
    });
    const players = [seat("p1", true), seat("p2", false), seat("p3", false)];
    const before = view({ players, combat: combat({ attackerPlayer: "p3", stage: "COMMIT_ATTACK" }) });
    const after = view({
      players,
      combat: combat({ attackerPlayer: "p3", stage: "COMMIT_DEFENSE", attackerCard: face(HAND_CARD) }),
    });
    expect(diffFxEvents(before, after, [])).toContainEqual({ type: "commit" });
  });

  it("leaves an ordinary face-down commit's beats exactly as they were", () => {
    const before = view({ combat: combat({ stage: "COMMIT_ATTACK" }) });
    const committed = view({
      self: { ...view({}).self, committedCard: HAND_CARD },
      combat: combat({ stage: "COMMIT_DEFENSE" }),
    });
    expect(diffFxEvents(before, committed, [])).toEqual([{ type: "commit" }]);
    const revealed = view({
      self: { ...view({}).self, committedCard: null },
      combat: combat({ stage: "DURING", attackerCard: face(HAND_CARD) }),
    });
    expect(diffFxEvents(committed, revealed, [])).toContainEqual({ type: "reveal", count: 1 });
  });
});

// --- the activity log -------------------------------------------------------

describe("the activity log", () => {
  it("says 'played … face up' at the commit, and 'Reveal: …' only after", () => {
    const opened = view({ combat: combat({ stage: "COMMIT_ATTACK" }) });
    const faceUp = view({ combat: combat({ stage: "COMMIT_DEFENSE", attackerCard: face(HAND_CARD) }) });

    // Batch 1 — the commit. `card` rides CARD_COMMITTED only for a face-up play.
    const commitEvents: GameEvent[] = [{ type: "CARD_COMMITTED", player: "p1", card: HAND_CARD }];
    const commitLines = enrichLines(diffViews(opened, faceUp, cardLabel, commitEvents), commitEvents, ctx());
    expect(texts(commitLines)).toContain("You played crushing-blow face up");
    // The defender has not acted yet — nothing may claim a reveal, least of all
    // "vs no defense", which is a statement about a decision not yet made.
    expect(texts(commitLines).some((t) => t.startsWith("Reveal:"))).toBe(false);

    // Batch 2 — the defender declines; NOW the cards are revealed.
    const revealed = view({ combat: combat({ stage: "DURING", attackerCard: face(HAND_CARD) }) });
    const revealLines = diffViews(faceUp, revealed, cardLabel, [
      { type: "CARDS_REVEALED", attackerCard: HAND_CARD, defenderCard: null },
    ]);
    expect(texts(revealLines)).toContain("Reveal: crushing-blow vs no defense");
  });

  it("logs nothing extra for a card-less CARD_COMMITTED (every face-down commit)", () => {
    // The defender's commit is card-less too, so card PRESENCE — never the event —
    // is what marks the attacker's face-up play.
    const events: GameEvent[] = [{ type: "CARD_COMMITTED", player: "p2" }];
    expect(enrichLines([], events, ctx())).toEqual([]);
  });

  it("keeps an ordinary face-down reveal identical", () => {
    const before = view({ combat: combat({ stage: "COMMIT_DEFENSE" }) });
    const after = view({ combat: combat({ stage: "DURING", attackerCard: face(HAND_CARD) }) });
    expect(texts(diffViews(before, after, cardLabel, []))).toContain("Reveal: crushing-blow vs no defense");
  });

  it("keeps a sub-attack / linked pre-reveal face reading as a reveal", () => {
    for (const instance of [SUB_ATTACK, LINKED]) {
      const before = view({ combat: null });
      const after = view({
        combat: combat({ stage: "COMMIT_DEFENSE", attackerCard: face(instance) }),
      });
      expect(texts(diffViews(before, after, cardLabel, [])).some((t) => t.startsWith("Reveal:"))).toBe(true);
    }
  });
});

// --- the strike hold --------------------------------------------------------

describe("combatHasRevealed", () => {
  it("is false while a face-up card waits on the defender", () => {
    expect(
      combatHasRevealed(combat({ stage: "COMMIT_DEFENSE", attackerCard: face(HAND_CARD) }), []),
    ).toBe(false);
  });

  it("stays true for every pre-reveal face it already counted", () => {
    for (const instance of [SUB_ATTACK, LINKED]) {
      expect(
        combatHasRevealed(combat({ stage: "COMMIT_DEFENSE", attackerCard: face(instance) }), []),
      ).toBe(true);
    }
  });

  it("is true once the stage moves on, or the batch reveals", () => {
    expect(combatHasRevealed(combat({ stage: "DURING", attackerCard: face(HAND_CARD) }), [])).toBe(
      true,
    );
    expect(
      combatHasRevealed(combat({ stage: "COMMIT_DEFENSE", attackerCard: face(HAND_CARD) }), [
        { type: "CARDS_REVEALED", attackerCard: HAND_CARD, defenderCard: null },
      ]),
    ).toBe(true);
  });
});

// --- the attacker's affordance ---------------------------------------------

describe("the action dock", () => {
  const plain: Action = { type: "COMMIT_ATTACK_CARD", player: "p1", card: HAND_CARD };
  const faceUp: Action = { type: "COMMIT_ATTACK_CARD", player: "p1", card: HAND_CARD, faceUp: true };
  const faceUpWithItem: Action = { ...faceUp, attachItem: true };

  it("labels the OPTIONAL card's two variants apart", () => {
    expect(describeAction(CATALOG, plain)).toBe("Commit Crushing Blow (5/1)");
    expect(describeAction(CATALOG, faceUp)).toBe("Commit Crushing Blow (5/1) (face up)");
  });

  it("offers both hand affordances, the face-up one marked", () => {
    expect(cardAffordances([plain, faceUp], HAND_CARD)).toEqual([
      { action: plain, label: "Attack with" },
      { action: faceUp, label: "Attack with (face up)" },
    ]);
  });

  it("stacks with the v17 item attach rather than replacing it", () => {
    expect(
      cardAffordances([faceUpWithItem], HAND_CARD, { label: "Torch", value: 2 })[0].label,
    ).toBe("Attack with + Torch (+2) (face up)");
  });

  it("offers the MANDATORY card alone — one row, still marked", () => {
    const rows = dockRows([faceUp]);
    expect(rows).toHaveLength(1);
    expect(describeAction(CATALOG, rows[0].action)).toContain("(face up)");
  });

  it("leaves a plain commit's label untouched", () => {
    expect(cardAffordances([plain], HAND_CARD)).toEqual([{ action: plain, label: "Attack with" }]);
  });
});

describe("the badge copy", () => {
  it("is the short lowercase chip the panel and the scrubber share", () => {
    expect(FACE_UP_BADGE).toBe("face up");
  });
});
