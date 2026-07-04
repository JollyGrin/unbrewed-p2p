/**
 * Client-side activity feed for Pro games. Protocol v1 has no event stream —
 * the client derives log lines by diffing consecutive server views (the same
 * data the board renders, so the log can never contradict the table).
 * Heuristic and display-only: misses nothing rules-relevant that the view
 * doesn't also show, and never feeds anything back into play.
 */
import { CardInstanceId, PlayerView } from "./protocol";

export interface ProLogLine {
  text: string;
  who: "you" | "opp" | "game";
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
  const oppDrew = prev.opponent.deckCount - next.opponent.deckCount;
  if (oppDrew > 0 && next.opponent.handCount > prev.opponent.handCount) {
    lines.push({ text: `Opponent drew ${oppDrew} card${oppDrew === 1 ? "" : "s"}`, who: "opp" });
  }
  for (const [seatKey, prevPile, nextPile] of [
    [next.you, prev.self.discard, next.self.discard],
    [next.opponent.id, prev.opponent.discard, next.opponent.discard],
  ] as const) {
    const added = nextPile.slice(prevPile.length);
    for (const c of added) {
      lines.push({ text: `${seat(seatKey)} → discard: ${label(c)}`, who: whoOf(seatKey) });
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
