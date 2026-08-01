/**
 * CHOOSE_SPACE prompt-option mapping (issue #553).
 *
 * The regression these exist for: the map used to be `space -> ONE optionId`, on the
 * stated assumption that "tokens never share a space". Protocol v26/v28 killed it —
 * these are the real option lists the engine emits for a `destroyToken` prompt when
 * corpses stack, verified against the engine branch:
 *
 *   { id: "corpse-0", label: "a3", data: { tokenId: "corpse-0", space: "a3" } }
 *   { id: "corpse-1", label: "a3", data: { tokenId: "corpse-1", space: "a3" } }
 *
 * The old Map kept only `corpse-1`.
 */
import { buildPromptSpaceMap, SpaceOption } from "./promptSpaces";

/** The engine's real destroyToken option shape. */
const corpseOption = (n: number, space: string): SpaceOption => ({
  id: `corpse-${n}`,
  label: space,
  data: { tokenId: `corpse-${n}`, space },
});

/** The caller's resolver, mirroring `optionSpace` in pages/pro/game.tsx. */
const resolve = (o: SpaceOption): string | null =>
  (o.data as { space?: string } | undefined)?.space ?? (/^[as]\d+$/.test(o.label) ? o.label : null);

describe("buildPromptSpaceMap", () => {
  it("keeps EVERY option when several name the same space (the v26 regression)", () => {
    const map = buildPromptSpaceMap([corpseOption(0, "a3"), corpseOption(1, "a3")], resolve);
    expect(map.bySpace.get("a3")).toEqual(["corpse-0", "corpse-1"]);
    // the old Map<space, id> would have silently dropped corpse-0
    expect(map.bySpace.get("a3")).toHaveLength(2);
  });

  it("scales to four stacked corpses — v28 lets 4 SMALL Larrys die on one space", () => {
    const map = buildPromptSpaceMap(
      [0, 1, 2, 3].map((n) => corpseOption(n, "s12")),
      resolve
    );
    expect(map.bySpace.get("s12")).toHaveLength(4);
    expect(map.unambiguous.size).toBe(0); // none is board-answerable
    expect(map.boardAnswerable.size).toBe(0); // …so all four reach the panel
  });

  it("answers a single-option space from the board, exactly as before", () => {
    const map = buildPromptSpaceMap([corpseOption(0, "a3")], resolve);
    expect(map.unambiguous.get("a3")).toBe("corpse-0");
    expect(map.boardAnswerable.has("corpse-0")).toBe(true);
  });

  it("mixes freely: the unambiguous spaces stay clickable while the crowded one does not", () => {
    const map = buildPromptSpaceMap(
      [corpseOption(0, "a3"), corpseOption(1, "a3"), corpseOption(2, "a5")],
      resolve
    );
    expect(map.unambiguous.get("a5")).toBe("corpse-2");
    expect(map.unambiguous.has("a3")).toBe(false);
    // every space is still HIGHLIGHTED — the prompt is about those objects
    expect([...map.bySpace.keys()].sort()).toEqual(["a3", "a5"]);
  });

  it("never board-answers an option it dropped — no id is both hidden and unclickable", () => {
    const options = [corpseOption(0, "a3"), corpseOption(1, "a3"), corpseOption(2, "a5")];
    const map = buildPromptSpaceMap(options, resolve);
    // The panel gets everything the board did not answer; together they must cover
    // the full option set exactly once. This is the invariant the bug violated.
    const panel = options.map((o) => o.id).filter((id) => !map.boardAnswerable.has(id));
    expect([...panel, ...map.boardAnswerable].sort()).toEqual(["corpse-0", "corpse-1", "corpse-2"]);
  });

  it("leaves non-space options entirely alone (sentinels, card picks, branches)", () => {
    const map = buildPromptSpaceMap(
      [{ id: "decline", label: "Decline" }, { id: "done", label: "Done destroying" }],
      resolve
    );
    expect(map.bySpace.size).toBe(0);
    expect(map.boardAnswerable.size).toBe(0);
  });

  it("is empty for a prompt that is not CHOOSE_SPACE (caller passes [])", () => {
    const map = buildPromptSpaceMap([], resolve);
    expect(map.bySpace.size).toBe(0);
    expect(map.unambiguous.size).toBe(0);
  });
});
