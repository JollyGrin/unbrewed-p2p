/**
 * One space on the tabletop board: an ellipse (a circle, foreshortened by the
 * tilted stage's own CSS transform — see TableStage's header comment) filled
 * with its zone colour, split into pie wedges when a space carries more than
 * one zone (SET semantics — `space.zones` lists every zone it belongs to).
 *
 * WHY PIXEL SIZES, NOT CSS PERCENTAGES. The board image is rarely square, so a
 * width-relative CSS `%` and a height-relative CSS `%` are different lengths.
 * Sizing a "circle" with `w="4%" h="4%"` only draws an actual circle when the
 * frame itself is square; on Unmatched's landscape art it draws an oval before
 * the tilt even applies, compounding into a visibly wrong wedge split. So both
 * the visible disc and its invisible hit target are sized in PX, computed from
 * `frameW` (the frame's measured LAYOUT width — see TableStage) exactly the
 * way ProBoard's own hit-circles are (its `framePx`) — only POSITION (`left`/
 * `top`) stays in the board's native 0–1 normalized fraction, because an
 * offset, unlike a size, does not care about the frame's aspect ratio.
 *
 * HIT TARGET. The invisible circle is padded via `tableHitDiameter` (bigger
 * the farther back the space sits — see tableProjection.ts) and is what
 * carries the click/hover handlers; the visible disc is a smaller, centered,
 * `pointerEvents: none` child of it, so tapping near-but-not-exactly on the
 * wedge still lands the click. Clicks are identity-based (`onSpaceClick(id)`),
 * exactly like the flat board — the browser hit-tests the RENDERED (tilted)
 * shape, so this needs no coordinate math of its own to work under zoom/pan.
 */
import { ReactNode } from "react";
import { Box } from "@chakra-ui/react";
import type { ProMapItem, ProMapSpace, SpaceId } from "@/lib/pro/protocol";
import { pieSliceAngles, pieSlicePath, tableHitDiameter } from "@/lib/pro/tableProjection";
import { ItemInspectBadge, PassageBadge } from "@/components/Pro/ItemBadge";

/** Fallback fill for a space that belongs to no zone (most maps have some —
 *  hallways, item spaces — a legible neutral rather than a jarring color). */
export const TABLE_SPACE_NEUTRAL = "rgba(224, 168, 46, 0.16)";

/**
 * TRANSLUCENCY (phase-2 fault #2). A fully opaque, fully saturated disc buries
 * whatever board art sits under it — the very art that sells "this is a real
 * board", not a diagram. A real Unmatched board photograph reads the zone
 * paint as a thin, clearly-bounded wash: you can tell red from blue at a
 * glance, but you can still see the floorboards or hull plating through it.
 * The recipe here is "a crisp, fully-saturated RIM + a soft, translucent
 * INNER tint": the rim alone would carry zone identity even if the inner fill
 * were removed entirely (so a multi-zone pie wedge stays unmistakable — the
 * requirement this exists to satisfy), and the inner tint is what lets the
 * art show through.
 *
 * `zoneAlphaFill` is the interior wash; `ZONE_RIM_OPACITY` (applied via the
 * `stroke`/`border` on top, at FULL saturation) is the identity-carrying edge.
 */
const ZONE_FILL_ALPHA = 0.4;
/** Width (px) of the crisp, fully-saturated rim (see above). Drawn INSET (via
 *  boxShadow / SVG stroke) so it never collides with the highlight/relocate
 *  OUTLINE, which is drawn OUTSET with its own offset. */
const ZONE_RIM_PX = 1.75;
/** Two-hex-digit alpha suffix for a `#rrggbb` zone color (editor zone colors
 *  are always hex — this space always renders a plain rgba fallback if a
 *  future zone color isn't). */
const alphaHex = (pct: number): string =>
  Math.round(pct * 255)
    .toString(16)
    .padStart(2, "0");
const ZONE_FILL_SUFFIX = alphaHex(ZONE_FILL_ALPHA);

