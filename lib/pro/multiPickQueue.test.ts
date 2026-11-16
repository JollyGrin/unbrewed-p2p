import { revealedHandPick } from "./cardOptions";
import { startPickQueue, stepPickQueue } from "./multiPickQueue";
import type { GameEvent, LegalOption, ViewPrompt } from "./protocol";

const HAND = ["pl/hit#2", "pl/hit#3", "pl/plot#1"];

const countPrompt: ViewPrompt = {
  promptId: "count",
  player: "p1",
  kind: "CHOOSE_OPTION",
  options: [0, 1, 2].map((n) => ({ id: String(n), label: String(n), data: { count: n } })),
};
const pick = revealedHandPick(
  countPrompt,
  [
    ...HAND.map((card): GameEvent => ({ type: "CARD_REVEALED", player: "p2", card })),
    { type: "PROMPT_OPENED", player: "p1", kind: "CHOOSE_OPTION", promptId: "count" },
  ],
  () => HAND.length,
)!;

const cardOpt = (card: string): LegalOption => ({ id: card, label: card, data: { card } });
const targetPrompt = (promptId: string, cards: string[], over: Partial<ViewPrompt> = {}): ViewPrompt => ({
  promptId,
  player: "p1",
  kind: "CHOOSE_TARGET",
  options: cards.map(cardOpt),
  ...over,
});

describe("startPickQueue", () => {
  it("answers the count prompt with the number of selected cards and queues them", () => {
    expect(startPickQueue(pick, "count", ["pl/plot#1", "pl/hit#2"])).toEqual({
      answer: { promptId: "count", optionId: "2" },
      queue: { answered: "count", cards: ["pl/plot#1", "pl/hit#2"], hand: HAND, total: 2 },
    });
  });

  it("answers 0 for an empty selection, with nothing queued", () => {
    const start = startPickQueue(pick, "count", []);
    expect(start?.answer).toEqual({ promptId: "count", optionId: "0" });
    expect(start?.queue.cards).toEqual([]);
  });

  it("refuses more cards than the max, a card outside the hand, or an unoffered count", () => {
    expect(startPickQueue(pick, "count", HAND)).toBeNull();
    expect(startPickQueue(pick, "count", ["other/card#1"])).toBeNull();
    expect(startPickQueue({ ...pick, countOptions: { 1: "1", 2: "2" } }, "count", [])).toBeNull();
  });
});

describe("stepPickQueue", () => {
  const { queue } = startPickQueue(pick, "count", ["pl/plot#1", "pl/hit#2"])!;

  it("sends the same answers as the manual flow: count, then each chosen card", () => {
    // the count prompt is still up (our answer is on the wire): wait
    expect(stepPickQueue(queue, countPrompt)).toEqual({ queue, answer: null });
    const first = stepPickQueue(queue, targetPrompt("t1", HAND));
    expect(first.answer).toEqual({ promptId: "t1", optionId: "pl/hit#2" });
    const second = stepPickQueue(first.queue, targetPrompt("t2", ["pl/hit#3", "pl/plot#1"]));
    expect(second.answer).toEqual({ promptId: "t2", optionId: "pl/plot#1" });
    // emptied, but held until the last prompt is replaced…
    expect(second.queue?.cards).toEqual([]);
    expect(stepPickQueue(second.queue, targetPrompt("t2", ["pl/hit#3", "pl/plot#1"]))).toEqual({
      queue: second.queue,
      answer: null,
    });
    // …then gone, without answering whatever comes next.
    expect(stepPickQueue(second.queue, null)).toEqual({ queue: null, answer: null });
    expect(stepPickQueue(second.queue, targetPrompt("t3", ["pl/hit#3"]))).toEqual({ queue: null, answer: null });
  });

  it("never answers the same prompt twice", () => {
    const first = stepPickQueue(queue, targetPrompt("t1", HAND));
    expect(stepPickQueue(first.queue, targetPrompt("t1", HAND)).answer).toBeNull();
  });

  it("drops the queue when the next prompt does not offer a queued card", () => {
    expect(stepPickQueue(queue, targetPrompt("t1", ["pl/hit#3"]))).toEqual({ queue: null, answer: null });
  });

  it("drops the queue on a prompt offering anything outside the revealed hand", () => {
    expect(stepPickQueue(queue, targetPrompt("t1", ["pl/hit#2", "other/card#9"]))).toEqual({ queue: null, answer: null });
    const withDecline = targetPrompt("t1", HAND);
    withDecline.options.push({ id: "decline", label: "Decline" });
    expect(stepPickQueue(queue, withDecline)).toEqual({ queue: null, answer: null });
    const fighters = targetPrompt("t1", [], { options: [{ id: "p2/hero", label: "Hero" }] });
    expect(stepPickQueue(queue, fighters)).toEqual({ queue: null, answer: null });
  });

  it("drops the queue on an unrelated prompt kind or when the prompt is gone", () => {
    expect(stepPickQueue(queue, { ...countPrompt, promptId: "other" })).toEqual({ queue: null, answer: null });
    expect(stepPickQueue(queue, targetPrompt("t1", HAND, { kind: "YES_NO" }))).toEqual({ queue: null, answer: null });
    expect(stepPickQueue(queue, null)).toEqual({ queue: null, answer: null });
  });

  it("is inert without a queue", () => {
    expect(stepPickQueue(null, targetPrompt("t1", HAND))).toEqual({ queue: null, answer: null });
  });
});
