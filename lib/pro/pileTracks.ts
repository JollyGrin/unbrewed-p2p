/**
 * Pile-driven QUEST TRACKS (issue #1623 ↔ engine #1056, POMNI's Adventure deck).
 *
 * A track is a short row of double-sided cards a hero works through in order: one
 * side is a GOAL ("Adventure n"), the other the REWARD it flips to. The engine keeps
 * no counter or flag for it — the whole state is WHERE each face sits, in public
 * piles on the hero's own seat:
 *
 *   active    the 0-or-1 goal being worked on
 *   pending   goals not placed yet (the "Adventure deck")
 *   held      rewards earned and in force; its length is "completed Adventures"
 *   spent     a reward used up and removed from the game
 *   hidden    the back of a card that is currently showing its other side
 *
 * This module is the ONE place those pile keys and card ids are written. Both render
 * surfaces (the seat plate / mobile seat sheet, and the feed) read the derived
 * `PileTrackView`, so a second track deck is one more registry entry.
 *
 * Faces are matched on CARD DEF ID, never on title: POMNI's Adventure 4 and 5 titles
 * carry an embedded newline (Adventure 5 a U+00A0 as well), which no editor can be
 * trusted to keep.
 *
 * Pile keys and card ids VERIFIED against `data/heroes/pomni.rules.ts` @41361953
 * (engine `feature/pomni`): ADV_PENDING / ADV_ACTIVE / ADV_FLIPPED / ADV_REWARDS /
 * ADV_DONE, the sealed EXILE, and `pomni/adventure-n` / `pomni/reward-n`.
 */
import type { CardDefId, CardInstanceId, GameEvent, PileEntry, PlayerId } from "./protocol";

export interface PileTrackStepDef {
  n: number;
  /** def id of the goal face ("Adventure n") */
  goal: CardDefId;
  /** def id of the reward face on the back of the same card */
  reward: CardDefId;
}

export interface PileTrackDef {
  /** hero ids that own this track */
  heroes: string[];
  /** word for a goal face ("Adventure") and for its reward ("Reward") */
  goalWord: string;
  rewardWord: string;
  piles: {
    active: string;
    pending: string;
    held: string;
    /** shared, generic pile: only THIS track's reward faces in it count as steps */
    spent: string;
    /** the hidden backs: never rendered, and their tucks never narrated */
    goalBack: string;
    rewardBack: string;
  };
  steps: PileTrackStepDef[];
  /**
   * A step that can come round again and then goes to the BACK of the queue. The
   * engine's placement ladder for POMNI is 1, 2 (first lap only), 3, 4, 5, then a
   * returned 2 — and it latches "first lap done" on a public flag. The flag is
   * bookkeeping and is never drawn; it is read here only to order `upcoming`.
   */
  repeatable?: { step: number; lapFlag: string };
  /** The step whose REWARD removes cards from OTHER seats' piles into `spent` on
   *  those seats (POMNI's Reward 2), named in the feed line for such a removal. */
  removesFromOthers?: number;
  /** The faces are landscape cards uploaded a quarter turn round in a portrait
   *  frame; the track turns them upright. */
  landscapeFaces?: boolean;
}

export const PILE_TRACKS: PileTrackDef[] = [
  {
    heroes: ["pomni"],
    goalWord: "Adventure",
    rewardWord: "Reward",
    piles: {
      active: "ADV_ACTIVE",
      pending: "ADV_PENDING",
      held: "ADV_DONE",
      spent: "EXILE",
      goalBack: "ADV_FLIPPED",
      rewardBack: "ADV_REWARDS",
    },
    steps: [1, 2, 3, 4, 5].map((n) => ({
      n,
      goal: `pomni/adventure-${n}`,
      reward: `pomni/reward-${n}`,
    })),
    repeatable: { step: 2, lapFlag: "POMNI_ADV2_ONCE" },
    removesFromOthers: 2,
    landscapeFaces: true,
  },
];

export const pileTrackDefFor = (heroId: string | undefined): PileTrackDef | null =>
  (heroId && PILE_TRACKS.find((t) => t.heroes.includes(heroId))) || null;

/**
 * - `active`   the goal is in play
 * - `upcoming` the goal waits in the deck
 * - `held`     completed; the reward is in force
 * - `spent`    completed, and the reward was used up and removed from the game
 * - `unknown`  neither face is where a track pile would put it (an older server)
 */
export type PileTrackStepState = "active" | "upcoming" | "held" | "spent" | "unknown";

