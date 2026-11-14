import * as d3 from "d3";
import { MutableRefObject, RefObject, useEffect, useRef, useState } from "react";
import { OwnedToken } from "../Positions/position.type";
import { IconSvg, tokenMarkup, tokenSize } from "./Tokens/tokenMarkup";
import { publishBoardTransform, setBoardSvg } from "./boardTransform";
import { setBoardViewControls } from "./boardView";
import { TokenAnimator, createTokenAnimator } from "./tokenMotion";
import { soundDragEnd, soundDragMove } from "@/lib/sound";

/** The map image's size; the first render fits it to the viewport. */
const MAP_W = 1200;
const MAP_H = 1000;

/**
 * Turns the board 180° about the map's centre (hotseat, the second seat's
 * turn). It sits INSIDE the zoom transform, so pan and zoom are untouched and
 * d3's pointer maths (getScreenCTM) keeps drags in board coords. A point maps
 * to (MAP_W − x, MAP_H − y), which is its own inverse.
 */
const ROTATE_180 = ` rotate(180 ${MAP_W / 2} ${MAP_H / 2})`;

type CanvasProps = {
  canvasRef: RefObject<SVGSVGElement>;
  gRef: MutableRefObject<SVGGElement | null>;
  parentRef?: RefObject<any>;
  tokens: OwnedToken[];
  self?: string;
  size: { width: number; height: number };
  /** Position sender. May be throttled — if it carries a lodash `.flush`,
   * drag-end calls it so the final position always lands. */
  move?: ((t: OwnedToken) => void) & { flush?: () => void };
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Click (+1) / right-click (−1) on a token's counter badge. */
  onCounterAdjust?: (t: OwnedToken, delta: number) => void;
  /** Hovering your own face-down card peeks at its face (null = peek off). */
  onCardPeek?: (t: OwnedToken | null, rect?: DOMRect) => void;
  /** Click on ANOTHER player's card token — opens the pickup panel. */
  onForeignCardClick?: (t: OwnedToken) => void;
  /** Resolve a bundled icon name to an SVG string; null until the set loads. */
  iconSvg: IconSvg;
  /** Filled with a fn returning the board coords at the viewport center. */
  centerRef?: MutableRefObject<() => { x: number; y: number }>;
  /** Filled with a fn converting client (screen) coords to board coords. */
  screenToBoardRef?: MutableRefObject<
    (sx: number, sy: number) => { x: number; y: number }
  >;
  /** Turn the board 180° (hotseat); token faces and labels stay upright. */
  rotated?: boolean;
};

/**
 * Renders and wires the board: overlays (mini-maps) in a group beneath all
 * normal tokens, drag restricted to the local player's own tokens, click to
 * select your own token, zoom/pan on the canvas itself.
 */
