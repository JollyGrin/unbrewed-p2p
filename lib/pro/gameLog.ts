/**
 * Client-side activity feed for Pro games. Protocol v1 has no event stream —
 * the client derives log lines by diffing consecutive server views (the same
 * data the board renders, so the log can never contradict the table).
 * Heuristic and display-only: misses nothing rules-relevant that the view
 * doesn't also show, and never feeds anything back into play.
 */
import {
  CardInstanceId,
  FighterId,
  GameEvent,
  PlayerId,
  PlayerView,
  ValueBreakdown,
  ViewPlayer,
} from "./protocol";
import { boardObjectOriginFighter, boardObjectVisualFor } from "./boardObjects";
import { FIGHTER_MARKER_BADGES } from "./fighterStatuses";
import { deriveTeams, isViewerOnWinningTeam } from "./teams";
import { sweptFighters } from "./sweep";
import { swappedFighters } from "./positionSwap";
import { combatOutcomeLogText } from "./combatOutcome";
import { MITIGATION_COUNTER } from "./clockTower";
import { rangeSpendLineFor } from "./rangePurchase";

export interface ProLogLine {
  text: string;
  who: "you" | "opp" | "game";
  /** card instances named in the line — the log panel shows them on hover */
  cards?: CardInstanceId[];
}

/**
 * Display label for the player action a STATE batch carried, derived from its
 * `ACTION_SPENT.action`. Used to label an action group in the log; `undefined`
 * for batches with no player action (setup, forced end-of-turn, prompt
 * resolutions), which render as a neutral (unlabeled) group.
 */
export type ProLogPhase = "Maneuver" | "Scheme" | "Attack" | "Scheme Item";

const ACTION_PHASE: Record<"MANEUVER" | "SCHEME" | "ATTACK" | "SCHEME_ITEM", ProLogPhase> = {
  MANEUVER: "Maneuver",
  SCHEME: "Scheme",
  ATTACK: "Attack",
  SCHEME_ITEM: "Scheme Item",
};

/** Past-tense verb per action, for the minimal fallback line (see
 *  `actionFallbackLine`). */
const ACTION_VERB: Record<"MANEUVER" | "SCHEME" | "ATTACK" | "SCHEME_ITEM", string> = {
  MANEUVER: "maneuvered",
  SCHEME: "schemed",
  ATTACK: "attacked",
  SCHEME_ITEM: "used a scheme item",
};

/**
 * The action-group label for one STATE broadcast, read off its `ACTION_SPENT`
 * event (a batch carries at most one). `undefined` when the batch spent no
 * action — the log then renders those lines as a neutral group.
 */
export function batchPhase(events: GameEvent[]): ProLogPhase | undefined {
  const spent = events.find((e) => e.type === "ACTION_SPENT");
  return spent && spent.type === "ACTION_SPENT" ? ACTION_PHASE[spent.action] : undefined;
}

/**
 * Minimal stand-in line for a STATE batch that SPENT an action yet produced no
 * visible lines at all — e.g. a maneuver that draws from an empty deck and
 * doesn't move (issue #509): no deck-count change, so no "drew a card"; no
 * space change, so no "moved". Without this the whole action vanishes from the
 * feed and a player watching the log sees an action disappear with no trace.
 *
 * Only ever used as a LAST RESORT (zero other lines for the batch), so it can
 * never duplicate a richer line, and only for batches with an `ACTION_SPENT` —
 * a batch that spent nothing and showed nothing is genuinely not worth a line.
 */
export function actionFallbackLine(
  events: GameEvent[],
  you: PlayerId,
  seat: (player: PlayerId) => string
): ProLogLine | undefined {
  const spent = events.find((e) => e.type === "ACTION_SPENT");
  if (!spent || spent.type !== "ACTION_SPENT") return undefined;
  return {
    text: `${seat(spent.player)} ${ACTION_VERB[spent.action]}`,
    who: spent.player === you ? "you" : "opp",
  };
}

