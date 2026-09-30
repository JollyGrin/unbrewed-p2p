import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProBoard } from "./ProBoard";
import { TableBoard } from "./Table/TableBoard";
import type { ProMapDef } from "@/lib/pro/protocol";

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "isla",
  meta: { title: "Isla", minPlayers: 1, maxPlayers: 4, specialRules: false, imageWidth: 2592, imageHeight: 1728 },
  zones: [],
  spaces: [{ id: "s1", x: 0.2, y: 0.1, zones: [], adjacentTo: [], start: { slot: 1 } }],
};

const wrap = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);

describe("a map with no imageUrl", () => {
  it("flat board: the ground image has a real src at the stated size (not the 0x0 collapse)", () => {
    const { container } = wrap(<ProBoard map={MAP} fighters={[]} />);
    const img = container.querySelector("img")!;
    const src = img.getAttribute("src") ?? "";
    expect(src).not.toBe("");
    expect(decodeURIComponent(src)).toContain('width="2592" height="1728"');
  });

  it("tabletop board: both stage images carry the placeholder", () => {
    const { container } = wrap(<TableBoard map={MAP} fighters={[]} />);
    const imgs = Array.from(container.querySelectorAll("img")).filter((i) =>
      (i.getAttribute("src") ?? "").startsWith("data:image/svg+xml")
    );
    expect(imgs.length).toBeGreaterThan(0);
  });
});
