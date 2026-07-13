/**
 * Pro board renderer — pure presentation, zero rules logic.
 *
 * Draws the map image, one hit-circle per space (normalized 0–1 coords,
 * sized by meta.spaceDiameter as a fraction of image width — same convention
 * as the dev map editor), fighter tokens, and gold highlights on whatever
 * spaces the caller says are currently actionable (which the server derives
 * from legalActions — the board never computes legality itself).
 */
import { Box, Button, Flex, Text, chakra, shouldForwardProp } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { isValidMotionProp, motion } from "framer-motion";
import { PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { FighterId, PlayerId, ProMapDef, ProMapRegion, ProMapSpace, SpaceId, ViewFighter, ViewToken } from "@/lib/pro/protocol";
import { BoardFxItem } from "@/lib/pro/useGameFx";
import { useZoomPan } from "@/lib/pro/useZoomPan";
import { LARGE_FIGHTER_BLURB, LARGE_REACH_CHIP } from "@/lib/pro/largeReach";

const DEFAULT_DIAMETER = 0.021;

// Duration of ONE hop in a multi-step move tween (see PendingMove below).
// Exported so callers can size a fallback timeout around the same value.
export const MOVE_STEP_SECONDS = 0.28;

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
}

const highlightPulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 2px #e0a82e, 0 0 12px 2px rgba(224,168,46,0.8); }
  50% { box-shadow: 0 0 0 3px #e0a82e, 0 0 22px 6px rgba(224,168,46,0.5); }
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

const ARROW_COLOR = "#E23B3B"; // crimson — reads as "attack", distinct from both player colors

const ONYXIA_PHASE_BOXES = 12;

const OnyxiaPhaseBar = ({ index }: { index: number | null }) => {
  const clamped = index == null ? null : Math.max(0, Math.min(ONYXIA_PHASE_BOXES - 1, index));
  return (
    <Box
      position="absolute"
      left="50%"
      top="1.25%"
      transform="translateX(-50%)"
      w="62%"
      zIndex={7}
      pointerEvents="none"
      filter="drop-shadow(0 3px 8px rgba(0,0,0,0.75))"
    >
      <Box position="relative">
        <Box as="img" src="/maps/onyxia-phasebar.png" alt="Onyxia phase bar" w="100%" display="block" draggable={false} />
        {clamped !== null && (
          <Box
            position="absolute"
            top="0"
            bottom="0"
            left={`${(clamped / ONYXIA_PHASE_BOXES) * 100}%`}
            w={`${100 / ONYXIA_PHASE_BOXES}%`}
            border="3px solid #E0A82E"
            boxShadow="0 0 12px rgba(224,168,46,0.95), inset 0 0 10px rgba(224,168,46,0.45)"
          />
        )}
      </Box>
    </Box>
  );
};

const OnyxiaFlamebreathLanes = () => (
  <svg
    viewBox="0 0 2471 2251"
    preserveAspectRatio="none"
    aria-hidden="true"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
  >
    <rect
      opacity="0.4"
      x="13.257"
      y="372.981"
      width="519.395"
      height="2387.55"
      rx="92.5"
      transform="rotate(-44.2418 13.257 372.981)"
      fill="#E0E0E0"
      fillOpacity="0.4"
      stroke="#95161D"
      strokeWidth="15"
      strokeDasharray="0 20"
    />
    <rect
      opacity="0.4"
      x="1692.78"
      y="373.099"
      width="519.395"
      height="2101.82"
      rx="92.5"
      transform="rotate(44.2973 1692.78 373.099)"
      fill="#E0E0E0"
      fillOpacity="0.4"
      stroke="#95161D"
      strokeWidth="15"
      strokeDasharray="0 20"
    />
    <rect
      opacity="0.4"
      x="8"
      y="906"
      width="2455"
      height="710"
      rx="92.5"
      fill="#E0E0E0"
      fillOpacity="0.4"
      stroke="#95161D"
      strokeWidth="15"
      strokeDasharray="0 20"
    />
  </svg>
);

const ONYXIA_ZONE_COLORS: Record<string, string> = {
  green: "#2fbf71",
  yellow: "#f4d35e",
  orange: "#f59e42",
  red: "#ef5a5a",
  blue: "#51c7df",
  purple: "#8b5cf6",
  black: "#111827",
};

const semicirclePath = (cx: number, cy: number, r: number, side: "left" | "right") =>
  side === "left"
    ? `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} L ${cx} ${cy} Z`
    : `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} L ${cx} ${cy} Z`;

const OnyxiaBoardGraph = ({ spaces, diam, width, height }: { spaces: ProMapSpace[]; diam: number; width: number; height: number }) => {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const edgeKeys = new Set<string>();
  const edges = spaces.flatMap((from) =>
    (from.adjacentTo ?? []).flatMap((toId) => {
      const to = byId.get(toId);
      if (!to) return [];
      const key = [from.id, to.id].sort().join("--");
      if (edgeKeys.has(key)) return [];
      edgeKeys.add(key);
      return [{ from, to }];
    })
  );
  // `diam` is a percentage of board width. Convert to the same pixel-like
  // coordinate system as the SVG viewBox so spaces stay circular on wide maps.
  const r = (diam / 100) * width * 0.5;
  const edgeWidth = width * 0.0042;
  const outlineWidth = width * 0.0016;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
    >
      {edges.map(({ from, to }) => (
        <line
          key={`${from.id}-${to.id}`}
          x1={from.x * width}
          y1={from.y * height}
          x2={to.x * width}
          y2={to.y * height}
          stroke="#050505"
          strokeWidth={edgeWidth}
          strokeLinecap="round"
        />
      ))}
      {spaces.map((s) => {
        const cx = s.x * width;
        const cy = s.y * height;
        const colors = (s.zones.length ? s.zones : ["green"]).map((z) => ONYXIA_ZONE_COLORS[z] ?? "#999");
        return (
          <g key={s.id}>
            {colors.length === 1 ? (
              <circle cx={cx} cy={cy} r={r} fill={colors[0]} />
            ) : (
              <>
                <path d={semicirclePath(cx, cy, r, "left")} fill={colors[0]} />
                <path d={semicirclePath(cx, cy, r, "right")} fill={colors[1]} />
              </>
            )}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0d0b08" strokeWidth={outlineWidth} />
          </g>
        );
      })}
    </svg>
  );
};

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
  const headLen = diam * 1.0;
  const headW = diam * 0.62;
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

