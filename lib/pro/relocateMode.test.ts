import { deriveRelocateMode, resolveRelocateBoardClick } from "./relocateMode";
import { Action, SpaceId } from "./protocol";

// The server's offers for the selected fighter, by origin space — one action per
// candidate origin (engine #535). S9 is adjacent to the fighter (a free step away
// AND a legal origin); S12 is a far own-zone space.
const origins = new Map<SpaceId, Action>([
  ["s9", { type: "RELOCATE_FIGHTER", player: "p1", fighter: "p1/hero", space: "s9" }],
  ["s12", { type: "RELOCATE_FIGHTER", player: "p1", fighter: "p1/hero", space: "s12" }],
]);

describe("resolveRelocateBoardClick — the dock-armed relocate mode (p2p #747 review)", () => {
  it("unarmed click on a gold+dashed space is the ordinary board answer — no action", () => {
    // s9 is both a gold step destination and a relocation origin; unarmed, the
    // board click must reach the step machine / far-preview untouched, and the
    // outcome carries no action to send. This pins the removal of the bare
    // board-click relocate from the first cut of #748.
    const click = resolveRelocateBoardClick({ armed: false, space: "s9", originActions: origins });
    expect(click).toEqual({ kind: "board" });
    expect(click.kind !== "relocate").toBe(true);
  });

  it("armed click on an offered origin sends exactly one RELOCATE_FIGHTER — the offered action", () => {
    const click = resolveRelocateBoardClick({ armed: true, space: "s12", originActions: origins });
    expect(click).toEqual({
      kind: "relocate",
      action: { type: "RELOCATE_FIGHTER", player: "p1", fighter: "p1/hero", space: "s12" },
    });
  });

  it("armed click on a space with no offer does nothing (only dashed spaces are clickable)", () => {
    const click = resolveRelocateBoardClick({ armed: true, space: "s7", originActions: origins });
    expect(click).toEqual({ kind: "ignored" });
  });

  it("armed click on an origin forwards the exact server offer, never a synthesized one", () => {
    // The offer object itself is what rides to sendAction (seat + fighter + space
    // verbatim), mirroring every other dock/board affordance.
    const offer: Action = { type: "RELOCATE_FIGHTER", player: "p1", fighter: "p1/hero", space: "s9" };
    const click = resolveRelocateBoardClick({
      armed: true,
      space: "s9",
      originActions: new Map([["s9", offer]]),
    });
    expect(click.kind === "relocate" && click.action).toBe(offer);
  });
});

// ---------------------------------------------------------------------------
// deriveRelocateMode — the dock rows (#764)
// ---------------------------------------------------------------------------

const offer = (fighter: string, space: string): Action => ({
  type: "RELOCATE_FIGHTER",
  player: "p1",
  fighter,
  space,
});
const move = (fighter: string): Action => ({
  type: "MOVE_FIGHTER",
  player: "p1",
  fighter,
  path: ["s1"],
});
// Jason is a solo seat: one fighter, several candidate origins.
const jason = [offer("p1/hero", "s9"), offer("p1/hero", "s12"), move("p1/hero")];
const names: Record<string, string> = { "p1/hero": "Jason Voorhees", "p1/sidekick-1": "Camper" };
const nameOf = (id: string) => names[id] ?? id;

describe("deriveRelocateMode — the arm rows come from the OFFERS, not the selection (#764)", () => {
  it("renders the row with NO fighter selected — the bug Dean hit on Jason", () => {
    // This is the whole ticket: clicking Maneuver offered RELOCATE_FIGHTER
    // immediately, but #747 derived the row from `selectedFighter`, so on a solo
    // seat the affordance only appeared after clicking the one token on the
    // board and the feature read as broken.
    const mode = deriveRelocateMode({
      turnPhase: "MANEUVER_MOVE",
      legalActions: jason,
      armed: null,
      nameOf,
    });
    expect(mode.rows).toEqual([
      { fighter: "p1/hero", armed: false, label: "Start maneuver elsewhere" },
    ]);
    expect(mode.armedTarget).toBeNull();
  });

  it("one fighter with offers keeps #747's copy — no name in the label", () => {
    const mode = deriveRelocateMode({
      turnPhase: "MANEUVER_MOVE",
      legalActions: jason,
      armed: "p1/hero",
      nameOf,
    });
    expect(mode.rows.map((r) => r.label)).toEqual([
      "Pick a dashed space to start from — click to cancel",
    ]);
  });

  it("arming a row exposes exactly that fighter's offered origins, by space", () => {
    const mode = deriveRelocateMode({
      turnPhase: "MANEUVER_MOVE",
      legalActions: jason,
      armed: "p1/hero",
      nameOf,
    });
    expect(mode.rows[0].armed).toBe(true);
    expect(mode.armedTarget?.fighter).toBe("p1/hero");
    expect([...(mode.armedTarget?.originActions.keys() ?? [])]).toEqual(["s9", "s12"]);
    // the offer object itself rides to sendAction — never a synthesized one
    expect(mode.armedTarget?.originActions.get("s9")).toBe(jason[0]);
  });

  it("two fighters with offers get one row each, NAMED, and only the armed one carries origins", () => {
    // Keyed on the offers, never on \"is the seat solo\": a second relocating
    // fighter must be tellable apart in the dock.
    const mode = deriveRelocateMode({
      turnPhase: "MANEUVER_MOVE",
      legalActions: [offer("p1/hero", "s9"), offer("p1/sidekick-1", "s3"), offer("p1/hero", "s12")],
      armed: "p1/sidekick-1",
      nameOf,
    });
    expect(mode.rows).toEqual([
      { fighter: "p1/hero", armed: false, label: "Start Jason Voorhees's maneuver elsewhere" },
      {
        fighter: "p1/sidekick-1",
        armed: true,
        label: "Pick a dashed space to start Camper from — click to cancel",
      },
    ]);
    expect([...(mode.armedTarget?.originActions.keys() ?? [])]).toEqual(["s3"]);
  });

  it("no relocation offers ⇒ zero rows and nothing armed (an unchanged dock for every other deck)", () => {
    expect(
      deriveRelocateMode({
        turnPhase: "MANEUVER_MOVE",
        legalActions: [move("p1/hero")],
        armed: null,
        nameOf,
      })
    ).toEqual({ rows: [], armedTarget: null });
  });

  it("outside MANEUVER_MOVE there is no row, whatever legalActions says", () => {
    expect(
      deriveRelocateMode({ turnPhase: "PLAY", legalActions: jason, armed: "p1/hero", nameOf })
    ).toEqual({ rows: [], armedTarget: null });
  });

  it("an armed fighter the server stopped offering loses its origins — the auto-disarm cue", () => {
    // The once-per-maneuver ledger (or a commit, or a phase change) ends the
    // offers; armedTarget going null is what the page disarms on, so the mode
    // can never outlive its row.
    const mode = deriveRelocateMode({
      turnPhase: "MANEUVER_MOVE",
      legalActions: [offer("p1/sidekick-1", "s3")],
      armed: "p1/hero",
      nameOf,
    });
    expect(mode.armedTarget).toBeNull();
    expect(mode.rows.map((r) => r.armed)).toEqual([false]);
  });
});
