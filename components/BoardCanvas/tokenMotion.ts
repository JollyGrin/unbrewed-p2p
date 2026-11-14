/**
 * Motion for the board's tokens (useCanvas.tsx): the lift when one is picked
 * up and the settle when it is put down, a real flip, smooth travel for moves
 * that arrive over the wire (other players drag at ~20 Hz), and cards flying
 * in from the hand or out to a pile.
 *
 * Same approach as the hand fan (Game/Hand/fanMotion.ts): springs stepped in
 * one rAF loop that writes the `transform` attribute of each `g.tok`, never a
 * React render per frame. d3 replaces a token's inner markup on every render,
 * so everything here lives on the `g.tok` itself, which d3 keeps (keyed by id).
 *
 * Nothing waits for an animation: the wire state is applied at once, the
 * token's hit box is where the state says, and every spring can be retargeted
 * or overridden by a drag mid-flight.
 *
 * `planTokenMotion` decides what may animate in a render. A whole snapshot
 * (first paint, rejoin, new game) changes many tokens at once and animates
 * nothing; a single remote change does.
 */
import {
  SpringConfig,
  motionAllowed,
  settled,
  stepSpring,
} from "../Game/Hand/fanMotion";

/** A token following its wire position (remote drags, ~20 Hz updates). */
export const REMOTE_FOLLOW: SpringConfig = { k: 300, zeta: 1 };
/** Picking a token up: quick, no overshoot. */
export const LIFT_UP: SpringConfig = { k: 900, zeta: 1 };
/** Putting it down: a little underdamped, so it settles instead of stopping. */
export const SETTLE: SpringConfig = { k: 520, zeta: 0.5 };
/** A card arriving from the hand or the deck button. */
export const LAND: SpringConfig = { k: 420, zeta: 0.9 };

/** How much a held token grows (1 = fully lifted). */
export const LIFT_SCALE = 0.07;
/** A full flip, seconds. The face changes at the half-way point. */
export const FLIP_SECONDS = 0.24;
/** A card leaving for a pile, seconds. */
export const EXIT_SECONDS = 0.2;
/** A token another player removed fading out in place, seconds. */
export const FADE_SECONDS = 0.14;
/** More un-announced changes than this in one render is a snapshot: snap. */
export const STORM_LIMIT = 3;

export type TokenFace = { faceDown?: boolean; flipped?: boolean };

/** What the planner needs to know about a token in one render. */
export type TokenSnap = TokenFace & {
  id: string;
  owner: string;
  x: number;
  y: number;
};

export type MotionPlan = {
  moves: Set<string>;
  flips: Set<string>;
  enters: Set<string>;
  exits: Set<string>;
};

const emptyPlan = (): MotionPlan => ({
  moves: new Set(),
  flips: new Set(),
  enters: new Set(),
  exits: new Set(),
});

const sameFace = (a: TokenFace, b: TokenFace) =>
  !!a.faceDown === !!b.faceDown && !!a.flipped === !!b.flipped;

/**
 * Which tokens may animate between two renders.
 *
 * - `prev` null (the board's first render): nothing.
 * - A change this client announced (a card it played or took back) always
 *   animates.
 * - Other changes animate only while there are at most STORM_LIMIT of them:
 *   one player moving or flipping a token is a few; a rejoin, a new game or a
 *   deck change rewrites the table and must not replay as a burst.
 * - A token that appears un-announced animates only if its owner already had
 *   tokens here, so a player's first blob (join, re-seed) just appears.
 */