/**
 * The disc's dark ink outline. The board art prints its spaces as discs with
 * a dark edge; without one ours read as flat stickers laid over the art
 * (owner feedback, 2026-09-23: "nicht clean"). Outside the disc, so it never
 * eats into the zone fill.
 */
export const TABLE_SPACE_OUTLINE = "0 0 0 1.5px rgba(12, 6, 12, 0.75)";
/** The seam between the wedges of a multi-zone space: thin and dark, like a
 *  printed divider (see the wedge comment below for why not the zone color). */
export const TABLE_SPACE_SEAM = "rgba(12, 6, 12, 0.55)";
/** A shallow dish lit from the upper left — the same light every standee
 *  shadow assumes (SHADOW_OFFSET_X/Y) — so a space reads as part of the board
 *  surface rather than a flat overlay. */
export const TABLE_SPACE_SHADE =
  "radial-gradient(circle at 34% 28%, rgba(255, 244, 225, 0.2) 0%, rgba(255, 244, 225, 0) 45%), " +
  "radial-gradient(circle at 66% 74%, rgba(8, 4, 8, 0.32) 0%, rgba(8, 4, 8, 0) 60%)";

/** Translucent interior wash for a zone's own hex color; non-hex colors (there
 *  are none in practice — see above) degrade to the solid input rather than
 *  throwing, so a malformed map still renders something legible. */
