import {
  FLIP_SECONDS,
  STORM_LIMIT,
  TokenSnap,
  announceExit,
  announceLanding,
  createTokenAnimator,
  exitPose,
  flipPose,
  planTokenMotion,
  reverseFlip,
  tokenTransform,
} from "./tokenMotion";

const tok = (id: string, over: Partial<TokenSnap> = {}): TokenSnap => ({
  id,
  owner: id.split("#")[0],
  x: 100,
  y: 100,
  ...over,
});
const table = (...tokens: TokenSnap[]) =>
  new Map(tokens.map((t) => [t.id, t] as const));
const sizes = (p: ReturnType<typeof planTokenMotion>) => ({
  moves: p.moves.size,
  flips: p.flips.size,
  enters: p.enters.size,
  exits: p.exits.size,
});
const NONE = { moves: 0, flips: 0, enters: 0, exits: 0 };

describe("planTokenMotion", () => {
  it("animates nothing on the board's first render", () => {
    expect(sizes(planTokenMotion(null, [tok("a#1"), tok("b#1")]))).toEqual(
      NONE,
    );
  });

  it("animates one token another player moved or flipped", () => {
    const prev = table(tok("a#1"), tok("b#1"), tok("b#2"));
    const moved = planTokenMotion(prev, [
      tok("a#1"),
      tok("b#1", { x: 140 }),
      tok("b#2"),
    ]);
    expect([...moved.moves]).toEqual(["b#1"]);
    const flipped = planTokenMotion(prev, [
      tok("a#1"),
      tok("b#1"),
      tok("b#2", { faceDown: true }),
    ]);
    expect([...flipped.flips]).toEqual(["b#2"]);
    expect(flipped.moves.size).toBe(0);
  });

  it("treats undefined and false faces as the same face", () => {
    const prev = table(tok("a#1", { faceDown: false }));
    expect(sizes(planTokenMotion(prev, [tok("a#1")]))).toEqual(NONE);
  });

  it("leaves the token being dragged to the drag", () => {
    const prev = table(tok("a#1"));
    const plan = planTokenMotion(prev, [tok("a#1", { x: 300 })], {
      draggingId: "a#1",
    });
    expect(plan.moves.size).toBe(0);
  });

  it("snaps a whole snapshot: many tokens changing at once", () => {
    const ids = Array.from({ length: STORM_LIMIT + 1 }, (_, i) => `b#${i}`);
    const prev = table(...ids.map((id) => tok(id)));
    const next = ids.map((id) => tok(id, { x: 500, faceDown: true }));
    expect(sizes(planTokenMotion(prev, next))).toEqual(NONE);
    // exactly at the limit still animates
    const few = ids.map((id, i) => tok(id, i < STORM_LIMIT ? { x: 500 } : {}));
    expect(planTokenMotion(prev, few).moves.size).toBe(STORM_LIMIT);
  });

  it("snaps a new game: old tokens gone and new ones in their place", () => {
    const prev = table(tok("a#1"), tok("a#2"), tok("b#1"), tok("b#2"));
    const next = [tok("a#9"), tok("a#8"), tok("b#9"), tok("b#8")];
    expect(sizes(planTokenMotion(prev, next))).toEqual(NONE);
  });

  it("does not animate the first tokens of a player who just arrived", () => {
    const prev = table(tok("a#1"));
    expect(sizes(planTokenMotion(prev, [tok("a#1"), tok("b#1")]))).toEqual(
      NONE,
    );
    // ...but a known player's new token does
    const plan = planTokenMotion(prev, [tok("a#1"), tok("a#2")]);
    expect([...plan.enters]).toEqual(["a#2"]);
  });

  it("always animates what this client announced, even inside a storm", () => {
    const ids = Array.from({ length: 6 }, (_, i) => `b#${i}`);
    const prev = table(tok("a#1"), tok("a#2"), ...ids.map((id) => tok(id)));
    const next = [
      tok("a#1"),
      tok("a#3"),
      ...ids.map((id) => tok(id, { x: 700 })),
    ];
    const plan = planTokenMotion(prev, next, {
      announcedEnter: (id) => id === "a#3",
      announcedExit: (id) => id === "a#2",
    });
    expect([...plan.enters]).toEqual(["a#3"]);
    expect([...plan.exits]).toEqual(["a#2"]);
    expect(plan.moves.size).toBe(0);
  });

  it("fades a single token another player removed", () => {
    const prev = table(tok("a#1"), tok("b#1"));
    expect([...planTokenMotion(prev, [tok("a#1")]).exits]).toEqual(["b#1"]);
  });
});

