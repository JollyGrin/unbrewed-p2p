import React, {
  CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Box, Flex } from "@chakra-ui/react";
import { Card } from "../CardFactory/Card";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import styled from "@emotion/styled";
import { colors, fonts } from "@/styles/style";
import { PopoverCardActions } from "./card-actions.popover";
import { getBoardSvg, getBoardTransform } from "../BoardCanvas/boardTransform";
import { pileRect } from "../BoardCanvas/tokenMotion";
import { DEFAULT_CARD_TOKEN_WIDTH } from "../Positions/position.type";
import { flyClone } from "./Hand/flyClone";
import {
  ARRIVAL_STAGGER,
  ARRIVE,
  FOCUS_IN,
  FOCUS_LIFT_RATIO,
  FOCUS_OUT,
  FOCUS_SCALE,
  FOLLOW,
  LAYOUT,
  MAX_TILT,
  RETURN,
  SWAY,
  TILT,
  arrivalStart,
  ghostScaleOnBoard,
  handArrivals,
  motionAllowed,
  pickFocus,
  prefersReducedMotion,
  riseFor,
  settled,
  spreadFor,
  stepSpring,
  swayFor,
  takeHandArrival,
} from "./Hand/fanMotion";

const CARD_WIDTH = 150;
const CARD_HEIGHT = 200;
/** The card face is 63:88 and fills the slot's height, so it is drawn a
 * little narrower than the slot. Sizes shared with the board use this. */
const CARD_FACE_WIDTH = (CARD_HEIGHT * 63) / 88;
/** widest the fan is allowed to spread before cards overlap tighter */
const MAX_FAN_WIDTH = 950;
/** pointer travel (px) before a press on a card becomes a drag-to-table */
const DRAG_THRESHOLD = 12;

const handleDragStart = (e: React.DragEvent) => {
  e.preventDefault();
};

type CardWrapperProps = {
  cards: DeckImportCardType[] | undefined;
  functions: {
    discardFn: (index: number) => void;
    /**
     * @deprecated Commit-modal flow — superseded by dragging cards to the
     * table (face-down by default). Kept wired so the modal machinery still
     * works, but no UI triggers it since the fan's "+" button was hidden.
     */
    commitFn: (index: number) => void;
    boostFn: (index: number) => void;
    deckCardFn: (index: number) => void;
    deckCardBottomFn: (index: number) => void;
    /** Play hand[index] onto the table — absent offline (no board). */
    playFn?: (
      index: number,
      opts?: {
        faceDown?: boolean;
        screenPos?: { x: number; y: number };
        /** Where the card is drawn as it is played (motion only). */
        from?: { x: number; y: number; width: number; rot?: number };
      },
    ) => void;
    /** Give hand[index] to another player (escrow transfer). */
    giveFn?: (index: number, to: string) => void;
  };
  /** Other players in the room, for the "Give card to…" actions. */
  opponents?: string[];
  /** Cards left in the deck: a new hand card that left the deck flies in
   * from the Deck button. */
  deckCount?: number;
};

/**
 * Where a card picked up at `index` sits in `cards` now: the same slot if it
 * is still there, else wherever that same object moved to, else -1 (it left
 * the hand mid-drag — played, discarded, or wiped by a reset).
 */
export const resolveHandIndex = (
  cards: DeckImportCardType[] | undefined,
  card: DeckImportCardType,
  index: number,
): number => (cards?.[index] === card ? index : cards?.indexOf(card) ?? -1);