/** A log line as stored in the page (feed + CSV/bug-report export). */
export interface ProLogEntry extends ProLogLine {
  key: string;
  /** ms epoch when the line was appended (client clock; used for CSV export) */
  ts?: number;
  /** turn number the line belongs to — lets the bug-report dialog window by turn */
  turn?: number;
  /** seat that owned this turn ("You"/"Opponent"/"P3"), for the turn header */
  turnActor?: string;
  /** monotonic id of the STATE batch these lines came from — lines sharing a
   *  batchId are one player action and render as a single grouped block */
  batchId?: number;
  /** action label for the batch (Maneuver/Scheme/Attack/Scheme Item), or
   *  undefined for batches that spent no action (neutral group) */
  phase?: ProLogPhase;
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * Oldest-first CSV of the whole feed. Single source for both the activity-panel
 * download and the bug-report attachment. The `phase` column (issue #298)
 * carries the action label so an exported log can be grouped the same way the
 * panel groups it.
 *
 * Batches are stored newest-first, but lines WITHIN a batch are stored
 * oldest-first (issue #402). So to get a strictly oldest-first, line-by-line
 * export we reverse the order of the batches only — never the lines inside one.
 */
export function logEntriesToCsv(entries: ProLogEntry[]): string {
  const batches: ProLogEntry[][] = [];
  for (const e of entries) {
    const last = batches[batches.length - 1];
    if (last && last[0].batchId === e.batchId) last.push(e);
    else batches.push([e]);
  }
  const ordered = batches.reverse().flat();
  return [
    "time,turn,phase,who,text",
    ...ordered.map((e) =>
      [e.ts ? new Date(e.ts).toISOString() : "", e.turn ?? "", e.phase ?? "", e.who, csvCell(e.text)].join(",")
    ),
  ].join("\n");
}

/** One player action's lines, grouped under its turn (see `groupLog`). */
export interface ProLogActionGroup {
  batchId?: number;
  phase?: ProLogPhase;
  entries: ProLogEntry[];
}

/** One turn's worth of action groups, newest-first (see `groupLog`). */
export interface ProLogTurnSection {
  /**
   * Stable identity for this SECTION, distinct from `turn`: the key of its
   * OLDEST entry. The turn number is not usable as an identity — a rewind can
   * put the same turn in two separate sections, and duplicate React keys /
   * collapse-state keys then make the two sections toggle as one (issue #522).
   * Anchoring on the oldest entry keeps the id fixed while newer batches are
   * prepended to the section.
   */
  id: string;
  turn?: number;
  actor?: string;
  groups: ProLogActionGroup[];
}

/**
 * Section a newest-first entry list into turns, and each turn into action
 * groups (one per STATE batch). Batches are appended whole, so entries are
 * contiguous by `batchId` and (normally) by turn, and a single pass suffices.
 * Display-only; never reorders lines — a turn that appears twice (rewind)
 * stays two sections in feed order, each with its own `id`.
 */
export function groupLog(entries: ProLogEntry[]): ProLogTurnSection[] {
  const sections: ProLogTurnSection[] = [];
  for (const e of entries) {
    let section = sections[sections.length - 1];
    if (!section || section.turn !== e.turn) {
      section = { id: e.key, turn: e.turn, actor: e.turnActor, groups: [] };
      sections.push(section);
    }
    // entries run newest-first, so the last one scanned is the section's
    // oldest — the anchor that survives new batches landing on top.
    section.id = e.key;
    let group = section.groups[section.groups.length - 1];
    if (!group || group.batchId !== e.batchId) {
      group = { batchId: e.batchId, phase: e.phase, entries: [] };
      section.groups.push(group);
    }
    group.entries.push(e);
  }
  return sections;
}

/**
 * Turn tag (number + acting seat) for one STATE batch's lines.
 *
 * Normally just the post-batch view's turn, but a view whose turn number
 * REGRESSES — an approved undo rewind, or a resume/correction that revives an
 * older state — would otherwise mint a whole out-of-place TURN section wherever
 * that batch landed in the newest-first feed ("TURN 10 — YOU" sitting above
 * "TURN 21 — OPPONENT", issue #522). File such a batch under the turn it
 * interrupted instead, so the rewind reads inside the turn the players were
 * actually looking at. Batches AFTER the rewind carry the new (lower) turn
 * number and open their own section normally.
 */
export function batchTurnTag(
  prev: PlayerView | null,
  next: PlayerView
): { turn: number; turnActor: string } {
  const rewound = !!prev && next.turnNumber < prev.turnNumber;
  const view = rewound ? prev! : next;
  return { turn: view.turnNumber, turnActor: seatLabel(next, view.activePlayer) };
}

const short = (name: string) => name.split("/").pop() ?? name;

const playersById = (view: PlayerView): Map<PlayerId, ViewPlayer> => {
  const players = new Map(view.players.map((p) => [p.id, p]));
  players.set(view.self.id, {
    ...(players.get(view.self.id) ?? {}),
    id: view.self.id,
    heroId: view.self.heroId,
    you: true,
    hand: view.self.hand,
    handCount: view.self.hand.length,
    deckCount: view.self.deckCount,
    discard: view.self.discard,
    committedCard: view.self.committedCard,
    hasCommitted: !!view.self.committedCard,
    counters: view.self.counters,
    flags: view.self.flags,
    wonCombatThisTurn: view.self.wonCombatThisTurn,
    lostCombatThisTurn: view.self.lostCombatThisTurn,
    firstAttackThisTurn: view.self.firstAttackThisTurn,
    playedACardThisTurn: view.self.playedACardThisTurn,
    tookDamageThisTurn: view.self.tookDamageThisTurn,
  });
  if (view.opponent) {
    players.set(view.opponent.id, {
      ...(players.get(view.opponent.id) ?? {}),
      id: view.opponent.id,
      heroId: view.opponent.heroId,
      you: false,
      handCount: view.opponent.handCount,
      deckCount: view.opponent.deckCount,
      discard: view.opponent.discard,
      hasCommitted: view.opponent.hasCommitted,
      counters: view.opponent.counters,
      flags: view.opponent.flags,
      wonCombatThisTurn: view.opponent.wonCombatThisTurn,
      lostCombatThisTurn: view.opponent.lostCombatThisTurn,
      firstAttackThisTurn: view.opponent.firstAttackThisTurn,
      playedACardThisTurn: view.opponent.playedACardThisTurn,
      tookDamageThisTurn: view.opponent.tookDamageThisTurn,
    });
  }
  return players;
};

/**
 * Human seat label for the log/report: "You" for the viewer, "Opponent" in a
 * duel, and the uppercased seat id ("P3") in any >2-player game — so a
 * multiplayer log attributes each line to a specific seat, never a generic
 * "opponent". Shared by diffViews and enrichLines.
 */
export const seatLabel = (view: PlayerView, player: PlayerId): string => {
  if (player === view.you) return "You";
  return view.players.length === 2 ? "Opponent" : player.toUpperCase();
};

/**
 * Delimiter joining `(player, counter)` into the running-value map key in
 * `counterChangeLines`. Written as an ESCAPE, never as a literal control byte:
 * this used to be a raw NUL in the source, which makes grep/ripgrep classify
 * gameLog.ts as a binary file and silently skip it in every repo-wide search.
 * ASCII unit separator — it cannot occur in an engine PlayerId or counter name,
 * so "p1"+"RAGE" can never collide with some other pair.
 */
const COUNTER_KEY_SEP = "\u001f";

/**
 * Log lines for the batch's `COUNTER_CHANGED` events (RAGE, Nancy's CLUE,
 * OMEN…). The event carries only the NEW value, so the delta is derived against
 * a per-`(player, counter)` running value: the FIRST event of a batch chains
 * off `priorValue` (the pre-batch snapshot value, 0 if the counter was unseen),
 * and each later event in the same batch chains off the value the prior event
 * set — so multiple mutations of one counter in a single action each read out.
 *
 * Generic by construction (raw engine key as the display name, no per-hero
 * switch), so any current or future counter hero surfaces automatically:
 *   - decrease to a positive value → `spent 2 RAGE (1 remaining)`
 *   - decrease to zero             → `lost all RAGE (was 2)`
 *   - increase                     → `gained 1 RAGE (2 total)`
 * A no-op (value unchanged) emits nothing.
 *
 * The one exception is `BOOKKEEPING_COUNTERS` — see below.
 */
/**
 * Engine-internal counters the log must NOT narrate (issue #663). Generic-by-key is
 * the right default — it is why every counter deck surfaces here for free — but it
 * assumes a counter is a RESOURCE, something a player holds between actions. Skull
 * Kid's `MITIGATION` is not: it exists only between the Clock Tower's mitigation
 * discards and the damage they reduce, all inside ONE resolution, and is zeroed in
 * the same run. Narrating it emits up to six lines of a key printed on no card
 * ("gained 2 MITIGATION … lost all MITIGATION") around each strike, on both seats'
 * logs, burying the discards that actually happened.
 *
 * Its live value is not lost: it is shown where it is actionable, in the mitigation
 * prompt's running-total line (lib/pro/clockTower.ts). This stays a deliberately
 * SHORT denylist — a counter belongs here only if it is transient within a single
 * resolution, never a resource a player can plan around.
 */
const BOOKKEEPING_COUNTERS: ReadonlySet<string> = new Set([MITIGATION_COUNTER]);

export function counterChangeLines(
  events: GameEvent[],
  priorValue: (player: PlayerId, name: string) => number,
  whoOf: (player: PlayerId) => "you" | "opp",
  /**
   * Issue #668: bespoke wording for a DECREASE the generic line cannot explain,
   * or null to keep the generic one. Today only Cecil Palmer's bought attack
   * range, where "spent 2 BROADCAST (4 remaining)" tells a reader the number but
   * not the reason, and the reason (an attack that was out of reach a moment
   * ago) is the entire point. Optional, so every existing caller is unchanged.
   */
  spendText?: (player: PlayerId, name: string, amount: number) => string | null
): ProLogLine[] {
  const running = new Map<string, number>();
  const out: ProLogLine[] = [];
  for (const e of events) {
    if (e.type !== "COUNTER_CHANGED") continue;
    if (BOOKKEEPING_COUNTERS.has(e.name)) continue;
    const key = `${e.player}${COUNTER_KEY_SEP}${e.name}`;
    const prior = running.has(key) ? running.get(key)! : priorValue(e.player, e.name);
    running.set(key, e.value);
    const delta = e.value - prior;
    if (delta === 0) continue;
    const bespoke = delta < 0 ? (spendText?.(e.player, e.name, -delta) ?? null) : null;
    const text =
      bespoke ??
      (delta > 0
        ? `gained ${delta} ${e.name} (${e.value} total)`
        : e.value === 0
          ? `lost all ${e.name} (was ${prior})`
          : `spent ${-delta} ${e.name} (${e.value} remaining)`);
    out.push({ text, who: whoOf(e.player) });
  }
  return out;
}

export function diffViews(
  prev: PlayerView | null,
  next: PlayerView,
  label: (instance: CardInstanceId) => string,
  events: GameEvent[] = []
): ProLogLine[] {
  const lines: ProLogLine[] = [];
  const whoOf = (p: string): "you" | "opp" => (p === next.you ? "you" : "opp");
  const seat = (p: PlayerId) => seatLabel(next, p);

  if (!prev) {
    lines.push({ text: `Game on — turn ${next.turnNumber}`, who: "game" });
    return lines;
  }

  const prevPlayers = playersById(prev);
  const nextPlayers = playersById(next);

  if (next.turnNumber !== prev.turnNumber) {
    lines.push({
      text: `Turn ${next.turnNumber} — ${next.activePlayer === next.you ? "your" : `${seat(next.activePlayer)}'s`} turn`,
      who: "game",
    });
  }

  // combat lifecycle FIRST so a single action reads as a chronological story
  // top-down: attack declared → reveal → outcome, then the fighter damage/defeat
  // those caused (issue #402). Within one STATE batch these never overlap
  // (movement is a maneuver; damage is combat), so ordering the whole combat
  // block ahead of the whole fighter block is safe.
  if (next.combat && !prev.combat) {
    const att = next.fighters.find((f) => f.id === next.combat!.attacker);
    const tgt = next.fighters.find((f) => f.id === next.combat!.target);
    lines.push({
      text: `${att?.name ?? short(next.combat.attacker)} attacks ${tgt?.name ?? short(next.combat.target)}`,
      who: whoOf(next.combat.attackerPlayer),
    });
  }
  if (next.combat?.attackerCard && !prev.combat?.attackerCard) {
    const def = next.combat.defenderCard;
    lines.push({
      text: `Reveal: ${label(next.combat.attackerCard.instance)} vs ${def ? label(def.instance) : "no defense"}`,
      who: "game",
      cards: [next.combat.attackerCard.instance, ...(def ? [def.instance] : [])],
    });
  }
  if (next.combat?.outcome && !prev.combat?.outcome) {
    // Wording comes from combatOutcome.ts so the log, the panel banner and the
    // replay scrubber can never disagree. UNKNOWN — the Doppelgänger's no-winner
    // resolve (engine #303) — used to print the raw enum here ("unknown — 0
    // damage"); it now reads "no winner — the values matched".
    lines.push({
      text: combatOutcomeLogText(next.combat.outcome, next.combat.attackDamageDealt),
      who: "game",
    });
  }

  // fighters: movement, damage, defeat — after the combat lines that caused them.
  const prevFighters = new Map(prev.fighters.map((f) => [f.id, f]));
  // Fighters cleared by the elimination sweep (hero-dead seat) drop to hp:0
  // with no DAMAGE_APPLIED — that hp change is bookkeeping, not combat, so skip
  // the phantom "took N damage" line and log a removal instead (issue #212).
  const swept = sweptFighters(events);
  // A `POSITIONS_SWAPPED` (protocol v31) relocation is NOT a move: the two
  // fighters exchanged spaces atomically, with no route and no FIGHTER_MOVED.
  // Two bare "X moved" lines would report it as two unrelated walks, so the
  // move branch skips them and the event's own line (below, in enrichLines)
  // narrates the exchange as the single thing it was.
  const swapped = swappedFighters(events);
  for (const f of next.fighters) {
    const was = prevFighters.get(f.id);
    if (!was) continue;
    if (f.space !== was.space && f.space && was.space && !swapped.has(f.id)) {
      lines.push({ text: `${f.name} moved`, who: whoOf(f.owner) });
    }
    if (f.hp < was.hp && !swept.has(f.id)) {
      lines.push({
        text: `${f.name} took ${was.hp - f.hp} damage (${f.hp}/${f.maxHp})`,
        who: whoOf(f.owner),
      });
    } else if (f.hp > was.hp) {
      lines.push({ text: `${f.name} healed ${f.hp - was.hp} (${f.hp}/${f.maxHp})`, who: whoOf(f.owner) });
    }
    if (f.defeated && !was.defeated) {
      lines.push(
        swept.has(f.id)
          ? { text: `${f.name} was removed (hero defeated)`, who: "game" }
          : { text: `${f.name} was defeated!`, who: "game" }
      );
    }
    // BENIGN removal (protocol v27 `removeFromBoard` / FIGHTER_REMOVED — Gerry's
    // Cannibalize eating a LIVING Larry): off the board, still alive, so neither the
    // move branch above (it requires a destination) nor the defeat branch fires and
    // the fighter used to just vanish from the board unremarked. Derived from the
    // snapshot rather than the event so it also narrates on an older/quieter server.
    if (!f.space && was.space && !f.defeated && !was.defeated) {
      lines.push({ text: `${f.name} was removed from the battlefield`, who: whoOf(f.owner) });
    }
  }

  // cards: draws and discard-pile growth. Only the viewer's own hand has
  // card identities; other seats expose count deltas.
  const drewSelf = next.self.hand.filter((c) => !prev.self.hand.includes(c)).length;
  if (drewSelf > 0 && next.self.deckCount < prev.self.deckCount) {
    lines.push({ text: `You drew ${drewSelf} card${drewSelf === 1 ? "" : "s"}`, who: "you" });
  }
  for (const [player, nextPlayer] of nextPlayers) {
    if (player === next.you) continue;
    const prevPlayer = prevPlayers.get(player);
    if (!prevPlayer) continue;
    const drew = prevPlayer.deckCount - nextPlayer.deckCount;
    if (drew > 0 && nextPlayer.handCount > prevPlayer.handCount) {
      lines.push({ text: `${seat(player)} drew ${drew} card${drew === 1 ? "" : "s"}`, who: "opp" });
    }
  }
  for (const [player, nextPlayer] of nextPlayers) {
    const prevPlayer = prevPlayers.get(player);
    if (!prevPlayer) continue;
    const added = nextPlayer.discard.slice(prevPlayer.discard.length);
    for (const c of added) {
      lines.push({ text: `${seat(player)} → discard: ${label(c)}`, who: whoOf(player), cards: [c] });
    }
  }

  // battlefield items (v17): scheme-item use + combat-item attach. These are
  // NOT snapshot-derivable from `view` alone (the item label lives on the static
  // map, not the catalog, and both actions merely drop a token), so they read off
  // the always-present event stream — the same channel diffViews already uses for
  // sweeps. Absent on join/reconnect/resume broadcasts, so no lines double-fire.
  // Item labels come from the static map.items (present on both prev and next).
  const itemLabel = (id: string): string =>
    (next.map.items ?? []).find((it) => it.id === id)?.label ?? id;
  for (const e of events) {
    if (e.type === "ITEM_USED") {
      lines.push({ text: `${seat(e.player)} used ${itemLabel(e.item)}`, who: whoOf(e.player) });
    } else if (e.type === "COMBAT_ITEM_ATTACHED") {
      const role = e.role === "ATTACK" ? "attack" : "defense";
      lines.push({
        text: `${seat(e.player)} attached ${itemLabel(e.item)} (+${e.value} ${role})`,
        who: whoOf(e.player),
      });
    }
  }

  // public counters (RAGE / CLUE / OMEN …): spent/gained/lost, off the event
  // stream — each COUNTER_CHANGED carries only the new value, so the delta is
  // measured against the pre-batch snapshot value (issue #485). Both seats see
  // both players' lines; counters are public. Absent on reconnect/resume
  // broadcasts (no events), so no lines double-fire.
  // A range purchase (issue #668 ↔ engine #456) rides that same event stream: it is
  // a decrease of the buyer's `rangePurchase` counter arriving BESIDE this batch's
  // ATTACK_DECLARED, and the engine emits nothing else for it. Reworded here rather
  // than in enrichLines because it REPLACES a diff line rather than annotating one —
  // and both seats get it, since the counters and the reach are public.
  lines.push(
    ...counterChangeLines(
      events,
      (player, name) => prevPlayers.get(player)?.counters?.[name] ?? 0,
      whoOf,
      (player, name, amount) => rangeSpendLineFor(events, player, name, amount, next)
    )
  );

  // board objects (protocol v26): appearances and disappearances, worded per KIND.
  // A corpse is not "placed" by anyone — it is what a body leaves behind — and it can
  // leave by being eaten (EFFECT) or by rotting out (EXPIRED), which the countdown
  // pips have been advertising. Unmapped future kinds fall back to the registry's
  // generic noun rather than being called totems.
  const prevTokens = new Map((prev.tokens ?? []).map((t) => [t.id, t]));
  const nextTokens = new Map((next.tokens ?? []).map((t) => [t.id, t]));
  const fighterNameOf = (id: string | null): string | null =>
    id ? (next.fighters.find((f) => f.id === id)?.name ?? null) : null;
  const destroyReasons = new Map(
    events.flatMap((e) => (e.type === "TOKEN_DESTROYED" ? [[e.token, e.reason] as const] : []))
  );
  for (const t of nextTokens.values()) {
    if (prevTokens.has(t.id)) continue;
    const noun = boardObjectVisualFor(t).noun;
    if (t.kind === "corpse") {
      const from = fighterNameOf(boardObjectOriginFighter(t));
      lines.push({
        text: from
          ? `${from}'s ${noun} remains on the battlefield`
          : `A ${noun} remains on the battlefield`,
        who: whoOf(t.owner),
      });
    } else {
      lines.push({ text: `${seat(t.owner)} placed a ${noun}`, who: whoOf(t.owner) });
    }
  }
  for (const t of prevTokens.values()) {
    if (nextTokens.has(t.id)) continue;
    const noun = boardObjectVisualFor(t).noun;
    const owner = t.owner === next.you ? "Your" : `${seat(t.owner)}'s`;
    const verb = destroyReasons.get(t.id) === "EXPIRED" ? "rotted away" : "was destroyed";
    lines.push({ text: `${owner} ${noun} ${verb}`, who: whoOf(t.owner) });
  }

  if (next.winner && !prev.winner) {
    const viewerWon = isViewerOnWinningTeam(next);
    // In a real team format, phrase both the win and the loss around the team.
    const teamGame = deriveTeams(next.players, next.you).active;
    const text = viewerWon
      ? teamGame
        ? "VICTORY — your team wins!"
        : "VICTORY — you win!"
      : `Defeat — ${seat(next.winner)}${teamGame ? "'s team" : ""} wins`;
    lines.push({ text, who: "game" });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Event enrichment (protocol v10).
//
// `diffViews` above remains the ONLY producer of log lines for anything it can
// derive from the view snapshots. `enrichLines` layers the structured engine
// `events` of the SAME STATE batch on top, decoratively, under exactly two
// modes and nothing else:
//   1. ANNOTATE an existing diff line (matched within this batch by card
//      instance id) — appends to its `text`/`cards`, never reorders or adds.
//   2. CREATE a NEW line ONLY for event types on the allowlist below — things
//      the diff cannot see in a snapshot (value math, scheduled/delayed
//      effects, ignored defense, prevented damage, gained actions, deck
//      exhaustion, and public reveal/return moments that can disappear from the
//      next snapshot.
// An event type that overlaps diff output (draws, moves, discards, damage,
// attacks, combat reveals, tokens, turn changes, defeats) must NEVER create a line —
// only annotate. A bug in the events channel can then at worst lose an
// annotation; it can never double-report or corrupt the log.
//
// Pure like `diffViews` — the parity/unit tests exercise it with no React.
// ---------------------------------------------------------------------------

/** Redacted source stand-in — a card whose face is hidden from this viewer. */
const HIDDEN_SOURCE = "(hidden)";

/** `EFFECT_SCHEDULED`/`EFFECT_FIRED` / `CARD_DISCARDED` `source` is a
 *  `CardInstanceId` unless it is a hero ref or the redacted placeholder. */
const isCardSource = (source: string): boolean =>
  source !== HIDDEN_SOURCE && !source.startsWith("hero:");

/** Human suffix for a `CARD_DISCARDED.reason`, appended to the discard line. */
const DISCARD_REASON: Record<string, string> = {
  BOOST: "spent to boost",
  COMBAT: "used in combat",
  HAND_LIMIT: "over hand limit",
  EFFECT: "card effect",
  MILL: "milled",
};

/** When a scheduled effect will fire, phrased for the log line. */
const FIRE_AT: Record<string, string> = {
  START: "at start of turn",
  END: "at end of turn",
  COMBAT_END: "at end of combat",
};

/**
 * One signed contribution in a value breakdown, rendered as ` + 3 (boost)` /
 * ` - 1`. The unlabeled form is used for the net effect delta, whose components
 * `VALUE_MODIFIED` already narrates line by line.
 */
const term = (amount: number, what?: string): string =>
  `${amount < 0 ? "-" : "+"} ${Math.abs(amount)}${what ? ` (${what})` : ""}`;

/**
 * The terms of one combat card's effective value, as ` = `-free arithmetic:
 * `6 (Gromnir) + 3 (boost) - 1`. The base term names the card so a reader can
 * tell which side's math they are looking at without cross-referencing the
 * reveal line; `null` card (a synthetic sub-attack) falls back to the role.
 *
 * A `locked` card ("value cannot be changed") reports zero on every other
 * channel per the protocol, so it renders as the bare base with a marker. When
 * the components would go negative the engine floors the card at 0 — say so,
 * or `3 - 5 = 0` reads as an arithmetic bug rather than the rule it is.
 */
function breakdownTerms(b: ValueBreakdown, label: (source: string) => string): string {
  const name = b.card ? label(b.card) : b.role === "ATTACK" ? "attack" : "defense";
  const base = b.override ?? b.printed;
  const notes = [b.override !== null ? "set" : null, b.locked ? "locked" : null].filter(Boolean);
  const parts = [`${base} (${[name, ...notes].join(", ")})`];
  if (b.delta !== 0) parts.push(term(b.delta));
  if (b.boosts !== 0) parts.push(term(b.boosts, "boost"));
  if (b.abilityBoosts !== 0) parts.push(term(b.abilityBoosts, "ability boost"));
  if (base + b.delta + b.boosts + b.abilityBoosts < 0 && b.total === 0) parts.push("(min 0)");
  return parts.join(" ");
}

/**
 * The `COMBAT_VALUE_BREAKDOWN` line: `Attack: 6 (Gromnir) + 3 (boost) = 9 ·
 * Defense: 2 (FEINT) + 1 = 3` (issue #510). The totals come from the event's
 * `effectiveAttack`/`effectiveDefense` — the numbers the outcome was actually
 * decided on — so the line can never disagree with the damage it explains.
 */
function valueBreakdownText(
  e: Extract<GameEvent, { type: "COMBAT_VALUE_BREAKDOWN" }>,
  label: (source: string) => string
): string {
  const attack = `Attack: ${breakdownTerms(e.attack, label)} = ${e.effectiveAttack}`;
  const defense = e.ignoreDefense
    ? "Defense: ignored"
    : e.defense.length === 0
      ? "Defense: none"
      : `Defense: ${e.defense.map((d) => breakdownTerms(d, label)).join(" + ")} = ${e.effectiveDefense}`;
  return `${attack} · ${defense}`;
}

/**
 * Display words for a per-fighter marker name (protocol v29 `FighterStatus.name` /
 * the two marker events). Reuses the board badge registry so the log and the token
 * can never drift apart — a marker the client does not know still narrates, under its
 * raw engine name, rather than vanishing from the feed.
 */
const markerLabel = (name: string): string =>
  FIGHTER_MARKER_BADGES[name]?.label ?? name;

/** Context the page supplies so enrichment can resolve labels and seats
 *  without any data fetching of its own. */
export interface EnrichContext {
  /** Title for an event `source`: a `CardInstanceId`, `'hero:<pid>'`, or the
   *  `'(hidden)'` placeholder (which renders as "a hidden card"). */
  label: (source: string) => string;
  /** Viewer's player id (`view.you`) — maps player-scoped events to you/opp. */
  you: string;
  /** Seat label for a player-scoped event ("You"/"Opponent"/"P3"), so a >2p
   *  log names the acting seat instead of a generic "Opponent". */
  seat: (player: PlayerId) => string;
  /** Display name for a FighterId ("General Grievous"/"B1 Battle Droid"), from
   *  the STATE view's fighter list — used by the nested-combat events (issue #288)
   *  that carry attacker/target fighter ids rather than a card source. */
  fighter: (id: FighterId) => string;
  /** Chain progress for the n-th (0-based) SUB_ATTACK_INITIATED event in THIS
   *  batch — "Hundred-Fist Rush — chain hit 2 of up to 3" — or null when there is
   *  no chain worth naming (issue #596 ↔ engine #359). The ordinal is passed
   *  rather than the label itself because one batch can drain several followups.
   *  Supplied by the page from lib/pro/subAttackChain.ts, which is where the
   *  cross-batch bookkeeping lives; omitted (older callers, tests of the
   *  single-hit shape) leaves the line exactly as it was. */
  chain?: (ordinalInBatch: number) => string | null;
}

/**
 * Decoratively enrich `diffViews` output with the batch's engine `events`.
 * Returns a NEW array: every input line is preserved in order (annotations
 * mutate a shallow copy's `text`/`cards` only), followed by any allowlisted
 * new lines. Never mutates the input `lines`.
 */
export function enrichLines(
  lines: ProLogLine[],
  events: GameEvent[],
  ctx: EnrichContext
): ProLogLine[] {
  if (!events.length) return lines;
  const out: ProLogLine[] = lines.map((l) => ({ ...l, cards: l.cards ? [...l.cards] : l.cards }));
  const whoOf = (p: string): "you" | "opp" => (p === ctx.you ? "you" : "opp");
  const added: ProLogLine[] = [];
  // Position of the next SUB_ATTACK_INITIATED within this batch — a drained
  // followup queue can dispatch more than one before a player has to act again.
  let subAttackOrdinal = 0;

  // A card instance rendered on a NEW line so the panel can hover its face.
  const sourceCards = (source: string): CardInstanceId[] | undefined =>
    isCardSource(source) ? [source] : undefined;

  for (const e of events) {
    switch (e.type) {
      // --- Mode 1: annotate an existing diff line ---------------------------
      case "CARD_DISCARDED": {
        const suffix = DISCARD_REASON[e.reason];
        if (!suffix) break;
        // Match strictly within THIS batch's discard lines by instance id,
        // skipping any already annotated so N discards of the same card map
        // one-to-one to their N events.
        const target = out.find(
          (l) =>
            /→ discard:/.test(l.text) &&
            l.cards?.includes(e.card) &&
            !/ \((?:spent to boost|used in combat|over hand limit|card effect|milled)\)$/.test(l.text)
        );
        if (target) target.text = `${target.text} (${suffix})`;
        break;
      }

      // --- Mode 2: new lines, allowlist only -------------------------------
      case "VALUE_MODIFIED": {
        const label = e.role === "ATTACK" ? "Attack" : "Defense";
        const sign = e.delta > 0 ? "+" : "";
        added.push({ text: `${label} value ${e.newEffective - e.delta} → ${e.newEffective} (${sign}${e.delta})`, who: "game" });
        break;
      }
      case "VALUE_SET": {
        const label = e.role === "ATTACK" ? "Attack" : "Defense";
        added.push({ text: `${label} value set to ${e.to}${e.locked ? " (locked)" : ""}`, who: "game" });
        break;
      }
      case "EFFECT_SCHEDULED": {
        const when = FIRE_AT[e.fireAt] ?? "later";
        added.push({
          text: `${ctx.label(e.source)}: effect will trigger ${when}`,
          who: "game",
          cards: sourceCards(e.source),
        });
        break;
      }
      case "EFFECT_FIRED": {
        added.push({
          text: `${ctx.label(e.source)}: delayed effect resolves`,
          who: "game",
          cards: sourceCards(e.source),
        });
        break;
      }
      case "EFFECT_CANCELED": {
        // "The Snuff" (issue #346). The cancel kills the card's TEXT only — its
        // printed value still resolves — so the line says so explicitly instead
        // of leaving the cancel to be reverse-engineered from the damage math.
        //
        // v24 `voided` (issue #510) distinguishes the two very different things
        // this event has always covered. A card with no cancellable effect
        // blocks (Gromnir) cannot be "cancelled" at all — per the King
        // Arthur/Excalibur ruling its value AND its ability-attached boost still
        // count — and the old fixed line sent readers of game 9VQH straight to
        // the wrong conclusion: correct 6 damage looked like a boost that had
        // failed to apply. Only `voided === false` takes the new branch, so a
        // pre-v24 server (flag absent) keeps the historical line.
        const side = e.role === "ATTACK" ? "Attack" : "Defense";
        const cards = e.card ? [e.card] : undefined;
        if (e.voided === false) {
          const name = e.card ? ctx.label(e.card) : `the ${side.toLowerCase()} card`;
          added.push({
            text: `Feint had no effect — ${name} has no card effects to cancel (value and boosts still count)`,
            who: "game",
            cards,
          });
          break;
        }
        // A real cancel. When it also stripped the hero's ability-attached boost
        // (`discardIfCanceled`), that is the half of the outcome the damage math
        // makes look arbitrary — name it rather than leaving a silent -N.
        added.push({
          text:
            `Feint! ${side} card effects were cancelled (printed value still counts)` +
            (e.boostVoided ? " — its ability boost was cancelled too and no longer counts" : ""),
          who: "game",
          cards,
        });
        break;
      }
      case "COMBAT_VALUE_BREAKDOWN": {
        // The auditable value math for both sides (issue #510). VALUE_MODIFIED
        // narrates effect deltas as they land, but boost contributions had no
        // trace beyond a bare "→ discard: Storm's Toll (used in combat)", so the
        // final damage number could not be reconstructed from the log at all.
        const named = [e.attack.card, ...e.defense.map((d) => d.card)].filter(
          (c): c is CardInstanceId => c !== null
        );
        added.push({
          text: valueBreakdownText(e, ctx.label),
          who: "game",
          cards: named.length ? named : undefined,
        });
        break;
      }
      case "EXHAUSTION_DAMAGE": {
        // Drawing from an empty deck costs 2 damage to EVERY living fighter of
        // that seat (issue #509). Not snapshot-derivable — the draw changes no
        // counts, so without this line the resulting hp loss reads as an
        // unexplained "took 1 damage" and a hero can simply die mid-log. The hp
        // loss itself stays a separate diff line, so this never double-reports.
        const seat = ctx.seat(e.player);
        const whose = seat === "You" ? "Your" : `${seat}'s`;
        const their = seat === "You" ? "your" : "their";
        added.push({
          text: `Exhaustion! ${whose} deck is empty — drawing deals 2 damage to each of ${their} fighters`,
          who: whoOf(e.player),
        });
        break;
      }
      case "DEFENSE_IGNORED": {
        added.push({ text: "Defense ignored", who: "game" });
        break;
      }
      case "DAMAGE_PREVENTED": {
        added.push({ text: "Damage prevented", who: "game" });
        break;
      }
      case "ACTIONS_GAINED": {
        const seat = ctx.seat(e.player);
        added.push({
          text: `${seat} gained ${e.amount} action${e.amount === 1 ? "" : "s"}`,
          who: whoOf(e.player),
        });
        break;
      }
      case "CARD_RETURNED_TO_HAND": {
        const seat = ctx.seat(e.player);
        added.push({
          text: `${seat} returned ${ctx.label(e.card)} to hand`,
          who: whoOf(e.player),
          cards: [e.card],
        });
        break;
      }
      case "CARD_REVEALED": {
        // Emitted by `revealCompareBoost` since v12 and, since v31 (engine #445),
        // by the generic transient `reveal` op too — which can fire OUTSIDE a
        // combat window (Skull Kid's The Clock Tower, Cecil's They do not exist)
        // and from the DECK TOP as well as from hand. Nothing here is
        // combat-scoped, and the line names no origin: the wire event carries
        // `{player, card}` only, so the client cannot know (and must not claim)
        // whether the card came from a hand or off the top of a deck.
        const seat = ctx.seat(e.player);
        added.push({
          text: `${seat} revealed ${ctx.label(e.card)}`,
          who: whoOf(e.player),
          cards: [e.card],
        });
        break;
      }

      // v31 atomic position swap (protocol v31 ↔ engine #445). A TELEPORT, not a
      // move: no path, no FIGHTER_MOVED, so this event is the ONLY record of the
      // exchange — the diff's move branch above deliberately stays quiet for both
      // fighters (see `swapped` in diffViews) and this is the line that replaces
      // them. Mode 2 (a new line) because nothing it overlaps survives.
      case "POSITIONS_SWAPPED": {
        added.push({
          text: `${ctx.fighter(e.a)} and ${ctx.fighter(e.b)} swapped places`,
          who: "game",
        });
        break;
      }

      // --- Set-aside piles (issue #539 ↔ engine #293, protocol v25) ----------
      // A tuck moves a played card into a public pile INSTEAD of the discard, so
      // the diff sees a card leave hand and never arrive anywhere it tracks — it
      // would otherwise silently vanish from the log. The return is the inverse.
      // Allowlist (Mode 2): neither overlaps a diff line.
      //
      // CROSS-PLAYER TUCK (v0.49.0, engine #459 — issue #671). `player` is the pile's
      // HOST: where the card now SITS. `controller`, present only when the two differ,
      // is whose card it still IS. Boba Fett tucks every bounty under an OPPONENT, so
      // reading `player` as the actor would credit the victim with playing the card
      // and colour the line as their move — on the deck's core mechanic, every time.
      case "CARD_TUCKED": {
        const actor = e.controller ?? e.player;
        const under =
          e.player === ctx.you
            ? "your hero card"
            : actor === e.player
              ? "their hero card"
              : `${ctx.seat(e.player)}'s hero card`;
        added.push({
          text: `${ctx.seat(actor)} tucked ${ctx.label(e.card)} under ${under} (${e.pile})`,
          who: whoOf(actor),
          cards: [e.card],
        });
        break;
      }
      // The inverse, and the same distinction (v0.57.0, engine #473): a card can now
      // LEAVE a pile another player hosts and is routed to its CONTROLLER's hand, so
      // `player` here is the controller and the OPTIONAL `host` says where the pile
      // was. Boba taking a bounty back off an opponent is the consumer; a same-seat
      // return (Luke's TRAINING) omits `host` and reads exactly as it always has.
      case "CARD_RETURNED_FROM_PILE": {
        const from =
          e.host && e.host !== e.player
            ? `${e.host === ctx.you ? "your" : `${ctx.seat(e.host)}'s`} ${e.pile}`
            : e.pile;
        added.push({
          text: `${ctx.seat(e.player)} took ${ctx.label(e.card)} back from ${from} to hand`,
          who: whoOf(e.player),
          cards: [e.card],
        });
        break;
      }

      // --- General Grievous nested combat (issue #288 ↔ engine #160) ---------
      // These delineate up to three sequential combats sharing the one
      // `state.combat` slot. Because that slot is REUSED (not cleared to null
      // between combats), diffViews' `!prev.combat` combat-start guard never
      // fires for combats 2/3 — so these NEW lines fill a genuine gap, they do
      // not double-report. All allowlist (Mode 2).
      case "COMBAT_WON_MARKED": {
        const seat = ctx.seat(e.player);
        added.push({
          text: `${seat} ${seat === "You" ? "are" : "is"} considered to have won this combat`,
          who: whoOf(e.player),
        });
        break;
      }
      case "PLAYED_CARD_RETURNED": {
        const seat = ctx.seat(e.player);
        added.push({
          text: `${seat} returned ${ctx.label(e.card)} to hand`,
          who: whoOf(e.player),
          cards: [e.card],
        });
        break;
      }
      case "SECOND_ATTACK_COMMITTED": {
        added.push({
          text: `${ctx.fighter(`${e.player}/hero`)} readies a second attack (face down)`,
          who: whoOf(e.player),
        });
        break;
      }
      case "BONUS_ATTACK_STARTED": {
        added.push({
          text: `Multi-Arm Barrage — Combat 2: ${ctx.fighter(e.attacker)} vs ${ctx.fighter(e.target)}`,
          who: "game",
        });
        break;
      }
      case "BONUS_ATTACK_PASSED": {
        added.push({ text: "Multi-Arm Barrage — 2nd attack passed", who: "game" });
        break;
      }
      // v29 per-fighter durable markers (issue #596 ↔ engine #360). The board badge
      // shows the CURRENT marks; these two lines give them a HISTORY — which fighter
      // got marked by what, and when the sweep took them away — because the mark is
      // applied in one combat and cashed in at turn end, several actions later.
      case "FIGHTER_MARKED": {
        // `total` is the resulting stack count, so a re-mark reads "×2" without the
        // client tracking stacks itself. A null expiry stamp means DURABLE: it
        // survives turn edges until something clears it.
        const stacks = e.total > 1 ? ` (×${e.total})` : "";
        const scope = e.expiresAtTurn === null ? "" : " until end of turn";
        added.push({
          text: `${ctx.fighter(e.fighter)} is marked — ${markerLabel(e.name)}${stacks}${scope}`,
          who: "game",
        });
        break;
      }
      case "FIGHTER_MARKS_CLEARED": {
        // `name: null` = every marker on that fighter was cleared (the no-name form
        // of clearFighterMarks). `removed` is how many stacks went.
        const what = e.name === null ? "marks" : markerLabel(e.name);
        added.push({
          text: `${ctx.fighter(e.fighter)}: ${what} cleared${e.removed > 1 ? ` (×${e.removed})` : ""}`,
          who: "game",
        });
        break;
      }
      case "SUB_ATTACK_INITIATED": {
        // The `subAttack` op is generic: any card that opens a deferred bonus
        // attack (Grievous's "Fire, you fools!" → a B1 Battle Droid's printed
        // "Blast 'em!", Batman's Dark Knight [3] CRITICAL STRIKE, …) emits it.
        // The protocol carries no source card (attacker/target/value only), so
        // we can only flavor from the attacker's identity client-side: keep
        // Grievous's "Blast 'em!" when a B1 Battle Droid fires, otherwise a
        // source-neutral bonus-attack line (issue #411).
        const attacker = ctx.fighter(e.attacker);
        const target = ctx.fighter(e.target);
        const base = attacker.includes("B1 Battle Droid")
          ? `${attacker} fires Blast 'em! (${e.value}) at ${target}`
          : `${attacker} makes a bonus attack (${e.value}) against ${target}`;
        // Chain progress prefix (#596): engine #359's followup QUEUE lets one card
        // open several of these in a row, and N identical lines are unreadable
        // without an ordinal. Null for a lone unregistered hit — which keeps
        // Grievous's single "Fire, you fools!" line byte-identical.
        const progress = ctx.chain?.(subAttackOrdinal++) ?? null;
        added.push({ text: progress ? `${progress}: ${base}` : base, who: "game" });
        break;
      }

      // v32 (issue #671 ↔ engine #463): `{op:'attackWith'}` opened a REAL combat
      // from a card effect, outside any action. The view diff already narrates the
      // combat itself ("Boba Fett attacks King Kong" + the reveal line), so this
      // line exists to answer the two questions those cannot: WHY a combat opened
      // with nothing declared, and WHAT that attack card is — `card` is a CardDefId
      // that is NOT in the deck list (`HeroDef.linkedCards`, printed on another
      // card), so a reader scanning the opponent's 30 will never find it.
      //
      // `label` splits on "#" before it reads the catalog, so a bare def id resolves
      // to "Seismic Charge (6/0)" exactly as an instance would; the catalog carries
      // linked cards because the engine registers them into GameContext.cards.
      case "EFFECT_ATTACK_INITIATED": {
        added.push({
          text: `${ctx.fighter(e.attacker)} attacks ${ctx.fighter(e.target)} with ${ctx.label(
            e.card
          )} — no action spent`,
          who: "game",
          cards: [e.card],
        });
        break;
      }

      // Opening-hand mulligan (issue #622 ↔ protocol v30). Both events land only
      // when the window CLOSES, one per seat, which is the moment each player's
      // choice becomes public — until then the answers are redacted and there is
      // nothing to say. Nothing else narrates them: a redraw moves five cards out
      // and five back in with the deck count unchanged, so the view diff sees no
      // draw at all.
      case "MULLIGAN_TAKEN":
      case "HAND_KEPT": {
        const mine = e.player === ctx.you;
        const verb = e.type === "MULLIGAN_TAKEN" ? "mulliganed" : "kept";
        added.push({
          text: `${ctx.seat(e.player)} ${verb} ${mine ? "your" : "their"} opening hand`,
          who: whoOf(e.player),
        });
        break;
      }

      // Every other event type overlaps diff output (or is not yet allowlisted)
      // and must NEVER create a line. Do nothing.
      default:
        break;
    }
  }

  return [...out, ...added];
}
