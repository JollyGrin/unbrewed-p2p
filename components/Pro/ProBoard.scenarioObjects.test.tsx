import "@testing-library/jest-dom";
import { fireEvent, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProBoard } from "./ProBoard";
import { TableBoard } from "./Table/TableBoard";
import { scenarioObjectModel } from "@/lib/pro/scenarioObjects";
import type { ProMapDef } from "@/lib/pro/protocol";

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "adv",
  meta: { title: "Adv", minPlayers: 1, maxPlayers: 4, specialRules: false, imageUrl: "/t.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: [], adjacentTo: ["s2"], start: { slot: 1 } },
    { id: "e1", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s1", "e2"], startsBlocked: true },
    { id: "e2", x: 0.8, y: 0.8, zones: [], adjacentTo: ["e1"], startsBlocked: true },
  ],
  scenario: { groups: [{ id: "pens", kind: "CONTAINS", spaces: ["e1", "e2"], order: [4, 6] }] },
};

const wrap = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);

describe("adventure pens on the flat board", () => {
  it("draws a closed badge with the printed number on a blocked space, and a destroyed mark on an opened one", () => {
    const { container } = wrap(
      <ProBoard map={MAP} fighters={[]} scenarioObjects={scenarioObjectModel(MAP, ["e1"])} />
    );
    const closed = container.querySelector('[data-scenario-object="e1"]')!;
    expect(closed).toHaveAttribute("data-scenario-object-state", "closed");
    expect(closed).toHaveTextContent("04");
    const gone = container.querySelector('[data-scenario-object="e2"]')!;
    expect(gone).toHaveAttribute("data-scenario-object-state", "destroyed");
    expect(container.querySelector('[data-scenario-object="s1"]')).toBeNull();
    // Visible but never a click target of its own.
    expect(closed).toHaveStyle({ pointerEvents: "none" });
  });

  it("lets a CHOOSE_SPACE prompt pick a blocked space (pen tie)", () => {
    const onSpaceClick = jest.fn();
    const { container } = wrap(
      <ProBoard
        map={MAP}
        fighters={[]}
        scenarioObjects={scenarioObjectModel(MAP, ["e1", "e2"])}
        highlightedSpaces={["e1", "e2"]}
        onSpaceClick={onSpaceClick}
      />
    );
    fireEvent.click(container.querySelector('[data-space-id="e2"]')!);
    expect(onSpaceClick).toHaveBeenCalledWith("e2");
  });

  it("does not make a blocked space clickable when no prompt offers it", () => {
    const onSpaceClick = jest.fn();
    const { container } = wrap(
      <ProBoard map={MAP} fighters={[]} scenarioObjects={scenarioObjectModel(MAP, ["e1"])} onSpaceClick={onSpaceClick} />
    );
    fireEvent.click(container.querySelector('[data-space-id="e1"]')!);
    expect(onSpaceClick).not.toHaveBeenCalled();
  });
});

describe("adventure pens on the tabletop board", () => {
  it("draws the same marks and lets a prompt pick a blocked space", () => {
    const onSpaceClick = jest.fn();
    const { container } = wrap(
      <TableBoard
        map={MAP}
        fighters={[]}
        scenarioObjects={scenarioObjectModel(MAP, ["e1"])}
        highlightedSpaces={["e1"]}
        onSpaceClick={onSpaceClick}
      />
    );
    expect(container.querySelector('[data-scenario-object="e1"]')).toHaveAttribute("data-scenario-object-state", "closed");
    expect(container.querySelector('[data-scenario-object="e2"]')).toHaveAttribute("data-scenario-object-state", "destroyed");
    fireEvent.click(container.querySelector('[data-space-id="e1"]')!);
    expect(onSpaceClick).toHaveBeenCalledWith("e1");
  });
});

describe("non-adventure boards are unchanged", () => {
  const PLAIN: ProMapDef = {
    ...MAP,
    spaces: MAP.spaces.map(({ startsBlocked: _sb, ...s }) => s),
    scenario: undefined,
  };
  it("a map without startsBlocked yields no model and identical markup to omitting the prop", () => {
    expect(scenarioObjectModel(PLAIN, undefined)).toBeNull();
    const a = wrap(<ProBoard map={PLAIN} fighters={[]} />).container.innerHTML;
    const b = wrap(<ProBoard map={PLAIN} fighters={[]} scenarioObjects={scenarioObjectModel(PLAIN, undefined)} />).container.innerHTML;
    expect(b).toBe(a);
    expect(a).not.toContain("data-scenario-object");
  });
});