export function planTokenMotion(
  prev: ReadonlyMap<string, TokenSnap> | null,
  next: readonly TokenSnap[],
  opts: {
    draggingId?: string | null;
    announcedEnter?: (id: string) => boolean;
    announcedExit?: (id: string) => boolean;
  } = {},
): MotionPlan {
  const plan = emptyPlan();
  if (!prev) return plan;
  const quiet = emptyPlan();
  const owners = new Set<string>();
  prev.forEach((t) => owners.add(t.owner));
  const seen = new Set<string>();
  for (const t of next) {
    seen.add(t.id);
    const was = prev.get(t.id);
    if (!was) {
      if (opts.announcedEnter?.(t.id)) plan.enters.add(t.id);
      else if (owners.has(t.owner)) quiet.enters.add(t.id);
      continue;
    }
    if (!sameFace(was, t)) quiet.flips.add(t.id);
    if ((was.x !== t.x || was.y !== t.y) && t.id !== opts.draggingId)
      quiet.moves.add(t.id);
  }
  prev.forEach((t, id) => {
    if (seen.has(id)) return;
    if (opts.announcedExit?.(id)) plan.exits.add(id);
    else quiet.exits.add(id);
  });
  const changed = new Set<string>();
  (["moves", "flips", "enters", "exits"] as const).forEach((k) =>
    quiet[k].forEach((id) => changed.add(id)),
  );
  if (changed.size > STORM_LIMIT) return plan;
  (["moves", "flips", "enters", "exits"] as const).forEach((k) =>
    quiet[k].forEach((id) => plan[k].add(id)),
  );
  return plan;
}

/**
 * A flip at progress p (0..1): the token turns edge-on at the half-way point
 * (where its face is swapped) and rises a little through the turn.
 */
export const flipPose = (p: number): { sx: number; rise: number } => {
  const c = Math.min(1, Math.max(0, p));
  return {
    sx: Math.max(0.02, Math.abs(Math.cos(Math.PI * c))),
    rise: Math.sin(Math.PI * c),
  };
};

/**
 * Where a flip that is `p` through restarts when the token flips back before
 * it finished: it turns round from where it is instead of starting over.
 */
export const reverseFlip = (p: number) => 1 - Math.min(1, Math.max(0, p));

/** A card on its way to a pile at progress p: shrinks, fades at the end. */
export const exitPose = (p: number) => {
  const c = Math.min(1, Math.max(0, p));
  const e = c * c * (3 - 2 * c);
  return {
    travel: e,
    scale: 1 - 0.65 * e,
    opacity: c < 0.55 ? 1 : Math.max(0, 1 - (c - 0.55) / 0.45),
  };
};

/** The `transform` of a token: plain when at rest, about its centre when not. */
export const tokenTransform = (
  x: number,
  y: number,
  w: number,
  h: number,
  pose: { sx?: number; sy?: number; rot?: number } = {},
): string => {
  const { sx = 1, sy = 1, rot = 0 } = pose;
  const base = `translate(${x}, ${y})`;
  if (sx === 1 && sy === 1 && rot === 0) return base;
  const cx = w / 2;
  const cy = h / 2;
  const turn = rot === 0 ? "" : ` rotate(${round(rot)})`;
  return `${base} translate(${cx}, ${cy})${turn} scale(${round(sx, 4)}, ${round(
    sy,
    4,
  )}) translate(${-cx}, ${-cy})`;
};

const round = (n: number, places = 2) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** A screen-space pose a card is arriving from (the drag ghost, a hand card,
 * the deck button): its centre, drawn width and rotation. */
export type ScreenPose = { x: number; y: number; width: number; rot?: number };

/** A token this client is about to add, and how it should arrive. */
export type Landing = {
  from?: ScreenPose;
  /** It was face-up in the hand and lands face-down: turn it over on arrival. */
  flipFromFace?: boolean;
};

export type ExitTo = "hand" | "deck" | "discard";

const HINT_TTL = 2000;
const landings = new Map<string, Landing & { at: number }>();
const exits = new Map<string, { to: ExitTo; at: number }>();
const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();
const prune = <T extends { at: number }>(m: Map<string, T>) => {
  const t = now();
  m.forEach((v, k) => {
    if (t - v.at > HINT_TTL) m.delete(k);
  });
};

/** Tell the board a token it is about to receive was just played locally. */
export const announceLanding = (id: string, landing: Landing = {}) => {
  prune(landings);
  landings.set(id, { ...landing, at: now() });
};

/** Tell the board a token about to disappear was sent somewhere locally. */
export const announceExit = (id: string, to: ExitTo) => {
  prune(exits);
  exits.set(id, { to, at: now() });
};

/** The pile buttons carry `data-pile`, so a leaving card knows where to go. */
export const pileRect = (pile: "deck" | "discard"): DOMRect | null =>
  typeof document === "undefined"
    ? null
    : document.querySelector(`[data-pile="${pile}"]`)?.getBoundingClientRect() ??
      null;

