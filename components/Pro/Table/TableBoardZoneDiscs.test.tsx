/**
 * The zone-disc toggle through the board (#1395): TableBoard hands the
 * preference to every space. Off (the default) no fill or pie is rendered,
 * yet the hit circles and highlight rings still render and still route
 * clicks; on, every fill is the plain `#rrggbb` with no alpha.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoard } from "./TableBoard";
import { ProMapDef } from "@/lib/pro/protocol";

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "zone-map",
  meta: { title: "Zone Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [
    { id: "fire", color: "#c0392b", label: "Fire" },
    { id: "ice", color: "#3498db", label: "Ice" },
  ],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: ["fire"], adjacentTo: ["s2"] },
    { id: "s2", x: 0.8, y: 0.8, zones: ["fire", "ice"], adjacentTo: ["s1", "s3"] },
    { id: "s3", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s2"] },
  ],
};

const renderBoard = (props: Partial<React.ComponentProps<typeof TableBoard>> = {}) =>
  render(
    <ChakraProvider>
      <TableBoard map={MAP} fighters={[]} {...props} />
    </ChakraProvider>
  );

const disc = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-space-id="${id}"]`)!.firstElementChild as HTMLElement;

describe("TableBoard zone discs OFF (default)", () => {
  it("renders no zone fill, pie or shade on any space", () => {
    const { container } = renderBoard();
    for (const id of ["s1", "s2", "s3"]) {
      expect(getComputedStyle(disc(container, id)).background).toBe("");
      expect(getComputedStyle(disc(container, id)).boxShadow).toBe("");
    }
    expect(container.querySelectorAll("[data-space-id] svg path")).toHaveLength(0);
    expect(container.querySelectorAll("[data-space-shade]")).toHaveLength(0);
  });

  it("still renders every hit circle with its highlight ring, and still routes clicks", () => {
    const onSpaceClick = jest.fn();
    const { container } = renderBoard({ highlightedSpaces: ["s2"], onSpaceClick });
    expect(container.querySelectorAll("[data-space-id]")).toHaveLength(3);
    const pick = screen.getByTitle("s2");
    expect(pick.hasAttribute("data-pick")).toBe(true);
    expect(getComputedStyle(disc(container, "s2")).outline).toContain("#E0A82E");
    fireEvent.click(pick);
    expect(onSpaceClick).toHaveBeenCalledWith("s2");
    // A non-pick stays inert, exactly as before.
    fireEvent.click(screen.getByTitle("s1"));
    expect(onSpaceClick).toHaveBeenCalledTimes(1);
  });

  it("the relocate ring survives too", () => {
    const onSpaceClick = jest.fn();
    const { container } = renderBoard({ relocateSpaces: ["s1"], relocateArmed: true, onSpaceClick });
    expect(getComputedStyle(disc(container, "s1")).outline).toContain("#38D9E8");
    fireEvent.click(screen.getByTitle("s1"));
    expect(onSpaceClick).toHaveBeenCalledWith("s1");
  });
});

describe("TableBoard zone discs ON", () => {
  it("fills every disc with the plain #rrggbb — no alpha suffix anywhere", () => {
    const { container } = renderBoard({ zoneDiscs: true });
    const single = getComputedStyle(disc(container, "s1")).background;
    expect(single).toContain("rgb(192, 57, 43)");
    expect(single).not.toContain("rgba(");
    const wedges = Array.from(container.querySelectorAll('[data-space-id="s2"] svg path'));
    expect(wedges.map((p) => p.getAttribute("fill"))).toEqual(["#c0392b", "#3498db"]);
    expect(container.querySelectorAll('[data-space-id="s1"] svg path')).toHaveLength(0);
    expect(container.querySelectorAll("[data-space-shade]")).toHaveLength(3);
  });
});
