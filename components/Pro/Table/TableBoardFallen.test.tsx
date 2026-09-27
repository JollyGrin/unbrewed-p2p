/**
 * The defeat ghost on the real board (#962): a defeated 3D mini leaves one
 * TableFallenMini on its last space, and none under reduced motion. The
 * ghost's timing is useFallenMinis.test.ts; this pins the board wiring.
 */
import { act, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoard } from "./TableBoard";
import type { ProMapDef, ViewFighter } from "@/lib/pro/protocol";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import type { MiniModel } from "@/lib/pro/minis3d/model";

// jest cannot resolve "@/…" in jest.mock: relative paths.
jest.mock("../../../lib/pro/minis3d/renderer", () => ({
  ensureMinis3d: jest.fn(() => Promise.resolve(true)),
  getMinis3dStatus: () => "ready",
  subscribeMinis3d: () => () => undefined,
  renderMini: jest.fn(() => 1),
}));
const model: MiniModel = {
  url: "/minis3d/kt.glb",
  bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1.4, 0.5], footprint: 1 },
  parts: [],
  triangles: 1,
  bytes: 1,
};
jest.mock("../../../lib/pro/minis3d/model", () => ({
  loadMiniModel: () => Promise.resolve(model),
}));
const mockReduced = { value: false };
jest.mock("framer-motion", () => ({
  ...jest.requireActual("framer-motion"),
  useReducedMotion: () => mockReduced.value,
}));

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.2, y: 0.3, zones: [], adjacentTo: ["s2"] },
    { id: "s2", x: 0.7, y: 0.6, zones: [], adjacentTo: ["s1"] },
  ],
};
const mini: Mini3d = {
  id: "kt@30k",
  url: model.url,
  baseDiameter: 1,
  tint: "#b8893a",
  variant: "unpainted",
  credit: { modelName: "m", creator: "c", license: "CC0-1.0", sourceUrl: "https://x" } as Mini3d["credit"],
};
const fighter = (over: Partial<ViewFighter>): ViewFighter =>
  ({
    id: "p1/hero",
    owner: "p1",
    kind: "HERO",
    name: "King Taranis",
    space: "s1",
    tailSpace: null,
    hp: 10,
    maxHp: 14,
    reach: "MELEE",
    size: "NORMAL",
    defeated: false,
    ...over,
  }) as ViewFighter;

const attacker = fighter({});
const defender = fighter({ id: "p2/hero", owner: "p2", space: "s2", hp: 2 });
const board = (fighters: ViewFighter[]) => (
  <ChakraProvider>
    <TableBoard map={MAP} fighters={fighters} fighterMini3d={() => mini} />
  </ChakraProvider>
);
const settle = () => act(() => new Promise((r) => setTimeout(r, 40)));
const ghosts = (c: HTMLElement) => c.querySelectorAll("[data-fallen-fighter-id]");

beforeEach(() => {
  mockReduced.value = false;
});

test("a defeated 3D mini leaves exactly one ghost on its last space", async () => {
  const { container, rerender } = render(board([attacker, defender]));
  await settle();
  expect(ghosts(container)).toHaveLength(0);
  rerender(board([attacker, { ...defender, defeated: true, space: null, hp: 0 }]));
  await settle();
  expect(ghosts(container)).toHaveLength(1);
  expect(ghosts(container)[0].getAttribute("data-fallen-fighter-id")).toBe("p2/hero");
});

test("no ghost under reduced motion", async () => {
  mockReduced.value = true;
  const { container, rerender } = render(board([attacker, defender]));
  await settle();
  rerender(board([attacker, { ...defender, defeated: true, space: null, hp: 0 }]));
  await settle();
  expect(ghosts(container)).toHaveLength(0);
});
