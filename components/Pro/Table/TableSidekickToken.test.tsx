import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import type { ViewFighter } from "@/lib/pro/protocol";
import { standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableSidekickToken } from "./TableSidekickToken";

const guard: ViewFighter = {
  id: "p2/sidekick-1",
  owner: "p2",
  kind: "SIDEKICK",
  name: "MagnaGuard",
  space: "s7",
  tailSpace: null,
  hp: 1,
  maxHp: 1,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
} as ViewFighter;

const token = (extra: Partial<Parameters<typeof TableSidekickToken>[0]> = {}) =>
  render(
    <ChakraProvider>
      <TableSidekickToken
        fighter={guard}
        x={0.5}
        y={0.5}
        tiltDeg={40}
        diamPx={40}
        artUrl="/token/guard.png"
        playerColor="#3B8BEB"
        selected={false}
        targetable={false}
        friendly={false}
        {...extra}
      />
    </ChakraProvider>
  );

describe("TableSidekickToken", () => {
  it("lies flat on its space, in the board plane, instead of standing up as a disc", () => {
    const { container } = token();
    const face = container.querySelector('[data-fighter-id="p2/sidekick-1"]') as HTMLElement;
    const ground = container.querySelector("[data-standee-ground]") as HTMLElement;
    expect(ground.contains(face)).toBe(true);
  });

  it("is the base itself: centred on the space, the base disc's size, measured by the probe", () => {
    const { container } = token();
    const bases = container.querySelectorAll("[data-fighter-base]");
    expect(bases).toHaveLength(1);
    const chip = bases[0] as HTMLElement;
    expect(chip.getAttribute("data-space-id")).toBe("s7");
    expect(parseFloat(chip.style.width)).toBeCloseTo(standeeBaseDiameterPx(40));
    // Centred on the feet point (the ground layer's origin).
    expect(chip.style.transform).toContain("translate(-50%, -50%)");
  });

  it("carries its owner's colour on the rim", () => {
    const { container } = token();
    const chip = container.querySelector("[data-fighter-base]") as HTMLElement;
    expect(chip.style.borderColor.toLowerCase()).toBe("#3b8beb");
  });

  it("stays tappable although the ground layer passes pointer events through", () => {
    const onClick = jest.fn();
    const { container } = token({ targetable: true, onClick });
    const face = container.querySelector('[data-fighter-id="p2/sidekick-1"]') as HTMLElement;
    face.click();
    expect(onClick).toHaveBeenCalledWith("p2/sidekick-1");
  });
});
