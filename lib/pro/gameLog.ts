/**
 * Client-side activity feed for Pro games. Protocol v1 has no event stream —
 * the client derives log lines by diffing consecutive server views (the same
 * data the board renders, so the log can never contradict the table).
 * Heuristic and display-only: misses nothing rules-relevant that the view
 * doesn't also show, and never feeds anything back into play.
 */
import { CardInstanceId, FighterId, GameEvent, PlayerId, PlayerView, ViewPlayer } from "./protocol";
import { deriveTeams, isViewerOnWinningTeam } from "./teams";
import { sweptFighters } from "./sweep";

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

/**
 * The action-group label for one STATE broadcast, read off its `ACTION_SPENT`
 * event (a batch carries at most one). `undefined` when the batch spent no
 * action — the log then renders those lines as a neutral group.
 */
export function batchPhase(events: GameEvent[]): ProLogPhase | undefined {
  const spent = events.find((e) => e.type === "ACTION_SPENT");
  return spent && spent.type === "ACTION_SPENT" ? ACTION_PHASE[spent.action] : undefined;
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
 * Oldest-first CSV of the whole feed (entries are stored newest-first). Single
 * source for both the activity-panel download and the bug-report attachment.
 * The `phase` column (issue #298) carries the action label so an exported log
 * can be grouped the same way the panel groups it.
 */
export function logEntriesToCsv(entries: ProLogEntry[]): string {
  return [
    "time,turn,phase,who,text",
    ...[...entries]
      .reverse()
      .map((e) =>
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
  turn?: number;
  actor?: string;
  groups: ProLogActionGroup[];
}

/**
 * Section a newest-first entry list into turns, and each turn into action
 * groups (one per STATE batch). Because batches are appended whole and turns
 * only advance, entries are already contiguous by turn and by `batchId`, so a
 * single pass suffices. Display-only; never reorders lines.
 */
export function groupLog(entries: ProLogEntry[]): ProLogTurnSection[] {
  const sections: ProLogTurnSection[] = [];
  for (const e of entries) {
    let section = sections[sections.length - 1];
    if (!section || section.turn !== e.turn) {
      section = { turn: e.turn, actor: e.turnActor, groups: [] };
      sections.push(section);
    }
    let group = section.groups[section.groups.length - 1];
    if (!group || group.batchId !== e.batchId) {
      group = { batchId: e.batchId, phase: e.phase, entries: [] };
      section.groups.push(group);
    }
    group.entries.push(e);
  }
  return sections;
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

  // fighters: movement, damage, defeat
  const prevFighters = new Map(prev.fighters.map((f) => [f.id, f]));
  // Fighters cleared by the elimination sweep (hero-dead seat) drop to hp:0
  // with no DAMAGE_APPLIED — that hp change is bookkeeping, not combat, so skip
  // the phantom "took N damage" line and log a removal instead (issue #212).
  const swept = sweptFighters(events);
  for (const f of next.fighters) {
    const was = prevFighters.get(f.id);
    if (!was) continue;
    if (f.space !== was.space && f.space && was.space) {
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
  }

  // combat lifecycle
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
    const dmg = next.combat.attackDamageDealt;
    lines.push({
      text: `${next.combat.outcome.replace(/_/g, " ").toLowerCase()}${dmg !== null ? ` — ${dmg} damage` : ""}`,
      who: "game",
    });
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

  // tokens (totems): appearances and disappearances
  const prevTokens = new Map((prev.tokens ?? []).map((t) => [t.id, t]));
  const nextTokens = new Map((next.tokens ?? []).map((t) => [t.id, t]));
  for (const t of nextTokens.values()) {
    if (!prevTokens.has(t.id)) {
      lines.push({ text: `${seat(t.owner)} placed a totem`, who: whoOf(t.owner) });
    }
  }
  for (const t of prevTokens.values()) {
    if (!nextTokens.has(t.id)) {
      const owner = t.owner === next.you ? "Your" : `${seat(t.owner)}'s`;
      lines.push({ text: `${owner} totem was destroyed`, who: whoOf(t.owner) });
    }
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
// Event enrichment (protocol v10, gated behind the `eventLog` flag).
//
// `diffViews` above remains the ONLY producer of log lines for anything it can
// derive from the view snapshots. `enrichLines` layers the structured engine
// `events` of the SAME STATE batch on top, decoratively, under exactly two
// modes and nothing else:
//   1. ANNOTATE an existing diff line (matched within this batch by card
//      instance id) — appends to its `text`/`cards`, never reorders or adds.
//   2. CREATE a NEW line ONLY for event types on the allowlist below — things
//      the diff cannot see in a snapshot (value math, scheduled/delayed
//      effects, ignored defense, prevented damage, gained actions, and public
//      reveal/return moments that can disappear from the next snapshot.
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
  BOOST: "boost",
  COMBAT: "combat",
  HAND_LIMIT: "hand limit",
  EFFECT: "effect",
  MILL: "milled",
};

/** When a scheduled effect will fire, phrased for the log line. */
const FIRE_AT: Record<string, string> = {
  START: "at start of turn",
  END: "at end of turn",
  COMBAT_END: "at end of combat",
};

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
            !/ \((?:boost|combat|hand limit|effect|milled)\)$/.test(l.text)
        );
        if (target) target.text = `${target.text} (${suffix})`;
        break;
      }

      // --- Mode 2: new lines, allowlist only -------------------------------
      case "VALUE_MODIFIED": {
        const label = e.role === "ATTACK" ? "Attack" : "Defense";
        added.push({ text: `${label} value ${e.newEffective - e.delta} → ${e.newEffective}`, who: "game" });
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
        const seat = ctx.seat(e.player);
        added.push({
          text: `${seat} revealed ${ctx.label(e.card)}`,
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
      case "SUB_ATTACK_INITIATED": {
        added.push({
          text: `${ctx.fighter(e.attacker)} fires Blast 'em! (${e.value}) at ${ctx.fighter(e.target)}`,
          who: "game",
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
