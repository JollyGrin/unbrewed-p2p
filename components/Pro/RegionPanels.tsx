/**
 * The flat 2D board renderer, factored out of `ProBoard.tsx` (unbrewed-p2p#922)
 * so BOTH the flat board and the tabletop's Hut inset can draw a region the
 * exact same way. Originally this was inline in `ProBoard` and used for two
 * things at once — the main board's own spaces AND every region's inset panel
 * — via the same `spaceLayers` closure (see `frameOf`'s cross-frame handling
 * below, which existed from the start for exactly this dual use). `ProBoard`
 * still calls `spaceLayers` directly for its main board; this file is what
 * moved out is `regionPanel` + the floating-inset wrapper (`screenOverlays`)
 * plus everything they depend on, so `TableBoard` can mount the SAME Hut panel
 * without reimplementing a second flat renderer (#922's "hybrid" ask: the main
 * map stays 3D, only a region draws as this 2D inset).
 *
 * `useRegionPanels` returns two things:
 *  - `spaceLayers(spaces, diam, layerPx, hitCapSx?)` — every per-space overlay
 *    (hit circles, item/passage badges, board objects, fighter tokens, bands,
 *    attack arrow, move hints/preview, transient fx) for ONE positioning
 *    frame. `ProBoard` calls it for `mainSpaces`; this file calls it again,
 *    internally, once per region.
 *  - `screenOverlays` — the region inset panel(s) (drag/collapse chrome +
 *    their own `spaceLayers` call) and the zone-membership legend, positioned
 *    either inside the caller's own zoom/pan frame (`upright: false`, the
 *    normal case) or hoisted to the outer, untransformed box (`upright: true`
 *    — ProBoard's rotated-portrait case; the tabletop view never rotates, so
 *    `TableBoard` always passes `upright: false`).
 *
 * `hitCapSx` (main-board-only touch hit-padding) and `fighterTokenRim` /
 * `tokenLife` (main-board-only cosmetics) are optional: a region call omits
 * the first (regions get no extra hit padding, matching `ProBoard`'s own
 * region calls today) and `TableBoard` omits the other two entirely (it
 * doesn't support them yet either, on its own 3D main board).
 */
import type { EnclosureModel } from "@/lib/pro/enclosures";
import { EnclosureLayer } from "@/components/Pro/EnclosureLayer";
import { Box, Flex, Text, chakra, shouldForwardProp } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { isValidMotionProp, motion, useReducedMotion } from "framer-motion";
import {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FighterId,
  PlayerId,
  ProMapDef,
  ProMapRegion,
  ProMapSpace,
  SpaceId,
  ViewFighter,
  ViewToken,
} from "@/lib/pro/protocol";
import { BoardFxItem } from "@/lib/pro/useGameFx";
import { TokenGestures, usePageHidden } from "@/lib/pro/tokenLife";
import { ZoomPanInset } from "@/lib/pro/useZoomPan";
import { useCoarsePointer } from "@/lib/pro/useCoarsePointer";
import { LARGE_REACH_TARGET_BLURB } from "@/lib/pro/largeReach";
import { bandLabelText, bandMidpoint } from "@/lib/pro/twoSpaceBand";
import { PendingSwap, SWAP_SECONDS, SWAP_TIMES } from "@/lib/pro/positionSwap";
import { tokenInitials } from "./FighterTokenPortrait";
import { TokenIdle, TokenLifeLayer, phaseSeed } from "./TokenLifeLayer";
import { ItemInspectBadge, PassageBadge } from "./ItemBadge";
import type { FlagTokenBadge } from "@/lib/pro/heroStateFlags";
import { fighterStatusBadgesFor } from "@/lib/pro/fighterStatuses";
import {
  boardObjectCountdown,
  boardObjectTitle,
  boardObjectVisualFor,
} from "@/lib/pro/boardObjects";
import {
  fighterStackBySpace,
  OBJECT_SCALE_BY_SHAPE,
  objectStackOffsets,
  slotIn,
  StackSlot,
} from "@/lib/pro/tokenStack";
import { useFlag } from "@/lib/flags";
import type { CosmeticRimTier } from "@/lib/pro/cosmetics";
import { DEFAULT_SPACE_DIAMETER, SEAT_COLOR } from "@/lib/pro/seatColors";
import { COSMETIC_RIM_MIN_PX, FighterTokenRim } from "./FighterTokenRim";

/**
 * Fighter-token chrome sizing: the initials label and the edge badges (HP chip,
 * hero-state / status / number badges, reach + price pills).
 *
 * A token is a percentage of the board frame, but its chrome is rem-sized and
 * proportioned for the 40–60px tokens a desktop frame yields. A phone frame
 * (~360px) renders the same map's tokens at 20–30px, so an 11px label and a
 * 16px HP chip no longer fit around each other: the chip lands on the initials
 * and neither reads (issue #836). Coarse pointers therefore make the token a
 * CSS query container and size every piece of chrome in `cqw` — a fixed
 * fraction of the token's OWN diameter — so the cluster keeps one layout at any
 * frame width, and scales as one under the auto-focus zoom (#831) exactly like
 * the rem sizes do. Fine pointers keep the rem sizes, byte-identical.
 *
 * Coarse geometry, measured on a 24px token (100 = its outer diameter; the
 * fixed 2px body border and 1.5px chip borders are a real share at this size):
 * the 3-letter label (32, nudged up 15% of its height) spans about x 16–84 /
 * y 29–61; the HP chip (28, line-height 1.2, inset −26%) starts at about
 * x 52 / y 68, seated on the bottom-right rim below the label. The corner
 * badges (24, inset −34%) end by y 26 (top row) or start at y 74 (bottom
 * row), clear of the label either way. The reach/price pills sit above the
 * circle as before. Every offset is a percentage, so the layout is the same at
 * any zoom and only gets roomier on a bigger token.
 */
export const TOKEN_CHROME = {
  fine: {
    label: "0.68rem",
    labelShift: undefined,
    hp: "0.7rem",
    hpLine: "1.4",
    hpInset: "-18%",
    badge: "0.68rem",
    stateInset: "-20%",
    numberInset: "-18%",
    statusInset: "-20%",
    pill: "0.55rem",
  },
  coarse: {
    label: "32cqw",
    labelShift: "translateY(-15%)",
    hp: "28cqw",
    hpLine: "1.2",
    hpInset: "-26%",
    badge: "24cqw",
    stateInset: "-34%",
    numberInset: "-34%",
    statusInset: "-34%",
    pill: "26cqw",
  },
} as const;

// motion.div wrapped in chakra's style-prop system — lets the fighter token
// keep every Chakra prop it already had (bg, border, boxShadow…) while also
// accepting framer-motion's `animate`/`transition` for the path tween.
const MotionFlex = chakra(motion.div, {
  shouldForwardProp: (prop) => isValidMotionProp(prop) || shouldForwardProp(prop),
});

/** A committed MOVE_FIGHTER: the full route including the fighter's space
 * BEFORE the move as path[0], so the board can tween through every
 * intermediate node instead of snapping straight to the destination. */
export interface PendingMove {
  fighterId: FighterId;
  path: SpaceId[];
  /** LARGE (two-space) movers, issue #658: the TRAILING end's route, in lockstep
   *  with `path` (same length — the trail is dragged into the lead's former space,
   *  so `trailPath[i] === path[i - 1]` after the first entry, which is the body's
   *  other starting space). It makes a two-space body move as ONE thing: the tail
   *  token tweens along it beside the head instead of snapping, and the stepping
   *  ghost draws the whole previewed BODY rather than just its leading end. Absent
   *  for NORMAL fighters, and ignorable — without it the head still animates. */
  trailPath?: SpaceId[] | null;
}

/** One "who would move here" cue (issue #320 follow-up): a ghost of `fighterId`
 * at destination `to`, plus a source ring + connector from its current space
 * `from`. Shown on hover of a move-target space and, persistently, while an
 * ambiguous space's fighter chooser is open. PRESENTATION ONLY. */
export interface MoveHint {
  fighterId: FighterId;
  from: SpaceId;
  to: SpaceId;
}

// Duration of ONE hop in a multi-step move tween (see PendingMove above).
// Exported so callers can size a fallback timeout around the same value.
export const MOVE_STEP_SECONDS = 0.28;

const highlightPulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 2px #e0a82e, 0 0 12px 2px rgba(224,168,46,0.8); }
  50% { box-shadow: 0 0 0 3px #e0a82e, 0 0 22px 6px rgba(224,168,46,0.5); }
`;

/**
 * A target that COSTS something to reach (issue #668). Deliberately not the gold
 * pulse above: a free adjacent target and a target three spaces away that will
 * eat two Broadcast tokens are different offers, and a player must be able to
 * tell them apart at a glance rather than by reading a chip. Broadcast violet
 * (the deck's own #653e7a, lightened to stay legible against dark board art),
 * plus a DASHED outer ring the free pulse never draws — so the difference
 * survives colour-blindness and a washed-out board photo alike.
 */
const boughtRangePulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 2px #C58BE8, 0 0 12px 2px rgba(197,139,232,0.85); }
  50% { box-shadow: 0 0 0 4px #C58BE8, 0 0 24px 7px rgba(197,139,232,0.45); }
`;

/**
 * The DEFENDER SUBSTITUTION ring (protocol v34 ↔ engine #494 — Ripley's *GET
 * BEHIND ME*). Deliberately its own look, not the gold target pulse: this token
 * is not something the viewer can act on, it is the fighter that is ABOUT TO
 * TAKE THE HIT after the defender changed under the attack. It opens with one
 * hard flare (the substitution beat) and settles into a slow violet breath that
 * lasts as long as the combat does, so a player looking away and back can still
 * see who is defending.
 */
const defenderStepInPulse = keyframes`
  0%   { box-shadow: 0 0 0 6px rgba(197,139,232,0.9), 0 0 26px 10px rgba(197,139,232,0.55); }
  22%  { box-shadow: 0 0 0 3px #C58BE8, 0 0 16px 4px rgba(197,139,232,0.7); }
  60%  { box-shadow: 0 0 0 2px #C58BE8, 0 0 10px 2px rgba(197,139,232,0.45); }
  100% { box-shadow: 0 0 0 3px #C58BE8, 0 0 16px 4px rgba(197,139,232,0.7); }
`;

// transient board effects (damage numbers etc.) — pop in, drift up, fade out
const fxFloat = keyframes`
  0%   { transform: translate(-50%, -40%) scale(0.7); opacity: 0; }
  12%  { transform: translate(-50%, -60%) scale(1.25); opacity: 1; }
  30%  { transform: translate(-50%, -75%) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -220%) scale(0.95); opacity: 0; }
`;
const fxRing = keyframes`
  0%   { transform: translate(-50%, -50%) scale(0.35); opacity: 0.9; }
  100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
`;

// Attack arrow (issue #148): a slow throb so the eye finds "who is hitting whom"
// during the combat commit/reveal beats without it screaming over everything.
const arrowPulse = keyframes`
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
`;

// K.O. topple (issue #320, `tokenLife` flag): a defeated fighter has already left
// the board's live token list, so its fall plays on a short-lived overlay GHOST
// captured at the moment of defeat. It tips over (away from the attacker),
// desaturates and sinks as it fades. `translate(-50%, …)` re-centers on the space
// exactly like a real token. Reduced-motion collapses this to a plain fade.
const KO_GHOST_MS = 750;
const toppleFallRight = keyframes`
  0%   { transform: translate(-50%, -50%) rotate(0deg) scale(1); opacity: 0.95; filter: saturate(1); }
  100% { transform: translate(-50%, -28%) rotate(34deg) scale(0.8); opacity: 0; filter: saturate(0.15) brightness(0.6); }
`;
const toppleFallLeft = keyframes`
  0%   { transform: translate(-50%, -50%) rotate(0deg) scale(1); opacity: 0.95; filter: saturate(1); }
  100% { transform: translate(-50%, -28%) rotate(-34deg) scale(0.8); opacity: 0; filter: saturate(0.15) brightness(0.6); }
`;
const toppleFade = keyframes`
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
  100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0; filter: saturate(0.2); }
`;

/** One captured defeated fighter, animating its fall on the overlay. */
interface KoGhost {
  key: string;
  space: SpaceId;
  color: string;
  art?: string | null;
  initials: string;
  isHero: boolean;
  fallRight: boolean;
  reduced: boolean;
}

// Raw hex for the token body when the `tokenLife` layer paints the circle via
// inline style (Chakra tokens don't resolve there). Must match styles/style.ts.
const SURFACE_DIM = "#2C1831";

// Team-affiliation ring (issue #195): a teal halo shared by every fighter on the
// viewer's team. Kept distinct from the gold highlight, white selection ring, and
// crimson attack arrow so it never reads as any of those. Must match ProHud's
// ALLY_ACCENT so HUD chip and board ring are visibly the same "team" signal.
const ALLY_RING = "#39B7A8";

const ARROW_COLOR = "#E23B3B"; // crimson — reads as "attack", distinct from both player colors
// Movement-intent cue (issue #320 follow-up): a soft periwinkle for the "who
// moves here" ghost/connector/source-ring. Deliberately its OWN channel —
// distinct from the gold move highlight (#E0A82E), the white selection ring, the
// teal ally ring (#39B7A8), and the crimson attack arrow — and it never touches
// box-shadow (which selection already owns).
const MOVE_HINT_COLOR = "#A78BFA";

// Maneuver-ORIGIN relocation pick (engine #535 ↔ unbrewed-p2p#747): a cold cyan
// drawn DASHED — the board's only dashed affordance — so a teleport origin never
// reads as the solid gold walk highlight, the white selection ring, the teal
// ally ring (#39B7A8), or the periwinkle move hint above.
const RELOCATE_COLOR = "#3ECFE0";

// Zone-membership readability (issue #413): a subtle fill tint keyed to a zone's
// own color. Append a low-alpha channel to a #rrggbb color (editor zone colors
// are always hex); any non-hex value is returned untouched so it degrades to a
// solid-but-harmless fill rather than throwing off the CSS.
const zoneTint = (hex: string): string =>
  /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}3D` : hex; // ~24% alpha

/**
 * Attacker→target arrow geometry in a frame's normalized 0–100 space (same
 * convention as the two-space band): a shaft that stops short of both tokens
 * plus a filled triangular head at the target end. Rendered inside a
 * preserveAspectRatio="none" SVG, so like the band it inherits the image's
 * non-uniform stretch — directionally exact (the tip lands on the target),
 * just visually squished on lopsided maps.
 */
const arrowGeometry = (
  attacker: { x: number; y: number },
  target: { x: number; y: number },
  diam: number
) => {
  const ax = attacker.x * 100;
  const ay = attacker.y * 100;
  const tx = target.x * 100;
  const ty = target.y * 100;
  const dx = tx - ax;
  const dy = ty - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy; // perpendicular unit
  const py = ux;
  const r = diam * 0.5; // token clearance (x-units)
  const headLen = diam * 0.5; // slim chevron — roughly half a pawn long, not a full one
  const headW = diam * 0.3; // half-width; keeps the head reading as a pointer, not a wedge
  const tipX = tx - ux * r; // land the tip at the target token's edge
  const tipY = ty - uy * r;
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;
  return {
    x1: ax + ux * r,
    y1: ay + uy * r,
    x2: baseX, // shaft ends where the head begins
    y2: baseY,
    points: `${tipX},${tipY} ${baseX + px * headW},${baseY + py * headW} ${baseX - px * headW},${baseY - py * headW}`,
  };
};

const FX_COLOR: Record<BoardFxItem["kind"], string> = {
  damage: "#FF5C5C",
  heal: "#58D68D",
  blocked: "#B8C4CE",
  defeat: "#E0A82E",
};

// Width of a region inset panel as a fraction of the board frame. The panels
// carry their own %-positioned tokens, so this is what converts their sizing
// into the same on-screen pixels the main board's tokens measure in (#613).
const REGION_PANEL_W = 0.27;
const REGION_PANEL_W_CSS = `${REGION_PANEL_W * 100}%`;

export interface RegionPanelsProps {
  map: ProMapDef;
  fighters: ViewFighter[];
  tokens?: ViewToken[];
  boardObjectArt?: (token: ViewToken) => string | null | undefined;
  boardObjectOriginName?: (token: ViewToken) => string | null | undefined;
  highlightedSpaces?: SpaceId[];
  chosenSpaces?: SpaceId[];
  highlightedFighters?: FighterId[];
  relocateSpaces?: SpaceId[];
  relocateArmed?: boolean;
  selectedFighter?: FighterId | null;
  attack?: { attacker: FighterId; target: FighterId } | null;
  defenderStepIn?: { fighterId: FighterId; chip: string; blurb: string } | null;
  friendlyOwners?: PlayerId[];
  fighterBadges?: Partial<Record<FighterId, number>>;
  extendedReachTargets?: FighterId[];
  boughtRangeTargets?: { id: FighterId; chip: string; blurb: string }[];
  fighterTokenArt?: (fighter: ViewFighter) => string | null | undefined;
  fighterTokenBadge?: (fighter: ViewFighter) => FlagTokenBadge | null | undefined;
  /** main-board-only cosmetic (issue #613) — omitted by every region call. */
  fighterTokenRim?: (fighter: ViewFighter) => CosmeticRimTier | null | undefined;
  fx?: BoardFxItem[];
  pendingMove?: PendingMove | null;
  onPendingMoveSettled?: () => void;
  swaps?: PendingSwap[] | null;
  previewMove?: PendingMove | null;
  /** Region ids currently out of play (view.closedRegions) — their inset
   * panels grey out and stop taking clicks */
  closedRegions?: string[];
  itemTokens?: Record<SpaceId, string>;
  enclosures?: EnclosureModel | null;
  onSpaceClick?: (id: SpaceId) => void;
  onFighterClick?: (id: FighterId) => void;
  onSpaceHover?: (id: SpaceId | null) => void;
  onFighterHover?: (id: FighterId | null) => void;
  moveHint?: MoveHint[] | null;
  /** main-board-only "lively tokens" beta (issue #320) — omitted by TableBoard
   *  entirely, on both its main board and this Hut panel. */
  tokenLife?: TokenGestures | null;
  fighterEls?: MutableRefObject<Map<FighterId, HTMLElement>>;
  /** px of this box hidden behind the caller's fixed overlays — only matters
   *  in rotated portrait (see `upright`), which the tabletop view never hits. */
  fitInset?: ZoomPanInset;
  /** Rotated-portrait hoist (issue #708): pin the panels to the untransformed
   *  screen instead of the board's own zoom/pan frame. `ProBoard` passes
   *  `zoomable && rotated`; the tabletop view forces flat in portrait, so
   *  `TableBoard` never sets this. */
  upright?: boolean;
  /** The board frame these panels drag/clamp against — its bounding rect is
   *  measured on every drag frame, so it must be the element the panels are
   *  actually positioned relative to (or one with the identical rect). */
  frameRef: MutableRefObject<HTMLDivElement | null>;
  /** On-screen width (px) of `frameRef`, post zoom/pan scale — region panels
   *  size their own token layer as a fraction of it (#613). */
  framePx: number;
}

export interface RegionPanelsResult {
  /** Every per-space overlay for ONE positioning frame — the main board or a
   *  region inset panel. `spaces` are the frame's members and their x/y are
   *  fractions of THAT frame; `diam` is the pawn diameter as a % of the frame
   *  width. `hitCapSx` (main-board-only touch hit-padding, issue #836) is
   *  omitted for every region call — their spacing isn't measured for it. */
  spaceLayers: (
    spaces: ProMapSpace[],
    diam: number,
    layerPx: number,
    hitCapSx?: (spaceId: SpaceId, renderedDiameterPx: number) => Record<string, unknown>,
    /** The frame's UNSCALED layout width and height (px) — lets the enclosure chips stay a fixed on-screen
     *  size inside the zoom-scaled frame. Unknown (omitted / 0): enclosure rings only. */
    layoutPx?: number,
    layoutH?: number
  ) => ReactNode;
  /** Region inset panels + the zone-membership legend. Empty fragment when
   *  the map has no regions AND nothing is hovered for the legend. */
  screenOverlays: ReactNode;
}

/**
 * Everything a board needs to draw a map's region(s) as floating 2D inset
 * panels — the drag/collapse chrome, their own space/fighter/object/fx layer,
 * and the zone-hover legend — plus the SAME renderer for the caller's own
 * main-board spaces (`ProBoard` uses both; `TableBoard` uses only the region
 * half, since its main board is the 3D `TableStage`).
 */
export const useRegionPanels = ({
  map,
  fighters,
  tokens = [],
  boardObjectArt,
  boardObjectOriginName,
  highlightedSpaces = [],
  chosenSpaces = [],
  highlightedFighters = [],
  relocateSpaces = [],
  relocateArmed = false,
  selectedFighter = null,
  attack = null,
  defenderStepIn = null,
  friendlyOwners = [],
  fighterBadges = {},
  extendedReachTargets = [],
  boughtRangeTargets = [],
  fighterTokenArt,
  fighterTokenBadge,
  fighterTokenRim,
  fx = [],
  pendingMove = null,
  onPendingMoveSettled,
  swaps = null,
  previewMove = null,
  closedRegions = [],
  itemTokens = {},
  enclosures = null,
  onSpaceClick,
  onFighterClick,
  onSpaceHover,
  onFighterHover,
  moveHint = null,
  tokenLife = null,
  fighterEls,
  fitInset,
  upright = false,
  frameRef,
  framePx,
}: RegionPanelsProps): RegionPanelsResult => {
  const reducedMotion = !!useReducedMotion();
  const pageHidden = usePageHidden();
  const coarsePointer = useCoarsePointer();
  const itemById = new Map((map.items ?? []).map((it) => [it.id, it]));
  const highlightSet = new Set(highlightedSpaces);
  const chosenOrder = new Map(chosenSpaces.map((id, i) => [id, i + 1] as const));
  const highlightFighterSet = new Set(highlightedFighters);
  const relocateSet = new Set(relocateSpaces);
  const extendedReachSet = new Set(extendedReachTargets);
  const boughtRangeById = new Map(boughtRangeTargets.map((t) => [t.id, t]));
  const closedSet = new Set(closedRegions);
  const friendlySet = new Set(friendlyOwners);

  // v9 regions (Baba Yaga's Hut): a region's spaces carry x/y normalized to the
  // REGION image, not the main board — each region renders as its own inset
  // panel with its own positioning frame. A space naming an unknown region id
  // falls back to the main frame rather than vanishing.
  const regions = map.regions ?? [];
  const regionIds = new Set(regions.map((r) => r.id));
  const frameOf = (s: ProMapSpace): string =>
    s.region && regionIds.has(s.region) ? s.region : "main";

  // Inset-panel UX (the panel covers main-board spaces otherwise): per-region
  // collapse + drag, both component-state only. `panelPos` is the dragged
  // top-left as a % of the board frame (null/absent = default bottom-right
  // stack) so a window resize keeps the panel glued to the same board spot.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [panelPos, setPanelPos] = useState<Record<string, { x: number; y: number }>>({});

  // A collapsed panel must never hide a required choice: any highlighted space
  // or targetable fighter INSIDE the region forces it open for the duration.
  // Relocation picks ride along — not required (END_MANEUVER always exists) but
  // a pick hidden behind a collapsed panel is a pick nobody can make.
  const regionActive = (regionId: string) =>
    map.spaces.some(
      (s) =>
        s.region === regionId &&
        (highlightSet.has(s.id) ||
          relocateSet.has(s.id) ||
          fighters.some((f) => f.space === s.id && highlightFighterSet.has(f.id)))
    );

  // Drag via the panel's header bar: pointer events (touch-friendly), clamped
  // to the board frame. Rects are captured once at pointerdown — the grab
  // offset keeps the panel from jumping under the pointer.
  const onHeaderPointerDown = (regionId: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    // Stop the press from bubbling to the outer container, whose useZoomPan
    // pointer-down would otherwise start a BOARD pan under the panel — one
    // gesture moving both (issue #216 parallax). The panel is its own drag.
    e.stopPropagation();
    const frame = frameRef.current;
    const panel = e.currentTarget.parentElement;
    if (!frame || !panel) return;
    const frameRect = frame.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    if (!frameRect.width || !frameRect.height) return;
    const offsetX = e.clientX - panelRect.left;
    const offsetY = e.clientY - panelRect.top;
    const move = (ev: PointerEvent) => {
      const left = Math.min(
        Math.max(ev.clientX - frameRect.left - offsetX, 0),
        frameRect.width - panelRect.width
      );
      const top = Math.min(
        Math.max(ev.clientY - frameRect.top - offsetY, 0),
        frameRect.height - panelRect.height
      );
      setPanelPos((p) => ({
        ...p,
        [regionId]: { x: (left / frameRect.width) * 100, y: (top / frameRect.height) * 100 },
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const fightersOnBoard = fighters.filter((f) => f.space && !f.defeated);
  const bySpace = new Map<SpaceId, ViewFighter[]>();
  for (const f of fightersOnBoard) {
    const list = bySpace.get(f.space as SpaceId) ?? [];
    list.push(f);
    bySpace.set(f.space as SpaceId, list);
  }

  // Per-space stack layout (protocol v28 — SMALL fighters share spaces), a LARGE
  // fighter's tail space included. Shared with the tabletop view via
  // lib/pro/tokenStack.ts so both boards put a crowd in the same places.
  const stackBySpace = fighterStackBySpace(fightersOnBoard);
  /** This token's drawn position + scale; centred full-size if the space is unknown. */
  const slotFor = (space: SpaceId, key: string): StackSlot => slotIn(stackBySpace, space, key);

  // v6 two-space (LARGE) fighters: `space` is the head, `tailSpace` the second
  // body space. The head renders through the normal per-space pass below;
  // these get an extra tail token + a stretch-band so the pair reads as ONE
  // fighter. Occupancy is exclusive server-side, so a tail never stacks.
  const spaceById = new Map(map.spaces.map((s) => [s.id, s]));
  const twoSpaceFighters = fightersOnBoard.filter((f) => f.tailSpace);

  // Multi-zone readability (issue #413): a space can belong to several zones, and
  // zone-conditional effects count fighters in EVERY zone a space touches — so a
  // fighter can be "in the zone" via a second, non-obvious zone. Hovering
  // (desktop) or tapping (touch) any space lights up every space sharing one of
  // its zones, tinted + ringed in that zone's own color. Gated behind a
  // default-OFF beta flag (issue #447).
  const [zoneHoverOn] = useFlag("zoneHover");
  const [zoneHoverSpace, setZoneHoverSpace] = useState<SpaceId | null>(null);
  const setZoneHover: typeof setZoneHoverSpace = (v) => {
    if (zoneHoverOn) setZoneHoverSpace(v);
  };
  const zoneColorById = new Map(map.zones.map((z) => [z.id, z.color] as const));
  const hoveredZoneSet = (() => {
    if (!zoneHoverOn) return new Set<string>();
    const s = zoneHoverSpace ? spaceById.get(zoneHoverSpace) : undefined;
    return new Set((s?.zones ?? []).filter((z) => zoneColorById.has(z)));
  })();
  // Zone colors applying to a space = the intersection of its zones with the
  // hovered space's zones, kept in the space's own zone order for stable rings.
  const zoneMemberColors = (s: ProMapSpace): string[] =>
    hoveredZoneSet.size
      ? s.zones.filter((z) => hoveredZoneSet.has(z)).map((z) => zoneColorById.get(z) as string)
      : [];

  // Attack arrow (issue #148): the two combatants of the active engagement, if
  // both are on the board. Resolved once here; spaceLayers draws the arrow in
  // whichever frame holds both tokens (the arrow doesn't cross frames).
  const attacker = attack ? fighters.find((f) => f.id === attack.attacker) : undefined;
  const attackTarget = attack ? fighters.find((f) => f.id === attack.target) : undefined;

  // K.O. topple ghosts (issue #320). A `topple` gesture is captured the instant a
  // fighter is defeated — while it is still in `fighters` — into a short-lived
  // overlay so the fall survives the fighter leaving the live token list next
  // snapshot. Self-contained: no ghosts unless the flag is on, so the board's
  // token DOM is unchanged when off.
  const [koGhosts, setKoGhosts] = useState<KoGhost[]>([]);
  const koSeenRef = useRef<Record<FighterId, number>>({});
  const koTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const timers = koTimersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    if (!tokenLife) return;
    const fresh: KoGhost[] = [];
    for (const [id, g] of Object.entries(tokenLife)) {
      if (g.kind !== "topple" || koSeenRef.current[id] === g.key) continue;
      koSeenRef.current[id] = g.key;
      const f = fighters.find((ff) => ff.id === id);
      const space = g.space ?? f?.space ?? f?.tailSpace ?? null;
      if (!f || !space) continue;
      fresh.push({
        key: `ko-${id}-${g.key}`,
        space,
        color: SEAT_COLOR[f.owner] ?? "#999",
        art: fighterTokenArt?.(f) ?? null,
        initials: tokenInitials(f.name),
        isHero: f.kind === "HERO",
        fallRight: g.dx >= 0,
        reduced: reducedMotion,
      });
    }
    if (fresh.length === 0) return;
    setKoGhosts((cur) => [...cur, ...fresh]);
    const keys = new Set(fresh.map((k) => k.key));
    koTimersRef.current.push(
      setTimeout(() => setKoGhosts((cur) => cur.filter((k) => !keys.has(k.key))), KO_GHOST_MS)
    );
  }, [tokenLife, fighters, fighterTokenArt, reducedMotion]);

  // The moving fighter's node-by-node route, resolved to coordinates. Only
  // the HEAD token of the named fighter tweens through it — an
  // authoritative snapshot landing mid-flight is ignored (see fighterToken)
  // so the token never jumps to wherever the server says it ended up.
  const routeAnim = (route: SpaceId[] | null | undefined) => {
    if (!route) return null;
    const nodes = route.map((id) => spaceById.get(id)).filter((s): s is ProMapSpace => !!s);
    if (nodes.length < 2) return null;
    // A portal move can cross frames (main board <-> region inset), whose %
    // coordinate systems are unrelated — tween only the leg inside the
    // DESTINATION frame and let the token snap across the boundary. A
    // single-node leg returns null (plain snap; the caller's pendingMove
    // timeout still clears the state).
    const destFrame = frameOf(nodes[nodes.length - 1]);
    let legStart = nodes.length - 1;
    while (legStart > 0 && frameOf(nodes[legStart - 1]) === destFrame) legStart--;
    const coords = nodes.slice(legStart);
    if (coords.length < 2) return null;
    return {
      fighterId: pendingMove!.fighterId,
      xs: coords.map((c) => c.x * 100),
      ys: coords.map((c) => c.y * 100),
    };
  };
  const pendingAnim = pendingMove ? routeAnim(pendingMove.path) : null;
  // A LARGE body moves as ONE thing (issue #658): its trailing end rides the same
  // tween, one space behind the lead, instead of snapping to wherever the snapshot
  // put it. Absent (NORMAL fighters, older callers) ⇒ exactly today's head-only tween.
  const pendingTailAnim = pendingMove ? routeAnim(pendingMove.trailPath) : null;

  // Atomic position swaps (protocol v31): the fighter's PRE-swap pose, keyed by
  // id. Deliberately kept out of `routeAnim` — a swap has no route to walk, so
  // the token crossfades between the two poses instead of tweening through
  // them, and the beat can never be mistaken for a walk.
  const swapByFighter = new Map((swaps ?? []).map((sw) => [sw.fighterId, sw]));

  // One fighter token (head or tail segment). Clicking EITHER segment acts on
  // the fighter; target/selection styling lights both. Only the head carries
  // the HP badge so the pair still shows a single HP readout.
  const fighterToken = (
    f: ViewFighter,
    s: ProMapSpace,
    slot: StackSlot,
    segment: "head" | "tail",
    diam: number,
    /** on-screen width (px) of the frame this token's % sizing is relative to;
     *  0 when unmeasured. Cosmetic-only — see the rim gate below. */
    layerPx: number,
    anim?: { xs: number[]; ys: number[] },
    hitCapSx?: (spaceId: SpaceId, renderedDiameterPx: number) => Record<string, unknown>
  ) => {
    const color = SEAT_COLOR[f.owner] ?? "#999";
    const isSelected = f.id === selectedFighter;
    const isTarget = highlightFighterSet.has(f.id);
    // Label + badge sizes: token-relative on a touch screen, rem on desktop.
    const chrome = coarsePointer ? TOKEN_CHROME.coarse : TOKEN_CHROME.fine;
    // Extended-reach attack target (issue #235): the pulsing token is a legal
    // target ONLY because a LARGE fighter is involved (2-space melee reach). Mark
    // it so the 2-space attack doesn't read as a bug. Presentation only.
    const isExtendedReachTarget = isTarget && extendedReachSet.has(f.id);
    // Bought-range target (issue #668): legal ONLY because tokens will be spent.
    // `isTarget` gates it so a stale price can never light a token the server is
    // not currently offering.
    const boughtRange = isTarget ? (boughtRangeById.get(f.id) ?? null) : null;
    // Defender substitution / redirect (protocol v34, #694): THIS fighter is the
    // one actually defending the live combat, and it is not who was attacked.
    // Head segment only, like every other badge, and
    // deliberately NOT gated on `isTarget` — the new defender is usually the
    // viewer's OWN fighter, which the server never offers as a target.
    const stepsInAsDefender = segment === "head" && defenderStepIn?.fighterId === f.id;
    const isFriendly = friendlySet.has(f.owner);
    // A CHOOSE_SPACE prompt highlights the space *under* the token, and the
    // token (zIndex 4) sits above the space hit-circle (zIndex 3) — a click
    // lands on the token and would die here (DOM siblings don't forward events
    // downward). So when this token's own space is a highlightable target and
    // the token isn't itself a fighter-click target, forward the click to the
    // space. Fighter-target clicks (attack / CHOOSE_TARGET) still take priority.
    const spaceHighlighted = highlightSet.has(s.id) && !!onSpaceClick;
    const fighterClickable = isTarget && !!onFighterClick;
    const clickable = fighterClickable || spaceHighlighted;
    const handleClick = fighterClickable
      ? () => onFighterClick!(f.id)
      : spaceHighlighted
        ? () => onSpaceClick!(s.id)
        : undefined;
    const key = segment === "head" ? f.id : `${f.id}-tail`;

    // Team ring (issue #195): an outer teal halo shared by the viewer's whole
    // team. Layered OUTSIDE the white selection ring (larger spread, listed last)
    // so selection and affiliation both stay legible. A targeted fighter's pulse
    // animation temporarily overrides box-shadow — the ring returns once it ends.
    const baseShadow = isSelected
      ? "0 0 0 3px #fff, 0 2px 8px rgba(0,0,0,0.6)"
      : "0 2px 6px rgba(0,0,0,0.5)";
    const boxShadow = isFriendly
      ? `${baseShadow}, 0 0 0 ${isSelected ? "5px" : "3px"} ${ALLY_RING}`
      : baseShadow;

    // Portrait art clipped into the circle (issue #247). HEAD segment only: a
    // LARGE fighter's tail body stays a plain colored circle (same head-only
    // rule as the HP badge). Undefined/null for decks without token art → the
    // token renders initials-only exactly as before.
    const tokenArt = segment === "head" ? fighterTokenArt?.(f) : null;
    const tokenBadge = segment === "head" && f.kind === "HERO" ? fighterTokenBadge?.(f) : null;
    // Per-fighter status rim badges (issue #371) — driven straight off
    // ViewFighter.statuses via the FIGHTER_STATUS_BADGES registry. Unlike the
    // hero-state tokenBadge above, these apply to ANY fighter (hero OR sidekick,
    // any hero) since a status is typically inflicted by the opponent. Head
    // segment only, same rule as the HP/state badges.
    const statusBadges = segment === "head" ? fighterStatusBadgesFor(f) : [];
    // Cosmetic metal rim (#613, design doc §10). HERO head segment only —
    // sidekick cosmetics are explicitly deferred (§10b), and a LARGE fighter's
    // tail is a plain body, same head-only rule as every badge. It resolves
    // strictly BESIDE the art chain, never instead of it: a hero-state portrait
    // swap still wins the picture, and the rim is additive chrome on top.
    //
    // Auto-retire (§10b): below COSMETIC_RIM_MIN_PX of rendered diameter the rim
    // just isn't rendered — the badges need those pixels, and since the rim is an
    // absolutely-positioned overlay its absence shifts no layout. An UNMEASURED
    // frame (layerPx 0) renders it: the gate exists to protect tiny tokens, not
    // to withhold the cosmetic whenever the size is unknown.
    const rimTier = segment === "head" && f.kind === "HERO" ? (fighterTokenRim?.(f) ?? null) : null;
    const rim =
      rimTier && (layerPx === 0 || layerPx * ((diam * slot.scale) / 100) >= COSMETIC_RIM_MIN_PX)
        ? rimTier
        : null;

    const children = (
      <>
        {tokenArt && (
          // Own inset layer with its OWN 50% clip + overflow:hidden so only the
          // art is masked to the circle — the edge badges (HP/number/reach) sit
          // OUTSIDE at negative offsets and must NOT be clipped, so the mask
          // stays off the MotionFlex itself. A soft dark scrim over the art
          // keeps the light initials + colored border legible on any portrait.
          <Box
            position="absolute"
            inset={0}
            borderRadius="50%"
            overflow="hidden"
            zIndex={0}
          >
            <Box
              as="img"
              src={tokenArt}
              alt=""
              draggable={false}
              w="100%"
              h="100%"
              sx={{ objectFit: "cover", objectPosition: "center top" }}
            />
            <Box
              position="absolute"
              inset={0}
              bg="radial-gradient(circle at 50% 42%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.35) 100%)"
            />
          </Box>
        )}
        {/* Cosmetic rim — after the art so the band seats on the edge of the
            portrait, before every badge so it can never sit over one. */}
        {rim && <FighterTokenRim tier={rim} />}
        <Text
          // rem, not vw: the label lives inside the zoom-transformed frame, so
          // a viewport-relative size would fight the zoom (text stays put while
          // the token scales). rem scales with the transform like the art.
          // (Coarse pointers use cqw — see TOKEN_CHROME — which scales the same.)
          fontSize={chrome.label}
          transform={chrome.labelShift}
          fontWeight="bold"
          letterSpacing="-0.02em"
          // Over art, drop to a uniform light label + dark shadow: the per-kind
          // dark/light color pair can't stay legible on an arbitrary portrait,
          // so art forces white-on-scrim; no-art keeps the original pairing.
          color={
            tokenArt
              ? "brand.parchment"
              : f.kind === "HERO"
                ? "brand.surfaceDim"
                : "brand.parchment"
          }
          textShadow={tokenArt ? "0 1px 3px rgba(0,0,0,0.95)" : undefined}
          zIndex={1}
          lineHeight={1}
        >
          {tokenInitials(f.name)}
        </Text>
        {segment === "head" && (
          // NB `pointerEvents="none"` on every badge layer below: they are anchored at
          // NEGATIVE offsets so they deliberately spill outside the token circle, and
          // since protocol v28 the space next to a token is another stacked fighter.
          // Without this a neighbour's HP badge sits over your token's centre and
          // swallows the click — decorative chrome must never be a click target.
          <Flex
            position="absolute"
            bottom={chrome.hpInset}
            right={chrome.hpInset}
            pointerEvents="none"
            bg="brand.surfaceDim"
            color="brand.parchment"
            border={`1.5px solid ${color}`}
            borderRadius="999px"
            px="0.3em"
            fontSize={chrome.hp}
            fontWeight="bold"
            lineHeight={chrome.hpLine}
          >
            {f.hp}
          </Flex>
        )}
        {tokenBadge && (
          <Flex
            position="absolute"
            top={chrome.stateInset}
            right={chrome.stateInset}
            pointerEvents="none"
            minWidth="1.45em"
            h="1.45em"
            px="0.18em"
            gap={tokenBadge.showLabel ? "0.12em" : undefined}
            alignItems="center"
            justifyContent="center"
            bg={tokenBadge.bg}
            color={tokenBadge.color}
            border="1.5px solid #fff"
            borderRadius="999px"
            fontSize={chrome.badge}
            fontWeight="bold"
            lineHeight="1"
            boxShadow="0 1px 4px rgba(0,0,0,0.75)"
            title={tokenBadge.title}
            aria-label={tokenBadge.title}
          >
            {tokenBadge.icon}
            {/* Numeric states (counter / set-aside pile) draw the live value on the
                token itself — the tooltip alone was not a board-readable surface.
                Word-labelled flag states leave `showLabel` off and stay icon-only. */}
            {tokenBadge.showLabel && (
              <Box as="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {tokenBadge.label}
              </Box>
            )}
          </Flex>
        )}
        {statusBadges.length > 0 && (
          // Rim badges for each active per-fighter status (#371). Anchored at the
          // bottom-left corner — clear of the HP badge (bottom-right), the
          // hero-state badge (top-right), the number badge (top-left) and the
          // reach pill (top-center) — and stacked upward (column-reverse) so a
          // second status kind just adds another badge with no repositioning.
          <Flex
            position="absolute"
            bottom={chrome.statusInset}
            left={chrome.statusInset}
            pointerEvents="none"
            direction="column-reverse"
            alignItems="flex-start"
            gap="0.15em"
          >
            {statusBadges.map((b) => (
              <Flex
                // `key`, not `kind`: one fighter can carry several `MARKED` statuses
                // at once (one per marker name, protocol v29), which share a kind.
                key={b.key}
                minWidth="1.45em"
                h="1.45em"
                px="0.18em"
                alignItems="center"
                justifyContent="center"
                bg={b.bg}
                color={b.color}
                border="1.5px solid #fff"
                borderRadius="999px"
                fontSize={chrome.badge}
                fontWeight="bold"
                lineHeight="1"
                boxShadow="0 1px 4px rgba(0,0,0,0.75)"
                title={b.title}
                aria-label={b.title}
              >
                {b.icon}
                {/* stack depth for a multi-stack marker (#596 ↔ engine #360) — the
                    count is rules-relevant (it IS the damage the tick deals), so it
                    reads off the board, not just out of the tooltip. A single stack
                    stays icon-only: "×1" is noise. */}
                {b.count && b.count > 1 ? (
                  <Box as="span" ml="0.1em">
                    {b.count}
                  </Box>
                ) : null}
              </Flex>
            ))}
          </Flex>
        )}
        {segment === "head" && fighterBadges[f.id] != null && (
          <Flex
            position="absolute"
            top={chrome.numberInset}
            left={chrome.numberInset}
            pointerEvents="none"
            bg={color}
            color="#fff"
            border="1.5px solid #fff"
            borderRadius="999px"
            minWidth="1.3em"
            px="0.25em"
            fontSize={chrome.badge}
            fontWeight="bold"
            lineHeight="1.5"
            boxShadow="0 1px 3px rgba(0,0,0,0.7)"
            // a name like "Raptor" can recur across several siblings; this
            // badge number is what ties the token to its sidebar button.
            title={`#${fighterBadges[f.id]}`}
            alignItems="center"
            justifyContent="center"
          >
            {fighterBadges[f.id]}
          </Flex>
        )}
        {segment === "head" && isExtendedReachTarget && (
          <Flex
            position="absolute"
            top="-46%"
            left="50%"
            transform="translateX(-50%)"
            bg="brand.accent"
            color="brand.surfaceDim"
            borderRadius="999px"
            px="0.45em"
            fontSize={chrome.pill}
            fontWeight="bold"
            letterSpacing="0.02em"
            lineHeight="1.5"
            whiteSpace="nowrap"
            boxShadow="0 1px 3px rgba(0,0,0,0.7)"
            // Terse at-a-glance echo on the pulsing token; the sidebar row carries
            // the full "Large fighter — melee reach 2" copy + tooltip. The reach is
            // attacker-only (#549), so this token is the one being reached OVER —
            // its hover title says so from the receiving end, wording still composed
            // from the shared blurb so board + row can never drift.
            title={LARGE_REACH_TARGET_BLURB}
          >
            reach 2
          </Flex>
        )}
        {segment === "head" && boughtRange && (
          <Flex
            position="absolute"
            top="-46%"
            left="50%"
            transform="translateX(-50%)"
            // Violet chip on the violet ring, so the price and the ring that
            // announces it read as one thing rather than two annotations.
            bg="#C58BE8"
            color="#241033"
            borderRadius="999px"
            px="0.45em"
            fontSize={chrome.pill}
            fontWeight="bold"
            letterSpacing="0.02em"
            lineHeight="1.5"
            whiteSpace="nowrap"
            boxShadow="0 1px 3px rgba(0,0,0,0.7)"
            // The whole point of the chip: the cost is legible BEFORE the click,
            // because the engine deducts it the instant the attack is declared and
            // there is no confirmation step to change your mind in.
            title={boughtRange.blurb}
          >
            {boughtRange.chip}
          </Flex>
        )}
        {stepsInAsDefender && defenderStepIn && (
          <Flex
            position="absolute"
            // Below the token rather than above it: the "reach 2" / price chips
            // own the top, and a substitution can land on a token that is also a
            // legal target, so the two must never draw on top of each other.
            top="108%"
            left="50%"
            transform="translateX(-50%)"
            bg="#C58BE8"
            color="#241033"
            borderRadius="999px"
            px="0.45em"
            fontSize={chrome.pill}
            fontWeight="bold"
            letterSpacing="0.02em"
            lineHeight="1.5"
            whiteSpace="nowrap"
            pointerEvents="none"
            boxShadow="0 1px 3px rgba(0,0,0,0.7)"
          >
            {defenderStepIn.chip}
          </Flex>
        )}
      </>
    );

    // Node-by-node route (in %) to tween through, or just the token's own
    // resting space when nothing is in flight. Always the SAME MotionFlex
    // element (never swapped for a plain Flex) so a move starting mid-render
    // is an ANIMATE UPDATE on the already-mounted node, not a fresh mount —
    // framer-motion only plays keyframes on updates; a mount snaps straight
    // to rest. The diagonal stacking `nudge` rides on `transform` instead of
    // `left`/`top` so those two stay plain percentages animation can tween.
    //
    // A SWAP (protocol v31) is the one relocation with no route: the two
    // fighters exchanged spaces atomically, so there is nothing to walk. The
    // token instead fades out at the pose it held BEFORE the swap, jumps while
    // invisible, and fades back in where it landed — a beat that reads as a
    // teleport rather than a walk, and needs no `transform` of its own (the
    // diagonal stacking nudge lives there and must survive untouched). A `from`
    // in a different positioning frame (region inset) has unrelated %
    // coordinates, so it degrades to an in-place blink at the destination.
    const swap = anim ? undefined : swapByFighter.get(f.id);
    const swapFromSpace = swap
      ? spaceById.get(segment === "tail" ? (swap.fromTail ?? swap.from) : swap.from)
      : undefined;
    const swapFrom =
      swap && !reducedMotion
        ? swapFromSpace && frameOf(swapFromSpace) === frameOf(s)
          ? { x: swapFromSpace.x * 100, y: swapFromSpace.y * 100 }
          : { x: s.x * 100, y: s.y * 100 }
        : null;

    const xs = anim ? anim.xs : swapFrom ? [swapFrom.x, swapFrom.x, s.x * 100, s.x * 100] : [s.x * 100];
    const ys = anim ? anim.ys : swapFrom ? [swapFrom.y, swapFrom.y, s.y * 100, s.y * 100] : [s.y * 100];
    const steps = xs.length;
    const times = swapFrom
      ? SWAP_TIMES
      : steps > 1
        ? Array.from({ length: steps }, (_, i) => i / (steps - 1))
        : undefined;
    const duration = anim ? (steps - 1) * MOVE_STEP_SECONDS : swapFrom ? SWAP_SECONDS : 0;

    // The visible circle body. When `tokenLife` is on it moves onto the inner
    // gesture wrapper (so the whole token recoils/lunges as one unit) and the
    // MotionFlex becomes a transparent shell that keeps only the position tween
    // and the box-shadow rings; when off it stays on the MotionFlex exactly as
    // before, so the token DOM is byte-identical.
    // `bodyBgToken` is the Chakra token used on the OFF path (byte-identical to
    // today); `bodyBgHex` is the resolved hex the inner layer needs for inline
    // style. Border/opacity are the same expression on both paths.
    const tokenLifeOn = !!tokenLife;
    const bodyBgToken = f.kind === "HERO" ? color : "brand.surfaceDim";
    const bodyBgHex = f.kind === "HERO" ? color : SURFACE_DIM;
    const bodyBorder = `2px solid ${f.kind === "HERO" ? "#fff" : color}`;
    const bodyOpacity = f.kind === "HERO" ? 1 : 0.92;
    // What the token settles back to after an animated opacity beat — the same
    // expression the `opacity` prop below renders at rest, on both token paths.
    const restOpacity = tokenLifeOn ? 1 : bodyOpacity;

    // Idle vocabulary: selected/deciding fighter gets the "ready" bob (idle
    // breathing suppressed so the two never read as the same); a near-death
    // fighter breathes "labored"; everyone else breathes normally.
    const idle: TokenIdle = isSelected
      ? "ready"
      : f.maxHp > 0 && f.hp / f.maxHp <= 0.34
        ? "labored"
        : "breathing";

    const body = tokenLifeOn ? (
      <TokenLifeLayer
        gesture={tokenLife?.[f.id]}
        idle={idle}
        reduced={reducedMotion}
        paused={pageHidden}
        moving={!!anim}
        seed={phaseSeed(f.id)}
        body={{ bg: bodyBgHex, border: bodyBorder, opacity: bodyOpacity }}
      >
        {children}
      </TokenLifeLayer>
    ) : (
      children
    );

    return (
      <MotionFlex
        key={key}
        // Register the HEAD token in the caller's registry so the damage arc can
        // measure this fighter's viewport rect at launch (#382). Tail segments and
        // ghosts don't register — one element per fighter id.
        ref={
          fighterEls && segment === "head"
            ? (el: HTMLElement | null) => {
                if (el) fighterEls.current.set(f.id, el);
                else fighterEls.current.delete(f.id);
              }
            : undefined
        }
        position="absolute"
        initial={false}
        animate={{
          left: xs.map((x) => `${x}%`),
          top: ys.map((y) => `${y}%`),
          // The swap crossfade (v31). Same keyframe count and `times` as
          // left/top so the fade brackets the jump exactly; it settles back on
          // the token's own resting opacity, so once the beat is over the
          // inline value framer leaves behind matches the Chakra prop below.
          ...(swapFrom
            ? { opacity: [restOpacity, 0, 0, restOpacity] }
            : {}),
        }}
        // Chakra's own `transition` style shorthand (a CSS transition
        // string) collides in the merged prop type with framer-motion's
        // Transition object — the `any` sidesteps that, the runtime value
        // is a real framer-motion Transition.
        transition={{ duration, ease: "easeInOut", times } as any}
        // One settle per move: the HEAD owns it, so a two-space body's tail tween
        // (issue #658) can't clear the pending move out from under the head.
        onAnimationComplete={anim && segment === "head" ? () => onPendingMoveSettled?.() : undefined}
        // v28: offsets are a PERCENTAGE OF THIS TOKEN'S OWN WIDTH, so the whole
        // cluster scales with the board and the zoom transform (see tokenStack.ts).
        transform={`translate(calc(-50% + ${slot.dx}%), calc(-50% + ${slot.dy}%))${upright ? " rotate(-90deg)" : ""}`}
        w={`${diam * slot.scale}%`}
        data-pick={fighterClickable ? "" : undefined}
        data-fighter-id={f.id}
        sx={{
          aspectRatio: "1",
          // Touch screens: the token is the query container its cqw-sized
          // chrome measures against (TOKEN_CHROME). Desktop adds nothing.
          ...(coarsePointer ? { containerType: "inline-size" } : {}),
          ...(clickable ? (hitCapSx?.(s.id, (layerPx * diam * slot.scale) / 100) ?? {}) : {}),
        }}
        borderRadius="50%"
        bg={tokenLifeOn ? "transparent" : bodyBgToken}
        border={tokenLifeOn ? "none" : bodyBorder}
        opacity={tokenLifeOn ? 1 : bodyOpacity}
        boxShadow={boxShadow}
        animation={
          // A substitution outranks the target pulse: "this is the fighter taking
          // the hit" is the more urgent of the two facts, and the gold pulse is
          // still explained by the sidebar row that offered the target.
          stepsInAsDefender
            ? `${defenderStepInPulse} 1.8s ease-in-out infinite alternate`
            : isTarget
              ? `${boughtRange ? boughtRangePulse : highlightPulse} 1.4s ease-in-out infinite`
              : undefined
        }
        cursor={clickable || s.zones.length ? "pointer" : "default"}
        // Actionable tokens keep their action; a non-actionable token toggles the
        // zone preview for its space (issue #413) — occupied spaces sit under the
        // token, so the token is the touch/click target for them.
        onClick={handleClick ?? (() => setZoneHover((cur) => (cur === s.id ? null : s.id)))}
        // Hovering a fighter lets the caller preview its reachable spaces AND
        // lights the zones its space belongs to. Fired for every token.
        onMouseEnter={() => {
          setZoneHover(s.id);
          onFighterHover?.(f.id);
        }}
        onMouseLeave={() => {
          setZoneHover((cur) => (cur === s.id ? null : cur));
          onFighterHover?.(null);
        }}
        // `MotionFlex` is `chakra(motion.div, …)`, a plain div — unlike the
        // real `Flex` component it doesn't default to `display: flex`, so
        // `alignItems`/`justifyContent` below were silently inert (issue
        // #129): initials sat at the block-flow top instead of centered.
        display="flex"
        alignItems="center"
        justifyContent="center"
        zIndex={4}
        title={
          stepsInAsDefender && defenderStepIn
            ? `${f.name} — ${f.hp}/${f.maxHp} HP · ${defenderStepIn.blurb}`
            : boughtRange
            ? `${f.name} — ${f.hp}/${f.maxHp} HP · ${boughtRange.blurb}`
            : isExtendedReachTarget
              ? `${f.name} — ${f.hp}/${f.maxHp} HP · ${LARGE_REACH_TARGET_BLURB}`
              : `${f.name} — ${f.hp}/${f.maxHp} HP`
        }
      >
        {body}
      </MotionFlex>
    );
  };

  /**
   * One board object (protocol v26), drawn from its registry entry. Non-interactive
   * and BELOW the fighter layer in every kind — an object never blocks a space click
   * and never competes with a fighter token for a target click.
   *
   * `muted` kinds (corpses) render as a DISC, not the totem diamond, because they are
   * the fighter they came from: same circular silhouette, the origin fighter's own
   * portrait art where the caller resolves one, greyscaled and rotated 180° so it
   * reads as a body lying on its back — an isopod's death pose, and unmistakably not
   * a live token. Countdown pips hang under the disc, one per remaining owner turn;
   * `remaining === 0` is drawn as a single hollow pip ("gone at the owner's next turn
   * start") because zero pips would read as permanent.
   */
  const boardObjectToken = (
    t: ViewToken,
    s: ProMapSpace,
    offset: { dx: number; dy: number },
    diam: number,
    covered = false
  ) => {
    const visual = boardObjectVisualFor(t);
    const color = SEAT_COLOR[t.owner] ?? "#999";
    const countdown = boardObjectCountdown(t);
    const title = boardObjectTitle(t, t.owner, boardObjectOriginName?.(t));
    const art = visual.muted ? boardObjectArt?.(t) : null;
    const uprightSuffix = upright ? " rotate(-90deg)" : "";
    // Percent-of-own-width, like the fighter stack — scales with board and zoom.
    const tx = `calc(-50% + ${offset.dx}%)`;
    const ty = `calc(-50% + ${offset.dy}%)`;

    if (visual.shape === "diamond" && covered && visual.glyph) {
      // A fighter stands here and would hide the marker: show a small corner badge.
      return (
        <Box
          key={t.id}
          data-marker-badge={t.identity ?? "marker"}
          position="absolute"
          left={`${s.x * 100}%`}
          top={`${s.y * 100}%`}
          transform={`translate(calc(-50% + ${diam * 0.42}%), calc(-50% - ${diam * 0.42}%))${uprightSuffix}`}
          px="0.2rem"
          minW="0.9rem"
          textAlign="center"
          bg="brand.surfaceDim"
          border={`1px solid ${color}`}
          borderRadius="999px"
          fontSize="0.55rem"
          lineHeight="1.1"
          color="brand.parchment"
          sx={{ pointerEvents: "none" }}
          zIndex={4}
          title={title}
        >
          {visual.glyph}
        </Box>
      );
    }

    if (visual.shape === "diamond") {
      return (
        <Box
          key={t.id}
          position="absolute"
          left={`${s.x * 100}%`}
          top={`${s.y * 100}%`}
          transform={`translate(${tx}, ${ty}) rotate(45deg)${uprightSuffix}`}
          w={`${diam * OBJECT_SCALE_BY_SHAPE.diamond}%`}
          sx={{ aspectRatio: "1", pointerEvents: "none" }}
          bg="brand.surfaceDim"
          border={`2px solid ${color}`}
          borderRadius="20%"
          boxShadow="0 1px 4px rgba(0,0,0,0.5)"
          zIndex={2}
          title={title}
          {...(visual.glyph ? { "data-marker": t.identity ?? "marker" } : {})}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {visual.glyph && (
            <Text
              as="span"
              transform="rotate(-45deg)"
              fontSize="0.55rem"
              fontWeight="bold"
              lineHeight={1}
              color="brand.parchment"
            >
              {visual.glyph}
            </Text>
          )}
        </Box>
      );
    }

    return (
      <Box
        key={t.id}
        position="absolute"
        left={`${s.x * 100}%`}
        top={`${s.y * 100}%`}
        transform={`translate(${tx}, ${ty})${uprightSuffix}`}
        w={`${diam * OBJECT_SCALE_BY_SHAPE.disc}%`}
        sx={{ aspectRatio: "1", pointerEvents: "none" }}
        zIndex={2}
      >
        <Box
          position="relative"
          w="100%"
          h="100%"
          borderRadius="50%"
          overflow="hidden"
          bg={SURFACE_DIM}
          // Dashed, dimmed rim: still owner-colored (whose body it is matters for
          // Cannibalize) but visibly not the solid ring of a living fighter.
          border={`2px dashed ${color}`}
          opacity={0.72}
          display="flex"
          alignItems="center"
          justifyContent="center"
          boxShadow="0 1px 4px rgba(0,0,0,0.5)"
          title={title}
        >
          {art ? (
            <Box
              as="img"
              src={art}
              alt=""
              draggable={false}
              w="100%"
              h="100%"
              sx={{
                objectFit: "cover",
                objectPosition: "center top",
                filter: "grayscale(1) brightness(0.65)",
                transform: "rotate(180deg)",
              }}
            />
          ) : (
            <Text fontSize="0.6rem" lineHeight={1} color="brand.parchment" opacity={0.85}>
              {visual.glyph}
            </Text>
          )}
        </Box>
        {countdown && (
          // Pips ride just under the disc, outside its clip, so they stay legible
          // over the board art at any zoom.
          <Box
            position="absolute"
            left="50%"
            top="100%"
            transform="translate(-50%, 0.1rem)"
            display="flex"
            gap="0.1rem"
            title={title}
          >
            {countdown.expiring ? (
              <Box
                w="0.28rem"
                h="0.28rem"
                borderRadius="50%"
                border={`1px solid ${color}`}
                boxShadow="0 0 2px rgba(0,0,0,0.9)"
              />
            ) : (
              Array.from({ length: countdown.pips }, (_, i) => (
                <Box
                  key={i}
                  w="0.28rem"
                  h="0.28rem"
                  borderRadius="50%"
                  bg={color}
                  boxShadow="0 0 2px rgba(0,0,0,0.9)"
                />
              ))
            )}
          </Box>
        )}
      </Box>
    );
  };

  // One K.O. ghost, drawn like a token in whichever frame holds its space.
  const koGhostToken = (g: KoGhost, s: ProMapSpace, diam: number) => (
    <Box
      key={g.key}
      position="absolute"
      left={`${s.x * 100}%`}
      top={`${s.y * 100}%`}
      w={`${diam * 0.82}%`}
      sx={{
        aspectRatio: "1",
        ...(coarsePointer ? { containerType: "inline-size" } : {}),
        // The topple animation owns this box's transform, so the counter-turn
        // rides its children instead.
        ...(upright ? { "& > *": { transform: "rotate(-90deg)" } } : {}),
      }}
      borderRadius="50%"
      bg={g.isHero ? g.color : SURFACE_DIM}
      border={`2px solid ${g.isHero ? "#fff" : g.color}`}
      display="flex"
      alignItems="center"
      justifyContent="center"
      pointerEvents="none"
      zIndex={5}
      style={{ transformOrigin: "center bottom" }}
      animation={`${g.reduced ? toppleFade : g.fallRight ? toppleFallRight : toppleFallLeft} ${
        KO_GHOST_MS / 1000
      }s ease-in forwards`}
    >
      {g.art && (
        <Box position="absolute" inset={0} borderRadius="50%" overflow="hidden">
          <Box
            as="img"
            src={g.art}
            alt=""
            draggable={false}
            w="100%"
            h="100%"
            sx={{ objectFit: "cover", objectPosition: "center top" }}
          />
        </Box>
      )}
      <Text
        // Same label size as the live token, but NOT its `labelShift`: the ghost
        // has no HP chip to clear, and its children carry the portrait
        // counter-rotation on `transform` (see the sx above) — a second
        // transform here would replace it and the initials would fall sideways.
        fontSize={(coarsePointer ? TOKEN_CHROME.coarse : TOKEN_CHROME.fine).label}
        fontWeight="bold"
        letterSpacing="-0.02em"
        color="brand.parchment"
        textShadow="0 1px 3px rgba(0,0,0,0.95)"
        lineHeight={1}
      >
        {g.initials}
      </Text>
    </Box>
  );

  // All per-space overlays for ONE positioning frame — the main board or a
  // region inset panel. `spaces` are the frame's members and their x/y are
  // fractions of THAT frame; `diam` is the pawn diameter as a % of the frame
  // width. Everything keys off space ids, so highlights/clicks/fx work
  // identically in either frame.
  const spaceLayers = (
    spaces: ProMapSpace[],
    diam: number,
    layerPx: number,
    hitCapSx?: (spaceId: SpaceId, renderedDiameterPx: number) => Record<string, unknown>,
    layoutPx = 0,
    layoutH = 0
  ) => {
    const uprightSuffix = upright ? " rotate(-90deg)" : "";
    const inFrame = new Set(spaces.map((s) => s.id));
    // Head and tail are always adjacent, so a two-space fighter never straddles
    // a frame boundary — require both ends anyway so a bad map can't draw a
    // band between unrelated coordinate systems.
    const frameTwoSpace = twoSpaceFighters.filter(
      (f) => inFrame.has(f.space as SpaceId) && inFrame.has(f.tailSpace as SpaceId)
    );
    // Attack arrow endpoints, only when BOTH combatants live in this frame (the
    // arrow is drawn in this frame's own 0–100 coordinate space).
    const arrow = (() => {
      if (!attacker?.space || !attackTarget?.space) return null;
      const from = spaces.find((sp) => sp.id === attacker.space);
      const to = spaces.find((sp) => sp.id === attackTarget.space);
      if (!from || !to || from.id === to.id) return null;
      return arrowGeometry(from, to, diam);
    })();
    // Incremental-maneuver ghost + trail (issue #285): the stepping fighter's
    // preview position and the hops taken so far, in THIS frame's 0–100 space.
    // Nothing is committed yet, so the real token stays where the server put it;
    // this is a translucent duplicate that follows the local preview. Rendered
    // only when the whole path lives in this frame (no cross-frame trail).
    const preview = (() => {
      if (!previewMove) return null;
      const f = fighters.find((x) => x.id === previewMove.fighterId);
      const nodes = previewMove.path
        .map((id) => spaces.find((sp) => sp.id === id))
        .filter((s): s is ProMapSpace => !!s);
      if (!f || nodes.length < 2 || nodes.length !== previewMove.path.length) return null;
      const ghost = nodes[nodes.length - 1];
      // A LARGE body previews as BOTH its spaces (issue #658) — the ghost head at
      // the leading end plus a second ghost on the trail, tied by the same band the
      // real two-space token wears, so the player sees where the whole body lands.
      // Drawn only when the trail also lives in this frame (no cross-frame band).
      const trailId = previewMove.trailPath?.[previewMove.trailPath.length - 1] ?? null;
      const trail = trailId ? spaces.find((sp) => sp.id === trailId) ?? null : null;
      return {
        color: SEAT_COLOR[f.owner] ?? "#999",
        initials: tokenInitials(f.name),
        isHero: f.kind === "HERO",
        x: ghost.x * 100,
        y: ghost.y * 100,
        trail: trail ? { x: trail.x * 100, y: trail.y * 100 } : null,
        points: nodes.map((n) => `${n.x * 100},${n.y * 100}`).join(" "),
      };
    })();
    // "Who would move here" cues (issue #320 follow-up): resolve each hint to its
    // source + destination coords in THIS frame (both ends must live here), the
    // owning fighter's look, and — when several land on the same space — a small
    // stack index so the ghosts don't sit exactly on top of one another.
    const hints = (moveHint ?? []).flatMap((h) => {
      const from = spaces.find((sp) => sp.id === h.from);
      const to = spaces.find((sp) => sp.id === h.to);
      const f = fighters.find((x) => x.id === h.fighterId);
      if (!from || !to || !f) return [];
      return [{ h, from, to, color: SEAT_COLOR[f.owner] ?? "#999", initials: tokenInitials(f.name), isHero: f.kind === "HERO", art: fighterTokenArt?.(f) ?? null }];
    });
    const stackIndex = new Map<SpaceId, number>();
    return (
      <>
      {/* space hit-circles */}
      {spaces.map((s) => {
        const isHighlighted = highlightSet.has(s.id);
        const isRelocate = relocateSet.has(s.id);
        const chosenN = chosenOrder.get(s.id);
        const zoneCols = zoneMemberColors(s);
        const inZone = zoneCols.length > 0;
        // Concentric per-zone rings (issue #413): one outset ring per zone this
        // space shares with the hovered space, each in that zone's color. A
        // multi-zone space carries several rings, so its membership is unambiguous.
        // Distinct from the gold action highlight (a solid fill + pulse) so it
        // never reads as a move/attack target.
        const zoneRings = inZone
          ? zoneCols.map((c, i) => `0 0 0 ${2 * (i + 1)}px ${c}`).join(", ")
          : undefined;
        const spaceActionable = (relocateArmed ? isRelocate : isHighlighted || isRelocate) && !!onSpaceClick;
        return (
          <Box
            key={s.id}
            data-space-id={s.id}
            data-pick={spaceActionable ? "" : undefined}
            position="absolute"
            left={`${s.x * 100}%`}
            top={`${s.y * 100}%`}
            transform="translate(-50%, -50%)"
            w={`${diam}%`}
            sx={{ aspectRatio: "1", ...(spaceActionable ? (hitCapSx?.(s.id, (layerPx * diam) / 100) ?? {}) : {}) }}
            borderRadius="50%"
            // While the relocate mode is armed, a dashed pick outranks a co-drawn
            // gold highlight outright: the dashed ring is the only clickable thing
            // on the space (game.tsx resolves the armed relocate first), so the
            // visuals must not promise the gold step.
            border={
              isRelocate ? `2px dashed ${RELOCATE_COLOR}`
              : chosenN ? "3px solid #FFFFFF"
              : isHighlighted ? "2px solid #E0A82E"
              : "1px solid rgba(255,255,255,0.15)"
            }
            bg={
              isRelocate ? "rgba(62,207,224,0.30)"
              : chosenN ? "rgba(224,168,46,0.95)"
              : isHighlighted ? "rgba(224,168,46,0.45)"
              : inZone ? zoneTint(zoneCols[0])
              : "transparent"
            }
            boxShadow={zoneRings}
            animation={
              (isHighlighted || isRelocate) && !chosenN ? `${highlightPulse} 1.4s ease-in-out infinite` : undefined
            }
            data-chosen={chosenN ? String(chosenN) : undefined}
            cursor={
              spaceActionable
                ? "pointer"
              : s.zones.length ? "pointer"
              : "default"
            }
            // Actionable spaces commit the prompt (unchanged); armed, only a
            // relocation pick answers. Any other space toggles the zone-membership
            // preview — the touch/click path; hover drives it on desktop.
            onClick={
              spaceActionable && onSpaceClick
                ? () => onSpaceClick(s.id)
                : () => setZoneHover((cur) => (cur === s.id ? null : s.id))
            }
            onMouseEnter={() => {
              setZoneHover(s.id);
              if (isHighlighted && !(relocateArmed && isRelocate)) onSpaceHover?.(s.id);
            }}
            onMouseLeave={() => {
              setZoneHover((cur) => (cur === s.id ? null : cur));
              if (isHighlighted && !(relocateArmed && isRelocate)) onSpaceHover?.(null);
            }}
            zIndex={isHighlighted || isRelocate || chosenN ? 3 : inZone ? 2 : 1}
          >
            {chosenN && (
              <Box
                as="span"
                position="absolute"
                inset={0}
                display="flex"
                alignItems="center"
                justifyContent="center"
                color="#1a1206"
                fontWeight={800}
                fontSize="clamp(0.6rem, 55%, 1.1rem)"
                pointerEvents="none"
              >
                {chosenN}
              </Box>
            )}
          </Box>
        );
      })}

      {/* neutral board OBJECTS (protocol v26) — below fighters, never clickable.
          Kind-driven via BOARD_OBJECT_VISUALS: totems keep their pre-v26 diamond
          byte-for-byte, corpses draw as a muted, upside-down disc of the fighter they
          came from plus countdown pips. Objects MAY share a space since v26, so they
          stack on the same diagonal offset as co-located fighters instead of drawing
          exactly on top of one another. */}
      {spaces
        .filter((s) => tokens.some((t) => t.space === s.id))
        .flatMap((s) => {
          const here = tokens.filter((t) => t.space === s.id);
          // v28: up to 4 Larrys can die stacked, so up to 4 corpses share a space.
          // Ringing them keeps each disc AND its countdown pips (which hang below
          // the disc) legible instead of smearing them into one blob.
          const offsets = objectStackOffsets(here.length);
          return here.map((t, i) => boardObjectToken(t, s, offsets[i], diam, bySpace.has(s.id)));
        })}

      {/* adventure enclosures: closed fence badge / destroyed mark, click-through */}
      {enclosures && (
        <EnclosureLayer
          enclosures={enclosures}
          spaces={spaces}
          diam={diam / 100}
          framePx={layerPx}
          layoutPx={layoutPx}
          layoutH={layoutH}
          upright={upright}
          zIndex={4}
        />
      )}

      {/* battlefield item tokens (v17) — a purple/versatile (combat) or
          yellow/lightning (scheme) square in the space's upper-right corner, and a
          keyhole in the upper-left for a secret-passage space (engine #156). Item
          presence is driven STRICTLY off the live server itemTokens map (never the
          static def), so a consumed token's badge disappears for BOTH players. The
          badges sit just outside the hit-circle so they never swallow a space click. */}
      {spaces.flatMap((s) => {
        const itemId = itemTokens[s.id];
        const item = itemId ? itemById.get(itemId) : undefined;
        const badgeW = diam * 0.5;
        // transform %s are relative to the badge's OWN box, so the corner offset
        // scales with the badge and never mixes the frame's width/height axes.
        const out = [];
        if (item) {
          out.push(
            <Box
              key={`${s.id}-item`}
              position="absolute"
              left={`${s.x * 100}%`}
              top={`${s.y * 100}%`}
              transform={`translate(35%, -115%)${uprightSuffix}`}
              w={`${badgeW}%`}
              sx={{ aspectRatio: "1" }}
              zIndex={5}
            >
              <ItemInspectBadge item={item} />
            </Box>
          );
        }
        if (s.passage) {
          out.push(
            <Box
              key={`${s.id}-passage`}
              position="absolute"
              left={`${s.x * 100}%`}
              top={`${s.y * 100}%`}
              transform={`translate(-135%, -115%)${uprightSuffix}`}
              w={`${badgeW}%`}
              sx={{ aspectRatio: "1" }}
              zIndex={5}
            >
              <PassageBadge />
            </Box>
          );
        }
        return out;
      })}

      {/* two-space fighter bands — the "string" tying head and tail together.
          viewBox 0-100 with preserveAspectRatio="none" maps the normalized
          space coords straight onto the stretched image. Widths bumped from
          the original 0.52/0.36 (real player feedback: at phone zoom the band
          was too thin to register as "these two tokens are joined" rather
          than "two tokens that happen to sit next to each other"). */}
      {frameTwoSpace.length > 0 && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          {frameTwoSpace.flatMap((f) => {
            const head = spaceById.get(f.space as SpaceId);
            const tail = spaceById.get(f.tailSpace as SpaceId);
            if (!head || !tail) return [];
            const color = SEAT_COLOR[f.owner] ?? "#999";
            // white outer + colored inner stroke, echoing the hero token look
            return [
              <line
                key={`${f.id}-band-outline`}
                x1={head.x * 100}
                y1={head.y * 100}
                x2={tail.x * 100}
                y2={tail.y * 100}
                stroke="#fff"
                strokeWidth={diam * 0.58}
                strokeLinecap="round"
                opacity={0.9}
              />,
              <line
                key={`${f.id}-band`}
                x1={head.x * 100}
                y1={head.y * 100}
                x2={tail.x * 100}
                y2={tail.y * 100}
                stroke={color}
                strokeWidth={diam * 0.42}
                strokeLinecap="round"
              />,
            ];
          })}
        </svg>
      )}

      {/* two-space fighter identity label — real player feedback: a LARGE
          body's head and tail tokens are the same color and (since issue
          #247) both already carry the fighter's initials, but two
          identically-lettered circles joined by a band still read as "two
          fighters that happen to match" at phone zoom, and a LARGE
          attacker's 2-space melee reach (largeReach.ts) means either circle
          can be a live attack target — so "which one is actually Appa" was a
          genuine in-play question. Anchored at the band's own midpoint (the
          one spot that belongs to neither token alone) so it reads as "this
          ties these two into one fighter" independent of whether the
          initials match is even noticed. `pointerEvents: none` — this is a
          read-only label, never a third click target. */}
      {frameTwoSpace.map((f) => {
        const head = spaceById.get(f.space as SpaceId);
        const tail = spaceById.get(f.tailSpace as SpaceId);
        if (!head || !tail) return null;
        const mid = bandMidpoint(head, tail);
        const color = SEAT_COLOR[f.owner] ?? "#999";
        return (
          <Flex
            key={`${f.id}-band-label`}
            position="absolute"
            left={`${mid.x * 100}%`}
            top={`${mid.y * 100}%`}
            transform={`translate(-50%, -50%)${uprightSuffix}`}
            pointerEvents="none"
            bg="brand.surfaceDim"
            color="brand.parchment"
            border={`1.5px solid ${color}`}
            borderRadius="999px"
            px="0.4em"
            fontSize="0.62rem"
            fontWeight="bold"
            letterSpacing="-0.01em"
            lineHeight="1.5"
            whiteSpace="nowrap"
            boxShadow="0 1px 3px rgba(0,0,0,0.75)"
            zIndex={4}
          >
            {bandLabelText(f.name)}
          </Flex>
        );
      })}

      {/* attack arrow (issue #148): attacker -> target, so the board shows who is
          hitting whom while the combat panel resolves. Sits just under the tokens
          (zIndex 3) with the head landing at the target's edge, so both pawns stay
          readable. White outline + crimson fill echoes the hero-token treatment. */}
      {arrow && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 3,
            animation: `${arrowPulse} 1.3s ease-in-out infinite`,
            overflow: "visible",
          }}
        >
          <line
            x1={arrow.x1}
            y1={arrow.y1}
            x2={arrow.x2}
            y2={arrow.y2}
            stroke="#fff"
            strokeWidth={diam * 0.2}
            strokeLinecap="round"
            opacity={0.9}
          />
          <line
            x1={arrow.x1}
            y1={arrow.y1}
            x2={arrow.x2}
            y2={arrow.y2}
            stroke={ARROW_COLOR}
            strokeWidth={diam * 0.12}
            strokeLinecap="round"
          />
          <polygon
            points={arrow.points}
            fill={ARROW_COLOR}
            stroke="#fff"
            strokeWidth={diam * 0.08}
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* move-intent connectors + source rings (issue #320 follow-up): a
          periwinkle shaft from each candidate fighter's space to the hovered/
          anchored destination, with a ring around the source token. Sits under
          the tokens (zIndex 3) like the attack arrow; non-crimson so it never
          reads as an attack. Static (no pulse) to stay distinct from the pulsing
          gold highlight. */}
      {hints.length > 0 && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 3,
            overflow: "visible",
          }}
        >
          {hints.flatMap(({ h, from, to }) => {
            if (from.id === to.id) return [];
            const g = arrowGeometry(from, to, diam);
            return [
              <circle
                key={`${h.fighterId}-${h.to}-ring`}
                cx={from.x * 100}
                cy={from.y * 100}
                r={diam * 0.44}
                fill="none"
                stroke={MOVE_HINT_COLOR}
                strokeWidth={diam * 0.1}
                opacity={0.95}
              />,
              <line
                key={`${h.fighterId}-${h.to}-line`}
                x1={g.x1}
                y1={g.y1}
                x2={g.x2}
                y2={g.y2}
                stroke={MOVE_HINT_COLOR}
                strokeWidth={diam * 0.11}
                strokeLinecap="round"
                strokeDasharray={`${diam * 0.2} ${diam * 0.16}`}
                opacity={0.9}
              />,
              <polygon
                key={`${h.fighterId}-${h.to}-head`}
                points={g.points}
                fill={MOVE_HINT_COLOR}
                stroke="#fff"
                strokeWidth={diam * 0.06}
                strokeLinejoin="round"
              />,
            ];
          })}
        </svg>
      )}

      {/* fighter tokens (heads). v28: several fighters legally share a space, so
          each space's occupants are laid out by `stackLayout` — the non-small keeps
          the centre, smalls ring around it — and emitted in the layout's `order` so
          the big body renders BEHIND the smalls standing on it (equal zIndex, DOM
          order decides). Every token keeps its own click target. */}
      {spaces
        .filter((s) => bySpace.has(s.id))
        .flatMap((s) =>
          [...(bySpace.get(s.id) as ViewFighter[])]
            .sort((a, b) => slotFor(s.id, a.id).order - slotFor(s.id, b.id).order)
            .map((f) =>
              fighterToken(
                f,
                s,
                slotFor(s.id, f.id),
                "head",
                diam,
                layerPx,
                pendingAnim?.fighterId === f.id ? pendingAnim : undefined,
                hitCapSx
              )
            )
        )}

      {/* tail tokens of two-space fighters — same interactions as the head. The tail
          takes its own space's slot, so smalls sharing the TAIL space ring around it
          just as they do around the head. */}
      {frameTwoSpace.flatMap((f) => {
        const tail = spaceById.get(f.tailSpace as SpaceId);
        return tail
          ? [
              fighterToken(
                f,
                tail,
                slotFor(tail.id, `${f.id}-tail`),
                "tail",
                diam,
                layerPx,
                pendingTailAnim?.fighterId === f.id ? pendingTailAnim : undefined,
                hitCapSx
              ),
            ]
          : [];
      })}

      {/* K.O. topple ghosts (issue #320) — a defeated fighter's fall, played on an
          overlay because the fighter has already left the live token list. Drawn
          only in the frame that holds its space. */}
      {koGhosts.flatMap((g) => {
        const s = spaces.find((sp) => sp.id === g.space);
        return s ? [koGhostToken(g, s, diam)] : [];
      })}

      {/* move-intent destination ghosts (issue #320 follow-up): a translucent
          duplicate of each candidate fighter AT the hovered/anchored space, so
          you see WHICH fighter would move there before committing. Multiple
          candidates stack with a slight diagonal offset so the ambiguity is
          visible. Non-interactive (clicks pass through to the space beneath). */}
      {hints.map(({ h, to, color, initials, isHero, art }) => {
        const idx = stackIndex.get(h.to) ?? 0;
        stackIndex.set(h.to, idx + 1);
        const nudge = idx * 0.5;
        return (
          <Box
            key={`hint-${h.fighterId}-${h.to}`}
            position="absolute"
            left={`${to.x * 100}%`}
            top={`${to.y * 100}%`}
            transform={`translate(calc(-50% + ${nudge}rem), calc(-50% + ${nudge}rem))${uprightSuffix}`}
            w={`${diam * 0.82}%`}
            sx={{ aspectRatio: "1", pointerEvents: "none" }}
            borderRadius="50%"
            bg={isHero ? color : "brand.surfaceDim"}
            border={`2px dashed ${MOVE_HINT_COLOR}`}
            opacity={0.6}
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={5}
            title={`${initials} would move here`}
          >
            {art && (
              <Box position="absolute" inset={0} borderRadius="50%" overflow="hidden" opacity={0.85}>
                <Box
                  as="img"
                  src={art}
                  alt=""
                  draggable={false}
                  w="100%"
                  h="100%"
                  sx={{ objectFit: "cover", objectPosition: "center top" }}
                />
              </Box>
            )}
            <Text
              fontSize="0.68rem"
              fontWeight="bold"
              letterSpacing="-0.02em"
              color="brand.parchment"
              textShadow="0 1px 3px rgba(0,0,0,0.9)"
              lineHeight={1}
              userSelect="none"
              zIndex={1}
            >
              {initials}
            </Text>
          </Box>
        );
      })}

      {/* incremental-maneuver preview (issue #285): dashed trail through the hops
          taken + a translucent ghost token at the preview position. Both are
          non-interactive so clicks pass to the gold step highlights beneath. */}
      {preview && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          {/* the previewed BODY of a two-space fighter — same band the real token
              wears, drawn under the ghosts so the pair reads as one fighter. */}
          {preview.trail && (
            <line
              x1={preview.x}
              y1={preview.y}
              x2={preview.trail.x}
              y2={preview.trail.y}
              stroke={preview.color}
              strokeWidth={diam * 0.3}
              strokeLinecap="round"
              opacity={0.5}
            />
          )}
          <polyline
            points={preview.points}
            fill="none"
            stroke="#E0A82E"
            strokeWidth={diam * 0.18}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${diam * 0.3} ${diam * 0.3}`}
            opacity={0.85}
          />
        </svg>
      )}
      {preview &&
        [
          { at: { x: preview.x, y: preview.y }, end: "lead" },
          ...(preview.trail ? [{ at: preview.trail, end: "trail" }] : []),
        ].map(({ at, end }) => (
        <Box
          key={`preview-${end}`}
          position="absolute"
          left={`${at.x}%`}
          top={`${at.y}%`}
          transform={`translate(-50%, -50%)${uprightSuffix}`}
          w={`${diam * 0.82}%`}
          sx={{ aspectRatio: "1", pointerEvents: "none" }}
          borderRadius="50%"
          bg={preview.isHero ? preview.color : "brand.surfaceDim"}
          border={`2px dashed ${preview.isHero ? "#fff" : preview.color}`}
          opacity={0.55}
          display="flex"
          alignItems="center"
          justifyContent="center"
          zIndex={5}
          title="move preview — click a gold space to keep stepping, or commit to finish"
        >
          <Text
            fontSize="0.68rem"
            fontWeight="bold"
            letterSpacing="-0.02em"
            color="brand.parchment"
            textShadow="0 1px 3px rgba(0,0,0,0.85)"
            lineHeight={1}
            userSelect="none"
          >
            {preview.initials}
          </Text>
        </Box>
      ))}

      {/* transient effects — impact ring + floating label, above everything */}
      {fx.flatMap((item) => {
        const s = spaces.find((sp) => sp.id === item.space);
        if (!s) return [];
        const color = FX_COLOR[item.kind];
        return [
          <Box
            key={`${item.key}-ring`}
            position="absolute"
            left={`${s.x * 100}%`}
            top={`${s.y * 100}%`}
            w={`${diam * 1.5}%`}
            sx={{ aspectRatio: "1", pointerEvents: "none" }}
            border={`3px solid ${color}`}
            borderRadius="50%"
            animation={`${fxRing} 0.7s ease-out both`}
            zIndex={5}
          />,
          <Text
            key={item.key}
            position="absolute"
            left={`${s.x * 100}%`}
            top={`${s.y * 100}%`}
            fontFamily="BebasNeueRegular"
            // rem, not vw — see the token-label note above: FX overlays live in
            // the zoom-transformed frame and must scale with it, not the viewport.
            fontSize={item.kind === "damage" || item.kind === "heal" ? "1.6rem" : "1.1rem"}
            fontWeight="bold"
            letterSpacing="0.04em"
            color={color}
            textShadow="0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.6)"
            animation={`${fxFloat} 1.5s ease-out both`}
            sx={{ pointerEvents: "none" }}
            zIndex={6}
            whiteSpace="nowrap"
          >
            {item.label}
          </Text>,
        ];
      })}
      </>
    );
  };

  // A region's inset panel: a compact header bar (drag handle + collapse
  // toggle) above the art frame. The ART FRAME — not the panel — is the
  // positioning context, so the identical % math lands pieces on the inset
  // art regardless of the header. Closed regions (view.closedRegions) grey
  // out and their art stops taking clicks, but the header stays live so a
  // dead panel can still be collapsed or dragged out of the way.
  const regionPanel = (r: ProMapRegion) => {
    const closed = closedSet.has(r.id);
    const rDiam = (r.spaceDiameter ?? map.meta.spaceDiameter ?? DEFAULT_SPACE_DIAMETER) * 100;
    const isCollapsed = !!collapsed[r.id] && !regionActive(r.id);
    return (
      <Box
        key={r.id}
        // Marks the inset panel subtree so useZoomPan ignores any pointer/wheel
        // gesture that starts inside it — defense-in-depth against issue #216.
        data-region-panel={r.id}
        position="relative"
        w="100%"
        borderRadius="0.5rem"
        overflow="hidden"
        border="1px solid rgba(224,168,46,0.4)"
        boxShadow="0 4px 16px rgba(0,0,0,0.6)"
        bg="rgba(18,14,26,0.9)"
        pointerEvents="auto"
        filter={closed ? "grayscale(1) brightness(0.55)" : undefined}
        title={r.label}
      >
        <Flex
          alignItems="center"
          justifyContent="space-between"
          px="0.5rem"
          py="0.15rem"
          bg="rgba(18,14,26,0.95)"
          cursor="grab"
          onPointerDown={onHeaderPointerDown(r.id)}
          sx={{ touchAction: "none" }}
        >
          <Text
            fontSize="0.65rem"
            fontFamily="SpaceGrotesk"
            letterSpacing="0.08em"
            color="brand.parchment"
            opacity={0.85}
            whiteSpace="nowrap"
          >
            {r.label}
            {closed ? " — closed" : ""}
          </Text>
          <Box
            as="button"
            aria-label={`toggle ${r.label}`}
            onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => e.stopPropagation()}
            onClick={() => setCollapsed((c) => ({ ...c, [r.id]: !c[r.id] }))}
            color="brand.parchment"
            fontSize="0.7rem"
            lineHeight="1"
            px="0.3rem"
            cursor="pointer"
          >
            {isCollapsed ? "▸" : "▾"}
          </Box>
        </Flex>
        {!isCollapsed && (
          <Box position="relative" pointerEvents={closed ? "none" : "auto"}>
            {r.imageUrl ? (
              <Box as="img" src={r.imageUrl} alt={r.label} w="100%" display="block" draggable={false} />
            ) : (
              <Box w="100%" sx={{ aspectRatio: "4 / 3" }} />
            )}
            {spaceLayers(
              map.spaces.filter((s) => s.region === r.id),
              rDiam,
              framePx * REGION_PANEL_W
            )}
            {closed && (
              <Flex position="absolute" inset="0" alignItems="center" justifyContent="center" bg="rgba(0,0,0,0.45)" zIndex={7}>
                <Text
                  fontFamily="BebasNeueRegular"
                  letterSpacing="0.12em"
                  color="brand.parchment"
                  fontSize="1.1rem"
                  textShadow="0 1px 3px rgba(0,0,0,0.9)"
                >
                  {r.label} — CLOSED
                </Text>
              </Flex>
            )}
          </Box>
        )}
      </Box>
    );
  };

  // Region inset panels + the zone legend. Inside the frame they float over the
  // board and scale with it; that is the desktop/landscape behaviour and it is
  // untouched. In rotated portrait the caller renders this same node in the
  // OUTER, untransformed box instead: they are self-contained HTML panels whose
  // clicks are identity-based (`data-space-id`), so nothing about them needs the
  // map's coordinate system — and pinning them to the screen is the only way a
  // 230px panel reliably stays on a 390px one.
  const screenTop = `calc(${fitInset?.top ?? 0}px + 0.5rem)`;
  const screenOverlays = (
    <>
      {regions.some((r) => !panelPos[r.id]) && (
        <Flex
          position="absolute"
          {...(upright
            ? { left: "0.5rem", top: screenTop }
            : { right: "1.5%", bottom: "1.5%" })}
          w={REGION_PANEL_W_CSS}
          maxW="calc(100% - 1rem)"
          direction="column"
          gap="0.4rem"
          zIndex={7}
          pointerEvents="none"
        >
          {regions.filter((r) => !panelPos[r.id]).map((r) => regionPanel(r))}
        </Flex>
      )}
      {regions
        .filter((r) => panelPos[r.id])
        .map((r) => (
          <Box
            key={r.id}
            position="absolute"
            left={upright ? "0.5rem" : `${panelPos[r.id].x}%`}
            top={upright ? screenTop : `${panelPos[r.id].y}%`}
            w={REGION_PANEL_W_CSS}
            maxW="calc(100% - 1rem)"
            zIndex={7}
            pointerEvents="none"
          >
            {regionPanel(r)}
          </Box>
        ))}

      {/* zone-membership legend (issue #413): names the zone(s) the inspected
          space belongs to, color-matched to the on-board rings, so a multi-zone
          space is unambiguous. Non-interactive; shown only while a space is
          hovered/selected and only when the map actually defines zones. */}
      {hoveredZoneSet.size > 0 && (
        <Flex
          position="absolute"
          top={upright ? screenTop : "1.5%"}
          {...(upright ? { right: "0.5rem" } : { left: "1.5%" })}
          zIndex={8}
          direction="column"
          gap="0.15rem"
          bg="blackAlpha.700"
          px="0.4rem"
          py="0.3rem"
          borderRadius="0.4rem"
          pointerEvents="none"
        >
          {map.zones
            .filter((z) => hoveredZoneSet.has(z.id))
            .map((z) => (
              <Flex key={z.id} align="center" gap="0.35rem">
                <Box
                  w="0.7rem"
                  h="0.7rem"
                  borderRadius="2px"
                  bg={z.color}
                  border="1px solid rgba(255,255,255,0.6)"
                />
                <Box as="span" fontSize="0.7rem" color="white" whiteSpace="nowrap">
                  {z.label || z.id}
                </Box>
              </Flex>
            ))}
        </Flex>
      )}
    </>
  );

  return { spaceLayers, screenOverlays };
};
