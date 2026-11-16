import { cardFaceOptions, optionCardId, revealedHandPick } from "./cardOptions";
import type { LegalOption, PlayerId, PromptKind, ViewPrompt } from "./protocol";

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

import { optionPlayerId, revealedPlayerPickOptions, type RevealedCard } from "./cardOptions";

const playerOpt = (id: string, player: string): LegalOption => ({
  id,
  label: player.toUpperCase(),
  data: { player },
});

const rev = (player: PlayerId, card: string): RevealedCard => ({ player, card });

describe("optionPlayerId", () => {
  it("reads data.player from an option", () => {
    expect(optionPlayerId(playerOpt("a1", "p1"))).toBe("p1");
  });

  it("returns null when the option carries no player", () => {
    expect(optionPlayerId(cardOpt("card_042#1"))).toBeNull();
  });
});

describe("revealedPlayerPickOptions (issue #861 — Foreshadowing pick-a-player)", () => {
  it("duel: 2 reveals enrich both options as card faces", () => {
    const p = prompt("CHOOSE_TARGET", [playerOpt("a1", "p1"), playerOpt("b1", "p2")]);
    expect(revealedPlayerPickOptions(p, [rev("p1", "card_001#1"), rev("p2", "card_002#2")])).toEqual([
      { id: "a1", instance: "card_001#1", player: "p1" },
      { id: "b1", instance: "card_002#2", player: "p2" },
    ]);
  });

  it("team-2v2: 4 reveals enrich all four options", () => {
    const p = prompt("CHOOSE_TARGET", [
      playerOpt("a1", "p1"),
      playerOpt("b1", "p2"),
      playerOpt("a2", "p3"),
      playerOpt("b2", "p4"),
    ]);
    expect(
      revealedPlayerPickOptions(p, [
        rev("p1", "card_001#1"),
        rev("p2", "card_002#1"),
        rev("p3", "card_003#1"),
        rev("p4", "card_004#1"),
      ]),
    ).toEqual([
      { id: "a1", instance: "card_001#1", player: "p1" },
      { id: "b1", instance: "card_002#1", player: "p2" },
      { id: "a2", instance: "card_003#1", player: "p3" },
      { id: "b2", instance: "card_004#1", player: "p4" },
    ]);
  });

  it("falls back to plain buttons when a data.player prompt has no reveals in its batch (Choose Opponent)", () => {
    const p = prompt("CHOOSE_TARGET", [playerOpt("a1", "p1"), playerOpt("b1", "p2")]);
    expect(revealedPlayerPickOptions(p, [])).toEqual([]);
  });

  it("a stale reveal from an earlier batch must not attach (keyed by promptId upstream)", () => {
    const p = prompt("CHOOSE_TARGET", [playerOpt("a1", "p1"), playerOpt("b1", "p2")]);
    expect(revealedPlayerPickOptions(p, [rev("p1", "card_001#1")])).toEqual([]);
  });

  it("falls back when only SOME players have reveals", () => {
    const p = prompt("CHOOSE_TARGET", [playerOpt("a1", "p1"), playerOpt("b1", "p2")]);
    expect(revealedPlayerPickOptions(p, [rev("p1", "card_001#1"), rev("p2", "card_002#1"), rev("p3", "card_003#1")])).toEqual(
      [
        { id: "a1", instance: "card_001#1", player: "p1" },
        { id: "b1", instance: "card_002#1", player: "p2" },
      ],
    );
  });

  it("a fighter-target CHOOSE_TARGET (no data.player) keeps its board flow", () => {
    const p = prompt("CHOOSE_TARGET", [{ id: "f1", label: "Cecil", data: { fighter: "f1" } }]);
    expect(revealedPlayerPickOptions(p, [rev("p1", "card_001#1")])).toEqual([]);
  });
});

// Issue #1691 — POMNI's *The Funny One!*: reveal the opponent's hand, then
// "how many? 0/1/2" (CHOOSE_OPTION, data.count), then one CHOOSE_TARGET per card.
describe("revealedHandPick", () => {
  const countOpt = (n: number): LegalOption => ({ id: String(n), label: String(n), data: { count: n } });
  const counts = (...ns: number[]) => prompt("CHOOSE_OPTION", ns.map(countOpt));
  const hand = (...cards: string[]) => cards.map((c) => rev("p2", c));

  it("fires for a count prompt whose batch revealed one opponent's hand", () => {
    expect(revealedHandPick(counts(0, 1, 2), hand("pl/hit#2", "pl/hit#3", "pl/plot#1"))).toEqual({
      owner: "p2",
      cards: ["pl/hit#2", "pl/hit#3", "pl/plot#1"],
      max: 2,
      countOptions: { 0: "0", 1: "1", 2: "2" },
    });
  });

  it("caps the max at what the engine offers for a 1-card hand", () => {
    expect(revealedHandPick(counts(0, 1), hand("pl/hit#2"))?.max).toBe(1);
  });

  it("never lets the max exceed the revealed hand", () => {
    expect(revealedHandPick(counts(0, 1, 2), hand("pl/hit#2"))?.max).toBe(1);
  });

  it("leaves a count prompt with no reveal in its batch as buttons (discard-N, reconnect)", () => {
    expect(revealedHandPick(counts(0, 1, 2), [])).toBeNull();
  });

  it("ignores a reveal of the chooser's own cards", () => {
    expect(revealedHandPick(counts(0, 1, 2), [rev("p1", "pl/hit#2")])).toBeNull();
  });

  it("ignores reveals from more than one seat (Foreshadowing's shape)", () => {
    expect(revealedHandPick(counts(0, 1), [rev("p2", "a/x#1"), rev("p3", "a/y#1")])).toBeNull();
  });

  it("needs EVERY option to be a count", () => {
    const mixed = prompt("CHOOSE_OPTION", [countOpt(0), countOpt(1), { id: "decline", label: "Decline" }]);
    expect(revealedHandPick(mixed, hand("pl/hit#2"))).toBeNull();
    const branches = prompt("CHOOSE_OPTION", [{ id: "a", label: "Draw", data: { branch: 0 } }]);
    expect(revealedHandPick(branches, hand("pl/hit#2"))).toBeNull();
  });

  it("only reads CHOOSE_OPTION prompts", () => {
    expect(revealedHandPick(prompt("CHOOSE_TARGET", [countOpt(0), countOpt(1)]), hand("pl/hit#2"))).toBeNull();
    expect(revealedHandPick(null, hand("pl/hit#2"))).toBeNull();
  });

  it("has nothing to offer when the only count is 0", () => {
    expect(revealedHandPick(counts(0), hand("pl/hit#2"))).toBeNull();
  });
});
