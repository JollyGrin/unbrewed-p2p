/**
 * Fault #3 coverage (phase-2 report): the base disc must stay IN the board's
 * plane (no counter-rotation) while the figure billboards upright — that
 * split is the whole point of the redesign, so it gets a direct test rather
 * than relying on the visual screenshot alone.
 */
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableStandeeAnchor } from "./TableStandeeAnchor";
import { standeeTransform } from "@/lib/pro/tableProjection";

describe("TableStandeeAnchor", () => {
  it("counter-rotates the billboard (figure) but leaves the base disc in-plane", () => {
    const { container } = render(
      <ChakraProvider>
        <TableStandeeAnchor x={0.5} y={0.5} tiltDeg={48} widthPx={40} heightPx={50}>
          <div data-testid="figure-content" />
        </TableStandeeAnchor>
      </ChakraProvider>
    );
    const figureContent = container.querySelector('[data-testid="figure-content"]') as HTMLElement;
    const billboard = figureContent.parentElement as HTMLElement;
    expect(billboard.style.transform).toContain(standeeTransform(48));

    // The anchor itself renders exactly 3 direct children: the contact
    // shadow, the base disc, and the billboard — the first two must carry NO
    // rotation of their own (they inherit the board's ambient tilt from the
    // ancestor stage plane and nothing else, same as a plain space disc).
    const anchorEl = billboard.parentElement as HTMLElement;
    const directChildren = Array.from(anchorEl.children) as HTMLElement[];
    expect(directChildren).toHaveLength(3);
    const [shadow, base] = directChildren;
    expect(shadow.style.transform ?? "").not.toContain("rotateX");
    expect(base.style.transform ?? "").not.toContain("rotateX");
  });

  it("is a no-op billboard rotation on a flat (untilted) board", () => {
    const { container } = render(
      <ChakraProvider>
        <TableStandeeAnchor x={0.5} y={0.5} tiltDeg={0} widthPx={40} heightPx={50}>
          <div data-testid="figure-content" />
        </TableStandeeAnchor>
      </ChakraProvider>
    );
    const figureContent = container.querySelector('[data-testid="figure-content"]') as HTMLElement;
    const billboard = figureContent.parentElement as HTMLElement;
    expect(billboard.style.transform).toContain("rotateX(0deg)");
  });

  it("marks itself as a pick only when `pick` is true", () => {
    const { container, rerender } = render(
      <ChakraProvider>
        <TableStandeeAnchor x={0.2} y={0.2} tiltDeg={48} widthPx={30} heightPx={30} pick>
          <div />
        </TableStandeeAnchor>
      </ChakraProvider>
    );
    expect(container.querySelector("[data-pick]")).toBeTruthy();

    rerender(
      <ChakraProvider>
        <TableStandeeAnchor x={0.2} y={0.2} tiltDeg={48} widthPx={30} heightPx={30}>
          <div />
        </TableStandeeAnchor>
      </ChakraProvider>
    );
    expect(container.querySelector("[data-pick]")).toBeNull();
  });
});
