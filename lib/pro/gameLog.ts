/**
 * Client-side activity feed for Pro games. Protocol v1 has no event stream —
 * the client derives log lines by diffing consecutive server views (the same
 * data the board renders, so the log can never contradict the table).
 * Heuristic and display-only: misses nothing rules-relevant that the view
 * doesn't also show, and never feeds anything back into play.
 */
import { CardInstanceId, GameEvent, PlayerView } from "./protocol";
import { requireOpponent } from "./viewCompat";

export interface ProLogLine {
  text: string;
  who: "you" | "opp" | "game";
  /** card instances named in the line — the log panel shows them on hover */
  cards?: CardInstanceId[];
}

/** A log line as stored in the page (feed + CSV/bug-report export). */
export interface ProLogEntry extends ProLogLine {
  key: string;
  /** ms epoch when the line was appended (client clock; used for CSV export) */
  ts?: number;
  /** turn number the line belongs to — lets the bug-report dialog window by turn */
  turn?: number;
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * Oldest-first CSV of the whole feed (entries are stored newest-first). Single
 * source for both the activity-panel download and the bug-report attachment.
 */
export function logEntriesToCsv(entries: ProLogEntry[]): string {
  return [
    "time,turn,who,text",
    ...[...entries]
      .reverse()
      .map((e) =>
        [e.ts ? new Date(e.ts).toISOString() : "", e.turn ?? "", e.who, csvCell(e.text)].join(",")
      ),
  ].join("\n");
}

const short = (name: string) => name.split("/").pop() ?? name;

export function diffViews(
  prev: PlayerView | null,
  next: PlayerView,
  label: (instance: CardInstanceId) => string
): ProLogLine[] {
  const lines: ProLogLine[] = [];
  const whoOf = (p: string): "you" | "opp" => (p === next.you ? "you" : "opp");
  const seat = (p: string) => (p === next.you ? "You" : "Opponent");

  if (!prev) {
    lines.push({ text: `Game on — turn ${next.turnNumber}`, who: "game" });
    return lines;
  }

  const prevOpponent = requireOpponent(prev);
  const nextOpponent = requireOpponent(next);

  if (next.turnNumber !== prev.turnNumber) {
    lines.push({
      text: `Turn ${next.turnNumber} — ${next.activePlayer === next.you ? "your" : "opponent's"} turn`,
      who: "game",
    });
  }

  // fighters: movement, damage, defeat
  const prevFighters = new Map(prev.fighters.map((f) => [f.id, f]));
  for (const f of next.fighters) {
    const was = prevFighters.get(f.id);
    if (!was) continue;
    if (f.space !== was.space && f.space && was.space) {
      lines.push({ text: `${f.name} moved`, who: whoOf(f.owner) });
    }
    if (f.hp < was.hp) {
      lines.push({
        text: `${f.name} took ${was.hp - f.hp} damage (${f.hp}/${f.maxHp})`,
        who: whoOf(f.owner),
      });
    } else if (f.hp > was.hp) {
      lines.push({ text: `${f.name} healed ${f.hp - was.hp} (${f.hp}/${f.maxHp})`, who: whoOf(f.owner) });
    }
    if (f.defeated && !was.defeated) {
      lines.push({ text: `${f.name} was defeated!`, who: "game" });
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

  // cards: draws (counts only for the opponent), discard-pile growth
  const drewSelf = next.self.hand.filter((c) => !prev.self.hand.includes(c)).length;
  if (drewSelf > 0 && next.self.deckCount < prev.self.deckCount) {
    lines.push({ text: `You drew ${drewSelf} card${drewSelf === 1 ? "" : "s"}`, who: "you" });
  }
  const oppDrew = prevOpponent.deckCount - nextOpponent.deckCount;
  if (oppDrew > 0 && nextOpponent.handCount > prevOpponent.handCount) {
    lines.push({ text: `Opponent drew ${oppDrew} card${oppDrew === 1 ? "" : "s"}`, who: "opp" });
  }
  for (const [seatKey, prevPile, nextPile] of [
    [next.you, prev.self.discard, next.self.discard],
    [nextOpponent.id, prevOpponent.discard, nextOpponent.discard],
  ] as const) {
    const added = nextPile.slice(prevPile.length);
    for (const c of added) {
      lines.push({ text: `${seat(seatKey)} → discard: ${label(c)}`, who: whoOf(seatKey), cards: [c] });
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
      const owner = t.owner === next.you ? "Your" : "Opponent's";
      lines.push({ text: `${owner} totem was destroyed`, who: whoOf(t.owner) });
    }
  }

  if (next.winner && !prev.winner) {
    lines.push({
      text: next.winner === next.you ? "VICTORY — you win!" : "Defeat — opponent wins",
      who: "game",
    });
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
        const seat = whoOf(e.player) === "you" ? "You" : "Opponent";
        added.push({
          text: `${seat} gained ${e.amount} action${e.amount === 1 ? "" : "s"}`,
          who: whoOf(e.player),
        });
        break;
      }
      case "CARD_RETURNED_TO_HAND": {
        const seat = whoOf(e.player) === "you" ? "You" : "Opponent";
        added.push({
          text: `${seat} returned ${ctx.label(e.card)} to hand`,
          who: whoOf(e.player),
          cards: [e.card],
        });
        break;
      }
      case "CARD_REVEALED": {
        const seat = whoOf(e.player) === "you" ? "You" : "Opponent";
        added.push({
          text: `${seat} revealed ${ctx.label(e.card)}`,
          who: whoOf(e.player),
          cards: [e.card],
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
