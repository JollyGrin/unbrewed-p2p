import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  PoolType,
  adjustExtraCharacterHp,
  adjustHp,
  hasFieldedSidekick,
  hasSidekick,
  toPoolExtraCharacters,
} from "@/components/DeckPool/PoolFns";
import { adjustSidekickCount } from "./irlPool";

/**
 * The IRL tray's health counters (issue #798): one per character with a
 * printed hp. Current values live on the pool (so they persist and reset with
 * it); start values come off the printed deck, which the counters never touch.
 */
export type IrlCounter = {
  id: string;
  name: string;
  isRanged: boolean;
  /** second meta line fact — "move 3", "sidekick" */
  detail: string;
  /** hp = health; count = how many of a sidekick squad are still standing */
  kind: "hp" | "count";
  value: number;
  start: number | null;
  /** apply `delta`, floored so no counter goes below 0 */
  adjust: (pool: PoolType, delta: number) => PoolType;
};

const floored = (value: number, delta: number) => Math.max(delta, -value);

export const irlCounters = (
  deck: DeckImportType,
  pool: PoolType,
): IrlCounter[] => {
  const printed = deck.deck_data;
  const counters: IrlCounter[] = [];

  const heroHp = pool.hero?.hp ?? 0;
  counters.push({
    id: "hero",
    name: pool.hero?.name || deck.name,
    isRanged: !!pool.hero?.isRanged,
    detail: typeof pool.hero?.move === "number" ? `move ${pool.hero.move}` : "hero",
    kind: "hp",
    value: heroHp,
    start: printed?.hero?.hp ?? null,
    adjust: (p, d) => adjustHp(p, "hero", floored(p.hero.hp ?? 0, d)),
  });

  // The same quantity rule PlayerBox uses — a squad (> 1) counts fighters,
  // a lone sidekick tracks health — read off the PRINTED quantity, so a squad
  // whittled down to its last clone keeps its count counter instead of
  // flipping into an HP counter mid-game.
  const sidekick = pool.sidekick;
  const printedSidekick = printed?.sidekick;
  if (hasSidekick(printedSidekick) && sidekick) {
    const squad = (printedSidekick.quantity ?? 0) > 1;
    if (squad) {
      counters.push({
        id: "sidekick",
        name: sidekick.name,
        isRanged: !!sidekick.isRanged,
        detail: "sidekicks",
        kind: "count",
        value: sidekick.quantity ?? 0,
        start: printedSidekick.quantity,
        adjust: adjustSidekickCount,
      });
    } else if (sidekick.hp !== null && sidekick.hp !== undefined) {
      counters.push({
        id: "sidekick",
        name: sidekick.name,
        isRanged: !!sidekick.isRanged,
        detail: "sidekick",
        kind: "hp",
        value: sidekick.hp,
        start: printedSidekick.hp,
        adjust: (p, d) => adjustHp(p, "sidekick", floored(p.sidekick.hp ?? 0, d)),
      });
    }
  }

  const printedExtras = toPoolExtraCharacters(printed?.extraCharacters);
  (pool.extraCharacters ?? []).forEach((character, index) => {
    const { hero, sidekick: extraSidekick } = character;
    if (hero.hp !== null && hero.hp !== undefined) {
      counters.push({
        id: `extra-${index}-hero`,
        name: hero.name,
        isRanged: !!hero.isRanged,
        detail: typeof hero.move === "number" ? `move ${hero.move}` : "character",
        kind: "hp",
        value: hero.hp,
        start: printedExtras[index]?.hero.hp ?? null,
        adjust: (p, d) =>
          adjustExtraCharacterHp(
            p,
            index,
            "hero",
            floored(p.extraCharacters[index]?.hero.hp ?? 0, d),
          ),
      });
    }
    if (
      hasFieldedSidekick(extraSidekick) &&
      extraSidekick.hp !== null &&
      extraSidekick.hp !== undefined
    ) {
      counters.push({
        id: `extra-${index}-sidekick`,
        name: extraSidekick.name,
        isRanged: !!extraSidekick.isRanged,
        detail: "sidekick",
        kind: "hp",
        value: extraSidekick.hp,
        start: printedExtras[index]?.sidekick.hp ?? null,
        adjust: (p, d) =>
          adjustExtraCharacterHp(
            p,
            index,
            "sidekick",
            floored(p.extraCharacters[index]?.sidekick.hp ?? 0, d),
          ),
      });
    }
  });

  return counters;
};

/** Characters the deck fields — the count on the tray's Characters tile. */
export const irlCharacterCount = (deck: DeckImportType): number => {
  const printed = deck.deck_data;
  const extras = toPoolExtraCharacters(printed?.extraCharacters);
  return (
    1 +
    (hasSidekick(printed?.sidekick) ? 1 : 0) +
    extras.length +
    extras.filter((c) => hasFieldedSidekick(c.sidekick)).length
  );
};

export type IrlQuote = { text: string; by?: string };

/**
 * A printed hero quote split into its words and attribution. unmatched.cards
 * stores it as one blob — `"…mysteries of creation."\n     -Mary Shelley` —
 * and on the SIDEKICK object, whatever the deck, so callers pass
 * `hero.quote || sidekick.quote`.
 */
export const parseQuote = (raw?: string | null): IrlQuote | undefined => {
  const lines = (raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return undefined;
  const last = lines[lines.length - 1];
  const attributed = lines.length > 1 && /^[-–—]/.test(last);
  const body = (attributed ? lines.slice(0, -1) : lines).join(" ");
  const text = body.replace(/^["“”']+|["“”']+$/g, "").trim();
  if (!text) return undefined;
  return {
    text,
    by: attributed ? `– ${last.replace(/^[-–—]+\s*/, "")}` : undefined,
  };
};
