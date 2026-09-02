import { cardFaceOptions, optionCardId } from "./cardOptions";
import type { LegalOption, PromptKind, ViewPrompt } from "./protocol";

const prompt = (kind: PromptKind, options: LegalOption[]): ViewPrompt => ({
  promptId: "p1",
  player: "p1",
  kind,
  options,
});

// A deck-search / tutor option (issue #352): the engine emits CHOOSE_TARGET with
// the real card instance in data.card, its id/label the same instance string.
const cardOpt = (instance: string): LegalOption => ({
  id: instance,
  label: instance,
  data: { card: instance },
});

describe("optionCardId", () => {
  it("returns the instance id from data.card when it looks like `<def>#<n>`", () => {
    expect(optionCardId(cardOpt("card_042#3"))).toBe("card_042#3");
  });

  it("returns null for a sentinel with no card (decline)", () => {
    expect(optionCardId({ id: "decline", label: "Decline" })).toBeNull();
  });

  it("returns null when data.card is null", () => {
    expect(optionCardId({ id: "decline", label: "Decline", data: { card: null } })).toBeNull();
  });

  it("returns null for an effect-label branch (data.branch, no card)", () => {
    expect(optionCardId({ id: "b1", label: "Deal 2 damage", data: { branch: "b1" } })).toBeNull();
  });

  it("returns null when data.card lacks the `#` instance suffix", () => {
    // A raw def id (no instance suffix) is not a resolvable instance — ignore it.
    expect(optionCardId({ id: "x", label: "x", data: { card: "card_042" } })).toBeNull();
  });
});

describe("cardFaceOptions", () => {
  it("returns [] for a null prompt", () => {
    expect(cardFaceOptions(null)).toEqual([]);
  });

  it("surfaces card faces for a CHOOSE_TARGET deck-search prompt (issue #352)", () => {
    const p = prompt("CHOOSE_TARGET", [cardOpt("card_042#1"), cardOpt("card_099#2")]);
    expect(cardFaceOptions(p)).toEqual([
      { id: "card_042#1", instance: "card_042#1" },
      { id: "card_099#2", instance: "card_099#2" },
    ]);
  });

  it("surfaces card faces for a CHOOSE_OPTION hand-card commit (issue #288)", () => {
    const p = prompt("CHOOSE_OPTION", [cardOpt("card_007#1")]);
    expect(cardFaceOptions(p)).toEqual([{ id: "card_007#1", instance: "card_007#1" }]);
  });

  it("keeps a decline sentinel out so it falls through to a panel button", () => {
    const p = prompt("CHOOSE_TARGET", [
      cardOpt("card_042#1"),
      { id: "decline", label: "Decline" },
    ]);
    expect(cardFaceOptions(p)).toEqual([{ id: "card_042#1", instance: "card_042#1" }]);
  });

  it("leaves a fighter/space CHOOSE_TARGET (no data.card) to the board flow", () => {
    // Fighter targets are plain option ids with no data.card — never card faces.
    const p = prompt("CHOOSE_TARGET", [
      { id: "fighter:hero", label: "Hero" },
      { id: "fighter:sk1", label: "Sidekick" },
    ]);
    expect(cardFaceOptions(p)).toEqual([]);
  });

  // Issue #737. Appa's *Animal Antics* returns revealed cards with an UNFILTERED
  // `putInDeck` over the OPPONENT's whole discard, and `execPutInDeck` sends every
  // option with `label` set to the bare CardInstanceId. If this gate ever stopped
  // matching, the player would be asked to pick between buttons reading
  // "kong/pounce#2" — captured verbatim off a live PUT_IN_DECK_CARD prompt.
  it("turns a PUT_IN_DECK_CARD pick into faces, never raw instance-id labels", () => {
    const p = prompt("CHOOSE_TARGET", [
      cardOpt("king-kong/regroup#1"),
      cardOpt("king-kong/jaw-of-the-beast#2"),
      cardOpt("king-kong/the-king-is-coming#3"),
      cardOpt("king-kong/pounce#1"),
    ]);
    const faces = cardFaceOptions(p);
    expect(faces).toHaveLength(4);
    expect(faces.map((f) => f.instance)).toEqual(p.options.map((o) => o.id));
    // Every option the engine offered is renderable — none falls through to a
    // button whose only text would be the instance id the engine used as a label.
    expect(faces.map((f) => f.id)).toEqual(p.options.map((o) => o.id));
  });

  it("ignores prompt kinds that never carry card options", () => {
    // e.g. a CHOOSE_SPACE pose prompt — options are `<space>|<space>` strings.
    const p = prompt("CHOOSE_SPACE", [{ id: "s12|s13", label: "s12|s13" }]);
    expect(cardFaceOptions(p)).toEqual([]);
  });
});
