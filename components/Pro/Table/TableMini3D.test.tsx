/**
 * 3D minis on the tabletop (#945): the fallback chain (3D → sprite → token),
 * body taps, the badge plate and the scheduled draw — with the WebGL renderer
 * and the GLB loader mocked (jsdom has no WebGL).
 */
import { act, fireEvent, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import type { ViewFighter } from "@/lib/pro/protocol";
import type { Figure } from "@/lib/pro/figures";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import type { MiniModel } from "@/lib/pro/minis3d/model";
import type { TableRig } from "@/lib/pro/minis3d/camera";
import { standingPose } from "@/lib/pro/minis3d/pose";
import { placeStandee, standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableFighterStandee, heroPlateSize } from "./TableFighterStandee";
import { TableSidekickToken } from "./TableSidekickToken";
import { mini3dPlateSize, miniBounds } from "./TableMini3D";
import { miniCamera } from "@/lib/pro/minis3d/camera";
import { mini3dFor, parseMini3dManifest } from "@/lib/pro/minis3d/manifest";
import { renderMini as renderMiniMocked } from "@/lib/pro/minis3d/renderer";

// jest cannot resolve "@/…" in jest.mock (see the repo's memory notes): relative paths.
const mockRenderer = {
  status: "ready" as string,
  listeners: new Set<() => void>(),
  set(s: string) {
    this.status = s;
    this.listeners.forEach((l) => l());
  },
};
jest.mock("../../../lib/pro/minis3d/renderer", () => ({
  ensureMinis3d: jest.fn(() => Promise.resolve(true)),
  getMinis3dStatus: () => mockRenderer.status,
  subscribeMinis3d: (fn: () => void) => {
    mockRenderer.listeners.add(fn);
    return () => mockRenderer.listeners.delete(fn);
  },
  renderMini: jest.fn(() => 1),
}));

const model: MiniModel = {
  url: "/minis3d/kt.30k.meshopt.glb",
  // footprint 1: the model layer always reports the pipeline contract (MINI_FOOTPRINT).
  bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1.4, 0.5], footprint: 1 },
  parts: [],
  triangles: 1,
  bytes: 1,
};
const mockLoad = jest.fn((_url: string): Promise<MiniModel | null> => Promise.resolve(model));
jest.mock("../../../lib/pro/minis3d/model", () => ({
  loadMiniModel: (url: string) => mockLoad(url),
}));

const renderMini = renderMiniMocked as jest.Mock;

const mini: Mini3d = {
  id: "kt@30k",
  url: model.url,
  baseDiameter: 1,
  tint: "#b8893a",
  credit: { modelName: "m", creator: "c", license: "CC0-1.0", sourceUrl: "https://x" } as Mini3d["credit"],
};
const rig: TableRig = { frameW: 800, frameH: 560, tiltDeg: 40, yawDeg: 2.5, perspectiveRatio: 1.1 };
const figure: Figure = { anchor: { x: 0.5, y: 0.75 }, imageWidthMm: 80, footprintMm: 60, aspect: 1.5, url: "/figures/kt.p1.webp" };
const taranis = {
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "King Taranis",
  space: "s1",
  tailSpace: null,
  hp: 14,
  maxHp: 14,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
} as ViewFighter;

// The model resolves, the piece re-renders, then the scheduler's next frame draws.
const flush = async () => {
  await act(() => new Promise((r) => setTimeout(r, 40)));
  await act(() => new Promise((r) => setTimeout(r, 40)));
};

const standee = (extra: Partial<Parameters<typeof TableFighterStandee>[0]> = {}) =>
  render(
    <ChakraProvider>
      <TableFighterStandee
        fighter={taranis}
        x={0.3}
        y={0.7}
        tiltDeg={40}
        diamPx={40}
        playerColor="#E0A82E"
        artUrl="/token/kt.png"
        selected={false}
        targetable={false}
        friendly={false}
        extendedReach={false}
        figure={figure}
        mini3d={mini}
        rig={rig}
        frameW={rig.frameW}
        frameH={rig.frameH}
        {...extra}
      />
    </ChakraProvider>
  );

const q = (c: HTMLElement) => ({
  canvas: c.querySelector("[data-mini3d-canvas]"),
  sprite: c.querySelector("[data-table-figure]"),
  token: c.querySelector("img:not([data-table-figure]):not([data-table-figure-ground])"),
  hit: c.querySelector("[data-mini3d-hit]") as HTMLElement | null,
});

beforeEach(() => {
  mockRenderer.status = "ready";
  mockLoad.mockImplementation(() => Promise.resolve(model));
  renderMini.mockClear();
});