export interface ProBoardProps {
  map: ProMapDef;
  fighters: ViewFighter[];
  /** Neutral board tokens (totems) — non-interactive sprites, public to both players */
  tokens?: ViewToken[];
  /** Spaces the current player can act on right now (move targets, placements…) */
  highlightedSpaces?: SpaceId[];
  /** Fighters the current player can act on right now (attack targets, movable…) */
  highlightedFighters?: FighterId[];
  selectedFighter?: FighterId | null;
  /** Active combat pairing (view.combat) — draws an attacker→target arrow so it's
   *  clear who is attacking whom during the attack phase (issue #148). null = no
   *  combat in progress, no arrow. */
  attack?: { attacker: FighterId; target: FighterId } | null;
  /** Owner ids on the VIEWER's team, including the viewer (issue #195). Fighters
   *  owned by any of these get a subtle shared teal ring so allies read at a
   *  glance without touching per-seat identity colors. Empty/omitted in
   *  duel/ffa/older-server views → no ring, board unchanged. */
  friendlyOwners?: PlayerId[];
  /** Per-fighter disambiguator number drawn as a badge on the token (issue #161).
   *  Only populated when several same-named attackers are offered at once, so the
   *  "Attack … with Raptor 1 / 2 / 3" sidebar buttons can be matched to the right
   *  board token. Absent = no badge (the single-attacker case stays uncluttered). */
  fighterBadges?: Partial<Record<FighterId, number>>;
  /** Attack targets reachable ONLY via the large-fighter reach extension (issue
   *  #235). PRESENTATION ONLY — the caller derives these from the server's own
   *  legalActions; the board just annotates the pulsing token so a 2-space melee
   *  attack doesn't read as a bug. Absent/empty = no annotation. */
  extendedReachTargets?: FighterId[];
  /** Portrait art for a fighter's token, clipped into its circle (issue #247).
   *  PRESENTATION ONLY — the caller resolves it client-side by hero id + kind
   *  (see useProCardArt.resolveFighterToken); the board just paints whatever URL
   *  it gets. Returns undefined/null for fighters whose deck has no token art,
   *  and those tokens render initials-only exactly as before. Absent prop = no
   *  art anywhere (the board demo / any caller that doesn't wire it). */
  fighterTokenArt?: (fighter: ViewFighter) => string | null | undefined;
  /** transient effect overlays (floating damage numbers…) — keyed, caller-expired */
  fx?: BoardFxItem[];
  /** a just-committed move to tween through node-by-node instead of snapping */
  pendingMove?: PendingMove | null;
  /** fired once the tween finishes — caller clears its pendingMove state */
  onPendingMoveSettled?: () => void;
  /** Region ids currently out of play (view.closedRegions) — their inset
   * panels grey out and stop taking clicks */
  closedRegions?: string[];
  /** Presentation-only encounter overlays. Rules and legality still come from the server. */
  encounterPhase?: string | null;
  encounterPhaseCounterIndex?: number | null;
  onSpaceClick?: (id: SpaceId) => void;
  onFighterClick?: (id: FighterId) => void;
  /** cap the board image height (e.g. "calc(100svh - 2rem)") so the whole
   * field fits the viewport; width shrinks to keep the aspect ratio */
  imgMaxH?: string;
  /** Enable pinch/scroll zoom + drag pan on the board (issue #120, gated by
   * the `zoomMap` beta flag). Off (default) = no handlers, no transform, no
   * added DOM — the board behaves exactly as before. */
  zoomable?: boolean;
}

