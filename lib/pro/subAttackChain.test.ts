/**
 * Sub-attack chain tracking (issue #596 ↔ engine #359). These prove the two halves
 * the client has to derive because the protocol carries neither:
 *
 *  - PARENT RECOVERY — the synthetic combat card has no `parentCard` on the wire, so
 *    the chain is attributed from the last REAL combat card the sub-attacker's owner
 *    revealed, remembered from the pre-batch view and then HELD across hits 2 and 3.
 *  - PROGRESS, without inventing a total — the followup queue drains one entry at a
 *    time, so "of up to 3" may only ever come from the card's PRINTED bound.
 *
 * Plus the compatibility floor: Grievous's lone "Fire, you fools!" droid shot must
 * still narrate exactly as it did before chains existed.
 */
import {
  EMPTY_SUB_ATTACK_CHAIN,
  SUB_ATTACK_CHAINS,
  advanceSubAttackChain,
  isSubAttackInstance,
  parentCardTitle,
  subAttackChainProgress,
} from "./subAttackChain";
import { CardMeta, GameEvent, PlayerView, ViewCombat, ViewFighter } from "./protocol";

const RUSH = "kenshiro/hokuto-hundred-fist-rush#1";
const FIRE = "grievous/fire-you-fools#1";
const SYNTHETIC = "sub-attack:p1/hero";

const CATALOG: Record<string, CardMeta> = {
  "kenshiro/hokuto-hundred-fist-rush": {
    title: "Hokuto: Hundred-Fist Rush",
    type: "attack",
    value: 3,
    boost: 0,
  },
  "grievous/fire-you-fools": { title: "Fire, you fools!", type: "scheme", value: null, boost: 2 },
};

const fighter = (over: Partial<ViewFighter> = {}): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Kenshiro",
  space: "s1",
  tailSpace: null,
  hp: 17,
  maxHp: 17,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

const combat = (over: Partial<ViewCombat> = {}): ViewCombat => ({
  attackerPlayer: "p1",
  defenderPlayer: "p2",
  attacker: "p1/hero",
  target: "p2/hero",
  stage: "AFTER",
  attackerCard: null,
  defenderCard: null,
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
  ...over,
});

/** Minimal view: only the fields the tracker reads (combat + fighters + catalog). */
const view = (c: ViewCombat | null): PlayerView =>
  ({
    you: "p1",
    catalog: CATALOG,
    combat: c,
    fighters: [fighter(), fighter({ id: "p2/hero", owner: "p2", name: "Thrall" })],
  }) as unknown as PlayerView;

const card = (instance: string) => ({ instance, role: "ATTACK" as const, boosts: [], effectiveValue: 3 });

const SUB_ATTACK = (attacker = "p1/hero"): GameEvent => ({
  type: "SUB_ATTACK_INITIATED",
  attacker,
  target: "p2/hero",
  value: 3,
});

describe("isSubAttackInstance", () => {
  it("recognizes the engine's synthetic instance and nothing else", () => {
    expect(isSubAttackInstance(SYNTHETIC)).toBe(true);
    expect(isSubAttackInstance(RUSH)).toBe(false);
  });
});

describe("parentCardTitle", () => {
  it("resolves the VERBATIM printed title — no value/boost stats appended", () => {
    expect(parentCardTitle(CATALOG, RUSH)).toBe("Hokuto: Hundred-Fist Rush");
    expect(parentCardTitle(CATALOG, RUSH)).not.toContain("(");
  });

  it("degrades to null for an unknown instance or none at all", () => {
    expect(parentCardTitle(CATALOG, "who/knows#1")).toBeNull();
    expect(parentCardTitle(CATALOG, null)).toBeNull();
  });
});

