/**
 * The ordering behind /collection's hero picker (ticket #625).
 *
 * The dropdown this replaced could hide a player's whole standing behind a
 * click: 25 heroes, one visible name, and no way to see which of them had
 * points without opening the list and reading it one option at a time. The
 * picker shows every hero's numbers at once, which makes ORDER the thing that
 * has to be right — a wall of 25 rows is only readable if the ones that matter
 * are at the top.
 *
 * Two sections, and the split is the whole idea:
 *
 *  - **`ranked`** — heroes you have actually played, richest first by EARNED
 *    points. Earned rather than available, for the same reason the token rim
 *    is measured against earned: it records what you have done on a hero, and
 *    spending on card art must never demote you down the list.
 *  - **`more`** — everything else, alphabetically, for the page to collapse
 *    behind a "More decks" disclosure. These rows are a lookup ("what would I
 *    start earning on?"), not a status board, so they can cost a click.
 *
 * DEGRADED IS A FIRST-CLASS STATE here too. When telemetry is down every
 * `earned` is `null` — "we could not find out", never zero (see
 * `lib/account/cosmetics.ts`) — so points cannot rank anybody. The heroes the
 * API still reported a ledger row for keep the top section, in the API's own
 * games-descending order, and the picker keeps rendering names and rims. What
 * must NEVER happen is an outage that reads as "you have no heroes".
 */
import { HeroCosmetics, rimTierName } from "@/lib/account/cosmetics";
import { CollectionHero } from "@/lib/collection/roster";
import { CosmeticRimTier } from "@/lib/pro/cosmetics";

/** One hero as the picker draws it: who they are, plus the numbers, at rest. */
export interface HeroPickerRow {
  hero: CollectionHero;
  /** Lifetime points, or null while telemetry is unreachable. */
  earned: number | null;
  /** Points left to spend, or null while telemetry is unreachable. */
  available: number | null;
  /** Token-rim tier unlocked, as a paint name — null for "no rim / unknown". */
  rim: CosmeticRimTier | null;
}

export interface HeroPickerSections {
  /** Heroes with points (or with a ledger row during an outage), best first. */
  ranked: HeroPickerRow[];
  /** The rest of the roster, alphabetical — the collapsed "More decks" half. */
  more: HeroPickerRow[];
}

interface Ordered extends HeroPickerRow {
  /** Position in the API's payload (games descending), or last for a hero it
   * never mentioned. The tie-break that survives a telemetry outage. */
  index: number;
}

/**
 * Split and sort the roster for the picker.
 *
 * `heroes` is the API's payload verbatim — its membership is what says "this
 * player has a history on that hero", which is the only signal left when the
 * numbers themselves are null. `degraded` is what a hero MISSING from that
 * payload means: ordinarily "nothing earned yet" (0), but during an outage
 * "unknown" (null), exactly as `emptyHeroCosmetics` reads it.
 */
export const heroPickerSections = (
  roster: readonly CollectionHero[],
  heroes: readonly HeroCosmetics[],
  degraded = false,
): HeroPickerSections => {
  const byId = new Map<string, { row: HeroCosmetics; index: number }>();
  heroes.forEach((row, index) => {
    if (!byId.has(row.heroId)) byId.set(row.heroId, { row, index });
  });

  const ranked: Ordered[] = [];
  const more: Ordered[] = [];
  for (const hero of roster) {
    const reported = byId.get(hero.heroId);
    const unplayed = degraded ? null : 0;
    const row: Ordered = {
      hero,
      earned: reported ? reported.row.earned : unplayed,
      available: reported ? reported.row.available : unplayed,
      rim: rimTierName(reported?.row.tokenRim.unlockedTier ?? 0),
      index: reported?.index ?? Number.MAX_SAFE_INTEGER,
    };
    // "Has points" = a positive lifetime balance, or — when telemetry is down
    // and every balance is unknown — a ledger row the API reported anyway.
    const earns = row.earned === null ? reported !== undefined : row.earned > 0;
    (earns ? ranked : more).push(row);
  }

  ranked.sort((a, b) => {
    if (a.earned !== b.earned) {
      // A hero whose points we couldn't read sorts behind every hero we could.
      if (a.earned === null) return 1;
      if (b.earned === null) return -1;
      return b.earned - a.earned;
    }
    // Equal (or equally unknown) points fall back to the API's games-descending
    // order, then to the name, so the list never reshuffles between renders.
    return a.index - b.index || a.hero.name.localeCompare(b.hero.name);
  });
  more.sort((a, b) => a.hero.name.localeCompare(b.hero.name));

  const strip = ({ index: _index, ...row }: Ordered): HeroPickerRow => row;
  return { ranked: ranked.map(strip), more: more.map(strip) };
};