const PLAYER_COLOR: Record<string, string> = {
  p1: "#E0A82E", // gold
  p2: "#3B8BEB", // blue
  p3: "#2F9E68", // green
  p4: "#C0449E", // magenta
};

// Team-affiliation ring (issue #195): a teal halo shared by every fighter on the
// viewer's team. Kept distinct from the gold highlight, white selection ring, and
// crimson attack arrow so it never reads as any of those. Must match ProHud's
// ALLY_ACCENT so HUD chip and board ring are visibly the same "team" signal.
const ALLY_RING = "#39B7A8";

/** Token initials: leading "The " is noise ("The Mandalorian"/"The Child" would
 * otherwise both read "THE"), so strip it and take three letters. A name that's
 * literally just "The" (or empty) has nothing left to abbreviate once stripped —
 * fall back to a single letter rather than leaking the literal word "THE". */
const tokenInitials = (name: string) => {
  const stripped = name.replace(/^the\b\s*/i, "").trim();
  const base = stripped || name.trim();
  const initials = base.slice(0, 3).toUpperCase();
  return initials && initials !== "THE" ? initials : base.slice(0, 1).toUpperCase() || "?";
};

export const ProBoard = ({
  map,
  fighters,
  tokens = [],
  highlightedSpaces = [],
  highlightedFighters = [],
  selectedFighter = null,
  attack = null,
  friendlyOwners = [],
  fighterBadges = {},
  extendedReachTargets = [],
  fighterTokenArt,
  fx = [],
  pendingMove = null,
  onPendingMoveSettled,
  closedRegions = [],
  encounterPhase = null,
  encounterPhaseCounterIndex = null,
  onSpaceClick,
  onFighterClick,
  imgMaxH,
  zoomable = false,
}: ProBoardProps) => {
  const diameter = (map.meta.spaceDiameter ?? DEFAULT_DIAMETER) * 100; // % of width
  const highlightSet = new Set(highlightedSpaces);
  const highlightFighterSet = new Set(highlightedFighters);
  const extendedReachSet = new Set(extendedReachTargets);
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
  const mainSpaces = regions.length ? map.spaces.filter((s) => frameOf(s) === "main") : map.spaces;

  // Inset-panel UX (the panel covers main-board spaces otherwise): per-region
  // collapse + drag, both component-state only. `panelPos` is the dragged
  // top-left as a % of the board frame (null/absent = default bottom-right
  // stack) so a window resize keeps the panel glued to the same board spot.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [panelPos, setPanelPos] = useState<Record<string, { x: number; y: number }>>({});

  // Pinch/scroll zoom + drag pan (issue #120). The transform rides the
  // shrink-wrap frame below so the art and every overlay move as one unit;
  // when `zoomable` is false the hook attaches nothing and returns no transform.
  const zoom = useZoomPan(zoomable, frameRef);

  // A collapsed panel must never hide a required choice: any highlighted space
  // or targetable fighter INSIDE the region forces it open for the duration.
  const regionActive = (regionId: string) =>
    map.spaces.some(
      (s) =>
        s.region === regionId &&
        (highlightSet.has(s.id) ||
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

  // v6 two-space (LARGE) fighters: `space` is the head, `tailSpace` the second
  // body space. The head renders through the normal per-space pass below;
  // these get an extra tail token + a stretch-band so the pair reads as ONE
  // fighter. Occupancy is exclusive server-side, so a tail never stacks.
  const spaceById = new Map(map.spaces.map((s) => [s.id, s]));
  const twoSpaceFighters = fightersOnBoard.filter((f) => f.tailSpace);

  // Attack arrow (issue #148): the two combatants of the active engagement, if
  // both are on the board. Resolved once here; spaceLayers draws the arrow in
  // whichever frame holds both tokens (the arrow doesn't cross frames).
  const attacker = attack ? fighters.find((f) => f.id === attack.attacker) : undefined;
  const attackTarget = attack ? fighters.find((f) => f.id === attack.target) : undefined;

  // The moving fighter's node-by-node route, resolved to coordinates. Only
  // the HEAD token of the named fighter tweens through it — an
  // authoritative snapshot landing mid-flight is ignored (see fighterToken)
  // so the token never jumps to wherever the server says it ended up.
  const pendingAnim = (() => {
    if (!pendingMove) return null;
    const nodes = pendingMove.path
      .map((id) => spaceById.get(id))
      .filter((s): s is ProMapSpace => !!s);
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
      fighterId: pendingMove.fighterId,
      xs: coords.map((c) => c.x * 100),
      ys: coords.map((c) => c.y * 100),
    };
  })();

  // One fighter token (head or tail segment). Clicking EITHER segment acts on
  // the fighter; target/selection styling lights both. Only the head carries
  // the HP badge so the pair still shows a single HP readout.
  const fighterToken = (
    f: ViewFighter,
    s: ProMapSpace,
    nudge: number,
    segment: "head" | "tail",
    diam: number,
    anim?: { xs: number[]; ys: number[] }
  ) => {
    const color = PLAYER_COLOR[f.owner] ?? "#999";
    const isSelected = f.id === selectedFighter;
    const isTarget = highlightFighterSet.has(f.id);
    // Extended-reach attack target (issue #235): the pulsing token is a legal
    // target ONLY because a LARGE fighter is involved (2-space melee reach). Mark
    // it so the 2-space attack doesn't read as a bug. Presentation only.
    const isExtendedReachTarget = isTarget && extendedReachSet.has(f.id);
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
        <Text
          // rem, not vw: the label lives inside the zoom-transformed frame, so
          // a viewport-relative size would fight the zoom (text stays put while
          // the token scales). rem scales with the transform like the art.
          fontSize="0.68rem"
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
          <Flex
            position="absolute"
            bottom="-18%"
            right="-18%"
            bg="brand.surfaceDim"
            color="brand.parchment"
            border={`1.5px solid ${color}`}
            borderRadius="999px"
            px="0.3em"
            fontSize="0.7rem"
            fontWeight="bold"
            lineHeight="1.4"
          >
            {f.hp}
          </Flex>
        )}
        {segment === "head" && fighterBadges[f.id] != null && (
          <Flex
            position="absolute"
            top="-18%"
            left="-18%"
            bg={color}
            color="#fff"
            border="1.5px solid #fff"
            borderRadius="999px"
            minWidth="1.3em"
            px="0.25em"
            fontSize="0.68rem"
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
            fontSize="0.55rem"
            fontWeight="bold"
            letterSpacing="0.02em"
            lineHeight="1.5"
            whiteSpace="nowrap"
            boxShadow="0 1px 3px rgba(0,0,0,0.7)"
            // Terse at-a-glance echo on the pulsing token; the sidebar row carries
            // the full "Large fighter — melee reach 2" copy + tooltip, and this
            // pill's hover title spells out the same rule (LARGE_REACH_CHIP is
            // referenced so board + row can never drift on the wording).
            title={`${LARGE_REACH_CHIP} — ${LARGE_FIGHTER_BLURB}`}
          >
            reach 2
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
    const xs = anim ? anim.xs : [s.x * 100];
    const ys = anim ? anim.ys : [s.y * 100];
    const steps = xs.length;
    const times = steps > 1 ? Array.from({ length: steps }, (_, i) => i / (steps - 1)) : undefined;
    const duration = anim ? (steps - 1) * MOVE_STEP_SECONDS : 0;

    return (
      <MotionFlex
        key={key}
        position="absolute"
        initial={false}
        animate={{ left: xs.map((x) => `${x}%`), top: ys.map((y) => `${y}%`) }}
        // Chakra's own `transition` style shorthand (a CSS transition
        // string) collides in the merged prop type with framer-motion's
        // Transition object — the `any` sidesteps that, the runtime value
        // is a real framer-motion Transition.
        transition={{ duration, ease: "easeInOut", times } as any}
        onAnimationComplete={anim ? () => onPendingMoveSettled?.() : undefined}
        transform={`translate(calc(-50% + ${nudge}rem), calc(-50% + ${nudge}rem))`}
        w={`${diam * 0.82}%`}
        sx={{ aspectRatio: "1" }}
        borderRadius="50%"
        bg={f.kind === "HERO" ? color : "brand.surfaceDim"}
        border={`2px solid ${f.kind === "HERO" ? "#fff" : color}`}
        opacity={f.kind === "HERO" ? 1 : 0.92}
        boxShadow={boxShadow}
        animation={isTarget ? `${highlightPulse} 1.4s ease-in-out infinite` : undefined}
        cursor={clickable ? "pointer" : "default"}
        onClick={handleClick}
        // `MotionFlex` is `chakra(motion.div, …)`, a plain div — unlike the
        // real `Flex` component it doesn't default to `display: flex`, so
        // `alignItems`/`justifyContent` below were silently inert (issue
        // #129): initials sat at the block-flow top instead of centered.
        display="flex"
        alignItems="center"
        justifyContent="center"
        zIndex={4}
        title={
          isExtendedReachTarget
            ? `${f.name} — ${f.hp}/${f.maxHp} HP · ${LARGE_FIGHTER_BLURB}`
            : `${f.name} — ${f.hp}/${f.maxHp} HP`
        }
      >
        {children}
      </MotionFlex>
    );
  };

  // All per-space overlays for ONE positioning frame — the main board or a
  // region inset panel. `spaces` are the frame's members and their x/y are
  // fractions of THAT frame; `diam` is the pawn diameter as a % of the frame
  // width. Everything keys off space ids, so highlights/clicks/fx work
  // identically in either frame.
  const spaceLayers = (spaces: ProMapSpace[], diam: number) => {
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
    return (
      <>
      {/* space hit-circles */}
      {spaces.map((s) => {
        const isHighlighted = highlightSet.has(s.id);
        const hidePassiveCircle = map.id === "onyxia-lair" && !isHighlighted;
        return (
          <Box
            key={s.id}
            position="absolute"
            left={`${s.x * 100}%`}
            top={`${s.y * 100}%`}
            transform="translate(-50%, -50%)"
            w={`${diam}%`}
            sx={{ aspectRatio: "1" }}
            borderRadius="50%"
            border={hidePassiveCircle ? "0" : isHighlighted ? "2px solid #E0A82E" : "1px solid rgba(255,255,255,0.15)"}
            bg={isHighlighted ? "rgba(224,168,46,0.45)" : "transparent"}
            animation={isHighlighted ? `${highlightPulse} 1.4s ease-in-out infinite` : undefined}
            cursor={isHighlighted && onSpaceClick ? "pointer" : "default"}
            onClick={isHighlighted && onSpaceClick ? () => onSpaceClick(s.id) : undefined}
            zIndex={isHighlighted ? 3 : 1}
          />
        );
      })}

      {/* neutral board tokens (totems/flames) — below fighters, never clickable */}
      {spaces
        .filter((s) => tokens.some((t) => t.space === s.id))
        .flatMap((s) =>
          tokens
            .filter((t) => t.space === s.id)
            .map((t) => {
              const flame = t.kind === "flame";
              return (
                <Box
                  key={t.id}
                  position="absolute"
                  left={`${s.x * 100}%`}
                  top={`${s.y * 100}%`}
                  transform={flame ? "translate(-50%, -50%)" : "translate(-50%, -50%) rotate(45deg)"}
                  w={`${diam * (flame ? 0.62 : 0.55)}%`}
                  sx={{ aspectRatio: "1", pointerEvents: "none" }}
                  bg={flame ? "#E85D2A" : "brand.surfaceDim"}
                  border={`2px solid ${flame ? "#FFD18A" : (PLAYER_COLOR[t.owner] ?? "#999")}`}
                  borderRadius={flame ? "55% 55% 55% 18%" : "20%"}
                  boxShadow={flame ? "0 0 10px rgba(232,93,42,0.85)" : "0 1px 4px rgba(0,0,0,0.5)"}
                  zIndex={2}
                  title={`${flame ? "Flame hazard" : "Totem"} (${t.owner})`}
                />
              );
            })
        )}

      {/* two-space fighter bands — the "string" tying head and tail together.
          viewBox 0-100 with preserveAspectRatio="none" maps the normalized
          space coords straight onto the stretched image. */}
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
            const color = PLAYER_COLOR[f.owner] ?? "#999";
            // white outer + colored inner stroke, echoing the hero token look
            return [
              <line
                key={`${f.id}-band-outline`}
                x1={head.x * 100}
                y1={head.y * 100}
                x2={tail.x * 100}
                y2={tail.y * 100}
                stroke="#fff"
                strokeWidth={diam * 0.52}
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
                strokeWidth={diam * 0.36}
                strokeLinecap="round"
              />,
            ];
          })}
        </svg>
      )}

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
            strokeWidth={diam * 0.34}
            strokeLinecap="round"
            opacity={0.9}
          />
          <line
            x1={arrow.x1}
            y1={arrow.y1}
            x2={arrow.x2}
            y2={arrow.y2}
            stroke={ARROW_COLOR}
            strokeWidth={diam * 0.2}
            strokeLinecap="round"
          />
          <polygon
            points={arrow.points}
            fill={ARROW_COLOR}
            stroke="#fff"
            strokeWidth={diam * 0.14}
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* fighter tokens (heads; stack co-located tokens with a slight diagonal offset) */}
      {spaces
        .filter((s) => bySpace.has(s.id))
        .flatMap((s) =>
          (bySpace.get(s.id) as ViewFighter[]).map((f, i, all) =>
            fighterToken(
              f,
              s,
              (i - (all.length - 1) / 2) * 0.35,
              "head",
              diam,
              pendingAnim?.fighterId === f.id ? pendingAnim : undefined
            )
          )
        )}

      {/* tail tokens of two-space fighters — same interactions as the head */}
      {frameTwoSpace.flatMap((f) => {
        const tail = spaceById.get(f.tailSpace as SpaceId);
        return tail ? [fighterToken(f, tail, 0, "tail", diam)] : [];
      })}

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
    const rDiam = (r.spaceDiameter ?? map.meta.spaceDiameter ?? DEFAULT_DIAMETER) * 100;
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
            {spaceLayers(map.spaces.filter((s) => s.region === r.id), rDiam)}
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

  const boardAspect = map.meta.imageWidth && map.meta.imageHeight
    ? `${map.meta.imageWidth} / ${map.meta.imageHeight}`
    : "4 / 3";

  return (
    // Outer box may be stretched by a parent grid/flex row; the INNER box is
    // the positioning context: it shrink-wraps the image exactly, so the
    // %-positioned overlays stay glued to the art at any size. When zoomable,
    // this outer box is the wheel/pointer target + the zoom viewport (clips the
    // zoomed frame to the board's cell); the transform rides the inner frame.
    <Box
      ref={zoom.containerRef}
      maxW="100%"
      position={zoomable ? "relative" : undefined}
      overflow={zoomable ? "hidden" : undefined}
      sx={zoomable ? { touchAction: "none", cursor: "grab" } : undefined}
      {...zoom.handlers}
    >
      <Box
        ref={frameRef}
        position="relative"
        w="fit-content"
        maxW="100%"
        mx="auto"
        userSelect="none"
        transform={zoom.transform}
        transformOrigin={zoom.transformOrigin}
      >
      {map.meta.imageUrl ? (
        <Box
          as="img"
          src={map.meta.imageUrl}
          alt={map.meta.title}
          maxW="100%"
          maxH={imgMaxH}
          display="block"
          draggable={false}
          borderRadius="0.5rem"
        />
      ) : (
        <Flex
          w="min(100vw, 72rem)"
          maxW="100%"
          maxH={imgMaxH}
          sx={{ aspectRatio: boardAspect }}
          alignItems="center"
          justifyContent="center"
          borderRadius="0.5rem"
          border="1px solid rgba(224,168,46,0.35)"
          bg="radial-gradient(circle at 46% 48%, rgba(173,110,43,0.52) 0%, rgba(96,63,36,0.76) 48%, rgba(28,22,25,0.94) 100%)"
          boxShadow="inset 0 0 80px rgba(0,0,0,0.42)"
          color="brand.parchment"
          fontFamily="BebasNeueRegular"
          fontSize="1.1rem"
          letterSpacing="0.08em"
          opacity={0.95}
        >
          {map.meta.title}
        </Flex>
      )}

      {map.id === "onyxia-lair" && encounterPhase === "FLIGHT" && <OnyxiaFlamebreathLanes />}
      {map.id === "onyxia-lair" && (
        <OnyxiaBoardGraph
          spaces={mainSpaces}
          diam={diameter}
          width={map.meta.imageWidth ?? 100}
          height={map.meta.imageHeight ?? 100}
        />
      )}
      {map.id === "onyxia-lair" && <OnyxiaPhaseBar index={encounterPhaseCounterIndex} />}

      {spaceLayers(mainSpaces, diameter)}

      {/* region inset panels (v9 — e.g. Baba Yaga's Hut), pinned bottom-right
          and stacked upward; sized relative to the board so they scale with it.
          The container ignores pointer events so the gaps between panels stay
          clickable board (each panel re-enables its own). A dragged panel
          leaves the stack and pins to wherever the player put it. */}
      {regions.some((r) => !panelPos[r.id]) && (
        <Flex
          position="absolute"
          right="1.5%"
          bottom="1.5%"
          w="27%"
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
            left={`${panelPos[r.id].x}%`}
            top={`${panelPos[r.id].y}%`}
            w="27%"
            zIndex={7}
            pointerEvents="none"
          >
            {regionPanel(r)}
          </Box>
        ))}
      </Box>

      {/* reset-to-fit control — appears only once zoomed/panned so a mis-pan
          can never strand the board off-screen. Sits in the outer (untransformed)
          box so it stays put on screen regardless of the board's transform. */}
      {zoom.active && (
        <Button
          size="xs"
          position="absolute"
          bottom="0.5rem"
          left="0.5rem"
          zIndex={8}
          bg="whiteAlpha.300"
          color="brand.parchment"
          _hover={{ bg: "whiteAlpha.500" }}
          onClick={zoom.reset}
        >
          reset view
        </Button>
      )}
    </Box>
  );
};