describe("advanceSubAttackChain", () => {
  it("attributes the first hit to the real card revealed in the PRE-batch view", () => {
    const parentCombat = view(combat({ attackerCard: card(RUSH) }));
    const subCombat = view(combat({ attackerCard: card(SYNTHETIC), stage: "COMMIT_DEFENSE" }));
    const state = advanceSubAttackChain(EMPTY_SUB_ATTACK_CHAIN, parentCombat, subCombat, [
      SUB_ATTACK(),
    ]);
    expect(state).toMatchObject({ parent: RUSH, hits: 1 });
  });

  it("holds that parent across hits 2 and 3, when only the synthetic card is on the table", () => {
    const parentCombat = view(combat({ attackerCard: card(RUSH) }));
    const subCombat = view(combat({ attackerCard: card(SYNTHETIC), stage: "COMMIT_DEFENSE" }));
    let s = advanceSubAttackChain(EMPTY_SUB_ATTACK_CHAIN, parentCombat, subCombat, [SUB_ATTACK()]);
    // the defense window / damage / cleanup of hit 1 — no new event, same combat
    s = advanceSubAttackChain(s, subCombat, view(combat({ attackerCard: card(SYNTHETIC) })), []);
    expect(s).toMatchObject({ parent: RUSH, hits: 1 });
    // hit 2, then hit 3 — the real card is long gone from every view by now
    s = advanceSubAttackChain(s, subCombat, subCombat, [SUB_ATTACK()]);
    s = advanceSubAttackChain(s, subCombat, subCombat, [SUB_ATTACK()]);
    expect(s).toMatchObject({ parent: RUSH, hits: 3 });
  });

  it("counts every followup a single batch drains", () => {
    const parentCombat = view(combat({ attackerCard: card(RUSH) }));
    const subCombat = view(combat({ attackerCard: card(SYNTHETIC) }));
    const s = advanceSubAttackChain(EMPTY_SUB_ATTACK_CHAIN, parentCombat, subCombat, [
      SUB_ATTACK(),
      SUB_ATTACK(),
    ]);
    expect(s.hits).toBe(2);
  });

  it("attributes to the SUB-ATTACKER's owner, not whoever attacked", () => {
    // p2 defended with a real card whose text opens a sub-attack by p2's fighter;
    // p1's attack card must not be credited.
    const parentCombat = view(
      combat({ attackerCard: card(RUSH), defenderCard: card(FIRE), defenderPlayer: "p2" })
    );
    const s = advanceSubAttackChain(
      EMPTY_SUB_ATTACK_CHAIN,
      parentCombat,
      view(combat({ attackerCard: card(SYNTHETIC) })),
      [SUB_ATTACK("p2/hero")]
    );
    expect(s.parent).toBe(FIRE);
  });

  it("resets when a real attack card is back on the table (the queue drained)", () => {
    const started = advanceSubAttackChain(
      EMPTY_SUB_ATTACK_CHAIN,
      view(combat({ attackerCard: card(RUSH) })),
      view(combat({ attackerCard: card(SYNTHETIC) })),
      [SUB_ATTACK()]
    );
    const next = advanceSubAttackChain(
      started,
      view(combat({ attackerCard: card(SYNTHETIC) })),
      view(combat({ attackerCard: card(RUSH) })),
      []
    );
    expect(next).toMatchObject({ parent: null, hits: 0 });
  });

  it("resets once combat is over entirely", () => {
    const started = advanceSubAttackChain(
      EMPTY_SUB_ATTACK_CHAIN,
      view(combat({ attackerCard: card(RUSH) })),
      view(combat({ attackerCard: card(SYNTHETIC) })),
      [SUB_ATTACK()]
    );
    expect(advanceSubAttackChain(started, null, view(null), [])).toMatchObject({
      parent: null,
      hits: 0,
    });
  });

  it("still counts hits when the parent card is unrecoverable (no pre-batch view)", () => {
    // A mid-chain reconnect: the parent combat was never seen by this client.
    const s = advanceSubAttackChain(
      EMPTY_SUB_ATTACK_CHAIN,
      null,
      view(combat({ attackerCard: card(SYNTHETIC) })),
      [SUB_ATTACK()]
    );
    expect(s).toMatchObject({ parent: null, hits: 1 });
  });

  it("never adopts a synthetic card as a parent candidate", () => {
    const subCombat = view(combat({ attackerCard: card(SYNTHETIC) }));
    const s = advanceSubAttackChain(EMPTY_SUB_ATTACK_CHAIN, subCombat, subCombat, [SUB_ATTACK()]);
    expect(s.parent).toBeNull();
    expect(Object.values(s.candidates)).not.toContain(SYNTHETIC);
  });
});

describe("subAttackChainProgress", () => {
  it("narrates a registered chain from hit 1, bounded by the card's PRINTED stages", () => {
    expect(subAttackChainProgress("Hokuto: Hundred-Fist Rush", 1)).toMatchObject({
      label: "Hundred-Fist Rush",
      hit: 1,
      max: 3,
      text: "Hundred-Fist Rush — chain hit 1 of up to 3",
    });
    expect(subAttackChainProgress("Hokuto: Hundred-Fist Rush", 3)!.text).toBe(
      "Hundred-Fist Rush — chain hit 3 of up to 3"
    );
  });

  it("matches the title case-insensitively (art/catalog casing is verbatim, typos included)", () => {
    expect(subAttackChainProgress("hokuto: hundred-fist rush", 2)!.max).toBe(3);
  });

  it("says nothing for a lone hit from an unregistered card — Grievous reads as before", () => {
    expect(subAttackChainProgress("Fire, you fools!", 1)).toBeNull();
    expect(subAttackChainProgress(null, 1)).toBeNull();
  });

  it("narrates ANY card from hit 2, without claiming a total it cannot know", () => {
    expect(subAttackChainProgress("Fire, you fools!", 2)).toMatchObject({
      hit: 2,
      max: null,
      text: "Fire, you fools! — chain hit 2",
    });
    expect(subAttackChainProgress(null, 2)!.text).toBe("Bonus attack — chain hit 2");
  });

  it("is null below the first hit (no chain in progress)", () => {
    expect(subAttackChainProgress("Hokuto: Hundred-Fist Rush", 0)).toBeNull();
  });
});

describe("SUB_ATTACK_CHAINS registry", () => {
  it("declares Hundred-Fist Rush with the verbatim title the deck snapshot ships", () => {
    const e = SUB_ATTACK_CHAINS.find((x) => x.heroes.includes("kenshiro"));
    expect(e).toBeDefined();
    expect(e!.title).toBe("Hokuto: Hundred-Fist Rush");
    expect(e!.max).toBe(3);
  });
});
