import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { EnclosureLayer } from "@/components/Pro/EnclosureLayer";
import { enclosureModel } from "@/lib/pro/enclosures";
import { ADJACENT_CHIP, NEXT_CHIP } from "@/lib/pro/enclosureStakes";
import type { ProMapDef } from "@/lib/pro/protocol";
import { theme } from "@/styles/style";

const map = {
  schemaVersion: "1",
  id: "m",
  meta: { title: "M", minPlayers: 1, maxPlayers: 4, specialRules: false },
  zones: [],
  spaces: [
    { id: "a", x: 0.2, y: 0.3, zones: [], adjacentTo: [], startsBlocked: true },
    { id: "b", x: 0.7, y: 0.3, zones: [], adjacentTo: [], startsBlocked: true },
    { id: "c", x: 0.45, y: 0.7, zones: [], adjacentTo: [], startsBlocked: true },
  ],
} as unknown as ProMapDef;
const sc = (over: object) => ({ threat: { position: 0, level: 0, overflows: 0, positions: [] }, objectives: [], ...over }) as never;

const mount = (scenario?: never) =>
  render(
    <ChakraProvider theme={theme}>
      <EnclosureLayer
        enclosures={enclosureModel(map, ["a", "b"], scenario, [{ id: "f", name: "Carnotaurus" }])!}
        spaces={map.spaces}
        diam={0.05}
        framePx={1000}
        layoutPx={1000}
        layoutH={600}
      />
    </ChakraProvider>
  );

describe("EnclosureLayer stakes", () => {
  it("no scenario: today's badges, no rings, no chips", () => {
    const { container } = mount();
    expect(container.querySelectorAll("[data-enclosure]")).toHaveLength(3);
    expect(container.querySelector("[data-enclosure-adjacent],[data-enclosure-next],[data-enclosure-chip]")).toBeNull();
  });

  it("adjacent gets a red ring + chip, nextToOpen the gold one; destroyed shows the released enemy", () => {
    const { container } = mount(
      sc({
        contacts: { adjacent: ["a"], nextToOpen: ["b"] },
        releases: [{ round: 1, space: "c", fighter: "f", enemyId: "carnotaurus" }],
      })
    );
    expect(container.querySelector("[data-enclosure=a]")).toHaveAttribute("data-enclosure-adjacent");
    expect(container.querySelector("[data-enclosure=b]")).toHaveAttribute("data-enclosure-next");
    expect(container.querySelector("[data-enclosure-chip=a]")).toHaveTextContent(ADJACENT_CHIP);
    expect(container.querySelector("[data-enclosure-chip=b]")).toHaveTextContent(NEXT_CHIP);
    expect(container.querySelector("[data-enclosure=c]")).toHaveAttribute("data-enclosure-released", "Carnotaurus");
    expect(screen.getByTitle(/released Carnotaurus/)).toBeInTheDocument();
  });
});