export interface PileTrackStep {
  n: number;
  state: PileTrackStepState;
  /** the instance ids of the two faces, wherever they sit (null if not found) */
  goal: CardInstanceId | null;
  reward: CardInstanceId | null;
  /** the side that is face up on the table: the goal until completed */
  faceUp: CardInstanceId | null;
}

export interface PileTrackView {
  def: PileTrackDef;
  /** always in card order 1..n — the row of cards as they lie on the table */
  steps: PileTrackStep[];
  active: PileTrackStep | null;
  /** rewards in force, in card order */
  held: PileTrackStep[];
  /** the engine's "completed Adventures" number: rewards currently held */
  completed: number;
  /** the goal the next placement will pick, when nothing is active */
  next: PileTrackStep | null;
}

const defIdOf = (instance: CardInstanceId): CardDefId => instance.split("#")[0];
const entryCard = (e: PileEntry): CardInstanceId => (typeof e === "string" ? e : e.card);

const findIn = (
  piles: Record<string, PileEntry[]> | undefined,
  pile: string,
  def: CardDefId
): CardInstanceId | null =>
  (piles?.[pile] ?? []).map(entryCard).find((c) => defIdOf(c) === def) ?? null;

/**
 * A seat's track, read off its public piles. Null for a hero with no track, and for
 * a track hero whose seat carries none of the track's piles (an engine that predates
 * the deck) — the caller then renders nothing at all.
 */
export const pileTrackFor = (
  heroId: string | undefined,
  piles: Record<string, PileEntry[]> | undefined,
  flags?: Record<string, boolean>
): PileTrackView | null => {
  const def = pileTrackDefFor(heroId);
  if (!def || !piles) return null;
  const p = def.piles;
  const steps: PileTrackStep[] = def.steps.map((s) => {
    const inActive = findIn(piles, p.active, s.goal);
    const inPending = findIn(piles, p.pending, s.goal);
    const inHeld = findIn(piles, p.held, s.reward);
    const inSpent = findIn(piles, p.spent, s.reward);
    const goal = inActive ?? inPending ?? findIn(piles, p.goalBack, s.goal);
    const reward = inHeld ?? inSpent ?? findIn(piles, p.rewardBack, s.reward);
    const state: PileTrackStepState = inHeld
      ? "held"
      : inSpent
        ? "spent"
        : inActive
          ? "active"
          : inPending
            ? "upcoming"
            : "unknown";
    return {
      n: s.n,
      state,
      goal,
      reward,
      faceUp: state === "held" || state === "spent" ? reward : goal,
    };
  });
  if (steps.every((s) => s.state === "unknown")) return null;
  const active = steps.find((s) => s.state === "active") ?? null;
  const held = steps.filter((s) => s.state === "held");
  // The placement ladder: lowest number first, except a repeatable step that has
  // already been round once, which waits until every other goal has been placed.
  const lapped = !!(def.repeatable && flags?.[def.repeatable.lapFlag]);
  const upcoming = steps
    .filter((s) => s.state === "upcoming")
    .sort((a, b) => {
      const late = (s: PileTrackStep) => (lapped && s.n === def.repeatable!.step ? 1 : 0);
      return late(a) - late(b) || a.n - b.n;
    });
  return {
    def,
    steps,
    active,
    held,
    completed: held.length,
    next: active ? null : upcoming[0] ?? null,
  };
};

/** "Adventure 4:\nPomni’s Perilous Pilgrimage" -> "Pomni’s Perilous Pilgrimage".
 *  Display only (matching is by id): the author's casing is kept, the stray
 *  newline / no-break space is not. "" when the title has nothing after the colon. */
export const trackGoalSubtitle = (title: string | undefined): string => {
  if (!title) return "";
  const i = title.indexOf(":");
  if (i < 0) return "";
  return title
    .slice(i + 1)
    .replace(/[\s ]+/g, " ")
    .trim();
};

/** Card text of a reward face without its own leading "Reward:" label. */
export const trackRewardText = (text: string | undefined): string =>
  (text ?? "").replace(/^\s*reward\s*:\s*/i, "").trim();

// ---------------------------------------------------------------------------
// Feed narration
// ---------------------------------------------------------------------------

export interface TrackTuckLine {
  text: string;
  /** the seat the line belongs to (colours it as that player's move) */
  actor: PlayerId;
  cards: CardInstanceId[];
}

interface TuckEvent {
  player: PlayerId;
  card: CardInstanceId;
  pile: string;
}

const stepOfCard = (
  card: CardInstanceId
): { def: PileTrackDef; step: PileTrackStepDef; side: "goal" | "reward" } | null => {
  const id = defIdOf(card);
  for (const def of PILE_TRACKS) {
    for (const step of def.steps) {
      if (step.goal === id) return { def, step, side: "goal" };
      if (step.reward === id) return { def, step, side: "reward" };
    }
  }
  return null;
};

