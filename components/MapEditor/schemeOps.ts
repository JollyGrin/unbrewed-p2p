/**
 * Curated scheme-item effect vocabulary for the map editor (unbrewed-p2p-693).
 *
 * A scheme item's `ops` is the server's card-effect DSL — an open vocabulary the
 * client knows nothing about, executed at USE time, so a misshapen op only fails
 * once someone plays the map. This module is the narrow, known-good slice a
 * community mapmaker can author from a menu: three effects, each with a fixed op
 * shape verified against the engine DSL (`heal` / `draw` / `search`), plus the
 * player-facing sentence that goes in `ProMapItem.text`.
 *
 * Deliberately lossless in BOTH directions: `effectsFromOps` re-derives the
 * builder state from exported JSON so a round-trip lands back in the menu rather
 * than in the raw-JSON escape hatch — and it refuses anything it doesn't emit
 * itself (extra keys included), so hand-written advanced ops are never silently
 * narrowed into a shape that means something else.
 *
 * Pure + framework-free: the panel, the export path and the validator all read
 * from here, and it unit-tests without React.
 */
import type { Json } from "@/lib/pro/protocol";

/** One authored effect. `amount`-less kinds carry no fields beyond `kind`. */
export type SchemeEffect =
  | { kind: "heal"; amount: number }
  | { kind: "draw"; amount: number }
  | { kind: "search" };

export type SchemeEffectKind = SchemeEffect["kind"];

/** Menu metadata — the panel renders straight off this list, in order. */
export interface SchemeEffectOption {
  kind: SchemeEffectKind;
  /** menu wording (the ticket's table, verbatim) */
  label: string;
  /** amount input label, or undefined for a fixed effect */
  amountLabel?: string;
  defaultAmount?: number;
}

export const SCHEME_EFFECT_OPTIONS: readonly SchemeEffectOption[] = [
  { kind: "heal", label: "Recover health", amountLabel: "amount", defaultAmount: 2 },
  { kind: "draw", label: "Draw cards", amountLabel: "amount", defaultAmount: 1 },
  { kind: "search", label: "Return a card from your discard pile to your hand" },
];

/** The effect a brand-new scheme item is born with, so it is valid on creation. */
export const DEFAULT_SCHEME_EFFECT: SchemeEffect = { kind: "draw", amount: 1 };

export const optionFor = (kind: SchemeEffectKind): SchemeEffectOption =>
  SCHEME_EFFECT_OPTIONS.find((o) => o.kind === kind)!;

/** A fresh effect of `kind` at its default amount. */
export const newEffect = (kind: SchemeEffectKind): SchemeEffect => {
  const amount = optionFor(kind).defaultAmount ?? 1;
  return kind === "search" ? { kind } : { kind, amount };
};

const clampAmount = (n: number): number =>
  Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;

// ---------------------------------------------------------------------------
// effects -> ops (the only shapes the builder is allowed to emit)
// ---------------------------------------------------------------------------

/**
 * One effect -> one engine op. `SELF` inside a scheme item's run is the fighter
 * that used the token (the engine sets `scope.self` to it) and its controller,
 * so heal/draw both land on the user.
 */
export const effectToOp = (effect: SchemeEffect): Json => {
  switch (effect.kind) {
    case "heal":
      return { op: "heal", target: "SELF", amount: clampAmount(effect.amount) };
    case "draw":
      return { op: "draw", who: "SELF", amount: clampAmount(effect.amount) };
    case "search":
      return { op: "search", from: "DISCARD" };
  }
};

/** Stacked effects concatenate, in the order the author listed them. */
export const opsFromEffects = (effects: readonly SchemeEffect[]): Json =>
  effects.map(effectToOp) as Json;

// ---------------------------------------------------------------------------
// ops -> effects (round-trip; null = "not something this builder wrote")
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Exact-shape match: same key set, same literal selectors, integer amount ≥ 1. */
const opToEffect = (raw: unknown): SchemeEffect | null => {
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw).sort().join(",");
  const amount = raw.amount;
  const okAmount = typeof amount === "number" && Number.isInteger(amount) && amount >= 1;
  if (raw.op === "heal" && keys === "amount,op,target" && raw.target === "SELF" && okAmount)
    return { kind: "heal", amount: amount as number };
  if (raw.op === "draw" && keys === "amount,op,who" && raw.who === "SELF" && okAmount)
    return { kind: "draw", amount: amount as number };
  if (raw.op === "search" && keys === "from,op" && raw.from === "DISCARD")
    return { kind: "search" };
  return null;
};

/**
 * Builder state for an item's `ops`, or `null` when the body is outside the
 * curated vocabulary (the panel then falls back to the Advanced textarea).
 *
 * Absent/empty ops are NOT "advanced" — they are an empty builder, which is what
 * the reporter's map and every pre-#693 scheme item look like. The author sees an
 * effect menu with nothing picked yet plus the blocking export error, rather than
 * a raw-JSON box with no vocabulary.
 */
export const effectsFromOps = (ops: Json | undefined): SchemeEffect[] | null => {
  if (ops === undefined || ops === null) return [];
  if (!Array.isArray(ops)) return null;
  if (ops.length === 0) return [];
  const out: SchemeEffect[] = [];
  for (const op of ops) {
    const e = opToEffect(op);
    if (!e) return null;
    out.push(e);
  }
  return out;
};

/**
 * Server-side well-formedness of an ops body, mirrored client-side: the engine
 * hard-rejects a scheme item whose `ops` is missing/empty at ROOM CREATION, so
 * the editor blocks the export instead of letting the author find out there.
 * Anything that isn't a non-empty array of `{op: string, …}` objects counts as
 * invalid (a bare string, `[1,2]`, `{}` — all things the raw textarea accepts).
 */
export const isSchemeOpsValid = (ops: Json | undefined): boolean =>
  Array.isArray(ops) &&
  ops.length > 0 &&
  ops.every((o) => isRecord(o) && typeof o.op === "string" && o.op.length > 0);

// ---------------------------------------------------------------------------
// effects -> player-facing text (ProMapItem.text)
// ---------------------------------------------------------------------------

/** The sentence for ONE effect, written from the using player's point of view. */
export const effectSentence = (effect: SchemeEffect): string => {
  switch (effect.kind) {
    case "heal":
      return `Recover ${clampAmount(effect.amount)} health.`;
    case "draw": {
      const n = clampAmount(effect.amount);
      return `Draw ${n} card${n === 1 ? "" : "s"}.`;
    }
    case "search":
      return "Return a card from your discard pile to your hand.";
  }
};

/** The whole item's effect text — one sentence per effect, in order. */
export const effectsText = (effects: readonly SchemeEffect[]): string =>
  effects.map(effectSentence).join(" ");

/** Auto-generated text for an ops body, or "" when it isn't builder-shaped. */
export const textForOps = (ops: Json | undefined): string => {
  const effects = effectsFromOps(ops);
  return effects && effects.length ? effectsText(effects) : "";
};
