/**
 * The sound of being asked to defend.
 *
 * A defense is demanded in the MIDDLE of the opponent's turn, so the turn ding
 * never fires for it — until now the moment was carried by the DEFEND! pulse
 * alone, which a player looking away simply misses (player feedback).
 *
 * It deliberately reuses the `turn` clip rather than shipping another asset:
 * pitched down and struck twice, it reads as a relative of the turn ding — "you
 * are on" — while the doubled, lower knock says this one wants an answer now.
 */
import { SfxName } from "./sfx";

export interface CueBeat {
  name: SfxName;
  opts: { rate: number; delayMs?: number };
}

/** deep enough to be unmistakably not the turn ding, shallow enough to stay a ding */
const DEFEND_RATE = 0.72;
/** two knocks, close enough to hear as one gesture rather than two cues */
const DEFEND_GAP_MS = 150;

export const defendCueBeats = (): CueBeat[] => [
  { name: "turn", opts: { rate: DEFEND_RATE } },
  { name: "turn", opts: { rate: DEFEND_RATE, delayMs: DEFEND_GAP_MS } },
];
