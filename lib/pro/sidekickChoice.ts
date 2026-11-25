/**
 * Setup-time sidekick choice (issue #1717 ↔ engine #1087, protocol v42) — naming
 * and copy for the prompt, nothing else. No rules live here.
 *
 * A hero whose deck lets its player choose a sidekick (Harry Dresden: Mouse or
 * Karrin Murphy) gets one ordinary `CHOOSE_OPTION` prompt at game start, before
 * the mulligan and before any fighter is placed. The engine words it "Choose your
 * sidekick" and gives each option `data: { name, hp, reach, quantity }`. Seats
 * pick in seat order and each pick is public at once (`SIDEKICK_CHOSEN`, narrated
 * in gameLog.ts), so a later chooser can already see the earlier picks.
 *
 * The OTHER seats get the same prompt with `options: []` (redact.ts strips them)
 * but the same public `description`, so the description is what identifies the
 * prompt for a seat that is only watching.
 */
import type { LegalOption, PlayerId, PlayerView, ViewFighter, ViewPrompt } from "./protocol";

/**
 * The engine's `description` on the prompt: the literal string engine
 * `openSidekickChoicePrompt` passes to `openPrompt` (unbrewed-engine PR #1091,
 * engine/effects.ts). A seat that is not choosing gets no options, so this wording
 * is how it recognises the prompt; `isSidekickChoiceDescription` tolerates case,
 * outer whitespace and trailing punctuation so a small copy edit engine-side does
 * not silently drop the watcher copy back to the generic panel.
 */
export const SIDEKICK_CHOICE_DESCRIPTION = "Choose your sidekick";

const normDescription = (s: string): string =>
  s
    .trim()
    .replace(/[\s.!?:…]+$/u, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

/** Does a prompt `description` carry the engine's sidekick-choice wording? */
export const isSidekickChoiceDescription = (description: string | undefined): boolean =>
  description !== undefined && normDescription(description) === normDescription(SIDEKICK_CHOICE_DESCRIPTION);

/** What one option says about its sidekick (`LegalOption.data` on this prompt). */
export interface SidekickOptionData {
  name: string;
  hp: number;
  reach: ViewFighter["reach"];
  quantity: number;
}

/** The option's sidekick stats, or null when the option carries none. */
export const sidekickOptionData = (option: LegalOption): SidekickOptionData | null => {
  const d = option.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const { name, hp, reach, quantity } = d as Record<string, unknown>;
  if (typeof name !== "string" || typeof hp !== "number" || typeof reach !== "string") return null;
  return {
    name,
    hp,
    reach: reach as SidekickOptionData["reach"],
    quantity: typeof quantity === "number" ? quantity : 1,
  };
};

/**
 * Is this the setup sidekick choice? True for the chooser's copy (it carries the
 * sidekick-shaped options) and for everyone else's (no options, same description).
 */
export const isSidekickChoicePrompt = (prompt: ViewPrompt | null | undefined): boolean => {
  if (!prompt || prompt.kind !== "CHOOSE_OPTION") return false;
  if (isSidekickChoiceDescription(prompt.description)) return true;
  return prompt.options.length >= 2 && prompt.options.every((o) => sidekickOptionData(o) !== null);
};

const REACH_WORD: Record<SidekickOptionData["reach"], string> = {
  MELEE: "Melee",
  RANGED: "Ranged",
  LUNGE: "Lunge",
};

/** "7 HP · Melee", or "3 HP each · ×3 · Ranged" for a squad. */
export const sidekickStatsLine = (s: Pick<SidekickOptionData, "hp" | "reach" | "quantity">): string => {
  const reach = REACH_WORD[s.reach] ?? s.reach;
  return s.quantity > 1 ? `${s.hp} HP each · ×${s.quantity} · ${reach}` : `${s.hp} HP · ${reach}`;
};

/** Caption under an option button: its stats, or null when the option has none. */
export const sidekickOptionCaption = (option: LegalOption): string | null => {
  const d = sidekickOptionData(option);
  return d ? sidekickStatsLine(d) : null;
};

/**
 * The panel's headline. The chooser reads the engine's own wording; everyone else
 * is told WHO is choosing ("Opponent is choosing a sidekick") rather than reading
 * "Choose your sidekick" about somebody else's pick.
 */
export const sidekickChoiceHeadline = (
  prompt: Pick<ViewPrompt, "player" | "description">,
  you: PlayerId,
  seat: (player: PlayerId) => string
): string =>
  prompt.player === you
    ? prompt.description ?? SIDEKICK_CHOICE_DESCRIPTION
    : `${seat(prompt.player)} is choosing a sidekick`;

/**
 * Other seats' sidekicks already on the table, one line per seat — a fixed
 * sidekick, or one picked earlier in this same window (picks are sequential and
 * public). The figure exists from the moment of the pick (not yet placed), so the
 * view is enough; nothing is remembered client-side. Empty when nobody else has
 * one yet.
 */
export const otherSidekickLines = (
  view: Pick<PlayerView, "fighters">,
  chooser: PlayerId,
  seat: (player: PlayerId) => string
): string[] => {
  const bySeat = new Map<PlayerId, ViewFighter[]>();
  for (const f of view.fighters) {
    if (f.kind !== "SIDEKICK" || f.owner === chooser) continue;
    bySeat.set(f.owner, [...(bySeat.get(f.owner) ?? []), f]);
  }
  return [...bySeat.entries()].map(([owner, figs]) => {
    // A squad (Clone Troopers) shares one name; say it once with its size.
    const first = figs[0];
    const names = [...new Set(figs.map((f) => f.name))];
    const stats = sidekickStatsLine({ hp: first.maxHp, reach: first.reach, quantity: figs.length });
    const who = seat(owner);
    return `${who === "You" ? "Your" : `${who}'s`} sidekick: ${names.join(", ")} (${stats})`;
  });
};
