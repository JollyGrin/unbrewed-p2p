/**
 * Format-level rules copy for the Adventure briefing (unbrewed-p2p#1153) — the ONE
 * place the client words how an Adventure works. Scenario-specific text (win / lose /
 * threat / special) is data from `ScenarioListing.briefing`, never written here.
 * Source of truth for the rules: research/adventures-coop-rules.md §2.3–2.5.
 *
 * Text may carry `**bold**` spans; render with `emphasisParts`.
 */

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

/** §2.5 — the enemy targeting algorithm: ADJACENT → CLOSEST → NO TARGET. */
export const ENEMY_ACTS_COPY = {
  title: "HOW A DINOSAUR ACTS",
  steps: [
    "Next to a hero? **Attacks it.**",
    "Can reach one with its MOVE? **Goes for the closest** and attacks.",
    "No one in reach? **Stays put — threat +1.**",
  ],
  note: "Its attack is the top card of its deck. LARGE dinosaurs hit from 2 spaces away. On a tie, your team picks.",
} as const;

/** §2.4 — a hero's turn is exactly the duel turn. */
export const YOUR_TURN_COPY = {
  title: "YOUR TURN",
  text: "Same as a duel — **2 actions**: maneuver, scheme, attack. Attack a dinosaur and it defends with the top card of its deck.",
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

export const yourTurnText = (): string => (OPEN_HANDS_NOTE ? `${YOUR_TURN_COPY.text} ${OPEN_HANDS_NOTE}` : YOUR_TURN_COPY.text);

/** Split `**bold**` markers into renderable parts. */
export const emphasisParts = (text: string): Array<{ text: string; bold: boolean }> =>
  text
    .split("**")
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((p) => p.text !== "");