/** The page's card label decorates the title with the card's stats — "Form V (0/1)",
 *  "Reward 1 (scheme)". A sentence about a card leaving the game, or a track face
 *  (which has no stats worth reading), wants the bare title. */
const stripLabelStats = (label: string): string =>
  label.replace(/\s*\((?:scheme|[\d–-]+\/[\d–-]+)\)\s*$/, "");

/**
 * The feed line for one `CARD_TUCKED`, when a track deck gives it a meaning:
 *
 *  - a line        the tuck is a track move worth a sentence
 *  - `null`        the tuck is the silent half of a pair (the back of the card) — say nothing
 *  - `undefined`   not a track tuck: the caller narrates it as it always has
 *
 * `batch` / `index` locate the event in its STATE batch. A card removed from the
 * game on ANOTHER seat (POMNI's Reward 2 takes cards out of an opponent's discard
 * pile) carries only its HOST in `player` — the Boba Fett bounty lesson the other way
 * round: nothing on the event says who did it. The effect that did is the nearest
 * `EFFECT_RESOLVING` before it in the batch, and its `player` is the actor. A card
 * the host removed itself (a used reward, a played *ricochet super move*) has the
 * host's own effect there instead.
 */
export const trackTuckLine = (
  e: TuckEvent,
  batch: GameEvent[],
  index: number,
  ctx: { label: (card: CardInstanceId) => string; seat: (p: PlayerId) => string; you: string }
): TrackTuckLine | null | undefined => {
  const hit = stepOfCard(e.card);
  const name = (p: PlayerId) => ctx.seat(p);
  const their = (p: PlayerId) => (p === ctx.you ? "your" : `${ctx.seat(p)}'s`);
  if (hit) {
    const { def, step, side } = hit;
    const p = def.piles;
    const goal = `${def.goalWord} ${step.n}`;
    const reward = `${def.rewardWord} ${step.n}`;
    if (side === "goal" && e.pile === p.active) {
      const sub = trackGoalSubtitle(stripLabelStats(ctx.label(e.card)));
      return {
        text: `${name(e.player)}: ${goal} is now active${sub ? ` — ${sub}` : ""}`,
        actor: e.player,
        cards: [e.card],
      };
    }
    if (side === "reward" && e.pile === p.held) {
      return {
        text: `${name(e.player)} completed ${goal} — ${reward} earned`,
        actor: e.player,
        cards: [e.card],
      };
    }
    if (side === "reward" && e.pile === p.rewardBack) {
      return {
        text: `${name(e.player)} used ${reward} — ${goal} goes back to the bottom of the ${def.goalWord} deck`,
        actor: e.player,
        cards: [e.card],
      };
    }
    if (side === "reward" && e.pile === p.spent) {
      return {
        text: `${name(e.player)} used ${reward} — it is removed from the game`,
        actor: e.player,
        cards: [e.card],
      };
    }
    // The other half of a flip (goal -> its back, or the goal returning to the deck).
    if (e.pile === p.goalBack || e.pile === p.pending) return null;
    return undefined;
  }
  const def = PILE_TRACKS.find((t) => t.piles.spent === e.pile);
  if (!def) return undefined;
  // An ordinary card removed from the game: by whom?
  let actor: PlayerId = e.player;
  for (let i = index - 1; i >= 0; i--) {
    const b = batch[i];
    if (b.type === "EFFECT_RESOLVING") {
      actor = b.player;
      break;
    }
  }
  const title = stripLabelStats(ctx.label(e.card));
  if (actor !== e.player) {
    const via = def.removesFromOthers ? ` (${def.rewardWord} ${def.removesFromOthers})` : "";
    return {
      text: `${name(actor)} removed ${their(e.player)} ${title} from the game${via}`,
      actor,
      cards: [e.card],
    };
  }
  return {
    text: `${name(e.player)}: ${title} is removed from the game`,
    actor: e.player,
    cards: [e.card],
  };
};

/**
 * "Adventure n completed": the tuck that lands a track's REWARD face in its held
 * pile (the engine's own definition — engine #1056, Client surface). Null for
 * every other event.
 */
export const trackCompletionOf = (
  e: GameEvent
): { player: PlayerId; goalWord: string; n: number } | null => {
  if (e.type !== "CARD_TUCKED") return null;
  const hit = stepOfCard(e.card);
  if (!hit || hit.side !== "reward" || e.pile !== hit.def.piles.held) return null;
  return { player: e.player, goalWord: hit.def.goalWord, n: hit.step.n };
};
