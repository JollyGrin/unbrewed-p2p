import { resolveRelocateBoardClick } from "./relocateMode";
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
