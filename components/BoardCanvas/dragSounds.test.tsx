/**
 * #1631: a token drag makes exactly one lift and one landing sound, whichever
 * way the drag ends: its own `end`, or the window-level safety net (#1629)
 * when that `end` is lost.
 */
import { act, renderHook } from "@testing-library/react";
import * as d3 from "d3";
import { OwnedToken } from "../Positions/position.type";
import { playVoice } from "../../lib/sound/engine";
import { useCanvas } from "./useCanvas";

jest.mock("d3", () => jest.requireActual("../../node_modules/d3/dist/d3.js"));
jest.mock("../../lib/sound/engine", () => ({
  engineReady: jest.fn(() => true),
  takeCount: jest.fn(() => 3),
  playVoice: jest.fn(),
  armSoundEngine: jest.fn(),
}));

const played = playVoice as jest.Mock;
const events = () => played.mock.calls.map(([v]) => v.event);

const token = (id: string, x: number): OwnedToken =>
  ({ id, x, y: 100, size: 60, owner: "me" }) as OwnedToken;

const mount = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svg);
  // jsdom has no svg geometry: make d3.pointer take its client-rect branch
  (svg as unknown as { createSVGPoint: unknown }).createSVGPoint = undefined;
  const move = Object.assign(jest.fn(), { flush: jest.fn() });
  const hook = renderHook(() =>
    useCanvas({
      canvasRef: { current: svg },
      gRef: { current: null },
      parentRef: { current: document.body },
      tokens: [token("me#1", 100), token("me#2", 300)],
      self: "me",
      size: { width: 1200, height: 1000 },
      move,
      iconSvg: () => null,
    }),
  );
  const tok = d3
    .select(svg)
    .selectAll<SVGGElement, OwnedToken>("g.tok")
    .filter((d) => d.id === "me#1")
    .node() as SVGGElement;
  return { hook, tok };
};

const mouse = (target: EventTarget, type: string, x = 0, y = 0) =>
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
    }),
  );

// The sound director is one per page: keep the tests outside its rate limits.
let clock = 0;
beforeEach(() => {
  clock += 10_000;
  jest.spyOn(performance, "now").mockImplementation(() => (clock += 200));
  played.mockClear();
  localStorage.clear();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

const blur = () =>
  act(() => {
    window.dispatchEvent(new Event("blur"));
    jest.runOnlyPendingTimers();
  });

describe("useCanvas: drag sounds", () => {
  it("a normal drag lifts once and lands once; the safety net adds nothing", () => {
    const { tok } = mount();
    act(() => {
      mouse(tok, "mousedown", 110, 110);
      mouse(window, "mousemove", 130, 120);
      mouse(window, "mousemove", 170, 140);
      mouse(window, "mousemove", 210, 160);
    });
    expect(events()).toEqual(["tokenUp"]);
    act(() => {
      mouse(window, "mouseup", 210, 160);
    });
    expect(events()).toEqual(["tokenUp", "tokenDown"]);
    // the window-level release that follows every pointer-up
    blur();
    blur();
    expect(events()).toEqual(["tokenUp", "tokenDown"]);
  });

  it("a drag whose end is lost still lands once, through the safety net", () => {
    const { tok } = mount();
    act(() => {
      mouse(tok, "mousedown", 110, 110);
      mouse(window, "mousemove", 130, 120);
      mouse(window, "mousemove", 190, 150);
    });
    expect(events()).toEqual(["tokenUp"]);
    d3.select(window).on(".drag", null); // the drag's own end never arrives
    blur();
    expect(events()).toEqual(["tokenUp", "tokenDown"]);
    blur();
    expect(events()).toEqual(["tokenUp", "tokenDown"]);
  });

  it("a press that never moves is silent on both paths", () => {
    const { tok } = mount();
    act(() => {
      mouse(tok, "mousedown", 110, 110);
      mouse(window, "mouseup", 110, 110);
    });
    blur();
    act(() => {
      mouse(tok, "mousedown", 110, 110);
    });
    d3.select(window).on(".drag", null);
    blur();
    expect(played).not.toHaveBeenCalled();
  });
});