describe("the 3D mini fallback chain", () => {
  test("ready + decoded: the 3D mini replaces the sprite", async () => {
    const { container } = standee();
    await flush();
    expect(q(container).canvas).not.toBeNull();
    expect(q(container).sprite).toBeNull();
  });

  test("the sprite stands in while the model is still loading", async () => {
    mockLoad.mockImplementation(() => new Promise(() => {}));
    const { container } = standee();
    await flush();
    expect(q(container).canvas).toBeNull();
    expect(q(container).sprite).not.toBeNull();
  });

  test("context lost → sprite; restored → 3D again", async () => {
    const { container } = standee();
    await flush();
    act(() => mockRenderer.set("lost"));
    expect(q(container).canvas).toBeNull();
    expect(q(container).sprite).not.toBeNull();
    act(() => mockRenderer.set("ready"));
    await flush();
    expect(q(container).canvas).not.toBeNull();
    expect(q(container).sprite).toBeNull();
  });

  test("no WebGL (failed) → sprite, and never fetches the model", async () => {
    mockRenderer.status = "failed";
    mockLoad.mockClear();
    const { container } = standee();
    await flush();
    expect(q(container).canvas).toBeNull();
    expect(q(container).sprite).not.toBeNull();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  test("lost with no sprite → the flat token", async () => {
    const { container } = standee({ figure: null });
    await flush();
    expect(q(container).canvas).not.toBeNull();
    act(() => mockRenderer.set("lost"));
    expect(q(container).canvas).toBeNull();
    expect(q(container).token).not.toBeNull();
  });

  test("a model that cannot be loaded → sprite", async () => {
    mockLoad.mockImplementation(() => Promise.resolve(null));
    const { container } = standee();
    await flush();
    expect(q(container).canvas).toBeNull();
    expect(q(container).sprite).not.toBeNull();
  });
});

describe("drawing", () => {
  test("draws once through the scheduler, then does nothing at rest", async () => {
    const { rerender } = standee();
    await flush();
    expect(renderMini).toHaveBeenCalledTimes(1);
    // Same props again: the camera did not change, so no redraw.
    rerender(
      <ChakraProvider>
        <TableFighterStandee
          fighter={taranis}
          x={0.3}
          y={0.7}
          tiltDeg={40}
          diamPx={40}
          playerColor="#E0A82E"
          selected={false}
          targetable={false}
          friendly={false}
          extendedReach={false}
          figure={figure}
          mini3d={mini}
          rig={{ ...rig }}
        />
      </ChakraProvider>
    );
    await flush();
    expect(renderMini).toHaveBeenCalledTimes(1);
  });

  test("a new position redraws", async () => {
    const { rerender } = standee();
    await flush();
    rerender(
      <ChakraProvider>
        <TableFighterStandee
          fighter={taranis}
          x={0.6}
          y={0.2}
          tiltDeg={40}
          diamPx={40}
          playerColor="#E0A82E"
          selected={false}
          targetable={false}
          friendly={false}
          extendedReach={false}
          figure={figure}
          mini3d={mini}
          rig={rig}
        />
      </ChakraProvider>
    );
    await flush();
    expect(renderMini).toHaveBeenCalledTimes(2);
  });
});

describe("body taps (#873)", () => {
  test("a targetable body takes the tap through its hit ellipse", async () => {
    const onClick = jest.fn();
    const { container } = standee({ targetable: true, onClick });
    await flush();
    const hit = q(container).hit!;
    expect(hit).not.toBeNull();
    expect(hit.style.pointerEvents).toBe("auto");
    expect(hit.style.borderRadius).toBe("50%");
    expect(parseFloat(hit.style.width)).toBeGreaterThan(0);
    fireEvent.click(hit);
    expect(onClick).toHaveBeenCalledWith("p1/hero");
  });

  test("becoming a target sizes the hit area without redrawing the unchanged mini", async () => {
    const props = { fighter: taranis, x: 0.3, y: 0.7, tiltDeg: 40, diamPx: 40, playerColor: "#E0A82E", selected: false };
    const more = { friendly: false, extendedReach: false, figure, mini3d: mini, rig, onClick: jest.fn() };
    const view = (targetable: boolean) => (
      <ChakraProvider>
        <TableFighterStandee {...props} {...more} targetable={targetable} />
      </ChakraProvider>
    );
    const { container, rerender } = render(view(false));
    await flush();
    expect(renderMini).toHaveBeenCalledTimes(1);
    rerender(view(true));
    await flush();
    expect(parseFloat(q(container).hit!.style.width)).toBeGreaterThan(0);
    expect(renderMini).toHaveBeenCalledTimes(1);
  });

  test("not a target, or while a space pick is live: no body hit area", async () => {
    const a = standee({ targetable: false, onClick: jest.fn() });
    await flush();
    expect(q(a.container).hit).toBeNull();
    a.unmount();
    const b = standee({ targetable: true, onClick: jest.fn(), spacePicksLive: true });
    await flush();
    expect(q(b.container).hit).toBeNull();
  });
});

test("the badge plate comes from the model's projected bounds, not the sprite (#929)", async () => {
  const { container } = standee();
  await flush();
  const root = container.querySelector("[data-standee-root]") as HTMLElement;
  const tokenPx = standeeBaseDiameterPx(40);
  const strip = heroPlateSize(null, tokenPx, tokenPx);
  const want = mini3dPlateSize(model, mini, rig, standingPose(0.3, 0.7), tokenPx, placeStandee(0.7, 40).scale, strip.widthPx, strip.heightPx);
  const sprite = heroPlateSize(figure, tokenPx, tokenPx);
  expect(want.heightPx).not.toBeCloseTo(sprite.heightPx, 0);
  expect(getComputedStyle(root).height).toBe(`${want.heightPx}px`);
  expect(getComputedStyle(root).width).toBe(`${want.widthPx}px`);
});

test("a sidekick takes the same 3D mini with no renderer change", async () => {
  const { container } = render(
    <ChakraProvider>
      <TableSidekickToken
        fighter={{ ...taranis, id: "p1/sk", kind: "SIDEKICK" } as ViewFighter}
        x={0.5}
        y={0.5}
        tiltDeg={40}
        diamPx={40}
        selected={false}
        targetable={false}
        friendly={false}
        artUrl="/token/sk.png"
        mini3d={mini}
        rig={rig}
      />
    </ChakraProvider>
  );
  await flush();
  expect(q(container).canvas).not.toBeNull();
  expect(container.querySelector("[data-fighter-base]")).not.toBeNull();
  act(() => mockRenderer.set("lost"));
  expect(q(container).canvas).toBeNull();
  expect(q(container).token).not.toBeNull();
});

describe("the manifest's baseDiameter sizes the model to the disc", () => {
  const entry = (extra: Record<string, unknown> = {}) =>
    parseMini3dManifest({
      version: 1,
      minis: {
        kt: {
          files: { play: "kt.play.glb" },
          license: "CC0-1.0",
          redistributable: true,
          officialHero: false,
          modelName: "m",
          creator: "c",
          sourceUrl: "https://unbrewed.xyz",
          ...extra,
        },
      },
    });
  const scaleOf = (m: number[]) => Math.hypot(m[0], m[1], m[2]);
  const camFor = (m: Mini3d) => miniCamera({ rig, pose: standingPose(0.3, 0.7), baseDiamPx: 30, bounds: miniBounds(model, m) });

  test("an entry without the field draws exactly as before (the model's own bounds)", async () => {
    const plain = mini3dFor(entry(), "kt", "p1")!;
    expect(plain.baseDiameter).toBe(1);
    expect(miniBounds(model, plain)).toEqual(model.bounds);
    expect(camFor(plain)).toEqual(miniCamera({ rig, pose: standingPose(0.3, 0.7), baseDiamPx: 30, bounds: model.bounds }));
    // And the piece hands the renderer that same camera.
    standee({ mini3d: plain });
    await flush();
    const cam = renderMini.mock.calls[0][2];
    const before = miniCamera({
      rig,
      pose: standingPose(0.3, 0.7),
      baseDiamPx: standeeBaseDiameterPx(40) * placeStandee(0.7, 40).scale,
      bounds: model.bounds,
    });
    expect(cam).toEqual(before);
  });

  test("an entry with it scales the model by 1 / baseDiameter", async () => {
    const plain = mini3dFor(entry(), "kt", "p1")!;
    const sized = mini3dFor(entry({ baseDiameter: 0.9672 }), "kt", "p1")!;
    expect(sized.baseDiameter).toBe(0.9672);
    expect(scaleOf(camFor(sized).model) / scaleOf(camFor(plain).model)).toBeCloseTo(1 / 0.9672, 9);
    // Through the piece, too: what reaches the renderer is scaled the same way.
    standee({ mini3d: plain });
    await flush();
    standee({ mini3d: sized });
    await flush();
    const [a, b] = renderMini.mock.calls.map((c) => scaleOf(c[2].model));
    expect(b / a).toBeCloseTo(1 / 0.9672, 9);
  });
});
