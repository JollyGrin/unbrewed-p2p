import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableSurface, TableBoardLight } from "./TableSurface";
import { boardThicknessPx } from "@/lib/pro/tableProjection";

describe("TableSurface", () => {
  it("lies a board's thickness BELOW the board, so the board stands on it", () => {
    const { container } = render(
      <ChakraProvider>
        <TableSurface frameW={1000} />
      </ChakraProvider>
    );
    const surface = container.querySelector("[data-table-surface]") as HTMLElement;
    expect(surface.style.transform).toBe(`translateZ(-${boardThicknessPx(1000)}px)`);
  });

  it("reaches well past the board on every side, so its grain has room to recede", () => {
    const { container } = render(
      <ChakraProvider>
        <TableSurface frameW={1000} />
      </ChakraProvider>
    );
    const surface = container.querySelector("[data-table-surface]") as HTMLElement;
    for (const side of ["top", "right", "bottom", "left"] as const) {
      expect(parseFloat(getComputedStyle(surface)[side])).toBeLessThan(0);
    }
  });

  it("never takes a tap meant for the board", () => {
    const { container } = render(
      <ChakraProvider>
        <TableSurface frameW={1000} />
      </ChakraProvider>
    );
    const surface = container.querySelector("[data-table-surface]") as HTMLElement;
    expect(getComputedStyle(surface).pointerEvents).toBe("none");
  });

  it("renders nothing before the frame has been measured", () => {
    const { container } = render(
      <ChakraProvider>
        <TableSurface frameW={0} />
      </ChakraProvider>
    );
    expect(container.querySelector("[data-table-surface]")).toBeNull();
  });
});

describe("TableBoardLight", () => {
  it("covers the board face without intercepting taps", () => {
    const { container } = render(
      <ChakraProvider>
        <TableBoardLight />
      </ChakraProvider>
    );
    const light = container.querySelector("[data-table-board-light]") as HTMLElement;
    expect(light).not.toBeNull();
    expect(getComputedStyle(light).pointerEvents).toBe("none");
  });
});