/** Per-card spring state for the fan's hover motion. */
type CardSim = {
  /** focus amount 0..1: 1 = straightened, lifted, enlarged */
  f: number;
  vf: number;
  /** sideways push away from the focused card, px */
  spread: number;
  vs: number;
  /** cursor-proximity rise, px */
  rise: number;
  vr: number;
  /** cursor tilt, degrees */
  tx: number;
  vtx: number;
  ty: number;
  vty: number;
  /** arrival: 1 = at its origin (deck button, table token), 0 = in its slot */
  arr: number;
  varr: number;
  /** where the arrival starts: offset in the slot's frame, and scale */
  ax: number;
  ay: number;
  as: number;
  /** seconds before the arrival starts moving (staggered batches) */
  delay: number;
  /** fade in on the way (a card appearing out of a button) */
  fade: boolean;
};
const restSim = (): CardSim => ({
  arr: 0,
  varr: 0,
  ax: 0,
  ay: 0,
  as: 1,
  delay: 0,
  fade: false,
  f: 0,
  vf: 0,
  spread: 0,
  vs: 0,
  rise: 0,
  vr: 0,
  tx: 0,
  vtx: 0,
  ty: 0,
  vty: 0,
});

/** Spring state for the drag ghost (screen-space centre, scale, rotation). */
type GhostSim = {
  x: number;
  vx: number;
  y: number;
  vy: number;
  s: number;
  vs: number;
  rot: number;
  vrot: number;
  /** where the pointer is (follow mode) */
  px: number;
  py: number;
  overBoard: boolean;
  /** "return": a cancelled drag flying back to its slot */
  mode: "follow" | "return";
  home?: { x: number; y: number; rot: number };
};

const clamp1 = (n: number) => Math.max(-1, Math.min(1, n));

/**
 * Hand of cards fanned in an arc, floating over the board like a
 * physical hand held at the table edge.
 *
 * Hover is cursor-driven, not a fixed CSS pose: the card nearest the cursor
 * springs up (straightened, enlarged), its neighbours slide aside and every
 * card rises a little by its distance to the cursor, and the focused card
 * tilts toward the cursor. All of it runs in one rAF loop writing inline
 * transforms (see fanMotion.ts), so pointing at the hand never re-renders it.
 *
 * Cards can be dragged out of the fan and dropped on the board to play
 * them to the table: a fixed-position ghost lifts off from where the card
 * is drawn, trails the pointer on a spring (swaying with its speed), and the
 * drop lands only if it releases over the board svg (checked with
 * elementFromPoint, so drops onto other UI cancel and fly back to the hand).
 */
