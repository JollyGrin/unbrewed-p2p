/**
 * The curated scheme-effect vocabulary (unbrewed-p2p-693). The op shapes here are
 * the contract with the pro-server's effect DSL — `heal`/`draw`/`search` were read
 * off engine/dsl.ts, and a scheme item's run sets `scope.self` to the fighter that
 * used the token, which is what makes `SELF` mean "the user" for both heal and draw.
 * If these literals drift, maps authored in the editor break at USE time (not load
 * time), so they are asserted verbatim rather than via the builder's own helpers.
 */
import {
  DEFAULT_SCHEME_EFFECT,
  SCHEME_EFFECT_OPTIONS,
  effectSentence,
  effectToOp,
  effectsFromOps,
  effectsText,
  isSchemeOpsValid,
  newEffect,
  opsFromEffects,
  textForOps,
} from "./schemeOps";

describe("effect -> op emission", () => {
  it("emits the engine's heal shape", () => {
    expect(effectToOp({ kind: "heal", amount: 2 })).toEqual({ op: "heal", target: "SELF", amount: 2 });
  });
  it("emits the engine's draw shape", () => {
    expect(effectToOp({ kind: "draw", amount: 3 })).toEqual({ op: "draw", who: "SELF", amount: 3 });
  });
  it("emits the engine's discard-search shape", () => {
    expect(effectToOp({ kind: "search" })).toEqual({ op: "search", from: "DISCARD" });
  });
  it("clamps a junk amount to a legal integer ≥ 1", () => {
    expect(effectToOp({ kind: "heal", amount: 0 })).toMatchObject({ amount: 1 });
    expect(effectToOp({ kind: "draw", amount: 2.7 })).toMatchObject({ amount: 2 });
    expect(effectToOp({ kind: "draw", amount: NaN })).toMatchObject({ amount: 1 });
  });
  it("stacks effects in the authored order", () => {
    expect(opsFromEffects([{ kind: "heal", amount: 2 }, { kind: "search" }])).toEqual([
      { op: "heal", target: "SELF", amount: 2 },
      { op: "search", from: "DISCARD" },
    ]);
  });
  it("covers every menu entry", () => {
    for (const option of SCHEME_EFFECT_OPTIONS) {
      const op = effectToOp(newEffect(option.kind)) as { op: string };
      expect(typeof op.op).toBe("string");
    }
  });
});

describe("ops -> effect round-trip", () => {
  it("re-derives builder state from exported ops (every menu entry, stacked)", () => {
    const effects = [
      { kind: "heal", amount: 2 },
      { kind: "draw", amount: 1 },
      { kind: "search" },
    ] as const;
    expect(effectsFromOps(opsFromEffects([...effects]))).toEqual([...effects]);
  });

  it("treats absent/empty ops as an EMPTY builder, not as advanced JSON", () => {
    // The reporter's map is exactly this: a scheme item the old editor exported
    // with `ops: []`. It must reopen in the effect menu, not the raw textarea.
    expect(effectsFromOps([])).toEqual([]);
    expect(effectsFromOps(undefined)).toEqual([]);
  });

  it("refuses ops it did not write (advanced fallback)", () => {
    expect(effectsFromOps([{ op: "dealDamage", amount: 1 }])).toBeNull();
    expect(effectsFromOps([{ op: "heal", target: "OPPOSING_FIGHTER", amount: 2 }])).toBeNull();
    expect(effectsFromOps([{ op: "draw", who: "OPPONENT", amount: 1 }])).toBeNull();
    expect(effectsFromOps([{ op: "search", from: "DECK" }])).toBeNull();
    expect(effectsFromOps("nope")).toBeNull();
    // one bad op poisons the whole body — a partial menu would misrepresent it
    expect(effectsFromOps([{ op: "heal", target: "SELF", amount: 2 }, { op: "endTurn" }])).toBeNull();
  });

  it("refuses a builder shape carrying EXTRA keys (never silently narrows)", () => {
    expect(effectsFromOps([{ op: "search", from: "DISCARD", filter: { type: "attack" } }])).toBeNull();
    expect(effectsFromOps([{ op: "draw", who: "SELF", amount: 1, andThen: [] }])).toBeNull();
  });

  it("refuses a non-integer / sub-1 amount", () => {
    expect(effectsFromOps([{ op: "heal", target: "SELF", amount: 0 }])).toBeNull();
    expect(effectsFromOps([{ op: "draw", who: "SELF", amount: 1.5 }])).toBeNull();
  });
});

describe("isSchemeOpsValid (mirrors the engine's load-time rejection)", () => {
  it("accepts any non-empty array of op objects, builder-shaped or not", () => {
    expect(isSchemeOpsValid([{ op: "heal", target: "SELF", amount: 2 }])).toBe(true);
    expect(isSchemeOpsValid([{ op: "dealDamage", amount: 1 }])).toBe(true);
  });
  it("rejects what the server rejects", () => {
    expect(isSchemeOpsValid([])).toBe(false);
    expect(isSchemeOpsValid(undefined)).toBe(false);
    expect(isSchemeOpsValid("[]")).toBe(false);
    expect(isSchemeOpsValid([1, 2])).toBe(false);
    expect(isSchemeOpsValid([{}])).toBe(false);
    expect(isSchemeOpsValid([{ op: "" }])).toBe(false);
  });
});

describe("player-facing sentences", () => {
  it("writes one sentence per effect, from the user's point of view", () => {
    expect(effectSentence({ kind: "heal", amount: 2 })).toBe("Recover 2 health.");
    expect(effectSentence({ kind: "draw", amount: 1 })).toBe("Draw 1 card.");
    expect(effectSentence({ kind: "draw", amount: 2 })).toBe("Draw 2 cards.");
    expect(effectSentence({ kind: "search" })).toBe(
      "Return a card from your discard pile to your hand."
    );
  });
  it("joins a stack into the ticket's wording", () => {
    expect(effectsText([{ kind: "heal", amount: 2 }, { kind: "search" }])).toBe(
      "Recover 2 health. Return a card from your discard pile to your hand."
    );
  });
  it("generates text straight from ops, and nothing from advanced ops", () => {
    expect(textForOps([{ op: "heal", target: "SELF", amount: 2 }])).toBe("Recover 2 health.");
    expect(textForOps([{ op: "dealDamage", amount: 1 }])).toBe("");
    expect(textForOps([])).toBe("");
  });
});

it("the default effect a new scheme item is born with is itself valid", () => {
  const ops = opsFromEffects([DEFAULT_SCHEME_EFFECT]);
  expect(isSchemeOpsValid(ops)).toBe(true);
  expect(effectsFromOps(ops)).toEqual([DEFAULT_SCHEME_EFFECT]);
});
