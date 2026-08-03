/**
 * Stable squad numbering (issue #560). The player report: with six identical
 * "Clone Trooper" tokens there is no way to tell which is which, and it matters
 * mechanically — the hero ability summons in the ATTACKER's zone, and "Same heart,
 * same blood" hinges on which clone sits at 1 HP. The old #161/v28 numbering was
 * transient (prompt-scoped) and reshuffled between prompts, so these prove the
 * replacement: numbers come from the engine id, they hold still as clones are
 * summoned and defeated, they are per-side, and a unique-named fighter gets none.
 */
import { badgedFighterName, fighterIdNumber, fighterName, squadBadges } from "./squadNumbers";
import type { ViewFighter } from "./protocol";

const fighter = (over: Partial<ViewFighter> = {}): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Clone Troopers",
  space: "A1",
  tailSpace: null,
  hp: 2,
  maxHp: 2,
  reach: "RANGED",
  size: "NORMAL",
  defeated: false,
  ...over,
});

/** One clone of the DJQB squad, on board unless told otherwise. */
const clone = (n: number, over: Partial<ViewFighter> = {}): ViewFighter =>
  fighter({
    id: `p1/sidekick-${n}`,
    kind: "SIDEKICK",
    name: "Clone Trooper",
    space: `A${n}`,
    hp: 1,
    maxHp: 1,
    ...over,
  });

describe("fighterIdNumber", () => {
  it("reads the sidekick index off an engine id", () => {
    expect(fighterIdNumber("p1/sidekick-1")).toBe(1);
    expect(fighterIdNumber("p2/sidekick-6")).toBe(6);
    expect(fighterIdNumber("player-abc/sidekick-12")).toBe(12);
  });

  it("has no number for a hero or an id off that shape", () => {
    expect(fighterIdNumber("p1/hero")).toBeNull();
    expect(fighterIdNumber("p1/sidekick")).toBeNull();
    expect(fighterIdNumber("weird")).toBeNull();
  });
});

