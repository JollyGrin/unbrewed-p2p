/**
 * Format-level rules copy for the Adventure briefing (unbrewed-p2p#1153) — the ONE
 * place the client words how an Adventure works. Scenario-specific text (win / lose /
 * threat / special, the enemy noun, the enemy-turn tile) is data from
 * `ScenarioListing.briefing` / `.display`, never written here; this file holds only the
 * generic fallbacks for a scenario that authors none.
 * Source of truth for the rules: research/adventures-coop-rules.md §2.3–2.5.
 *
 * Text may carry `**bold**` spans; render with `emphasisParts`.
 */
import type { GameEvent, ScenarioDisplay } from "./protocol";

type EnemyActivationOutcome = Extract<GameEvent, { type: "ENEMY_ACTIVATION" }>["outcome"];

export const BRIEFING_TITLE = "How this adventure works";
export const ENEMY_BOX_TITLE = "THE ENEMY FIELDS";
export const FORMAT_KICKER = "ADVENTURE · CO-OP";

/** §2.3 — the round is the initiative deck. */
export const ROUND_COPY = {
  title: "THE ROUND",
  text:
    "Everyone — heroes and enemies — has a card in one deck. Cards flip one at a time; **whoever flips, acts**. " +
    "So the order changes every round. When the deck runs out, each card's **End of Round** text happens, " +
    "left to right, and it reshuffles.",
} as const;

/**
 * §2.5 — the enemy targeting ladder: ADJACENT → CLOSEST → NO TARGET. `label` / `does` are the
 * enemy-turn card's short rows; `rule` is the briefing's sentence (when the scenario authors no
 * `display.enemyTurn`).
 */
export const ENEMY_LADDER = [
  { n: 1, label: "Hero adjacent?", does: "attacks", rule: "Next to a hero? **Attacks it.**" },
  { n: 2, label: "Closest reachable hero", does: "moves, attacks", rule: "Can reach one with its MOVE? **Goes for the closest** and attacks." },
  { n: 3, label: "No one in reach", does: "threat +1", rule: "No one in reach? **Stays put — threat +1.**" },
] as const;

export const LARGE_REACH_NOTE = "hits from 2 away";

/** The briefing's enemy-behaviour tile: the scenario's own copy, else the generic ladder.
 *  TODO(unbrewed-engine#826, p2p#1330 part C): drop the generic fallback once the engine always
 *  projects `display.enemyTurn`. */
export const enemyActsCopy = (display?: ScenarioDisplay | null): { title: string; steps: readonly string[]; note?: string } =>
  display?.enemyTurn ?? {
    title: "HOW AN ENEMY ACTS",
    steps: ENEMY_LADDER.map((s) => s.rule),
    note: "Its attack is the top card of its deck. LARGE enemies hit from 2 spaces away. On a tie, your team picks.",
  };

/**
 * What an activating enemy does, in the words the log, the enemy-turn card and the board share:
 * "attacks X" / "moves toward X" / "stays put, threat +1".
 */
export const enemyIntent = (outcome: EnemyActivationOutcome, target: string | null): string =>
  outcome === "NO_TARGET"
    ? "stays put, threat +1"
    : outcome === "ADJACENT"
      ? `attacks ${target ?? "a hero"}`
      : `moves toward ${target ?? "a hero"}`;

/** "an enemy" (or the scenario's own `enemyNoun`) with its article. */
export const anEnemy = (display?: ScenarioDisplay | null): string => {
  const noun = display?.enemyNoun.singular ?? "enemy";
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
};

/** §2.4 — a hero's turn is exactly the duel turn. */
export const YOUR_TURN_COPY = {
  title: "YOUR TURN",
  text: "Same as a duel — **2 actions**: maneuver, scheme, attack.",
} as const;

/**
 * UNRATIFIED RULING R3 (open hands): whether teammates' hands are open to each other.
 * Appended to YOUR_TURN only while this is true; flip or reword when R3 is ratified.
 */
export const OPEN_HANDS_NOTE: string | null = "Your teammates' hands are open to you.";

/**
 * UNRATIFIED — engine #658 (4-hero balance): the threat clock does not scale with
 * table size yet. Reword when #658 lands; null hides the note.
 */
export const DIFFICULTY_NOTE: { title: string; text: string } | null = {
  title: "DIFFICULTY",
  text: "Harder with more heroes; the threat clock does not scale yet.",
};

/**
 * UNRATIFIED — JW-R17 (villain HP): the villain's HP per hero count is shown from
 * `EnemyListing.hp` as data. No copy claims anything about it; this names the ruling
 * for whoever changes how HP is presented.
 */
export const VILLAIN_HP_RULING = "JW-R17";

export const yourTurnText = (display?: ScenarioDisplay | null): string => {
  const text = `${YOUR_TURN_COPY.text} Attack ${anEnemy(display)} and it defends with the top card of its deck.`;
  return OPEN_HANDS_NOTE ? `${text} ${OPEN_HANDS_NOTE}` : text;
};

/** Split `**bold**` markers into renderable parts. */
export const emphasisParts = (text: string): Array<{ text: string; bold: boolean }> =>
  text
    .split("**")
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((p) => p.text !== "");