export const zoneAlphaFill = (hex: string): string =>
  /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${ZONE_FILL_SUFFIX}` : hex;

export interface TableSpaceProps {
  space: ProMapSpace;
  zoneColor: (zoneId: string) => string;
  diameterPct: number;
  frameW: number;
  highlighted: boolean;
  relocateOrigin: boolean;
  relocateArmed: boolean;
  item?: ProMapItem | null;
  passage?: boolean;
  onClick?: (id: SpaceId) => void;
  onHoverChange?: (id: SpaceId | null) => void;
  /** Extra content anchored at the space's centre, above the disc (fighters
   *  stacked here forward their click to the space when it's the only target —
   *  same ProBoard convention — but that wiring lives in the fighter/standee
   *  component; this slot is for board-object tokens sharing the space). */
  children?: ReactNode;
}

export const TableSpace = ({
  space,
  zoneColor,
  diameterPct,
  frameW,
  highlighted,
  relocateOrigin,
  relocateArmed,
  item,
  passage,
  onClick,
  onHoverChange,
  children,
}: TableSpaceProps) => {
  const diamPx = (diameterPct / 100) * Math.max(frameW, 1);
  const hitPx = (tableHitDiameter(diameterPct, space.y) / 100) * Math.max(frameW, 1);
  // Relocate mode ARMED makes non-origin spaces inert (protocol/dock review of
  // #748): only the dashed origins are clickable, and hovering anything else
  // must not fire the "who would move here" preview — mirrors ProBoard exactly.
  const clickable = !!onClick && (relocateArmed ? relocateOrigin : highlighted || relocateOrigin);
  const hoverable = !!onHoverChange && highlighted && !relocateArmed;

  const zones = space.zones ?? [];
  const slices = zones.length > 1 ? pieSliceAngles(zones.length) : null;
  const singleZoneColor = zones.length === 1 && zones[0] ? zoneColor(zones[0]) : null;

  // Relocate origins get a dashed cyan ring, deliberately distinct from the
  // solid gold walk highlight, matching ProBoard's own two affordances.
  const ringed = highlighted || relocateOrigin;
  const ringColor = relocateOrigin ? "#38D9E8" : "#E0A82E";

  // Fault #2 (phase-2 report): translucent interior + crisp rim instead of a
  // flat opaque fill, so the board art shows through while zone identity
  // stays unmistakable. The rim is INSET (never collides with the ringed
  // highlight's own OUTSET outline). The dark ink outline sits OUTSIDE the
  // disc, and only when no pick ring is drawn: a highlighted space's gold or
  // cyan ring already separates it from the art, and two rings read as noise.
  const zoneRimShadow = singleZoneColor ? `inset 0 0 0 ${ZONE_RIM_PX}px ${singleZoneColor}` : undefined;
  const outline = ringed ? undefined : TABLE_SPACE_OUTLINE;
  const discShadow = [zoneRimShadow, outline].filter(Boolean).join(", ") || undefined;

  return (
    <Box
      // Board-relative offset — a normalized fraction, so it is untouched by
      // the frame's own (possibly non-square) aspect ratio.
      position="absolute"
      left={`${space.x * 100}%`}
      top={`${space.y * 100}%`}
      w={`${hitPx}px`}
      h={`${hitPx}px`}
      transform="translate(-50%, -50%)"
      borderRadius="50%"
      cursor={clickable ? "pointer" : undefined}
      pointerEvents={clickable || hoverable ? "auto" : "none"}
      data-space-id={space.id}
      // Fault #4 (phase-2 report): the same `[data-pick]` marker ProBoard's
      // own auto-focus-zoom scans for, so switching to the tabletop view
      // during an active prompt zooms onto the actionable spaces instead of
      // sitting at the whole-board fit (see TableStage's pick-focus effect).
      data-pick={clickable ? "" : undefined}
      title={space.id}
      onClick={clickable ? () => onClick!(space.id) : undefined}
      onMouseEnter={hoverable ? () => onHoverChange!(space.id) : undefined}
      onMouseLeave={hoverable ? () => onHoverChange!(null) : undefined}
      onTouchStart={hoverable ? () => onHoverChange!(space.id) : undefined}
    >
      {/* The visible disc — smaller than the (padded) hit circle, centred,
          and non-interactive so the outer box is the single source of truth
          for what counts as "on" this space. */}
      <Box
        position="absolute"
        top="50%"
        left="50%"
        w={`${diamPx}px`}
        h={`${diamPx}px`}
        transform="translate(-50%, -50%)"
        borderRadius="50%"
        pointerEvents="none"
        overflow="hidden"
        bg={zones.length <= 1 ? (singleZoneColor ? zoneAlphaFill(singleZoneColor) : TABLE_SPACE_NEUTRAL) : undefined}
        boxShadow={discShadow}
        sx={
          ringed
            ? { outline: `2.5px ${relocateOrigin ? "dashed" : "solid"} ${ringColor}`, outlineOffset: "2px" }
            : undefined
        }
      >
        {slices && (
          <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
            {zones.map((zoneId, i) => {
              const [start, end] = slices[i];
              const color = zoneColor(zoneId);
              return (
                <path
                  key={zoneId}
                  d={pieSlicePath(50, 50, 49, start, end)}
                  fill={zoneAlphaFill(color)}
                  // A seam on EACH wedge (fault #2): with a translucent fill
                  // alone, two adjacent low-alpha wedges blur into one blob
                  // on a busy multi-zone map. It used to be a full-saturation
                  // stroke in the zone's own color, which kept the wedges
                  // apart but drew a colored asterisk over every shared
                  // space. A thin dark seam separates them just as clearly
                  // and reads as a printed divider.
                  stroke={TABLE_SPACE_SEAM}
                  strokeWidth={1}
                />
              );
            })}
          </svg>
        )}
        <Box data-space-shade position="absolute" inset={0} borderRadius="50%" style={{ backgroundImage: TABLE_SPACE_SHADE }} />
      </Box>

      {/* Item / secret-passage badge — same registry components the flat
          board uses, just re-sized to this space's own disc. */}
      {item && (
        <Box position="absolute" top="50%" left="50%" w={`${diamPx * 0.55}px`} h={`${diamPx * 0.55}px`} transform="translate(-50%, -50%)">
          <ItemInspectBadge item={item} />
        </Box>
      )}
      {!item && passage && (
        <Box position="absolute" top="50%" left="50%" w={`${diamPx * 0.55}px`} h={`${diamPx * 0.55}px`} transform="translate(-50%, -50%)">
          <PassageBadge />
        </Box>
      )}

      {children}
    </Box>
  );
};