type Sim = {
  node: SVGGElement;
  w: number;
  h: number;
  /** drawn position, and the wire position it is heading for */
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  follow: SpringConfig;
  /** 0 = on the table, 1 = held */
  lift: number;
  vlift: number;
  held: boolean;
  /** extra scale (a card arriving from a pose of another size) → 1 */
  grow: number;
  vgrow: number;
  /** degrees → 0 */
  rot: number;
  vrot: number;
  flip: { p: number; prev: TokenFace } | null;
  /** see `hitAhead` */
  hit?: SVGRectElement;
};

type Fx = {
  node: SVGGElement;
  w: number;
  h: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  p: number;
  seconds: number;
  travel: boolean;
  /** the token's own opacity (other players' tokens are drawn at 0.8) */
  o0: number;
};

let activeAnimator: TokenAnimator | null = null;

/** On-screen rect of a token on the mounted board, if it is drawn. */
export const tokenScreenRect = (id: string): DOMRect | null =>
  activeAnimator?.rectOf(id) ?? null;

export type TokenAnimator = ReturnType<typeof createTokenAnimator>;

type PlacedToken = TokenSnap;

/**
 * Owns the `transform` of every `g.tok`. useCanvas calls `beginRender`, then
 * `place` for each token (and `exit` for each one d3 is about to remove), then
 * `endRender`; drags go through `dragStart` / `dragTo` / `dragEnd`.
 */
