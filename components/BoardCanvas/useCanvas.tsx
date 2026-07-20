import * as d3 from "d3";
import { MutableRefObject, RefObject, useEffect, useRef } from "react";
import {
  DEFAULT_TOKEN_SIZE,
  OwnedToken,
  cardTokenHeight,
} from "../Positions/position.type";
import { TokenMarkup } from "./Tokens";
import { cardTokenMarkup, sheetImageMarkup } from "./Tokens/cardFace";
import { publishBoardTransform, setBoardSvg } from "./boardTransform";

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
  iconSvg: (
    name: string,
    opts: { color?: string; size: number; cutout?: boolean; maskId?: string },
  ) => string | null;
  /** Filled with a fn returning the board coords at the viewport center. */
  centerRef?: MutableRefObject<() => { x: number; y: number }>;
  /** Filled with a fn converting client (screen) coords to board coords. */
  screenToBoardRef?: MutableRefObject<
    (sx: number, sy: number) => { x: number; y: number }
  >;
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
}: CanvasProps) => {
  // Token being dragged right now: it follows the pointer locally, so echo
  // re-renders must not snap it back to the (throttled, ≤50ms stale) wire
  // position mid-drag.
  const draggingIdRef = useRef<string | null>(null);

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

    const markup = (d: OwnedToken): string => {
      const w = d.size ?? DEFAULT_TOKEN_SIZE;
      const h = d.card
        ? d.h ?? cardTokenHeight(w)
        : d.imageUrl
          ? d.h ?? w
          : w;
      let inner: string;
      if (d.card) {
        inner = cardTokenMarkup({
          id: d.id,
          card: d.card,
          faceDown: d.faceDown,
          w,
          h,
          owner: d.owner,
          color: d.color,
        });
      } else if (d.imageUrl) {
        inner = d.sheet
          ? sheetImageMarkup({ id: d.id, url: d.imageUrl, sheet: d.sheet, w, h })
          : TokenMarkup.image({ url: d.imageUrl, w, h });
      } else if (d.icon) {
        inner =
          iconSvg(d.icon, {
            color: d.color,
            size: w,
            cutout: d.cutout,
            // Mask ids live in the shared document — keep them unique per
            // token and free of characters that break url(#…) references.
            maskId: `cut-${d.id.replace(/[^a-zA-Z0-9_-]/g, "")}`,
          }) ?? TokenMarkup.circle({ color: d.color, size: w });
      } else {
        inner = TokenMarkup.circle({ color: d.color, size: w });
      }
      if (d.id === selectedId && isOwn(d)) {
        inner += TokenMarkup.selectionRing({ w, h });
      }
      if (d.card && d.claimedBy) {
        inner += TokenMarkup.claimRing({ w, h });
      }
      if (d.counter) {
        const linked = d.counter.link;
        inner += TokenMarkup.counterBadge({
          w,
          text: d.counterDisplay == null ? "–" : String(d.counterDisplay),
          title: isOwn(d)
            ? `${linked ? `${linked} HP` : "counter"} — click +1, right-click −1`
            : linked
              ? `${d.owner}'s ${linked} HP`
              : `${d.owner}'s counter`,
        });
      }
      return inner;
    };

    const drag = d3
      .drag<SVGGElement, OwnedToken>()
      .on("start", function (_event, d) {
        draggingIdRef.current = d.id;
        d3.select(this).raise();
        g.attr("cursor", "grabbing");
        onCardPeek?.(null);
      })
      .on("drag", function (event: { x: number; y: number }, d) {
        // Local echo: the dragged token tracks the pointer at frame rate;
        // the network send may be throttled and lag a tick behind.
        d3.select(this).attr(
          "transform",
          `translate(${event.x}, ${event.y})`,
        );
        move?.({ ...d, x: event.x, y: event.y });
      })
      .on("end", () => {
        draggingIdRef.current = null;
        g.attr("cursor", "grab");
        move?.flush?.();
      })
      .touchable(true);

    const renderGroup = (
      groupSel: d3.Selection<SVGGElement, unknown, null, undefined>,
      items: OwnedToken[],
    ) => {
      const sel = groupSel
        .selectAll<SVGGElement, OwnedToken>("g.tok")
        // Key by id so DOM reordering (raise) doesn't scramble datum binding.
        .data(items, (d) => (d as OwnedToken).id)
        .join((enter) => enter.append("g").attr("class", "tok"))
        .each(function (d) {
          // wire position — except for the actively dragged token, whose
          // transform the drag handler owns until the pointer releases
          if (d.id === draggingIdRef.current) return;
          d3.select(this).attr("transform", `translate(${d.x}, ${d.y})`);
        })
        .html(markup)
        .attr("opacity", (d) => (isOwn(d) ? 1 : 0.8));

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
        // layer so they can always be grabbed under overlapping tokens.
        .raise();

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

    // Click on empty board space clears the selection.
    canvas.on("click", () => onSelect?.(null));

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([0.25, 4])
      .on("zoom", ({ transform }) => {
        g.attr("transform", transform);
        canvas.select("image.background").attr("transform", transform);
        // Broadcast so the dice overlay can ride the map.
        publishBoardTransform({ x: transform.x, y: transform.y, k: transform.k });
      });
    canvas.call(zoom);

    // Expose the <svg> so overlays (dice) can align to its on-screen rect.
    setBoardSvg(canvasRef.current);

    if (centerRef) {
      centerRef.current = () => {
        const t = d3.zoomTransform(canvasRef.current as SVGSVGElement);
        const [x, y] = t.invert([width / 2, height / 2]);
        return { x, y };
      };
    }

    if (screenToBoardRef) {
      screenToBoardRef.current = (sx: number, sy: number) => {
        const svg = canvasRef.current as SVGSVGElement;
        const rect = svg.getBoundingClientRect();
        const t = d3.zoomTransform(svg);
        const [x, y] = t.invert([sx - rect.left, sy - rect.top]);
        return { x, y };
      };
    }

    // fit + center the map on first render (moves map and tokens together)
    if (isFirstRender) {
      const MAP_W = 1200;
      const MAP_H = 1000;
      const scale = Math.min(width / MAP_W, height / MAP_H, 1);
      const tx = (width - MAP_W * scale) / 2;
      const ty = (height - MAP_H * scale) / 2;
      canvas.call(
        zoom.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale),
      );
    }

    // Publish the live transform (covers the initial fit and any resize/re-run)
    // so a freshly-mounted overlay gets the current value without a zoom event.
    const t0 = d3.zoomTransform(canvasRef.current);
    publishBoardTransform({ x: t0.x, y: t0.y, k: t0.k });
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
  ]);

  // Clear the shared svg reference when the board unmounts.
  useEffect(() => () => setBoardSvg(null), []);
};
