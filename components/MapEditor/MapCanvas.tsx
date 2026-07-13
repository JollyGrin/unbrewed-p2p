/* eslint-disable @next/next/no-img-element */
/**
 * The editor canvas: the board image plus every interactive overlay (spaces,
 * edges, rubber-band link preview). Zoom/pan is reused from the in-game board
 * (`useZoomPan`, same normalized-coord + `spaceDiameter` convention) so the
 * authoring tool is no less capable than the viewer.
 *
 * Interaction model (no more strict tool modes for the common ops):
 *  - place   : click empty board = add space · click space = select (inspector)
 *              · drag a space = move it. Hover a space for a delete ✕.
 *  - connect : click A then B, or drag A→B, to create a TWO-WAY edge. Direction
 *              is changed on the selected edge in the inspector, never by
 *              re-clicking. Click an edge (line) to select it.
 *  - zone    : click spaces to toggle the active zone's membership.
 *
 * All coordinates stay normalized 0–1; `getBoundingClientRect` already folds in
 * the zoom transform, so every pointer math path is correct at any zoom/pan.
 */
import { useEffect, useRef, useState } from "react";
import { Box } from "@chakra-ui/react";
import { useZoomPan } from "@/lib/pro/useZoomPan";
import { ItemBadge, PassageBadge } from "@/components/Pro/ItemBadge";
import type { EdgeRef, MapDoc, Zone } from "./model";
import { edgeRef, edgesOf, sameEdge, spaceById } from "./model";

export type EditorMode = "place" | "connect" | "zone";

interface Props {
  doc: MapDoc;
  zones: Zone[];
  spaceDiameter: number;
  mode: EditorMode;
  selectedSpaceId?: string;
  selectedEdge?: EdgeRef;
  onPlace: (x: number, y: number) => void;
  onSelectSpace: (id: string) => void;
  onSelectEdge: (ref: EdgeRef) => void;
  onClearSelection: () => void;
  onConnect: (a: string, b: string) => void;
  onToggleZone: (id: string) => void;
  onDeleteSpace: (id: string) => void;
  onMoveStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveEnd: () => void;
}

type Gesture = { kind: "move" | "link"; id: string; moved: boolean; sx: number; sy: number };

const PAN_THRESHOLD = 4;

const SELECTED = "#00e5ff";
const TWO_WAY = "#00e5ff";
const ONE_WAY = "#ff9f1c";
const PENDING = "#e0a82e";

