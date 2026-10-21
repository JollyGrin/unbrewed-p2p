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
import { Box } from "@chakra-ui/react";
import type { ProMapItem, ProMapSpace, SpaceId } from "@/lib/pro/protocol";
import { pieSliceAngles, pieSlicePath, tableHitDiameter, tableHitPx } from "@/lib/pro/tableProjection";
import { ItemInspectBadge, PassageBadge } from "@/components/Pro/ItemBadge";

/** Fallback fill for a space that belongs to no zone (most maps have some —
 *  hallways, item spaces — a legible neutral rather than a jarring color).
 *  Drawn only while the zone discs are ON (#1395); off, such a space is as
 *  invisible as every other. */
export const TABLE_SPACE_NEUTRAL = "rgba(224, 168, 46, 0.16)";

/**
 * ZONE DISCS ARE A TOGGLE, OFF BY DEFAULT, AND OPAQUE WHEN ON (#1395).
 *
 * The discs used to be a translucent wash (40% alpha interior + a saturated
 * rim) so the board art showed through. But the maps print their own zone
 * circles — many as a two- or three-colour pie of their own — so a see-through
 * disc at a slightly different size sat over a printed pie with BOTH patterns
 * visible at once, and which zones a space belonged to became harder to read,
 * not easier. So now:
 *
 *  - `zoneDiscs` OFF (the default, lib/pro/zoneDiscs.ts): no fill, rim,
 *    seam, pie or dish shade at all — the art carries the zones, as it does
 *    on the flat board. Everything INTERACTIVE is untouched: the padded hit
 *    circle, `data-pick`, the gold walk ring, the dashed cyan relocate ring,
 *    hover preview.
 *  - `zoneDiscs` ON: the fill is the zone's plain `#rrggbb`, no alpha, so no
 *    printed pattern can interfere with it. The inset rim, dark outline and
 *    wedge seams are kept as they were — they read fine on an opaque disc —
 *    and the dish shade stays translucent: it is a lighting cue, not a colour.
 */
/** Width (px) of the crisp, fully-saturated rim. Drawn INSET (via boxShadow /
 *  SVG stroke) so it never collides with the highlight/relocate OUTLINE,
 *  which is drawn OUTSET with its own offset. */
const ZONE_RIM_PX = 1.75;

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

export interface TableSpaceProps {
  space: ProMapSpace;
  zoneColor: (zoneId: string) => string;
  diameterPct: number;
  frameW: number;
  highlighted: boolean;
  /** 1-based position in a multi-step pick (LARGE two-step move, #1170): drawn filled
   *  with a number badge instead of the gold candidate ring. */
  chosenOrder?: number;
  relocateOrigin: boolean;
  relocateArmed: boolean;
  /** Paint the zone disc (fill, rim, outline, pie, shade) over the art
   *  (#1395). Off — the default — draws nothing visible but the pick rings. */
  zoneDiscs?: boolean;
  /** Touch device: pad the hit circle for depth (see `tableHitPx`). */
  coarsePointer?: boolean;
  /** Distance (board-plane px) to the nearest other pick — the padded hit
   *  circle never grows past it, so adjacent picks never overlap (#873). */
  hitCapPx?: number;
  onClick?: (id: SpaceId) => void;
  onHoverChange?: (id: SpaceId | null) => void;
}

