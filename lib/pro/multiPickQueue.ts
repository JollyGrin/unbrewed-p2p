/**
 * multiPickQueue.ts — answer a "how many?" count prompt and the card picks that
 * follow it from ONE selection (issue #1691 — POMNI's *The Funny One!*).
 *
 * The engine asks the count first (CHOOSE_OPTION) and then one CHOOSE_TARGET per
 * card; an answer is always a single option id. The multi-pick view collects the
 * whole selection up front, so on confirm the client answers the count and keeps
 * the chosen cards here, feeding one to each CHOOSE_TARGET as it opens.
 *
 * Pure and deliberately timid: `stepPickQueue` answers a prompt only when it is
 * plainly the next pick of the same effect (a CHOOSE_TARGET offering nothing but
 * cards of the revealed hand, one of them queued). Anything else drops the queue
 * and the prompt renders the way it always did, for the player to answer by hand.
 * The caller also drops it on a rejected answer, a timer expiry or a reconnect.
 */
import { optionCardId, type RevealedHandPick } from "./cardOptions";
import type { CardInstanceId, ViewPrompt } from "./protocol";

export interface PickQueue {
  /** the prompt the last answer went to; nothing is sent until it is replaced */
  answered: string;
  /** chosen cards still to be picked */
  cards: CardInstanceId[];
  /** the revealed hand the cards were chosen from */
  hand: CardInstanceId[];
  /** how many cards the selection held (for the "returning…" line) */
  total: number;
}

export interface PickAnswer {
  promptId: string;
  optionId: string;
}

/**
 * Confirm a selection on the count prompt: the answer to send now plus the queue
 * that will pick the cards. Null when the selection cannot be confirmed (more
 * cards than allowed, a card outside the hand, or a count the prompt does not
 * offer) — the caller then sends nothing.
 */
export const startPickQueue = (
  pick: RevealedHandPick,
  promptId: string,
  selected: readonly CardInstanceId[],
): { answer: PickAnswer; queue: PickQueue } | null => {
  const cards = [...new Set(selected)];
  const optionId = pick.countOptions[cards.length];
  if (optionId === undefined || cards.length > pick.max) return null;
  if (cards.some((c) => !pick.cards.includes(c))) return null;
  return { answer: { promptId, optionId }, queue: { answered: promptId, cards, hand: pick.cards, total: cards.length } };
};

/**
 * Advance the queue against the prompt now addressed to this seat (null: none).
 * Returns the queue to keep and, when the prompt is the next card pick, the
 * answer to send. An emptied queue is kept until its last prompt is replaced, so
 * the caller can hold the "returning…" view instead of flashing a picker for a
 * prompt that is already answered.
 */
export const stepPickQueue = (
  queue: PickQueue | null,
  prompt: ViewPrompt | null,
): { queue: PickQueue | null; answer: PickAnswer | null } => {
  const drop = { queue: null, answer: null };
  if (!queue || !prompt) return drop;
  if (prompt.promptId === queue.answered) return { queue, answer: null };
  if (queue.cards.length === 0 || prompt.kind !== "CHOOSE_TARGET") return drop;
  let option: string | null = null;
  for (const o of prompt.options) {
    const card = optionCardId(o);
    if (!card || !queue.hand.includes(card)) return drop;
    if (option === null && queue.cards.includes(card)) option = o.id;
  }
  if (option === null) return drop;
  const picked = prompt.options.find((o) => o.id === option)!;
  const pickedCard = optionCardId(picked);
  return {
    queue: { ...queue, answered: prompt.promptId, cards: queue.cards.filter((c) => c !== pickedCard) },
    answer: { promptId: prompt.promptId, optionId: option },
  };
};