export const useCanvas = ({
  canvasRef,
  parentRef,
  gRef,
  tokens,
  self,
  move,
  size,
  selectedId,
  onSelect,
  onCounterAdjust,
  onCardPeek,
  onForeignCardClick,
  iconSvg,
  centerRef,
  screenToBoardRef,
  rotated = false,
}: CanvasProps) => {
  // Token being dragged right now: it follows the pointer locally, so echo
  // re-renders must not snap it back to the (throttled, ≤50ms stale) wire
  // position mid-drag.
  const draggingIdRef = useRef<string | null>(null);
  // The board's zoom behaviour, built once per <svg> (see the effect).
  const zoomRef = useRef<{
    svg: SVGSVGElement;
    zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
  } | null>(null);
  // The current turn suffix, read by the long-lived zoom listener.
  const rotationRef = useRef("");
  // Image urls that failed to load here (#1029: an expired Labs hosted-save
  // image). Their tokens draw a placeholder until the url changes — a deck
  // refresh swaps in the new image — or the page reloads.
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Token motion (tokenMotion.ts) owns each token's transform. A flip swaps
  // the face half-way through by asking for one more render.
  const [flipTick, setFlipTick] = useState(0);
  const motionRef = useRef<TokenAnimator | null>(null);
  if (!motionRef.current)
    motionRef.current = createTokenAnimator({
      onFlipMid: () => setFlipTick((n) => n + 1),
    });

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!parentRef) return;
    if (!size.width || !size.height) return;

    const { width, height } = size;

    const canvas = d3
      .select<SVGSVGElement, unknown>(canvasRef.current)
      .attr("width", width)
      .attr("height", height);

    const isFirstRender = !gRef.current;
    if (!gRef.current) {
      const g = canvas.append("g").attr("cursor", "grab");
      g.append("g").attr("class", "overlays");
      g.append("g").attr("class", "pieces");
      gRef.current = g.node();
    }
    const g = d3.select(gRef.current);
    const gOverlays = g.select<SVGGElement>("g.overlays");
    const gPieces = g.select<SVGGElement>("g.pieces");

    const isOwn = (d: OwnedToken) => d.owner === self;
    const rotation = rotated ? ROTATE_180 : "";
    // Zoom-space point → board point (undoes the rotation).
    const unrotate = ([x, y]: [number, number]) =>
      rotated ? { x: MAP_W - x, y: MAP_H - y } : { x, y };

    const motion = motionRef.current!;
    motion.beginRender(tokens, {
      draggingId: draggingIdRef.current,
      rotated,
    });

    const markup = (d: OwnedToken): string => {
      // a token turning over shows its old face until it is edge-on
      const face = motion.faceOverride(d.id);
      const inner = tokenMarkup(face ? { ...d, ...face } : d, {
        own: isOwn(d),
        selected: d.id === selectedId,
        iconSvg,
        brokenImage: !!d.imageUrl && brokenImages.has(d.imageUrl),
      });
      if (!rotated) return inner;
      // On a turned board each token turns back about its own centre, so
      // faces and labels read upright and the token keeps its spot.
      const { w, h } = tokenSize(d);
      return `<g class="upright" transform="rotate(180 ${w / 2} ${h / 2})">${inner}</g>`;
    };

    const markBroken = (url: string) =>
      setBrokenImages((prev) =>
        prev.has(url) ? prev : new Set(prev).add(url),
      );

    const drag = d3
      .drag<SVGGElement, OwnedToken>()
      .on("start", function (_event, d) {
        draggingIdRef.current = d.id;
        // The lift starts here; the token is NOT raised here (see "drag").
        motion.dragStart(d.id);
        g.attr("cursor", "grabbing");
        onCardPeek?.(null);
      })
      .on("drag", function (event: { x: number; y: number }, d) {
        // Bring the token over its neighbours once it actually moves, by
        // moving the neighbours under it rather than the held node (a touch
        // keeps sending its events to that node, see renderGroup).
        // Raising it on pointer-down moved the node mid-click and the
        // browser then dropped the click: the first press on a counter badge
        // of any token but the top one did nothing (#1630).
        const parent = this.parentNode;
        while (parent && this.nextSibling)
          parent.insertBefore(this.nextSibling, this);
        // Local echo: the dragged token tracks the pointer at frame rate;
        // the network send may be throttled and lag a tick behind.
        motion.dragTo(d.id, event.x, event.y);
        move?.({ ...d, x: event.x, y: event.y });
        soundDragMove({ x: event.x, y: event.y, card: d.card });
      })
      .on("end", (_event, d) => {
        draggingIdRef.current = null;
        motion.dragEnd(d.id);
        g.attr("cursor", "grab");
        move?.flush?.();
        soundDragEnd();
      })
      .touchable(true);

    const renderGroup = (
      groupSel: d3.Selection<SVGGElement, unknown, null, undefined>,
      items: OwnedToken[],
    ) => {
      const bound = groupSel
        .selectAll<SVGGElement, OwnedToken>("g.tok")
        // Key by id so DOM reordering (raise) doesn't scramble datum binding.
        .data(items, (d) => (d as OwnedToken).id);
      bound
        .exit<OwnedToken>()
        .each(function (d) {
          motion.exit(this as SVGGElement, d);
        })
        .remove();
      const all = bound
        .enter()
        .append("g")
        .attr("class", "tok")
        .merge(bound);

      // The token being pressed or dragged never moves in the DOM (#1640).
      // d3's `join` would `order()` every node back to its data position
      // here, the held one included: moving a node between pointer-down and
      // pointer-up makes the browser drop the click (a heart press did
      // nothing when a render landed mid-press), and a dragged token ended up
      // under other players' tokens until its next move. So the others are
      // put in order around it.
      const heldId = draggingIdRef.current;
      const heldNode =
        heldId == null ? null : all.filter((d) => d.id === heldId).node();
      (heldNode ? all.filter((d) => d.id !== heldId) : all).order();

      all
        .each(function (d) {
          // wire position — except for the actively dragged token, which
          // follows the pointer until it is released (tokenMotion.ts)
          const { w, h } = tokenSize(d);
          motion.place(this, d, w, h);
        })
        .attr("opacity", (d) => (isOwn(d) ? 1 : 0.8));

      // The token being dragged is left exactly as it is until it is put
      // down: no new markup, no re-wiring, no move in the DOM. A touch keeps
      // sending its events to the element it started on, so replacing that
      // element (or the drag behaviour that knows the gesture) mid-drag cut
      // the drag off after its first move and its `end` never fired.
      const sel = heldNode ? all.filter((d) => d.id !== heldId) : all;
      sel.html(markup);

      // An image face that fails to load would otherwise draw nothing at all.
      sel
        .filter((d) => !d.card && Boolean(d.imageUrl))
        .each(function (d) {
          d3.select(this)
            .selectAll("image")
            .on("error", () => markBroken(d.imageUrl!));
        });

      // Locked overlays and other players' tokens are inert to the pointer so
      // they never block grabbing what's on top of them. Exception: foreign
      // CARD tokens take clicks (pickup requests) — but never drags.
      sel.attr("pointer-events", (d) => {
        if (!isOwn(d)) return d.card ? "all" : "none";
        return d.overlay && d.locked ? "none" : "all";
      });

      // Clear stale handlers, then wire drag on our movable tokens.
      sel
        .on(".drag", null)
        .on("click", null)
        .on("pointerenter", null)
        .on("pointerleave", null);
      const own = sel
        .filter((d) => isOwn(d) && !(d.overlay && d.locked))
        .call(drag)
        // Keep the local player's tokens painted last (on top) within their
        // layer so they can always be grabbed under overlapping tokens; the
        // one being dragged stays above them without being moved itself.
        .each(function () {
          const parent = this.parentNode;
          if (!parent) return;
          if (heldNode && heldNode.parentNode === parent)
            parent.insertBefore(this, heldNode);
          else parent.appendChild(this);
        });
      // Whatever still follows the held token (a token another player just
      // added) goes under it, again without moving the held node itself.
      if (heldNode?.parentNode)
        while (heldNode.nextSibling)
          heldNode.parentNode.insertBefore(heldNode.nextSibling, heldNode);

      // Only image pieces and cards open the on-board panel; discs and icons
      // are managed from the token menu instead.
      own
        .filter((d) => Boolean(d.imageUrl || d.card))
        .on("click", (event: MouseEvent, d) => {
          event.stopPropagation();
          onSelect?.(d.id);
        });

      // Foreign card tokens: click opens the pickup panel (no drag, no peek).
      sel
        .filter((d) => !isOwn(d) && Boolean(d.card))
        .attr("cursor", "pointer")
        .on("click", (event: MouseEvent, d) => {
          event.stopPropagation();
          onForeignCardClick?.(d);
        });

      // Peek: hovering your own face-down card previews its face — only for
      // you; everyone else keeps seeing the back. Leave is wired on every
      // own card so a peek never sticks after a flip re-renders the token.
      const ownCards = own.filter((d) => Boolean(d.card));
      ownCards.on("pointerleave", () => onCardPeek?.(null));
      ownCards
        .filter((d) => Boolean(d.faceDown))
        .on(
          "pointerenter",
          function (this: SVGGElement, _e: unknown, d: OwnedToken) {
            onCardPeek?.(d, this.getBoundingClientRect());
          },
        );

      // Counter badge: click +1, right-click −1 (own tokens only).
      own
        .select<SVGGElement>("g.counter")
        .on("click", (event: MouseEvent, d) => {
          event.stopPropagation();
          onCounterAdjust?.(d, 1);
        })
        .on("contextmenu", (event: MouseEvent, d) => {
          event.preventDefault();
          event.stopPropagation();
          onCounterAdjust?.(d, -1);
        });

      return sel;
    };

    renderGroup(gOverlays, tokens.filter((t) => t.overlay));
    renderGroup(gPieces, tokens.filter((t) => !t.overlay));
    motion.endRender();

    // Click on empty board space clears the selection.
    canvas.on("click", () => onSelect?.(null));

    // One zoom behaviour per <svg> (#1603). d3-zoom keeps double-tap and
    // wheel/touch timer state in the behaviour's closure, so a new one per
    // re-render (every token move, every selection) left a gesture started in
    // one instance to finish in another, which threw on touchend. Later runs
    // only refresh what changes: the extent here, the turn via rotationRef.
    rotationRef.current = rotation;
    const svgNode = canvasRef.current;
    if (zoomRef.current?.svg !== svgNode) {
      const created = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.25, 4])
        .on("zoom", ({ transform }) => {
          const view = `${transform}${rotationRef.current}`;
          d3.select(gRef.current).attr("transform", view);
          d3.select(svgNode).select("image.background").attr("transform", view);
          // Broadcast so the dice overlay can ride the map.
          publishBoardTransform({ x: transform.x, y: transform.y, k: transform.k });
        });
      zoomRef.current = { svg: svgNode, zoom: created };
      canvas.call(created);
    }
    const zoom = zoomRef.current.zoom.extent([
      [0, 0],
      [width, height],
    ]);

    // Expose the <svg> so overlays (dice) can align to its on-screen rect.
    setBoardSvg(canvasRef.current);

    if (centerRef) {
      centerRef.current = () => {
        const t = d3.zoomTransform(canvasRef.current as SVGSVGElement);
        return unrotate(t.invert([width / 2, height / 2]));
      };
    }

    if (screenToBoardRef) {
      screenToBoardRef.current = (sx: number, sy: number) => {
        const svg = canvasRef.current as SVGSVGElement;
        const rect = svg.getBoundingClientRect();
        const t = d3.zoomTransform(svg);
        return unrotate(t.invert([sx - rect.left, sy - rect.top]));
      };
    }

    // fit + center the map (moves map and tokens together)
    const fitView = () => {
      const scale = Math.min(width / MAP_W, height / MAP_H, 1);
      const tx = (width - MAP_W * scale) / 2;
      const ty = (height - MAP_H * scale) / 2;
      return d3.zoomIdentity.translate(tx, ty).scale(scale);
    };
    if (isFirstRender) canvas.call(zoom.transform, fitView());

    // Keyboard zoom / recentre (lib/keybinds), a short glide like the wheel.
    setBoardViewControls({
      zoomBy: (factor) =>
        canvas.transition().duration(140).call(zoom.scaleBy, factor),
      fit: () => canvas.transition().duration(220).call(zoom.transform, fitView()),
    });

    // Publish the live transform (covers the initial fit and any resize/re-run)
    // so a freshly-mounted overlay gets the current value without a zoom event.
    const t0 = d3.zoomTransform(canvasRef.current);
    publishBoardTransform({ x: t0.x, y: t0.y, k: t0.k });
    // A turn of the board (no zoom event) re-applies the current view.
    g.attr("transform", `${t0}${rotation}`);
    canvas.select("image.background").attr("transform", `${t0}${rotation}`);
  }, [
    tokens,
    size,
    parentRef,
    move,
    self,
    selectedId,
    onSelect,
    onCounterAdjust,
    onCardPeek,
    onForeignCardClick,
    iconSvg,
    canvasRef,
    gRef,
    centerRef,
    screenToBoardRef,
    brokenImages,
    rotated,
    flipTick,
  ]);

  // Safety net for a drag whose own `end` never arrives (seen on touch: the
  // drag behaviour is re-attached by the renders its moves cause, and the new
  // instance does not know the gesture). Once no pointer is down, a tick
  // later so a normal `end` always runs first, the token is put down and the
  // last position flushed. With nothing held this does nothing.
  const moveRef = useRef(move);
  moveRef.current = move;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      timer = null;
      if (draggingIdRef.current != null) {
        draggingIdRef.current = null;
        if (gRef.current) d3.select(gRef.current).attr("cursor", "grab");
        moveRef.current?.flush?.();
      }
      motionRef.current?.releaseAll();
      soundDragEnd(); // lands a lifted token once; silent if `end` already ran
    };
    const later = () => {
      if (timer == null) timer = setTimeout(settle, 0);
    };
    // touch is judged by the touch events below (a second finger lifting is
    // not a release); mouse and pen by no button being left down
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.buttons === 0) later();
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) later();
    };
    window.addEventListener("pointerup", onPointer);
    window.addEventListener("pointercancel", onPointer);
    window.addEventListener("touchend", onTouch);
    window.addEventListener("touchcancel", onTouch);
    window.addEventListener("blur", later);
    return () => {
      if (timer != null) clearTimeout(timer);
      window.removeEventListener("pointerup", onPointer);
      window.removeEventListener("pointercancel", onPointer);
      window.removeEventListener("touchend", onTouch);
      window.removeEventListener("touchcancel", onTouch);
      window.removeEventListener("blur", later);
    };
  }, [gRef]);

  // Clear the shared svg reference when the board unmounts.
  useEffect(
    () => () => {
      setBoardSvg(null);
      setBoardViewControls(null);
      motionRef.current?.dispose();
    },
    [],
  );
};
