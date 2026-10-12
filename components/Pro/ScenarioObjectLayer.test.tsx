import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ScenarioObjectLayer } from "@/components/Pro/ScenarioObjectLayer";
import { scenarioObjectModel } from "@/lib/pro/scenarioObjects";
import { ADJACENT_CHIP, NEXT_CHIP, TIE_CHIP, TIE_PICK_TOOLTIP } from "@/lib/pro/scenarioObjectStakes";
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

const mount = (scenario?: never, pickOpen = false, blocked = ["a", "b"]) =>
  render(
    <ChakraProvider theme={theme}>
      <ScenarioObjectLayer
        scenarioObjects={{ ...scenarioObjectModel(map, blocked, scenario, [{ id: "f", name: "Carnotaurus" }], pickOpen)! }}
        spaces={map.spaces}
        diam={0.05}
        framePx={1000}
        layoutPx={1000}
        layoutH={600}
      />
    </ChakraProvider>
  );

describe("ScenarioObjectLayer stakes", () => {
  it("no scenario: today's badges, no rings, no chips", () => {
    const { container } = mount();
    expect(container.querySelectorAll("[data-scenario-object]")).toHaveLength(3);
    expect(container.querySelector("[data-scenario-object-adjacent],[data-scenario-object-next],[data-scenario-object-chip]")).toBeNull();
  });

  it("adjacent gets a red ring + chip, nextToOpen the gold one; destroyed shows the released enemy", () => {
    const { container } = mount(
      sc({
        contacts: { adjacent: ["a"], nextToOpen: ["b"] },
        releases: [{ round: 1, space: "c", fighter: "f", enemyId: "carnotaurus" }],
      })
    );
    expect(container.querySelector("[data-scenario-object=a]")).toHaveAttribute("data-scenario-object-adjacent");
    expect(container.querySelector("[data-scenario-object=b]")).toHaveAttribute("data-scenario-object-next");
    expect(container.querySelector("[data-scenario-object-chip=a]")).toHaveTextContent(ADJACENT_CHIP);
    expect(container.querySelector("[data-scenario-object-chip=b]")).toHaveTextContent(NEXT_CHIP);
    expect(container.querySelector("[data-scenario-object=c]")).toHaveAttribute("data-scenario-object-released", "Carnotaurus");
    expect(screen.getByTitle(/released Carnotaurus/)).toBeInTheDocument();
  });

  it("tie chip: distinct token from adjacent, team-picks tooltip only while the pick is open", () => {
    const sce = sc({ contacts: { adjacent: ["a"], nextToOpen: ["b", "c"] } });
    const closed = mount(sce, false, ["a", "b", "c"]);
    const tie = closed.container.querySelector("[data-scenario-object-chip=b] [data-chip-text]")!;
    const adj = closed.container.querySelector("[data-scenario-object-chip=a] [data-chip-text]")!;
    expect(tie).toHaveTextContent(TIE_CHIP);
    expect(tie.getAttribute("data-chip-token")).toBe("tie");
    expect(adj.getAttribute("data-chip-token")).toBe("adjacent");
    expect(tie.textContent).not.toBe(adj.textContent);
    expect(tie.getAttribute("title")).toBe(TIE_CHIP);
    closed.unmount();
    const open = mount(sce, true, ["a", "b", "c"]);
    expect(open.container.querySelector("[data-scenario-object-chip=b] [data-chip-text]")!.getAttribute("aria-label")).toBe(TIE_PICK_TOOLTIP);
  });
});
