import { render, screen } from "@testing-library/react";
import { TableBoardFx } from "./TableBoardFx";
import { BoardFxItem } from "@/lib/pro/useGameFx";
import { ProMapSpace } from "@/lib/pro/protocol";

const space = (id: string, x: number, y: number): ProMapSpace => ({
  id,
  x,
  y,
  zones: ["z1"],
  adjacentTo: [],
});

const SPACES = [space("s1", 0.2, 0.15), space("s2", 0.7, 0.85)];

const fx = (over: Partial<BoardFxItem> = {}): BoardFxItem => ({
  key: "fx-1",
  space: "s1",
  kind: "damage",
  label: "−3",
  ...over,
});

const renderFx = (items: BoardFxItem[], reducedMotion = false) =>
  render(
    <TableBoardFx fx={items} spaces={SPACES} diamPct={8} tiltDeg={48} reducedMotion={reducedMotion} />
  );

describe("TableBoardFx", () => {
  it("shows the beat's label so a hit is never silent", () => {
    renderFx([fx()]);
    expect(screen.getByText("−3")).toBeTruthy();
  });

  it("draws a ground ring and a readable label for one beat", () => {
    const { container } = renderFx([fx()]);
    expect(container.querySelectorAll("[data-table-fx-ring]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-table-fx-label]")).toHaveLength(1);
  });

  it("billboards the label so text is not laid flat on a tilted board", () => {
    const { container } = renderFx([fx()]);
    const label = container.querySelector("[data-table-fx-label]") as HTMLElement;
    expect(label.style.transform).toContain("rotateX(-48deg)");
  });

  it("leaves the ring in the board plane, where a mark on the ground belongs", () => {
    const { container } = renderFx([fx()]);
    const ring = container.querySelector("[data-table-fx-ring]") as HTMLElement;
    expect(ring.style.transform).not.toContain("rotateX");
  });

  it("keeps the ring under the pieces and lifts the number above them", () => {
    const { container } = renderFx([fx()]);
    const ring = container.querySelector("[data-table-fx-ring]") as HTMLElement;
    const label = container.querySelector("[data-table-fx-label]") as HTMLElement;
    expect(Number(ring.style.zIndex)).toBeLessThan(Number(label.style.zIndex));
  });

  it("drops a beat whose space this view does not draw, rather than parking it at the origin", () => {
    // Region-inset spaces are the real case: this view refuses maps with
    // regions, but a beat could still name a space outside `spaces`.
    const { container } = renderFx([fx({ space: "not-on-this-board" })]);
    expect(container.querySelectorAll("[data-table-fx-label]")).toHaveLength(0);
  });

  it("renders every kind the flat board can emit", () => {
    const items: BoardFxItem[] = [
      fx({ key: "a", kind: "damage", label: "−3" }),
      fx({ key: "b", kind: "heal", label: "+2" }),
      fx({ key: "c", kind: "blocked", label: "BLOCKED" }),
      fx({ key: "d", kind: "defeat", label: "K.O." }),
    ];
    const { container } = renderFx(items);
    expect(container.querySelectorAll("[data-table-fx-label]")).toHaveLength(4);
    expect(screen.getByText("K.O.")).toBeTruthy();
  });

  it("still shows the beat under reduced motion, just without the travel", () => {
    const { container } = renderFx([fx()], true);
    const label = container.querySelector("[data-table-fx-label]") as HTMLElement;
    expect(label).toBeTruthy();
    expect(screen.getByText("−3")).toBeTruthy();
    // no keyframe animation is attached to the text under reduced motion
    const text = screen.getByText("−3");
    expect(text.className).not.toMatch(/animation/);
  });
});