export const HandFan: React.FC<CardWrapperProps> = ({
  cards,
  functions,
  opponents,
  deckCount,
}) => {
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{
    card: DeckImportCardType;
    index: number;
  } | null>(null);
  // A drop fires long after the render its drag started in (issue #496): the
  // hand can change underneath it. Read the hand and handlers through refs so
  // pointerup plays the card that was picked up — found by identity — with
  // the current handlers, not the ones (and the pool) from pointerdown.
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const functionsRef = useRef(functions);
  functionsRef.current = functions;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const slotEls = useRef<(HTMLDivElement | null)[]>([]);
  const liftEls = useRef<(HTMLDivElement | null)[]>([]);
  const tiltEls = useRef<(HTMLDivElement | null)[]>([]);
  const sims = useRef<CardSim[]>([]);
  /** cursor over the hand: focused card, x within the fan, tilt coords -1..1 */
  const hover = useRef<{
    focus: number | null;
    x: number | null;
    u: number;
    v: number;
  }>({ focus: null, x: null, u: 0, v: 0 });
  /** a drag (or its fly-back) is in progress: the fan goes quiet */
  const dragging = useRef(false);
  const ghost = useRef<GhostSim | null>(null);
  const reduced = useRef(false);
  const raf = useRef<number | null>(null);
  const lastFrame = useRef(0);

  const count = cards?.length ?? 0;
  const mid = (count - 1) / 2;
  const spacing =
    count > 1
      ? Math.min(CARD_WIDTH * 0.72, (MAX_FAN_WIDTH - CARD_WIDTH) / (count - 1))
      : 0;
  const fanWidth = spacing * (count - 1) + CARD_WIDTH;
  const tiltPerCard = Math.min(4, 26 / Math.max(count, 1));
  const rotOf = (i: number) => (i - mid) * tiltPerCard;
  // outer cards droop DOWN for a natural fan; focus fully compensates so
  // drooped cards still lift into full view
  const droopOf = (i: number) => Math.abs(i - mid) ** 2 * spacing * 0.045;
  const layout = useRef({ count, spacing, rotOf, droopOf });
  layout.current = { count, spacing, rotOf, droopOf };

  /** Advance every card's springs and write the transforms. Busy = still moving. */
  const stepFan = (dt: number): boolean => {
    const { count, spacing, rotOf, droopOf } = layout.current;
    const h = hover.current;
    const quiet = dragging.current;
    const focus = quiet ? null : h.focus;
    const px = quiet ? null : h.x;
    let busy = false;
    sims.current.length = count;
    for (let i = 0; i < count; i++) {
      const s = (sims.current[i] ??= restSim());
      const focused = focus === i;
      const tf = focused ? 1 : 0;
      const tSpread = spreadFor(i, focus, spacing, CARD_WIDTH);
      const tRise = riseFor(i, px, spacing, CARD_WIDTH);
      const tTx = focused && !reduced.current ? -h.v * MAX_TILT : 0;
      const tTy = focused && !reduced.current ? h.u * MAX_TILT : 0;
      if (reduced.current) {
        Object.assign(s, restSim(), { f: tf, spread: tSpread });
      } else {
        [s.f, s.vf] = stepSpring(
          s.f,
          s.vf,
          tf,
          dt,
          tf > s.f ? FOCUS_IN : FOCUS_OUT,
        );
        [s.spread, s.vs] = stepSpring(s.spread, s.vs, tSpread, dt, LAYOUT);
        [s.rise, s.vr] = stepSpring(s.rise, s.vr, tRise, dt, LAYOUT);
        [s.tx, s.vtx] = stepSpring(s.tx, s.vtx, tTx, dt, TILT);
        [s.ty, s.vty] = stepSpring(s.ty, s.vty, tTy, dt, TILT);
        const still =
          settled(s.f, s.vf, tf, 0.002) &&
          settled(s.spread, s.vs, tSpread, 0.1) &&
          settled(s.rise, s.vr, tRise, 0.1) &&
          settled(s.tx, s.vtx, tTx, 0.05) &&
          settled(s.ty, s.vty, tTy, 0.05);
        if (still)
          Object.assign(s, {
            f: tf,
            vf: 0,
            spread: tSpread,
            vs: 0,
            rise: tRise,
            vr: 0,
            tx: tTx,
            vtx: 0,
            ty: tTy,
            vty: 0,
          });
        else busy = true;
        if (s.arr !== 0) {
          if (s.delay > 0) s.delay -= dt;
          else [s.arr, s.varr] = stepSpring(s.arr, s.varr, 0, dt, ARRIVE);
          if (s.delay <= 0 && settled(s.arr, s.varr, 0, 0.002))
            Object.assign(s, { arr: 0, varr: 0 });
          else busy = true;
        }
      }

      const lift = liftEls.current[i];
      const tilt = tiltEls.current[i];
      const slot = slotEls.current[i];
      // Counter-rotate by the focus amount so the card straightens to upright
      // (edge cards don't pop up tilted/cropped); with the slot's rotation
      // cancelled the rise/scale act in screen space. Adding the droop makes
      // every card converge to the SAME lifted height. The proximity rise
      // fades out on the focused card so its action buttons stay put.
      const y =
        s.f * (-droopOf(i) - CARD_HEIGHT * FOCUS_LIFT_RATIO) -
        s.rise * (1 - s.f);
      // An arriving card is drawn upright at its origin and eases into the
      // slot's own angle and place; the slot (the hit target) never moves.
      const upright = Math.min(1, s.f + Math.max(0, s.arr));
      if (lift) {
        lift.style.transform = `${
          s.arr !== 0
            ? `translate(${s.ax * s.arr}px, ${s.ay * s.arr}px) `
            : ""
        }translateX(${s.spread}px) rotate(${
          -rotOf(i) * upright
        }deg) translateY(${y}px) scale(${
          (1 + (FOCUS_SCALE - 1) * s.f) * (1 + (s.as - 1) * s.arr)
        })`;
        lift.style.opacity =
          s.fade && s.arr !== 0
            ? String(Math.max(0, Math.min(1, (1 - s.arr) * 4)))
            : "";
      }
      if (tilt)
        tilt.style.transform = `perspective(900px) rotateX(${s.tx}deg) rotateY(${s.ty}deg)`;
      if (slot) {
        // the card on its way down keeps its height in the stack until it
        // has mostly sunk, instead of dropping behind its neighbours mid-air
        slot.style.zIndex = String(
          focused
            ? 300
            : Math.abs(s.arr) > 0.03
              ? 295
              : s.f > 0.02
                ? 200 + Math.round(s.f * 90)
                : i,
        );
        slot.dataset.focused = String(focused);
      }
    }
    return busy;
  };

  const finishGhost = () => {
    ghost.current = null;
    dragging.current = false;
    setDrag(null);
  };

  const writeGhost = (el: HTMLDivElement | null, g: GhostSim) => {
    if (!el) return;
    el.style.transform = `translate(${g.x - CARD_WIDTH / 2}px, ${
      g.y - CARD_HEIGHT / 2
    }px) rotate(${g.rot}deg) scale(${g.s})`;
    el.style.opacity = g.mode === "follow" && !g.overBoard ? "0.7" : "1";
  };

  /** Advance the drag ghost. Busy = still moving. */
  const stepGhost = (dt: number): boolean => {
    const g = ghost.current;
    if (!g) return false;
    const back = g.mode === "return" && g.home;
    const tx = back ? g.home!.x : g.px;
    const ty = back ? g.home!.y : g.py;
    // over the board it is drawn at hand size; elsewhere (the drop would
    // cancel) it stays a little lifted and faded
    // over the board it is drawn the size it will land at, at any zoom;
    // elsewhere (the drop would cancel) it stays a little lifted and faded
    const ts = back
      ? 1
      : g.overBoard
        ? ghostScaleOnBoard(
            DEFAULT_CARD_TOKEN_WIDTH,
            getBoardTransform().k,
            CARD_FACE_WIDTH,
          )
        : 1.12;
    if (reduced.current) {
      Object.assign(g, { x: tx, y: ty, s: ts, rot: back ? g.home!.rot : 0 });
      writeGhost(ghostRef.current, g);
      if (back) finishGhost();
      return false;
    }
    const cfg = back ? RETURN : FOLLOW;
    [g.x, g.vx] = stepSpring(g.x, g.vx, tx, dt, cfg);
    [g.y, g.vy] = stepSpring(g.y, g.vy, ty, dt, cfg);
    [g.s, g.vs] = stepSpring(g.s, g.vs, ts, dt, cfg);
    // sway with horizontal speed, like a card held by its top edge
    const trot = back ? g.home!.rot : swayFor(g.vx);
    [g.rot, g.vrot] = stepSpring(g.rot, g.vrot, trot, dt, back ? cfg : SWAY);
    writeGhost(ghostRef.current, g);
    const still =
      settled(g.x, g.vx, tx, 0.5) &&
      settled(g.y, g.vy, ty, 0.5) &&
      settled(g.s, g.vs, ts, 0.005) &&
      settled(g.rot, g.vrot, trot, 0.1);
    if (still && back) {
      finishGhost();
      return false;
    }
    return !still;
  };

  const frame = (now: number) => {
    const dt = Math.max(0, (now - lastFrame.current) / 1000);
    lastFrame.current = now;
    const fanBusy = stepFan(dt);
    const ghostBusy = stepGhost(dt);
    raf.current =
      fanBusy || ghostBusy ? requestAnimationFrame(frameRef.current) : null;
  };
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const kick = () => {
    if (raf.current != null || typeof requestAnimationFrame !== "function")
      return;
    lastFrame.current = performance.now();
    raf.current = requestAnimationFrame((t) => frameRef.current(t));
  };
  const kickRef = useRef(kick);
  kickRef.current = kick;

  // Re-apply after every render: the hand may have changed under the springs.
  useEffect(() => kickRef.current());

  // New cards fly into the fan: from the Deck button when they left the deck,
  // from a table token when one was just taken back (noteHandArrival), else a
  // short rise. Runs before paint so a card is never drawn at rest first. The
  // hand can be mutated in place, so the previous one is kept as a copy.
  const prevHand = useRef<{
    cards: DeckImportCardType[] | undefined;
    deckCount: number | undefined;
  }>({ cards: undefined, deckCount: undefined });
  useLayoutEffect(() => {
    const was = prevHand.current;
    prevHand.current = { cards: cards?.slice(), deckCount };
    if (!cards || !motionAllowed()) return;
    const arrivals = handArrivals(was.cards, cards);
    if (!arrivals.length) return;
    const noted = arrivals.length === 1 ? takeHandArrival() : null;
    const deck =
      !noted &&
      was.deckCount != null &&
      deckCount != null &&
      was.deckCount - deckCount === arrivals.length
        ? pileRect("deck")
        : null;
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const { rotOf } = layout.current;
    sims.current.length = cards.length;
    arrivals.forEach((i, n) => {
      const slot = slotEls.current[i];
      if (!slot) return;
      const pivot = {
        x: box.left + slot.offsetLeft + CARD_WIDTH / 2,
        y: box.top + slot.offsetTop + CARD_HEIGHT,
      };
      const origin = noted ??
        (deck && {
          x: deck.left + deck.width / 2,
          y: deck.top + deck.height / 2,
          width: CARD_FACE_WIDTH * 0.3,
        }) ?? {
          x: pivot.x,
          y: pivot.y - CARD_HEIGHT / 2 + 56,
          width: CARD_FACE_WIDTH * 0.92,
        };
      const start = arrivalStart(origin, pivot, rotOf(i), {
        width: CARD_FACE_WIDTH,
        height: CARD_HEIGHT,
      });
      sims.current[i] = {
        ...restSim(),
        arr: 1,
        ax: start.x,
        ay: start.y,
        as: start.scale,
        delay: n * ARRIVAL_STAGGER,
        fade: !noted,
      };
    });
    // draw the first frame now: the card must not flash in its slot
    stepFan(0);
    kickRef.current();
  });

  /** Where hand[index] is drawn right now, for a token that arrives from it. */
  const poseOf = (index: number) => {
    const el = liftEls.current[index] ?? slotEls.current[index];
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    const f = sims.current[index]?.f ?? 0;
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      width: CARD_FACE_WIDTH * (1 + (FOCUS_SCALE - 1) * f),
      rot: rotOf(index) * (1 - f),
    };
  };

  /** A copy of hand[index] flies to a pile as the card itself leaves. */
  const flyToPile = (index: number, pile: "deck" | "discard") => {
    const f = sims.current[index]?.f ?? 0;
    flyClone(liftEls.current[index], pileRect(pile), {
      scale: 1 + (FOCUS_SCALE - 1) * f,
      rot: rotOf(index) * (1 - f),
    });
  };

  // Cursor tracking. Window-wide so the focused card stays up while the
  // cursor moves onto its enlarged face above the hand to read it.
  useEffect(() => {
    reduced.current = prefersReducedMotion();
    const clear = () => {
      const h = hover.current;
      if (h.focus == null && h.x == null) return;
      Object.assign(h, { focus: null, x: null, u: 0, v: 0 });
      kickRef.current();
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType === "touch" || dragging.current) return;
      const container = containerRef.current;
      if (!container) return;
      const h = hover.current;
      const target = ev.target as Element | null;
      const slot = target?.closest?.("[data-fan-slot]");
      const inFan = !!slot && container.contains(slot);
      if (!inFan && h.focus == null) return;
      const box = container.getBoundingClientRect();
      const x = ev.clientX - box.left;
      const focusedLift =
        h.focus != null ? liftEls.current[h.focus] : undefined;
      const onFocusedFace = !!focusedLift && focusedLift.contains(target);
      if (!inFan) {
        clear();
        return;
      }
      if (target?.closest?.(".actions") && h.focus != null) {
        // in the card's action buttons / menu: hold focus
      } else if (onFocusedFace && ev.clientY < box.top) {
        // reading the enlarged card above the hand: hold focus
      } else {
        const { count, spacing } = layout.current;
        h.focus = pickFocus(x, count, spacing, CARD_WIDTH, h.focus);
      }
      h.x = x;
      const lift = h.focus != null ? liftEls.current[h.focus] : undefined;
      if (lift) {
        const r = lift.getBoundingClientRect();
        h.u = clamp1((ev.clientX - (r.left + r.width / 2)) / (r.width / 2));
        h.v = clamp1((ev.clientY - (r.top + r.height / 2)) / (r.height / 2));
      }
      kickRef.current();
    };
    const onOut = (ev: PointerEvent) => {
      if (!ev.relatedTarget) clear(); // left the window
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerout", onOut);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, []);

  const onCardPointerDown = (e: React.PointerEvent, slotIndex: number) => {
    if (!functions.playFn) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // presses on the hover action buttons stay clicks, never drags
    if ((e.target as Element).closest?.(".actions")) return;
    // with a mouse, the card you see raised is the one you pick up, even
    // where its slot overlaps a neighbour's
    const focus = hover.current.focus;
    const index =
      e.pointerType !== "touch" && focus != null && focus < count
        ? focus
        : slotIndex;
    const card = cards?.[index];
    if (!card) return;

    const start = { x: e.clientX, y: e.clientY };
    let active = false;
    // The listeners are window-wide: only the pointer that pressed this card
    // may move or drop it, so a second finger can't fire this card's drop.
    const { pointerId } = e;

    const overBoard = (x: number, y: number) => {
      // ghost is pointer-events:none, so this hits whatever is underneath
      const el = document.elementFromPoint(x, y);
      const svg = getBoardSvg();
      return !!svg && !!el && svg.contains(el);
    };

    const liftOff = (ev: PointerEvent) => {
      // the ghost starts exactly where the card is drawn (raised and
      // enlarged if it was focused) and glides to the pointer from there,
      // instead of teleporting a fresh card under the cursor
      const from = (liftEls.current[index] ?? slotEls.current[index])
        ?.getBoundingClientRect();
      const sim = sims.current[index];
      const f = sim?.f ?? 0;
      const rot = rotOf(index) * (1 - f);
      ghost.current = {
        x: from ? from.left + from.width / 2 : ev.clientX,
        y: from ? from.top + from.height / 2 : ev.clientY,
        vx: 0,
        vy: 0,
        s: 1 + (FOCUS_SCALE - 1) * f,
        vs: 0,
        rot,
        vrot: 0,
        px: ev.clientX,
        py: ev.clientY,
        overBoard: overBoard(ev.clientX, ev.clientY),
        mode: "follow",
      };
      dragging.current = true;
      // forget the hover: once the drag ends the cursor is somewhere else
      Object.assign(hover.current, { focus: null, x: null, u: 0, v: 0 });
      setDrag({ card, index });
      kickRef.current();
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (
        !active &&
        Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > DRAG_THRESHOLD
      ) {
        active = true;
        liftOff(ev);
      }
      const g = ghost.current;
      if (active && g && g.mode === "follow") {
        g.px = ev.clientX;
        g.py = ev.clientY;
        g.overBoard = overBoard(ev.clientX, ev.clientY);
        kickRef.current();
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    /** Cancelled drop: fly the ghost back to the card's slot, then end. */
    const flyBack = () => {
      const g = ghost.current;
      const at = resolveHandIndex(cardsRef.current, card, index);
      const slot = at >= 0 ? slotEls.current[at] : null;
      if (!g || !slot || reduced.current) return finishGhost();
      const r = slot.getBoundingClientRect();
      g.mode = "return";
      g.home = {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        rot: layout.current.rotOf(at),
      };
      kickRef.current();
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      if (!active) return;
      if (!overBoard(ev.clientX, ev.clientY)) return flyBack();
      const at = resolveHandIndex(cardsRef.current, card, index);
      // the token takes over from exactly where the ghost is drawn
      const g = ghost.current;
      const from = g && {
        x: g.x,
        y: g.y,
        width: CARD_FACE_WIDTH * g.s,
        rot: g.rot,
      };
      finishGhost();
      if (at < 0) return; // it left the hand mid-drag — nothing to play
      functionsRef.current.playFn?.(at, {
        screenPos: { x: ev.clientX, y: ev.clientY },
        ...(from ? { from } : {}),
      });
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      if (active) flyBack();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  if (!cards) return null;
  if (cards.length === 0) return <EmptyHandHint />;

  const dragAt = drag ? resolveHandIndex(cards, drag.card, drag.index) : -1;

  return (
    <>
      <FanContainer ref={containerRef} style={{ width: `${fanWidth}px` }}>
        {cards.map((card, index) => {
          // motion is written straight to the DOM by the rAF loop (see
          // stepFan) so pointing at a card never re-renders the fan
          const fanVars = {
            left: `${index * spacing}px`,
            "--rot": `${rotOf(index)}deg`,
            "--droop": `${-droopOf(index)}px`,
            "--z": index,
          } as CSSProperties;
          return (
            <FanCard
              key={index + card.title}
              ref={(el: HTMLDivElement | null) => {
                slotEls.current[index] = el;
              }}
              data-fan-slot
              onDragStart={handleDragStart}
              onPointerDown={(e: React.PointerEvent) =>
                onCardPointerDown(e, index)
              }
              data-dragging={drag != null}
              data-drag-source={dragAt === index}
              style={fanVars}
            >
              <Box
                className="lift"
                ref={(el: HTMLDivElement | null) => {
                  liftEls.current[index] = el;
                }}
              >
                <Box
                  className="tilt"
                  ref={(el: HTMLDivElement | null) => {
                    tiltEls.current[index] = el;
                  }}
                >
                  <Card card={card} />
                </Box>
              </Box>
              {/* The +(commit) / –(discard) buttons are hidden: playing a
                  card is now drag-to-table, and discard lives in the menu.
                  commitFn stays wired (deprecated) for the commit modal. */}
              <Flex className="actions">
                <PopoverCardActions
                  actions={[
                    {
                      text: "Discard",
                      fn: () => {
                        flyToPile(index, "discard");
                        functions.discardFn(index);
                      },
                    },
                    ...(functions.playFn
                      ? [
                          {
                            text: "Place on table",
                            fn: () =>
                              functions.playFn?.(index, { from: poseOf(index) }),
                          },
                          {
                            text: "Place face-up on table",
                            fn: () =>
                              functions.playFn?.(index, {
                                faceDown: false,
                                from: poseOf(index),
                              }),
                          },
                        ]
                      : []),
                    ...(functions.giveFn
                      ? (opponents ?? []).map((name) => ({
                          text: `Give card to ${name}`,
                          fn: () => functions.giveFn?.(index, name),
                        }))
                      : []),
                    {
                      text: "Place top of deck",
                      fn: () => {
                        flyToPile(index, "deck");
                        functions.deckCardFn(index);
                      },
                    },
                    {
                      text: "Place bottom of deck",
                      fn: () => {
                        flyToPile(index, "deck");
                        functions.deckCardBottomFn(index);
                      },
                    },
                  ]}
                />
              </Flex>
            </FanCard>
          );
        })}
      </FanContainer>
      {drag && (
        <DragGhost
          ref={(el: HTMLDivElement | null) => {
            ghostRef.current = el;
            if (el && ghost.current) writeGhost(el, ghost.current);
          }}
        >
          <Card card={drag.card} />
        </DragGhost>
      )}
    </>
  );
};

const EmptyHandHint = () => (
  <Flex
    position="fixed"
    bottom="1.25rem"
    left="50%"
    transform="translateX(-50%)"
    px="1.25rem"
    py="0.4rem"
    alignItems="center"
    border="1px dashed rgba(231, 204, 152, 0.45)"
    borderRadius="10rem"
    color="rgba(231, 204, 152, 0.75)"
    bg="rgba(44, 24, 49, 0.6)"
    fontFamily={fonts.SpaceGrotesk}
    fontSize="0.85rem"
    userSelect="none"
    zIndex={200}
  >
    No cards in hand — draw one
  </Flex>
);

const FanContainer = styled(Box)`
  position: fixed;
  bottom: -${CARD_HEIGHT * 0.18}px;
  left: 50%;
  transform: translateX(-50%);
  height: ${CARD_HEIGHT}px;
  pointer-events: none;
  z-index: 200;
`;

/** Card following the pointer during a drag-to-table. Positioned via
 * transform by the fan's rAF loop; fixed + pointer-events:none so
 * elementFromPoint at drop sees the board underneath it. */
const DragGhost = styled(Box)`
  position: fixed;
  top: 0;
  left: 0;
  width: ${CARD_WIDTH}px;
  height: ${CARD_HEIGHT}px;
  pointer-events: none;
  z-index: 400;
  transform-origin: center;
  will-change: transform;
  transition: opacity 0.12s ease-out;
  filter: drop-shadow(0 14px 22px rgba(20, 8, 24, 0.55));
`;

const FanCard = styled(Box)`
  position: absolute;
  width: ${CARD_WIDTH}px;
  height: ${CARD_HEIGHT}px;
  pointer-events: auto;
  /* the fan never scrolls — let pointer drags own touch gestures too */
  touch-action: none;
  transform-origin: bottom center;
  bottom: var(--droop);
  z-index: var(--z);
  /* FanCard only rotates and never changes position/size — it is the
     stationary hit-target, so it never moves out from under the pointer.
     Which card is focused is decided from the cursor x (HandFan's
     pointermove), not :hover, so overlapping slots can't fight over it. */
  transform: rotate(var(--rot));
  filter: drop-shadow(0 4px 8px rgba(20, 8, 24, 0.45));
  transition: opacity 0.15s ease-out;

  /* The visual lift/scale/spread lives on an inner layer driven by the rAF
     loop (inline transform, springs — no CSS transition). It ignores the
     pointer, except on the focused card so its enlarged face can be read
     and grabbed above the hand. */
  .lift {
    width: 100%;
    height: 100%;
    pointer-events: none;
    transform-origin: bottom center;
    will-change: transform;
  }
  &[data-focused="true"] .lift {
    pointer-events: auto;
    cursor: grab;
  }

  /* cursor tilt, about the card's centre */
  .tilt {
    width: 100%;
    height: 100%;
    transform-origin: center;
  }

  .actions {
    display: none;
    position: absolute;
    bottom: -0.55rem;
    left: 50%;
    transform: translateX(-50%);
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;

    > p {
      font-size: 0.8rem;
      line-height: 1;
      padding: 0.2rem 0.55rem;
      border-radius: 10rem;
      background-color: ${colors.brand.primary};
      color: ${colors.brand.surfaceDim};
      font-weight: 700;
      box-shadow: 0 1px 3px rgba(20, 8, 24, 0.4);
      transition: background-color 0.15s;

      &:hover {
        background-color: ${colors.brand.highlight};
      }
    }
  }

  &[data-focused="true"] .actions {
    display: flex;
    /* ride up with the lifted card so the buttons land just below its
       bottom edge and stay on-screen + clickable (no scale, full size);
       counter-rotate too so they sit level under the upright card */
    transform: rotate(calc(-1 * var(--rot))) translateX(-50%)
      translateY(calc(var(--droop) - ${CARD_HEIGHT * FOCUS_LIFT_RATIO}px));
  }

  /* while a card is being dragged to the table the fan goes quiet */
  &[data-dragging="true"] .actions {
    display: none;
  }
  &[data-drag-source="true"] {
    opacity: 0.35;
  }
`;