describe("flipPose / reverseFlip", () => {
  it("is flat at both ends and edge-on half-way, never mirrored", () => {
    expect(flipPose(0).sx).toBeCloseTo(1);
    expect(flipPose(1).sx).toBeCloseTo(1);
    expect(flipPose(0.5).sx).toBeLessThan(0.05);
    expect(flipPose(0.5).sx).toBeGreaterThan(0);
    expect(flipPose(0.25).sx).toBeCloseTo(flipPose(0.75).sx);
    expect(flipPose(0.5).rise).toBeCloseTo(1);
    expect(flipPose(0).rise).toBeCloseTo(0);
  });

  it("turns back from where it is when flipped again mid-flip", () => {
    expect(reverseFlip(0.2)).toBeCloseTo(0.8);
    // same width before and after the reversal: no jump
    expect(flipPose(reverseFlip(0.3)).sx).toBeCloseTo(flipPose(0.3).sx);
    expect(reverseFlip(2)).toBe(0);
  });
});

describe("exitPose", () => {
  it("travels all the way, shrinking, and only fades near the end", () => {
    expect(exitPose(0)).toEqual({ travel: 0, scale: 1, opacity: 1 });
    expect(exitPose(0.5).opacity).toBe(1);
    expect(exitPose(1).travel).toBe(1);
    expect(exitPose(1).opacity).toBeCloseTo(0);
    expect(exitPose(1).scale).toBeCloseTo(0.35);
    expect(exitPose(0.3).travel).toBeLessThan(exitPose(0.6).travel);
  });
});

describe("tokenTransform", () => {
  it("is the plain wire translate at rest (old tests and tools read it)", () => {
    expect(tokenTransform(300, 200, 80, 80)).toBe("translate(300, 200)");
  });

  it("scales and turns about the token's centre", () => {
    expect(tokenTransform(10, 20, 100, 60, { sx: 0.5, sy: 1.1, rot: 4 })).toBe(
      "translate(10, 20) translate(50, 30) rotate(4) scale(0.5, 1.1) translate(-50, -30)",
    );
  });
});

const g = () =>
  document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

describe("createTokenAnimator without motion (reduced motion, no frame clock)", () => {
  it("places every token on its wire position in one step", () => {
    const motion = createTokenAnimator();
    const node = g();
    motion.beginRender([tok("a#1")], { draggingId: null });
    motion.place(node, tok("a#1"), 80, 80);
    motion.endRender();
    expect(node.getAttribute("transform")).toBe("translate(100, 100)");

    const moved = tok("a#1", { x: 420, faceDown: true });
    motion.beginRender([moved], { draggingId: null });
    motion.place(node, moved, 80, 80);
    expect(node.getAttribute("transform")).toBe("translate(420, 100)");
    expect(motion.faceOverride("a#1")).toBeNull();
    motion.dispose();
  });

  it("follows a drag 1:1 and ignores wire echoes until release", () => {
    const motion = createTokenAnimator();
    const node = g();
    motion.beginRender([tok("a#1")], { draggingId: null });
    motion.place(node, tok("a#1"), 80, 80);
    motion.dragStart("a#1");
    motion.dragTo("a#1", 250.4, 130.6);
    expect(node.getAttribute("transform")).toBe("translate(250.4, 130.6)");
    // a throttled echo of an older position re-renders mid-drag
    const echo = tok("a#1", { x: 180, y: 110 });
    motion.beginRender([echo], { draggingId: "a#1" });
    motion.place(node, echo, 80, 80);
    expect(node.getAttribute("transform")).toBe("translate(250.4, 130.6)");
    motion.dragEnd("a#1");
    const final = tok("a#1", { x: 250, y: 131 });
    motion.beginRender([final], { draggingId: null });
    motion.place(node, final, 80, 80);
    expect(node.getAttribute("transform")).toBe("translate(250, 131)");
    motion.dispose();
  });
});

