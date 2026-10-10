/**
 * The public Pro roster, for "N of 34 played" and the roster grids.
 *
 * Source: the prod engine's `HEROES` registry (JollyGrin/unbrewed-engine
 * `server/content.ts`), keeping exactly what `heroListings(false)` shows the
 * public — every entry that is neither `tier: 'reflavored'` nor
 * `rosterDebugOnly`. That drops the four reflavored baselines (`king-taranis`,
 * `thetis`, `piper-of-the-underroads`, `hollow-oak`) and keeps their `-spice`
 * replacements, which are separate heroes in telemetry and share the
 * baseline's display name exactly as the public roster shows them.
 *
 * Cross-checked against `HERO_DECK_IDS` (lib/pro/useProCardArt.ts): every id
 * below has a deck snapshot there; the four reflavored ids are the only
 * HERO_DECK_IDS entries left out. Display names are the engine's `hero.name`,
 * title-cased where the deck data isn't (`TRICERATOPS`, `gingerbread man`).
 *
 * Static on purpose: the site is a static export, and the roster changes only
 * when a deck ships (roster.test.ts pins it against HERO_DECK_IDS so a new deck
 * without a roster entry fails loudly).
 */
export interface RosterHero {
  heroId: string;
  name: string;
}

export const PUBLIC_ROSTER: readonly RosterHero[] = [
  { heroId: "appa", name: "Appa" },
  { heroId: "baba-yaga", name: "Baba Yaga" },
  { heroId: "batman", name: "Batman" },
  { heroId: "boba-fett", name: "Boba Fett" },
  { heroId: "buster-keaton", name: "Buster Keaton" },
  { heroId: "cairne-bloodhoof", name: "Cairne Bloodhoof" },
  { heroId: "cecil-palmer", name: "Cecil Palmer" },
  { heroId: "clone-troopers", name: "Clone Troopers" },
  { heroId: "darth-maul", name: "Darth Maul" },
  { heroId: "darth-vader", name: "Darth Vader" },
  { heroId: "doppelganger", name: "The Doppelgänger" },
  { heroId: "ellen-ripley", name: "Ellen Ripley" },
  { heroId: "frankenstein", name: "Frankestein" },
  { heroId: "general-grievous", name: "General Grievous" },
  { heroId: "gerry-the-isopod", name: "Gerry the Isopod" },
  { heroId: "gingerbread-man", name: "Gingerbread Man" },
  { heroId: "hollow-oak-spice", name: "The Hollow Oak" },
  { heroId: "jason-voorhees", name: "Jason Voorhees" },
  { heroId: "kenshiro", name: "Kenshiro" },
  { heroId: "king-kong", name: "King Kong" },
  { heroId: "king-taranis-spice", name: "King Taranis" },
  { heroId: "leon-s-kennedy", name: "Leon S. Kennedy" },
  { heroId: "luke-skywalker", name: "Luke Skywalker" },
  { heroId: "malfurion-stormrage", name: "Malfurion Stormrage" },
  { heroId: "nancy-drew", name: "Nancy Drew" },
  { heroId: "piper-of-the-underroads-spice", name: "Piper of the Underroads" },
  { heroId: "r2-d2", name: "R2-D2" },
  { heroId: "skull-kid", name: "Skull Kid" },
  { heroId: "specter-knight", name: "Specter Knight" },
  { heroId: "the-mandalorian", name: "The Mandalorian" },
  { heroId: "the-narrator", name: "The Narrator" },
  { heroId: "thetis-spice", name: "Thetis" },
  { heroId: "thrall", name: "Thrall" },
  { heroId: "triceratops", name: "Triceratops" },
];

/** The "of N" denominator. */
export const ROSTER_SIZE = PUBLIC_ROSTER.length;

/**
 * Engine ids hidden from the public roster (reflavored baselines). Telemetry
 * can still carry old games on them, so they resolve a name, but they never
 * count towards "N of 34".
 */
export const HIDDEN_HERO_NAMES: Readonly<Record<string, string>> = {
  "king-taranis": "King Taranis",
  thetis: "Thetis",
  "piper-of-the-underroads": "Piper of the Underroads",
  "hollow-oak": "The Hollow Oak",
};

const NAMES: ReadonlyMap<string, string> = new Map([
  ...Object.entries(HIDDEN_HERO_NAMES),
  ...PUBLIC_ROSTER.map((hero): [string, string] => [hero.heroId, hero.name]),
]);

export const isRosterHero = (heroId: string | null | undefined): boolean =>
  !!heroId && PUBLIC_ROSTER.some((hero) => hero.heroId === heroId);

/**
 * Display name for a hero id: the roster's, else the name the payload sent,
 * else the id itself — a hero the client doesn't know yet still gets a label.
 */
export const heroDisplayName = (
  heroId: string | null | undefined,
  sentName?: string | null,
): string => (heroId ? NAMES.get(heroId) : undefined) ?? sentName?.trim() ?? heroId ?? "Unknown hero";

/** Two-letter initials for the token fallback disc ("The Mandalorian" → "TM"). */
export const heroInitials = (name: string): string => {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};