describe("squadBadges", () => {
  it("numbers every same-named board-mate off its engine id", () => {
    const badges = squadBadges([fighter(), clone(1), clone(2), clone(3)]);
    expect(badges).toStrictEqual({
      "p1/sidekick-1": 1,
      "p1/sidekick-2": 2,
      "p1/sidekick-3": 3,
    });
  });

  it("leaves the hero unbadged — a distinct name and commander token art carry it", () => {
    const badges = squadBadges([fighter(), clone(1), clone(2)]);
    expect(badges["p1/hero"]).toBeUndefined();
  });

  it("holds numbers still as clones are defeated and summoned (the whole point)", () => {
    // Clone 2 dies; 1 and 3 keep their numbers rather than renumbering to 1,2 —
    // so the clone a player damaged to 1 HP is still "Clone Trooper 3" next turn.
    const after = squadBadges([clone(1), clone(2, { defeated: true, space: null }), clone(3)]);
    expect(after).toStrictEqual({ "p1/sidekick-1": 1, "p1/sidekick-3": 3 });
    // The hero ability then summons a fresh clone; nobody else shifts.
    const resummoned = squadBadges([
      clone(1),
      clone(2, { defeated: true, space: null }),
      clone(3),
      clone(4),
    ]);
    expect(resummoned).toStrictEqual({
      "p1/sidekick-1": 1,
      "p1/sidekick-3": 3,
      "p1/sidekick-4": 4,
    });
  });

  it("does not badge a lone survivor — nothing left to disambiguate", () => {
    const badges = squadBadges([
      clone(1),
      clone(2, { defeated: true, space: null }),
      clone(3, { defeated: true, space: null }),
    ]);
    expect(badges).toStrictEqual({});
  });

  it("renders a single-sidekick deck exactly as before: no badge", () => {
    const badges = squadBadges([
      fighter({ id: "p1/hero", name: "Mandalorian" }),
      fighter({ id: "p1/sidekick-1", kind: "SIDEKICK", name: "The Child", space: "B2" }),
    ]);
    expect(badges).toStrictEqual({});
  });

  it("leaves differently-named sidekicks of one deck alone", () => {
    const badges = squadBadges([
      fighter({ id: "p1/sidekick-1", kind: "SIDEKICK", name: "Raptor", space: "B1" }),
      fighter({ id: "p1/sidekick-2", kind: "SIDEKICK", name: "Wolf", space: "B2" }),
    ]);
    expect(badges).toStrictEqual({});
  });

  it("numbers per side, so a mirror match doesn't number one seat against the other", () => {
    const mine = fighter({ id: "p1/sidekick-1", kind: "SIDEKICK", name: "Raptor", space: "B1" });
    const theirs = fighter({
      id: "p2/sidekick-1",
      owner: "p2",
      kind: "SIDEKICK",
      name: "Raptor",
      space: "C1",
    });
    expect(squadBadges([mine, theirs])).toStrictEqual({});
    // …and each side's own pair still numbers independently.
    const theirs2 = { ...theirs, id: "p2/sidekick-2", space: "C2" };
    expect(squadBadges([mine, theirs, theirs2])).toStrictEqual({
      "p2/sidekick-1": 1,
      "p2/sidekick-2": 2,
    });
  });

  it("badges both sides' squads at once (you have to point at THEIR clone too)", () => {
    const badges = squadBadges([
      clone(1),
      clone(2),
      fighter({ id: "p2/sidekick-1", owner: "p2", kind: "SIDEKICK", name: "Larry", space: "C1" }),
      fighter({ id: "p2/sidekick-2", owner: "p2", kind: "SIDEKICK", name: "Larry", space: "C2" }),
    ]);
    expect(badges).toStrictEqual({
      "p1/sidekick-1": 1,
      "p1/sidekick-2": 2,
      "p2/sidekick-1": 1,
      "p2/sidekick-2": 2,
    });
  });

  it("ignores an off-board sibling — a badge must point at a visible token", () => {
    expect(squadBadges([clone(1), clone(2, { space: null })])).toStrictEqual({});
  });

  it("includeOffBoard keeps a just-defeated clone nameable for its own log line", () => {
    const badges = squadBadges([clone(1), clone(2, { defeated: true, space: null })], {
      includeOffBoard: true,
    });
    expect(badges).toStrictEqual({ "p1/sidekick-1": 1, "p1/sidekick-2": 2 });
  });

  it("falls back to a deterministic 1..N when an id carries no distinct index", () => {
    const odd = (id: string, space: string) =>
      fighter({ id, kind: "SIDEKICK", name: "Outlaw", space });
    expect(squadBadges([odd("p1/goon-b", "B2"), odd("p1/goon-a", "B1")])).toStrictEqual({
      "p1/goon-a": 1,
      "p1/goon-b": 2,
    });
  });
});

describe("fighterName / badgedFighterName", () => {
  const roster = [fighter(), clone(1), clone(2)];
  const badges = squadBadges(roster);

  it("names a fighter from the view", () => {
    expect(fighterName(roster, "p1/sidekick-2")).toBe("Clone Trooper");
    expect(fighterName(roster, "p1/hero")).toBe("Clone Troopers");
  });

  it("falls back to the id tail for a fighter the view doesn't know", () => {
    expect(fighterName(roster, "p9/sidekick-4")).toBe("sidekick-4");
    expect(fighterName(roster, "mystery")).toBe("mystery");
  });

  it("appends the stable number, so chooser and log agree with the board badge", () => {
    expect(badgedFighterName(roster, badges, "p1/sidekick-2")).toBe("Clone Trooper 2");
    expect(badgedFighterName(roster, badges, "p1/hero")).toBe("Clone Troopers");
  });

  it("leaves an unbadged fighter's label untouched", () => {
    const solo = [fighter({ id: "p1/sidekick-1", kind: "SIDEKICK", name: "The Child", space: "B2" })];
    expect(badgedFighterName(solo, squadBadges(solo), "p1/sidekick-1")).toBe("The Child");
  });
});