export const MapCanvas = (props: Props) => {
  const {
    doc, zones, spaceDiameter, mode,
    selectedSpaceId, selectedEdge,
    onPlace, onSelectSpace, onSelectEdge, onClearSelection,
    onConnect, onToggleZone, onDeleteSpace, onMoveStart, onMove, onMoveEnd,
  } = props;

  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const zoom = useZoomPan(true, frameRef);

  const gesture = useRef<Gesture | null>(null);
  const justHandled = useRef(false); // swallow the click that trails a drag/link
  const pendingRef = useRef<string | null>(null);
  const [pendingSource, setPendingSourceState] = useState<string | null>(null);
  const [linkCursor, setLinkCursor] = useState<{ x: number; y: number } | null>(null);

  const setPending = (v: string | null) => {
    pendingRef.current = v;
    setPendingSourceState(v);
  };

  // Normalized 0–1 point from a screen event. The image's rect already reflects
  // the zoom transform, so the fraction is correct at any scale/pan.
  const relPoint = (clientX: number, clientY: number) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return undefined;
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  };

  const hitTestSpace = (clientX: number, clientY: number): string | undefined =>
    (document.elementFromPoint(clientX, clientY) as Element | null)
      ?.closest("[data-space-id]")
      ?.getAttribute("data-space-id") ?? undefined;

  // Window-level pointer tracking so a drag that outruns the element (or leaves
  // the canvas) still works. `gesture` lives in a ref, so re-attaching on prop
  // changes never loses an in-flight gesture.
  useEffect(() => {
    const onWinMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const p = relPoint(e.clientX, e.clientY);
      if (!p) return;
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > PAN_THRESHOLD) g.moved = true;
      if (g.kind === "move") {
        if (g.moved) onMove(g.id, p.x, p.y);
      } else {
        setLinkCursor(p);
      }
    };
    const onWinUp = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      if (g.kind === "move") {
        onMoveEnd();
        if (g.moved) justHandled.current = true;
        else onSelectSpace(g.id);
      } else {
        if (g.moved) {
          const over = hitTestSpace(e.clientX, e.clientY);
          if (over && over !== g.id) onConnect(g.id, over);
          justHandled.current = true;
          setPending(null);
        } else {
          const prev = pendingRef.current;
          if (prev == null) setPending(g.id);
          else if (prev === g.id) setPending(null);
          else {
            onConnect(prev, g.id);
            setPending(g.id); // chain: keep building a path from here
          }
        }
        setLinkCursor(null);
      }
    };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    return () => {
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
    };
  }, [onMove, onMoveEnd, onSelectSpace, onConnect]);

  const onSpacePointerDown = (id: string) => (e: React.PointerEvent) => {
    // Stop the press reaching the zoom container (it would start a board pan);
    // spaces own their own drag/link gesture. Mirrors ProBoard's region panel.
    e.stopPropagation();
    if (mode === "place") {
      onMoveStart();
      gesture.current = { kind: "move", id, moved: false, sx: e.clientX, sy: e.clientY };
    } else if (mode === "connect") {
      gesture.current = { kind: "link", id, moved: false, sx: e.clientX, sy: e.clientY };
    }
  };

  const onSpaceClick = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (justHandled.current) {
      justHandled.current = false;
      return;
    }
    // place-mode select and connect are resolved on pointer-up; here we only
    // handle zone painting (which has no gesture) so the click always toggles.
    if (mode === "zone") onToggleZone(id);
  };

  // Rubber-band preview follows the cursor from the pending/click anchor while
  // the pointer merely hovers (no button down). Drag previews come from the
  // window handler above.
  const onFramePointerMove = (e: React.PointerEvent) => {
    if (mode !== "connect" || gesture.current || !pendingRef.current) return;
    const p = relPoint(e.clientX, e.clientY);
    if (p) setLinkCursor(p);
  };

  const onFrameClick = (e: React.MouseEvent) => {
    if (justHandled.current) {
      justHandled.current = false;
      return;
    }
    if (mode === "place") {
      const p = relPoint(e.clientX, e.clientY);
      if (p) onPlace(p.x, p.y);
    } else {
      onClearSelection();
      if (mode === "connect") { setPending(null); setLinkCursor(null); }
    }
  };

  const edgesClickable = mode !== "zone";
  const diamPct = spaceDiameter * 100;
  const anchor = pendingSource ?? undefined;
  const anchorSpace = anchor ? spaceById(doc, anchor) : undefined;

  const spaceCursor = mode === "place" ? "grab" : mode === "connect" ? "crosshair" : "pointer";

  return (
    <Box
      ref={zoom.containerRef}
      flex="1"
      position="relative"
      overflow="hidden"
      bg="#1b1020"
      display="flex"
      alignItems="center"
      justifyContent="center"
      sx={{ touchAction: "none", cursor: "grab" }}
      {...zoom.handlers}
    >
      {doc.meta.imageUrl ? (
        <Box
          ref={frameRef}
          position="relative"
          w="fit-content"
          maxW="100%"
          maxH="100%"
          transform={zoom.transform}
          transformOrigin={zoom.transformOrigin}
          onClick={onFrameClick}
          onPointerMove={onFramePointerMove}
        >
          <img
            ref={imgRef}
            src={doc.meta.imageUrl}
            alt="board"
            draggable={false}
            style={{ maxWidth: "100%", maxHeight: "100%", userSelect: "none", display: "block" }}
          />

          {/* edges */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          >
            {edgesOf(doc).map((edge) => {
              const from = spaceById(doc, edge.from);
              const to = spaceById(doc, edge.to);
              if (!from || !to) return null;
              const ref = edgeRef(edge.from, edge.to);
              const isSel = sameEdge(ref, selectedEdge);
              const color = edge.type === "one" ? ONE_WAY : TWO_WAY;
              const key = `${edge.type}-${edge.from}-${edge.to}`;
              return (
                <g key={key}>
                  {isSel && (
                    <line
                      x1={from.x * 100} y1={from.y * 100} x2={to.x * 100} y2={to.y * 100}
                      stroke="#fff" strokeWidth={7} vectorEffect="non-scaling-stroke"
                      opacity={0.85} strokeLinecap="round"
                    />
                  )}
                  <line
                    x1={from.x * 100} y1={from.y * 100} x2={to.x * 100} y2={to.y * 100}
                    stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke"
                    opacity={0.95}
                    strokeDasharray={edge.type === "one" ? "6 3" : undefined}
                  />
                  {edge.type === "one" && (
                    <circle
                      cx={(from.x + (to.x - from.x) * 0.78) * 100}
                      cy={(from.y + (to.y - from.y) * 0.78) * 100}
                      r={0.55} fill={ONE_WAY}
                    />
                  )}
                  {edgesClickable && (
                    <line
                      x1={from.x * 100} y1={from.y * 100} x2={to.x * 100} y2={to.y * 100}
                      stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke"
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); onSelectEdge(ref); }}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  )}
                </g>
              );
            })}

            {/* rubber-band preview while linking */}
            {mode === "connect" && anchorSpace && linkCursor && (
              <line
                x1={anchorSpace.x * 100} y1={anchorSpace.y * 100}
                x2={linkCursor.x * 100} y2={linkCursor.y * 100}
                stroke={PENDING} strokeWidth={2.5} vectorEffect="non-scaling-stroke"
                strokeDasharray="4 3" opacity={0.9}
              />
            )}
          </svg>

          {/* spaces */}
          {doc.spaces.map((s) => {
            const cols = s.zones.map((zid) => zones.find((z) => z.id === zid)?.color ?? "#999");
            const bg =
              cols.length === 0 ? "rgba(255,255,255,0.25)"
              : cols.length === 1 ? cols[0]
              : `conic-gradient(${cols.map((c, i) => `${c} ${(i / cols.length) * 360}deg ${((i + 1) / cols.length) * 360}deg`).join(", ")})`;
            const isSelected = selectedSpaceId === s.id;
            const isPending = pendingSource === s.id;
            return (
              <Box
                key={s.id}
                role="group"
                data-space-id={s.id}
                onPointerDown={onSpacePointerDown(s.id)}
                onClick={onSpaceClick(s.id)}
                position="absolute"
                left={`${s.x * 100}%`}
                top={`${s.y * 100}%`}
                transform="translate(-50%, -50%)"
                w={`${diamPct}%`}
                borderRadius="50%"
                border="3px solid"
                borderColor={isSelected ? SELECTED : isPending ? PENDING : "rgba(0,0,0,0.85)"}
                boxShadow={
                  isSelected ? `0 0 10px ${SELECTED}`
                  : isPending ? `0 0 10px ${PENDING}`
                  : "0 0 4px rgba(0,0,0,0.6)"
                }
                cursor={spaceCursor}
                sx={{ background: bg, aspectRatio: "1", touchAction: "none" }}
                title={`${s.id} zones:[${s.zones.join(",")}]`}
              >
                {s.start && (
                  <Box position="absolute" top="-10px" right="-10px" w="16px" h="16px"
                    borderRadius="50%" bg="brand.accent" color="black" fontSize="0.6rem"
                    fontWeight={700} textAlign="center" lineHeight="16px">
                    {s.start}
                  </Box>
                )}
                {/* battlefield item badge (engine #157) — the same purple/yellow
                    square the in-game board shows; bottom-right so it clears the
                    start (top-right) and delete ✕ (top-left) badges. */}
                {(() => {
                  const item = s.item ? (doc.items ?? []).find((it) => it.id === s.item) : undefined;
                  return item ? (
                    <Box position="absolute" bottom="-9px" right="-9px" w="16px" h="16px"
                      title={`${item.label} (${item.kind})`}>
                      <ItemBadge kind={item.kind} title={`${item.label} (${item.kind})`} />
                    </Box>
                  ) : null;
                })()}
                {/* secret-passage keyhole (engine #156) — bottom-left. */}
                {s.passage && (
                  <Box position="absolute" bottom="-9px" left="-9px" w="16px" h="16px">
                    <PassageBadge />
                  </Box>
                )}
                {/* hover delete ✕ — common op without switching to a delete tool */}
                <Box
                  as="button"
                  aria-label={`delete ${s.id}`}
                  position="absolute"
                  top="-9px"
                  left="-9px"
                  w="16px"
                  h="16px"
                  borderRadius="50%"
                  bg="brand.danger"
                  color="white"
                  fontSize="0.62rem"
                  fontWeight={700}
                  lineHeight="16px"
                  textAlign="center"
                  opacity={0}
                  _groupHover={{ opacity: 1 }}
                  onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDeleteSpace(s.id); }}
                >
                  ✕
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box position="absolute" inset={0} display="flex" alignItems="center" justifyContent="center" color="brand.parchment" opacity={0.5}>
          paste a board image URL in the sidebar to begin
        </Box>
      )}

      {zoom.active && (
        <Box
          as="button"
          position="absolute"
          bottom="0.6rem"
          left="0.6rem"
          zIndex={8}
          bg="whiteAlpha.300"
          color="brand.parchment"
          _hover={{ bg: "whiteAlpha.500" }}
          borderRadius="0.3rem"
          px="0.6rem"
          py="0.25rem"
          fontSize="0.75rem"
          onClick={zoom.reset}
        >
          reset view
        </Box>
      )}
    </Box>
  );
};