export function createTokenAnimator(opts: { onFlipMid?: () => void } = {}) {
  const sims = new Map<string, Sim>();
  const fx: Fx[] = [];
  let prev: Map<string, TokenSnap> | null = null;
  let before: Map<string, TokenSnap> | null = null;
  let plan = emptyPlan();
  let enabled = false;
  let draggingId: string | null = null;
  let rotated = false;
  let raf: number | null = null;
  let last = 0;

  const scale = (s: Sim) => {
    const f = s.flip ? flipPose(s.flip.p) : null;
    const k = (1 + LIFT_SCALE * s.lift + (f ? 0.06 * f.rise : 0)) * s.grow;
    return { sx: k * (f ? f.sx : 1), sy: k };
  };

  const atRest = (s: Sim) =>
    !s.held &&
    !s.flip &&
    s.lift === 0 &&
    s.grow === 1 &&
    s.rot === 0 &&
    s.x === s.tx &&
    s.y === s.ty;

  /**
   * A token gliding to a new wire position is drawn behind the place it
   * really is, and a click aimed at that place would miss it. While it
   * travels it carries an unpainted rect over its true spot, so it can be
   * hit there as well as where it is drawn. (Renders replace a token's
   * markup; the next frame puts the rect back.)
   */
  const hitAhead = (s: Sim) => {
    const ahead = !s.held && (s.x !== s.tx || s.y !== s.ty);
    if (!ahead) {
      if (s.hit) s.hit.remove();
      s.hit = undefined;
      return;
    }
    const doc = s.node.ownerDocument;
    if (!doc || typeof doc.createElementNS !== "function") return;
    if (!s.hit) {
      s.hit = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
      s.hit.setAttribute("class", "hit-ahead");
      s.hit.setAttribute("fill", "none");
      // hit whatever the fill: follows the token's own `pointer-events`,
      // so a token that is inert to the pointer stays inert
      s.hit.setAttribute("pointer-events", "inherit");
    }
    if (s.hit.parentNode !== s.node) s.node.appendChild(s.hit);
    s.hit.setAttribute("x", String(round(s.tx - s.x)));
    s.hit.setAttribute("y", String(round(s.ty - s.y)));
    s.hit.setAttribute("width", String(s.w));
    s.hit.setAttribute("height", String(s.h));
  };

  const write = (s: Sim) => {
    hitAhead(s);
    if (atRest(s)) {
      s.node.setAttribute("transform", `translate(${s.x}, ${s.y})`);
      if (s.node.style.filter) s.node.style.filter = "";
      return;
    }
    s.node.setAttribute(
      "transform",
      tokenTransform(round(s.x), round(s.y), s.w, s.h, {
        ...scale(s),
        rot: s.rot,
      }),
    );
    // The shadow is what sells the lift; only a held token wears it, so at
    // most one filter is ever live on the board.
    const shade = s.held || s.lift > 0.04 ? Math.max(0, Math.min(1, s.lift)) : 0;
    s.node.style.filter =
      shade > 0
        ? `drop-shadow(0 ${round((rotated ? -9 : 9) * shade, 1)}px ${round(
            10 * shade,
            1,
          )}px rgba(20, 8, 24, ${round(0.5 * shade)}))`
        : "";
  };

  const snap = (s: Sim) => {
    Object.assign(s, {
      x: s.tx,
      y: s.ty,
      vx: 0,
      vy: 0,
      lift: s.held ? 1 : 0,
      vlift: 0,
      grow: 1,
      vgrow: 0,
      rot: 0,
      vrot: 0,
      flip: null,
    });
  };

  const step = (s: Sim, dt: number): { busy: boolean; mid: boolean } => {
    let mid = false;
    if (!s.held || s.x !== s.tx || s.y !== s.ty) {
      [s.x, s.vx] = stepSpring(s.x, s.vx, s.tx, dt, s.follow);
      [s.y, s.vy] = stepSpring(s.y, s.vy, s.ty, dt, s.follow);
      if (settled(s.x, s.vx, s.tx, 0.3) && settled(s.y, s.vy, s.ty, 0.3))
        Object.assign(s, { x: s.tx, y: s.ty, vx: 0, vy: 0 });
    }
    const tl = s.held ? 1 : 0;
    [s.lift, s.vlift] = stepSpring(
      s.lift,
      s.vlift,
      tl,
      dt,
      s.held ? LIFT_UP : SETTLE,
    );
    if (settled(s.lift, s.vlift, tl, 0.004)) Object.assign(s, { lift: tl, vlift: 0 });
    [s.grow, s.vgrow] = stepSpring(s.grow, s.vgrow, 1, dt, LAND);
    if (settled(s.grow, s.vgrow, 1, 0.003)) Object.assign(s, { grow: 1, vgrow: 0 });
    [s.rot, s.vrot] = stepSpring(s.rot, s.vrot, 0, dt, LAND);
    if (settled(s.rot, s.vrot, 0, 0.1)) Object.assign(s, { rot: 0, vrot: 0 });
    if (s.flip) {
      const was = s.flip.p;
      s.flip.p = was + dt / FLIP_SECONDS;
      if (was < 0.5 && s.flip.p >= 0.5) mid = true;
      if (s.flip.p >= 1) s.flip = null;
    }
    const busy =
      !!s.flip ||
      s.x !== s.tx ||
      s.y !== s.ty ||
      s.lift !== tl ||
      s.grow !== 1 ||
      s.rot !== 0;
    return { busy, mid };
  };

  const stepFx = (f: Fx, dt: number): boolean => {
    f.p += dt / f.seconds;
    if (f.p >= 1) {
      f.node.remove();
      return false;
    }
    if (f.travel) {
      const pose = exitPose(f.p);
      f.node.setAttribute(
        "transform",
        tokenTransform(
          round(f.x0 + (f.x1 - f.x0) * pose.travel),
          round(f.y0 + (f.y1 - f.y0) * pose.travel),
          f.w,
          f.h,
          { sx: pose.scale, sy: pose.scale },
        ),
      );
      f.node.setAttribute("opacity", String(round(f.o0 * pose.opacity)));
    } else {
      const s = 1 - 0.08 * f.p;
      f.node.setAttribute(
        "transform",
        tokenTransform(f.x0, f.y0, f.w, f.h, { sx: s, sy: s }),
      );
      f.node.setAttribute("opacity", String(round(f.o0 * (1 - f.p))));
    }
    return true;
  };

  const frame = (t: number) => {
    const dt = Math.max(0, (t - last) / 1000);
    last = t;
    let busy = false;
    let mid = false;
    sims.forEach((s) => {
      if (atRest(s)) return;
      const r = step(s, dt);
      write(s);
      busy = busy || r.busy;
      mid = mid || r.mid;
    });
    for (let i = fx.length - 1; i >= 0; i--) {
      if (stepFx(fx[i], dt)) busy = true;
      else fx.splice(i, 1);
    }
    raf = busy ? requestAnimationFrame(frame) : null;
    // The new face is drawn by the normal render path, so its handlers are
    // wired exactly as for any other render.
    if (mid) opts.onFlipMid?.();
  };

  const kick = () => {
    if (raf != null || typeof requestAnimationFrame !== "function") return;
    last = now();
    raf = requestAnimationFrame(frame);
  };

  /** Board units per screen px, and the screen → board map, for a token. */
  const boardSpace = (node: SVGGElement) => {
    const parent = node.parentNode as SVGGElement | null;
    if (!parent || typeof parent.getScreenCTM !== "function") return null;
    const m = parent.getScreenCTM();
    if (!m) return null;
    const inv = m.inverse();
    return {
      k: Math.hypot(m.a, m.b) || 1,
      point: (sx: number, sy: number) => ({
        x: inv.a * sx + inv.c * sy + inv.e,
        y: inv.b * sx + inv.d * sy + inv.f,
      }),
    };
  };

  const land = (s: Sim, landing: Landing | undefined, d: PlacedToken) => {
    const space = landing?.from ? boardSpace(s.node) : null;
    if (landing?.from && space) {
      const { from } = landing;
      const centre = space.point(from.x, from.y);
      s.x = centre.x - s.w / 2;
      s.y = centre.y - s.h / 2;
      s.grow = Math.max(0.1, from.width / (s.w * space.k));
      s.rot = from.rot ?? 0;
      s.follow = LAND;
      // a card put down face-up is pressed onto the table
      if (!landing.flipFromFace) s.vlift = -14;
    } else {
      // no known origin: it drops in from just above the table
      s.lift = 1.6;
    }
    if (landing?.flipFromFace && d.faceDown)
      s.flip = { p: 0, prev: { faceDown: false, flipped: d.flipped } };
  };

  /** Put a held token down where it is. Does nothing to one already down. */
  const release = (s: Sim) => {
    if (!s.held) return;
    s.held = false;
    if (!enabled) {
      snap(s);
      return write(s);
    }
    // the wire position is this one rounded: don't spring a sub-pixel
    s.x = s.tx = Math.round(s.x);
    s.y = s.ty = Math.round(s.y);
    write(s);
    kick();
  };

  const api = {
    /** Start a render: plan what may animate against the previous one. */
    beginRender(
      tokens: readonly PlacedToken[],
      state: { draggingId: string | null; rotated?: boolean },
    ) {
      enabled = motionAllowed();
      draggingId = state.draggingId;
      rotated = !!state.rotated;
      prune(landings);
      prune(exits);
      const next = new Map<string, TokenSnap>();
      tokens.forEach((t) =>
        next.set(t.id, {
          id: t.id,
          owner: t.owner,
          x: t.x,
          y: t.y,
          faceDown: t.faceDown,
          flipped: t.flipped,
        }),
      );
      plan = enabled
        ? planTokenMotion(prev, tokens, {
            draggingId,
            announcedEnter: (id) => landings.has(id),
            announcedExit: (id) => exits.has(id),
          })
        : emptyPlan();
      before = prev;
      prev = next;
      activeAnimator = api;
    },

    /** Position one token for this render. */
    place(node: SVGGElement, d: PlacedToken, w: number, h: number) {
      let s = sims.get(d.id);
      const fresh = !s;
      if (!s) {
        s = {
          node,
          w,
          h,
          x: d.x,
          y: d.y,
          vx: 0,
          vy: 0,
          tx: d.x,
          ty: d.y,
          follow: REMOTE_FOLLOW,
          lift: 0,
          vlift: 0,
          held: false,
          grow: 1,
          vgrow: 0,
          rot: 0,
          vrot: 0,
          flip: null,
        };
        sims.set(d.id, s);
      }
      s.node = node;
      s.w = w;
      s.h = h;
      // the dragged token follows the pointer until it is released
      if (d.id === draggingId && s.held) return write(s);
      const retargeted = s.tx !== d.x || s.ty !== d.y;
      s.tx = d.x;
      s.ty = d.y;
      if (!enabled) {
        snap(s);
        return write(s);
      }
      if (fresh) {
        if (plan.enters.has(d.id)) {
          const landing = landings.get(d.id);
          landings.delete(d.id);
          land(s, landing, d);
        }
      } else if (plan.moves.has(d.id)) {
        s.follow = REMOTE_FOLLOW;
      } else if (retargeted) {
        // moved as part of a snapshot, or by less than a drag's rounding
        Object.assign(s, { x: d.x, y: d.y, vx: 0, vy: 0 });
      }
      if (!fresh && plan.flips.has(d.id)) {
        const was = before?.get(d.id);
        s.flip = {
          p: s.flip ? reverseFlip(s.flip.p) : 0,
          prev: { faceDown: was?.faceDown, flipped: was?.flipped },
        };
      }
      write(s);
      if (!atRest(s)) kick();
    },

    /** A token d3 is about to remove: send a copy of it on its way. */
    exit(node: SVGGElement, d: PlacedToken) {
      const s = sims.get(d.id);
      // a token that changed layer is still on the board under the same id
      if (s && s.node !== node) return;
      sims.delete(d.id);
      const hint = exits.get(d.id);
      exits.delete(d.id);
      if (!enabled || !plan.exits.has(d.id) || !s) return;
      // to the hand: the fan flies its new card in from this token's rect
      if (hint?.to === "hand") return;
      const parent = node.parentNode;
      if (!parent || typeof node.cloneNode !== "function") return;
      const clone = node.cloneNode(true) as SVGGElement;
      clone.setAttribute("class", "tok-fx");
      clone.setAttribute("pointer-events", "none");
      clone.style.filter = "";
      const f: Fx = {
        node: clone,
        w: s.w,
        h: s.h,
        x0: s.x,
        y0: s.y,
        x1: s.x,
        y1: s.y,
        p: 0,
        seconds: FADE_SECONDS,
        travel: false,
        o0: parseFloat(node.getAttribute("opacity") ?? "1") || 1,
      };
      const rect = hint ? pileRect(hint.to) : null;
      const space = rect ? boardSpace(node) : null;
      if (rect && space) {
        const to = space.point(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        Object.assign(f, {
          x1: to.x - s.w / 2,
          y1: to.y - s.h / 2,
          seconds: EXIT_SECONDS,
          travel: true,
        });
      }
      parent.appendChild(clone);
      fx.push(f);
      kick();
    },

    endRender() {
      // tokens whose group was not rendered this time (never the case today)
      sims.forEach((s, id) => {
        if (!prev?.has(id)) sims.delete(id);
      });
    },

    /** The face to draw instead of the token's own while it turns over. */
    faceOverride(id: string): TokenFace | null {
      const f = sims.get(id)?.flip;
      return f && f.p < 0.5 ? f.prev : null;
    },

    dragStart(id: string) {
      const s = sims.get(id);
      if (!s) return;
      s.held = true;
      if (!enabled) return;
      // picking a token up mid-flight takes it from where it is drawn
      Object.assign(s, { tx: s.x, ty: s.y, vx: 0, vy: 0 });
      write(s);
      kick();
    },

    dragTo(id: string, x: number, y: number) {
      const s = sims.get(id);
      if (!s) return;
      // 1:1 with the pointer: a spring here would read as input lag
      Object.assign(s, { x, y, tx: x, ty: y, vx: 0, vy: 0 });
      write(s);
    },

    dragEnd(id: string) {
      const s = sims.get(id);
      if (s) release(s);
    },

    /**
     * Put down every token still held. The board calls this once the pointer
     * is certainly up (window-level release, blur), in case a drag's own end
     * never arrived. A no-op when nothing is held, so it is safe after
     * `dragEnd`.
     */
    releaseAll() {
      sims.forEach((s) => {
        if (s.held) release(s);
      });
    },

    rectOf(id: string): DOMRect | null {
      const node = sims.get(id)?.node;
      return node && typeof node.getBoundingClientRect === "function"
        ? node.getBoundingClientRect()
        : null;
    },

    dispose() {
      if (raf != null && typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(raf);
      raf = null;
      fx.forEach((f) => f.node.remove());
      fx.length = 0;
      sims.clear();
      if (activeAnimator === api) activeAnimator = null;
    },
  };
  return api;
}
