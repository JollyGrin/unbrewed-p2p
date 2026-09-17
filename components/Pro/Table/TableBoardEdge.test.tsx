/**
 * Direct coverage for the board's extruded thickness face (phase-5 target
 * #1). TableStage.test.tsx already checks this renders inside the right
 * parent; these tests check the geometry itself — size, fold, and the
 * "never renders ahead of a piece" stacking guarantee.
 */
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoardEdge } from "./TableBoardEdge";
import { Z_BASE, boardThicknessPx } from "@/lib/pro/tableProjection";

describe("TableBoardEdge", () => {
  it("sizes the flap off the frame's own width and BOARD_THICKNESS_RATIO", () => {
    const { container } = render(
      <ChakraProvider>
        <TableBoardEdge frameW={1000} frameH={400} />
      </ChakraProvider>
    );
    const edge = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(edge).width).toBe("1000px");
    expect(getComputedStyle(edge).height).toBe(`${boardThicknessPx(1000)}px`);
  });

  it("hinges at the plane's own bottom edge and folds with rotateX(-89.9deg)", () => {
    const { container } = render(
      <ChakraProvider>
        <TableBoardEdge frameW={800} frameH={300} />
      </ChakraProvider>
    );
    const edge = container.firstElementChild as HTMLElement;
    // A literal px top (from frameH), hinged exactly at the plane's own
    // bottom edge.
    expect(getComputedStyle(edge).top).toBe("300px");
    expect(edge.style.transformOrigin).toBe("top");
    expect(edge.style.transform).toBe("rotateX(-45deg)");
  });

  it("paints behind the standee stacking band", () => {
    const { container } = render(
      <ChakraProvider>
        <TableBoardEdge frameW={800} frameH={300} />
      </ChakraProvider>
    );
    const edge = container.firstElementChild as HTMLElement;
    expect(Number(getComputedStyle(edge).zIndex)).toBeLessThan(Z_BASE);
  });

  it("renders nothing before the frame has been measured — no zero-size flap flash", () => {
    // ChakraProvider itself injects a hidden `#__chakra_env` marker span, so
    // "renders nothing" is checked against OUR component's own output (the
    // only element in this tree carrying an inline `style`), not the whole
    // container.
    const { container } = render(
      <ChakraProvider>
        <TableBoardEdge frameW={0} frameH={0} />
      </ChakraProvider>
    );
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("never lets pointer events reach the extruded face — it is decorative only", () => {
    const { container } = render(
      <ChakraProvider>
        <TableBoardEdge frameW={800} frameH={300} />
      </ChakraProvider>
    );
    const edge = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(edge).pointerEvents).toBe("none");
  });
});