describe("createTokenAnimator with motion", () => {
  let frames: FrameRequestCallback[] = [];
  let clock = 0;
  const realRaf = window.requestAnimationFrame;
  const realCancel = window.cancelAnimationFrame;
  const realNow = performance.now;
  /** Run the animation for `ms`, 60 frames a second. */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 1000 / 60) {
      clock += 1000 / 60;
      const due = frames;
      frames = [];
      due.forEach((fn) => fn(clock));
    }
  };

  beforeEach(() => {
    frames = [];
    clock = 0;
    performance.now = () => clock;
    window.requestAnimationFrame = (fn) => frames.push(fn);
    window.cancelAnimationFrame = () => {
      frames = [];
    };
    window.matchMedia = (() => ({ matches: false })) as never;
  });
  afterEach(() => {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCancel;
    performance.now = realNow;
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  const render = (
    motion: ReturnType<typeof createTokenAnimator>,
    nodes: Map<string, SVGGElement>,
    tokens: TokenSnap[],
  ) => {
    motion.beginRender(tokens, { draggingId: null });
    tokens.forEach((t) => {
      if (!nodes.has(t.id)) nodes.set(t.id, g());
      motion.place(nodes.get(t.id)!, t, 80, 80);
    });
    motion.endRender();
  };
  const xOf = (node: SVGGElement) =>
    Number(/translate\(([-\d.]+),/.exec(node.getAttribute("transform")!)![1]);

  it("glides a remotely moved token to its new place and stops exactly there", () => {
    const motion = createTokenAnimator();
    const nodes = new Map<string, SVGGElement>();
    render(motion, nodes, [tok("a#1"), tok("b#1")]);
    render(motion, nodes, [tok("a#1"), tok("b#1", { x: 300 })]);
    const node = nodes.get("b#1")!;
    expect(xOf(node)).toBe(100); // nothing jumped
    run(50);
    expect(xOf(node)).toBeGreaterThan(100);
    expect(xOf(node)).toBeLessThan(300);
    run(600);
    expect(node.getAttribute("transform")).toBe("translate(300, 100)");
    expect(frames).toHaveLength(0); // the loop stopped
    motion.dispose();
  });

  it("keeps gliding when an unrelated render lands mid-flight, retargets on a new move", () => {
    const motion = createTokenAnimator();
    const nodes = new Map<string, SVGGElement>();
    render(motion, nodes, [tok("a#1"), tok("b#1")]);
    render(motion, nodes, [tok("a#1"), tok("b#1", { x: 300 })]);
    run(50);
    const mid = xOf(nodes.get("b#1")!);
    render(motion, nodes, [tok("a#1"), tok("b#1", { x: 300 })]);
    expect(xOf(nodes.get("b#1")!)).toBeCloseTo(mid, 1);
    render(motion, nodes, [tok("a#1"), tok("b#1", { x: 50 })]);
    run(700);
    expect(nodes.get("b#1")!.getAttribute("transform")).toBe(
      "translate(50, 100)",
    );
    motion.dispose();
  });

  it("snaps a snapshot that moves the whole table", () => {
    const motion = createTokenAnimator();
    const nodes = new Map<string, SVGGElement>();
    const ids = ["b#1", "b#2", "b#3", "b#4", "b#5"];
    render(motion, nodes, ids.map((id) => tok(id)));
    render(motion, nodes, ids.map((id) => tok(id, { x: 640 })));
    ids.forEach((id) =>
      expect(nodes.get(id)!.getAttribute("transform")).toBe(
        "translate(640, 100)",
      ),
    );
    expect(frames).toHaveLength(0);
    motion.dispose();
  });

  it("shows the old face until a flip is edge-on, then asks for one render", () => {
    const onFlipMid = jest.fn();
    const motion = createTokenAnimator({ onFlipMid });
    const nodes = new Map<string, SVGGElement>();
    render(motion, nodes, [tok("a#1", { faceDown: true })]);
    render(motion, nodes, [tok("a#1", { faceDown: false })]);
    expect(motion.faceOverride("a#1")).toEqual({
      faceDown: true,
      flipped: undefined,
    });
    run(FLIP_SECONDS * 1000 * 0.3);
    expect(onFlipMid).not.toHaveBeenCalled();
    expect(nodes.get("a#1")!.getAttribute("transform")).toContain("scale(");
    run(FLIP_SECONDS * 1000 * 0.3);
    expect(onFlipMid).toHaveBeenCalledTimes(1);
    expect(motion.faceOverride("a#1")).toBeNull();
    run(FLIP_SECONDS * 1000);
    expect(nodes.get("a#1")!.getAttribute("transform")).toBe(
      "translate(100, 100)",
    );
    motion.dispose();
  });

  it("lifts a held token, then settles it back to the plain transform", () => {
    const motion = createTokenAnimator();
    const nodes = new Map<string, SVGGElement>();
    render(motion, nodes, [tok("a#1")]);
    const node = nodes.get("a#1")!;
    motion.dragStart("a#1");
    run(400);
    expect(node.getAttribute("transform")).toMatch(/scale\(1\.07, 1\.07\)/);
    expect(node.style.filter).toContain("drop-shadow");
    motion.dragTo("a#1", 240.3, 100);
    expect(xOf(node)).toBe(240.3);
    motion.dragEnd("a#1");
    run(900);
    expect(node.getAttribute("transform")).toBe("translate(240, 100)");
    expect(node.style.filter).toBe("");
    motion.dispose();
  });

  it("drops in a card this client played, and fades one it sent to a pile", () => {
    const motion = createTokenAnimator();
    const nodes = new Map<string, SVGGElement>();
    const parent = g();
    render(motion, nodes, [tok("a#1")]);
    announceLanding("a#2", { flipFromFace: true });
    render(motion, nodes, [tok("a#1"), tok("a#2", { faceDown: true })]);
    const card = nodes.get("a#2")!;
    parent.appendChild(card);
    expect(card.getAttribute("transform")).toContain("scale(");
    expect(motion.faceOverride("a#2")).toEqual({
      faceDown: false,
      flipped: undefined,
    });
    run(900);
    expect(card.getAttribute("transform")).toBe("translate(100, 100)");

    announceExit("a#2", "discard");
    motion.beginRender([tok("a#1")], { draggingId: null });
    motion.exit(card, tok("a#2", { faceDown: true }));
    card.remove();
    motion.endRender();
    // a copy carries the animation; d3 already removed the real one
    expect(parent.querySelectorAll(".tok-fx")).toHaveLength(1);
    run(400);
    expect(parent.querySelectorAll(".tok-fx")).toHaveLength(0);
    motion.dispose();
  });
});