export const TableSpace = ({
  space,
  zoneColor,
  diameterPct,
  frameW,
  highlighted,
  chosenOrder,
  relocateOrigin,
  relocateArmed,
  zoneDiscs = false,
  coarsePointer = false,
  hitCapPx,
  onClick,
  onHoverChange,
}: TableSpaceProps) => {
  const diamPx = (diameterPct / 100) * Math.max(frameW, 1);
  const paddedPx = (tableHitDiameter(diameterPct, space.y) / 100) * Math.max(frameW, 1);
  const hitPx = tableHitPx(diamPx, paddedPx, coarsePointer, hitCapPx);
  // Relocate mode ARMED makes non-origin spaces inert (protocol/dock review of
  // #748): only the dashed origins are clickable, and hovering anything else
  // must not fire the "who would move here" preview — mirrors ProBoard exactly.
  const clickable = !!onClick && (relocateArmed ? relocateOrigin : highlighted || relocateOrigin);
  const hoverable = !!onHoverChange && highlighted && !relocateArmed;

  const zones = space.zones ?? [];
  const slices = zoneDiscs && zones.length > 1 ? pieSliceAngles(zones.length) : null;
  const singleZoneColor = zoneDiscs && zones.length === 1 && zones[0] ? zoneColor(zones[0]) : null;

  // Relocate origins get a dashed cyan ring, deliberately distinct from the
  // solid gold walk highlight, matching ProBoard's own two affordances.
  const ringed = highlighted || relocateOrigin;
  const ringColor = relocateOrigin ? "#38D9E8" : chosenOrder ? "#FFFFFF" : "#E0A82E";

  // Opaque fill + crisp inset rim (#1395; the rim never collides with the
  // ringed highlight's own OUTSET outline). The dark ink outline sits OUTSIDE
  // the disc, and only when no pick ring is drawn: a highlighted space's gold
  // or cyan ring already separates it from the art, and two rings read as
  // noise. With the discs off there is no disc to outline.
  const zoneRimShadow = singleZoneColor ? `inset 0 0 0 ${ZONE_RIM_PX}px ${singleZoneColor}` : undefined;
  const outline = zoneDiscs && !ringed ? TABLE_SPACE_OUTLINE : undefined;
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
          for what counts as "on" this space. With the zone discs off it is
          an unpainted circle that still carries the pick ring (#1395). */}
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
        data-chosen={chosenOrder ? String(chosenOrder) : undefined}
        bg={chosenOrder ? "rgba(224,168,46,0.95)" : zoneDiscs && zones.length <= 1 ? (singleZoneColor ?? TABLE_SPACE_NEUTRAL) : undefined}
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
                  // The plain zone hex, no alpha (#1395): a translucent wedge
                  // over the art's own printed pie is exactly the interference
                  // the toggle exists to remove.
                  fill={color}
                  // A seam on EACH wedge. It used to be a full-saturation
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
        {zoneDiscs && (
          <Box data-space-shade position="absolute" inset={0} borderRadius="50%" style={{ backgroundImage: TABLE_SPACE_SHADE }} />
        )}
        {chosenOrder && (
          <Box
            position="absolute"
            inset={0}
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="#1a1206"
            fontWeight={800}
            fontSize={`${Math.max(diamPx * 0.55, 10)}px`}
          >
            {chosenOrder}
          </Box>
        )}
      </Box>
    </Box>
  );
};

/** Badge size and offset, as fractions of the space's own diameter. The
 *  badge's centre sits up-and-right of the space's centre, far enough out
 *  (0.6d, with a 0.4d badge) that it clears the inner 80% of the disc. */
const BADGE_SIZE = 0.4;
const BADGE_OFFSET = 0.6 / Math.SQRT2;

export interface TableSpaceBadgeProps {
  space: ProMapSpace;
  diameterPct: number;
  frameW: number;
  item?: ProMapItem | null;
  passage?: boolean;
}

/**
 * A space's item or secret-passage badge (#873). It used to sit at the
 * centre of the space's own hit circle, which made it unreachable: a space
 * that isn't a pick is `pointerEvents: none` (so the badge was too), and on a
 * pick one tap both committed the move and opened the popover. Like ProBoard's
 * badges it now lies beside the disc in its own layer, up and to the right,
 * and always takes its own taps. Same registry components the flat board uses.
 */
export const TableSpaceBadge = ({ space, diameterPct, frameW, item, passage }: TableSpaceBadgeProps) => {
  if (!item && !passage) return null;
  const diamPx = (diameterPct / 100) * Math.max(frameW, 1);
  const sizePx = diamPx * BADGE_SIZE;
  const offsetPx = diamPx * BADGE_OFFSET;
  return (
    <Box
      position="absolute"
      left={`${space.x * 100}%`}
      top={`${space.y * 100}%`}
      w={`${sizePx}px`}
      h={`${sizePx}px`}
      style={{ transform: `translate(calc(-50% + ${offsetPx.toFixed(2)}px), calc(-50% - ${offsetPx.toFixed(2)}px))` }}
      pointerEvents="auto"
      data-space-badge={space.id}
    >
      {item ? <ItemInspectBadge item={item} /> : <PassageBadge />}
    </Box>
  );
};
