/**
 * Board-object presentation registry (issue #553, protocol v26). These pin the four
 * things the rest of the client leans on: totems render EXACTLY as they did pre-v26,
 * corpses are a distinct muted disc, an unmapped future kind still renders something,
 * and the countdown distinguishes PERMANENT (field absent) from "gone next turn" (0).
 */
import {
  BOARD_OBJECT_VISUALS,
  UNKNOWN_OBJECT,
  boardObjectCountdown,
  boardObjectOriginFighter,
  boardObjectTitle,
  boardObjectVisualFor,
  disambiguateLabels,
} from "./boardObjects";
import type { ViewToken } from "./protocol";

const token = (over: Partial<ViewToken> = {}): ViewToken => ({
  id: "corpse-1",
  kind: "corpse",
  owner: "p1",
  space: "A1",
  ...over,
});

describe("BOARD_OBJECT_VISUALS registry", () => {
  it("keeps the totem's pre-v26 diamond, unmuted", () => {
    const totem = BOARD_OBJECT_VISUALS.totem;
    expect(totem.shape).toBe("diamond");
    expect(totem.muted).toBe(false);
    expect(totem.noun).toBe("totem");
  });

  it("draws a corpse as a MUTED DISC so it reads as the body it was", () => {
    const corpse = BOARD_OBJECT_VISUALS.corpse;
    expect(corpse.shape).toBe("disc");
    expect(corpse.muted).toBe(true);
    expect(corpse.noun).toBe("corpse");
  });

  it("resolves a kind through the registry", () => {
    expect(boardObjectVisualFor(token({ kind: "totem" })).label).toBe("Totem");
    expect(boardObjectVisualFor(token()).label).toBe("Corpse");
  });

  it("still renders SOMETHING for a kind this client does not map (protocol rule)", () => {
    // Deliberately a kind the union will grow into later (walls/traps/decoys).
    const wall = boardObjectVisualFor({ kind: "wall" as ViewToken["kind"] });
    expect(wall).toBe(UNKNOWN_OBJECT);
    // The point of the fallback: it is NOT undefined, so the object cannot silently
    // disappear from the board the way an unknown fighter STATUS is dropped.
    expect(wall.label.length).toBeGreaterThan(0);
  });
});

describe("boardObjectCountdown", () => {
  it("returns null for a PERMANENT object (field absent, every totem)", () => {
    expect(boardObjectCountdown(token({ kind: "totem" }))).toBeNull();
  });

  it("counts one pip per remaining owner turn", () => {
    expect(boardObjectCountdown(token({ ownerTurnsRemaining: 3 }))).toEqual({
      remaining: 3,
      pips: 3,
      expiring: false,
    });
  });

  it("treats 0 as EXPIRING, never as permanent", () => {
    const c = boardObjectCountdown(token({ ownerTurnsRemaining: 0 }));
    expect(c).not.toBeNull();
    expect(c!.expiring).toBe(true);
    expect(c!.pips).toBe(0);
  });
});

describe("boardObjectOriginFighter", () => {
  it("reads the fighter id out of the provenance string", () => {
    expect(boardObjectOriginFighter(token({ origin: "corpse-of:p1/sidekick-2" }))).toBe(
      "p1/sidekick-2"
    );
  });

  it("splits on the FIRST separator only, so a ':' inside a fighter id survives", () => {
    expect(boardObjectOriginFighter(token({ origin: "corpse-of:p1:sidekick:2" }))).toBe(
      "p1:sidekick:2"
    );
  });

  it("is null for a card-placed object (no origin) and for a malformed one", () => {
    expect(boardObjectOriginFighter(token({ kind: "totem" }))).toBeNull();
    expect(boardObjectOriginFighter(token({ origin: "corpse-of:" }))).toBeNull();
    expect(boardObjectOriginFighter(token({ origin: "no-separator" }))).toBeNull();
  });
});

describe("disambiguateLabels", () => {
  it("numbers repeated labels — two identical corpses never read as one button", () => {
    const out = disambiguateLabels([
      { id: "corpse-0", label: "Corpse of Larry at a3 · 3 turns left" },
      { id: "corpse-1", label: "Corpse of Larry at a3 · 3 turns left" },
    ]);
    expect(out.map((o) => o.label)).toEqual([
      "Corpse of Larry at a3 · 3 turns left (1)",
      "Corpse of Larry at a3 · 3 turns left (2)",
    ]);
  });

  it("leaves already-distinct labels untouched (inert for every other prompt)", () => {
    const opts = [
      { id: "a", label: "Corpse of Larry at a3 · 3 turns left" },
      { id: "b", label: "Corpse of Larry at a5 · 1 turn left" },
      { id: "decline", label: "Decline" },
    ];
    expect(disambiguateLabels(opts)).toEqual(opts);
  });

  it("numbers only the colliding group, not the whole list", () => {
    const out = disambiguateLabels([
      { id: "a", label: "same" },
      { id: "b", label: "unique" },
      { id: "c", label: "same" },
    ]);
    expect(out.map((o) => o.label)).toEqual(["same (1)", "unique", "same (2)"]);
  });
});

describe("boardObjectTitle", () => {
  it("names the fighter and the turns left", () => {
    const title = boardObjectTitle(
      token({ origin: "corpse-of:p1/sidekick-2", ownerTurnsRemaining: 2 }),
      "You",
      "Larry"
    );
    expect(title).toBe("Corpse of Larry (You) — 2 owner turns left");
  });

  it("singularises the last full turn", () => {
    expect(boardObjectTitle(token({ ownerTurnsRemaining: 1 }), "p1")).toContain("1 owner turn left");
  });

  it("says when an expiring object goes, instead of showing a bare 0", () => {
    expect(boardObjectTitle(token({ ownerTurnsRemaining: 0 }), "p1")).toContain(
      "removed at the start of its owner's next turn"
    );
  });

  it("omits the countdown clause entirely for a permanent object", () => {
    expect(boardObjectTitle(token({ kind: "totem" }), "You")).toBe("Totem (You)");
  });
});
