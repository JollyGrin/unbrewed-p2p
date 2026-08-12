/**
 * The create screen's duel opponent seat, and who is allowed to set it (#593).
 *
 * Two writers race for this one piece of state:
 *  - the `?vs=` URL preset (#460), which can only apply AFTER hydration because
 *    on the static export `router.query` is empty for the first render, and
 *  - the player, who can click a tier chip before that effect ever runs.
 *
 * The original guard was "has the preset fired yet", which is not the same
 * question: a player who landed from a `?vs=ai` CTA (= medium) and immediately
 * clicked Expert had their pick silently overwritten with medium a tick later —
 * they got a medium bot for an Expert-labelled fight, with no visible tell.
 * So the rule here is the stronger one: an explicit choice is NEVER overwritten
 * by URL-preset hydration, whether it was made before or after the preset fired.
 *
 * Only a real user action goes through `chooseOpponent`. Machine-driven revisions
 * — most notably pruning an armed tier the server stopped offering, via
 * `coerceBotTier` — use `reviseOpponent`, which deliberately does NOT count as
 * the player choosing: it is the same choice, narrowed to what is serveable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BotDifficulty } from "./protocol";

/** Who-fills-this-seat choice, unified across the duel opponent + multiplayer
 *  seats (both drive the same `human | <bot tier>` union). */
export type OpponentChoice = "human" | BotDifficulty;

export interface OpponentSeat {
  /** Current seat occupant. */
  opponent: OpponentChoice;
  /** A player clicked a seat chip. Locks the seat against `?vs=` hydration. */
  chooseOpponent: (next: OpponentChoice) => void;
  /** A non-user revision (tier pruning). Does not lock the seat. */
  reviseOpponent: (next: OpponentChoice | ((prev: OpponentChoice) => OpponentChoice)) => void;
}

export function useOpponentSeat(vsBot: BotDifficulty | null): OpponentSeat {
  const [opponent, setOpponent] = useState<OpponentChoice>("human");
  // Set the instant a chip is clicked — a ref, not state, because the preset
  // effect must see it in the very same commit the click happened in.
  const userChose = useRef(false);
  const presetApplied = useRef(false);

  const chooseOpponent = useCallback((next: OpponentChoice) => {
    userChose.current = true;
    setOpponent(next);
  }, []);

  useEffect(() => {
    // One-shot, and only while the seat is still untouched.
    if (presetApplied.current || userChose.current || !vsBot) return;
    presetApplied.current = true;
    setOpponent(vsBot);
  }, [vsBot]);

  return { opponent, chooseOpponent, reviseOpponent: setOpponent };
}
