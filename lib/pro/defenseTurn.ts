/**
 * "Is the live combat waiting on YOUR defense?" — the one question two separate
 * feel-layer differs both need to ask.
 *
 * `combatFx.ts` uses it for the full-screen DEFEND! pulse; `fxEvents.ts` uses it
 * for the defense sound. It lives in its own module so the pure event differ
 * doesn't have to import a React hook module to borrow four lines of logic.
 */
import { PlayerView } from "./protocol";

export const mustDefend = (v: PlayerView): boolean =>
  v.combat?.stage === "COMMIT_DEFENSE" && v.combat.defenderPlayer === v.you;
