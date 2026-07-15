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
import { isValidMotionProp, motion, useReducedMotion } from "framer-motion";
import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { FighterId, PlayerId, ProMapDef, ProMapItem, ProMapRegion, ProMapSpace, SpaceId, ViewFighter, ViewToken } from "@/lib/pro/protocol";
import { BoardFxItem } from "@/lib/pro/useGameFx";
import { TokenGestures, usePageHidden } from "@/lib/pro/tokenLife";
import { useZoomPan } from "@/lib/pro/useZoomPan";
import { LARGE_FIGHTER_BLURB, LARGE_REACH_CHIP } from "@/lib/pro/largeReach";
import { tokenInitials } from "./FighterTokenPortrait";
import { TokenIdle, TokenLifeLayer, phaseSeed } from "./TokenLifeLayer";
import { ItemBadge, PassageBadge } from "./ItemBadge";
import type { FlagTokenBadge } from "@/lib/pro/heroStateFlags";

/** Hover/long-press tooltip for a live item token, per the official wording. */
export const itemBadgeTitle = (item: ProMapItem): string =>
  item.kind === "combat"
    ? `${item.label} — +${item.value ?? 0} to a combat card played from this space`
    : item.label;

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

/** One "who would move here" cue (issue #320 follow-up): a ghost of `fighterId`
 * at destination `to`, plus a source ring + connector from its current space
 * `from`. Shown on hover of a move-target space and, persistently, while an
 * ambiguous space's fighter chooser is open. PRESENTATION ONLY. */
export interface MoveHint {
  fighterId: FighterId;
  from: SpaceId;
  to: SpaceId;
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

const ARROW_COLOR = "#E23B3B"; // crimson — reads as "attack", distinct from both player colors
// Movement-intent cue (issue #320 follow-up): a soft periwinkle for the "who
// moves here" ghost/connector/source-ring. Deliberately its OWN channel —
// distinct from the gold move highlight (#E0A82E), the white selection ring, the
// teal ally ring (#39B7A8), and the crimson attack arrow — and it never touches
// box-shadow (which selection already owns).
const MOVE_HINT_COLOR = "#A78BFA";

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
  /** Small state badge for a fighter token (tide / druid form today). PRESENTATION
   *  ONLY — caller derives the badge from public player flags via the unified
   *  HERO_STATE_FLAGS registry; the board just draws it on the hero token head.
   *  Absent/null = no badge. */
  fighterTokenBadge?: (fighter: ViewFighter) => FlagTokenBadge | null | undefined;
  /** transient effect overlays (floating damage numbers…) — keyed, caller-expired */
  fx?: BoardFxItem[];
  /** a just-committed move to tween through node-by-node instead of snapping */
  pendingMove?: PendingMove | null;
  /** fired once the tween finishes — caller clears its pendingMove state */
  onPendingMoveSettled?: () => void;
  /** Incremental-maneuver LOCAL preview (issue #285): the ghost token's current
   *  route while the player steps hop-by-hop. `path[0]` is the fighter's real
   *  space (the token stays there), the last element is the ghost's position.
   *  PRESENTATION ONLY, non-interactive, no tween — nothing has been sent yet;
   *  clicks still land on the underlying gold step highlights. null = no preview. */
  previewMove?: PendingMove | null;
  /** Region ids currently out of play (view.closedRegions) — their inset
   * panels grey out and stop taking clicks */
  closedRegions?: string[];
  /** Live battlefield item tokens (view.itemTokens), keyed by space → item id.
   *  DRIVES the item badges strictly off server state — a badge appears only while
   *  its space is in this map and vanishes the instant the token is consumed. NEVER
   *  read the static map.items/space.item for presence (protocol v17). Absent/empty
   *  = no item badges. The item id is looked up in `map.items` for kind + label. */
  itemTokens?: Record<SpaceId, string>;
  onSpaceClick?: (id: SpaceId) => void;
  onFighterClick?: (id: FighterId) => void;
  /** Hover of a highlighted move-target space (null on leave) — drives the
   *  "who would move here" cue. Fired ONLY for highlighted spaces. */
  onSpaceHover?: (id: SpaceId | null) => void;
  /** Hover of a fighter token (null on leave) — lets the caller preview just
   *  that fighter's reachable spaces without committing a selection. */
  onFighterHover?: (id: FighterId | null) => void;
  /** "Who would move here" cues to draw (issue #320 follow-up): a ghost at each
   *  destination + a source ring & connector. Absent/empty = nothing drawn. */
  moveHint?: MoveHint[] | null;
  /** cap the board image height (e.g. "calc(100svh - 2rem)") so the whole
   * field fits the viewport; width shrinks to keep the aspect ratio */
  imgMaxH?: string;
  /** Enable pinch/scroll zoom + drag pan on the board (issue #120, gated by
   * the `zoomMap` beta flag). Off (default) = no handlers, no transform, no
   * added DOM — the board behaves exactly as before. */
  zoomable?: boolean;
  /** Per-fighter combat gestures for the `tokenLife` beta feature (issue #320),
   *  derived from snapshot diffs by useTokenLife. PRESENTATION ONLY. Absent/null
   *  (flag off) = no wrapper, no idle motion — the token DOM is byte-identical to
   *  today. Present (even if empty) = tokens breathe and react to combat. */
  tokenLife?: TokenGestures | null;
}

const PLAYER_COLOR: Record<string, string> = {
  p1: "#E0A82E", // gold
  p2: "#3B8BEB", // blue
  p3: "#2F9E68", // green
  p4: "#C0449E", // magenta
};

// Raw hex for the token body when the `tokenLife` layer paints the circle via
// inline style (Chakra tokens don't resolve there). Must match styles/style.ts.
const SURFACE_DIM = "#2C1831";

// Team-affiliation ring (issue #195): a teal halo shared by every fighter on the
// viewer's team. Kept distinct from the gold highlight, white selection ring, and
// crimson attack arrow so it never reads as any of those. Must match ProHud's
// ALLY_ACCENT so HUD chip and board ring are visibly the same "team" signal.
const ALLY_RING = "#39B7A8";

/** Token initials: leading "The " is noise ("The Mandalorian"/"The Child" would
 * otherwise both read "THE"), so strip it and take three letters. A name that's
 * literally just "The" (or empty) has nothing left to abbreviate once stripped —
 * fall back to a single letter rather than leaking the literal word "THE". */
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
  fighterTokenBadge,
  fx = [],
  pendingMove = null,
  onPendingMoveSettled,
  previewMove = null,
  closedRegions = [],
  itemTokens = {},
  onSpaceClick,
  onFighterClick,
  onSpaceHover,
  onFighterHover,
  moveHint = null,
  imgMaxH,
  zoomable = false,
  tokenLife = null,
}: ProBoardProps) => {
  // "Lively tokens" (issue #320): present (even empty) = the feature is on.
  const tokenLifeOn = !!tokenLife;
  const reducedMotion = !!useReducedMotion();
  const pageHidden = usePageHidden();
  const diameter = (map.meta.spaceDiameter ?? DEFAULT_DIAMETER) * 100; // % of width
  // Static item definitions (kind + label + value), keyed by id — looked up from
  // the LIVE itemTokens map so a badge renders only while the token is on the board.
  const itemById = new Map((map.items ?? []).map((it) => [it.id, it]));
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
        color: PLAYER_COLOR[f.owner] ?? "#999",
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
    const tokenBadge = segment === "head" && f.kind === "HERO" ? fighterTokenBadge?.(f) : null;

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
        {tokenBadge && (
          <Flex
            position="absolute"
            top="-20%"
            right="-20%"
            minWidth="1.45em"
            h="1.45em"
            px="0.18em"
            alignItems="center"
            justifyContent="center"
            bg={tokenBadge.bg}
            color={tokenBadge.color}
            border="1.5px solid #fff"
            borderRadius="999px"
            fontSize="0.68rem"
            fontWeight="bold"
            lineHeight="1"
            boxShadow="0 1px 4px rgba(0,0,0,0.75)"
            title={tokenBadge.title}
            aria-label={tokenBadge.title}
          >
            {tokenBadge.icon}
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

    // The visible circle body. When `tokenLife` is on it moves onto the inner
    // gesture wrapper (so the whole token recoils/lunges as one unit) and the
    // MotionFlex becomes a transparent shell that keeps only the position tween
    // and the box-shadow rings; when off it stays on the MotionFlex exactly as
    // before, so the token DOM is byte-identical.
    // `bodyBgToken` is the Chakra token used on the OFF path (byte-identical to
    // today); `bodyBgHex` is the resolved hex the inner layer needs for inline
    // style. Border/opacity are the same expression on both paths.
    const bodyBgToken = f.kind === "HERO" ? color : "brand.surfaceDim";
    const bodyBgHex = f.kind === "HERO" ? color : SURFACE_DIM;
    const bodyBorder = `2px solid ${f.kind === "HERO" ? "#fff" : color}`;
    const bodyOpacity = f.kind === "HERO" ? 1 : 0.92;

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
        bg={tokenLifeOn ? "transparent" : bodyBgToken}
        border={tokenLifeOn ? "none" : bodyBorder}
        opacity={tokenLifeOn ? 1 : bodyOpacity}
        boxShadow={boxShadow}
        animation={isTarget ? `${highlightPulse} 1.4s ease-in-out infinite` : undefined}
        cursor={clickable ? "pointer" : "default"}
        onClick={handleClick}
        // Hovering a fighter lets the caller preview just its reachable spaces.
        // Fired for every token; the caller ignores non-movable ones.
        onMouseEnter={onFighterHover ? () => onFighterHover(f.id) : undefined}
        onMouseLeave={onFighterHover ? () => onFighterHover(null) : undefined}
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
        {body}
      </MotionFlex>
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
      sx={{ aspectRatio: "1" }}
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
        fontSize="0.68rem"
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
      return {
        color: PLAYER_COLOR[f.owner] ?? "#999",
        initials: tokenInitials(f.name),
        isHero: f.kind === "HERO",
        x: ghost.x * 100,
        y: ghost.y * 100,
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
      return [{ h, from, to, color: PLAYER_COLOR[f.owner] ?? "#999", initials: tokenInitials(f.name), isHero: f.kind === "HERO", art: fighterTokenArt?.(f) ?? null }];
    });
    const stackIndex = new Map<SpaceId, number>();
    return (
      <>
      {/* space hit-circles */}
      {spaces.map((s) => {
        const isHighlighted = highlightSet.has(s.id);
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
            border={isHighlighted ? "2px solid #E0A82E" : "1px solid rgba(255,255,255,0.15)"}
            bg={isHighlighted ? "rgba(224,168,46,0.45)" : "transparent"}
            animation={isHighlighted ? `${highlightPulse} 1.4s ease-in-out infinite` : undefined}
            cursor={isHighlighted && onSpaceClick ? "pointer" : "default"}
            onClick={isHighlighted && onSpaceClick ? () => onSpaceClick(s.id) : undefined}
            // Hover cue only for actionable spaces — the caller shows "who would
            // move here". Fires null on leave so the cue clears.
            onMouseEnter={isHighlighted && onSpaceHover ? () => onSpaceHover(s.id) : undefined}
            onMouseLeave={isHighlighted && onSpaceHover ? () => onSpaceHover(null) : undefined}
            zIndex={isHighlighted ? 3 : 1}
          />
        );
      })}

      {/* neutral board tokens (totems) — below fighters, never clickable */}
      {spaces
        .filter((s) => tokens.some((t) => t.space === s.id))
        .flatMap((s) =>
          tokens
            .filter((t) => t.space === s.id)
            .map((t) => (
              <Box
                key={t.id}
                position="absolute"
                left={`${s.x * 100}%`}
                top={`${s.y * 100}%`}
                transform="translate(-50%, -50%) rotate(45deg)"
                w={`${diam * 0.55}%`}
                sx={{ aspectRatio: "1", pointerEvents: "none" }}
                bg="brand.surfaceDim"
                border={`2px solid ${PLAYER_COLOR[t.owner] ?? "#999"}`}
                borderRadius="20%"
                boxShadow="0 1px 4px rgba(0,0,0,0.5)"
                zIndex={2}
                title={`Totem (${t.owner})`}
              />
            ))
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
              transform="translate(35%, -115%)"
              w={`${badgeW}%`}
              sx={{ aspectRatio: "1" }}
              zIndex={5}
            >
              <ItemBadge kind={item.kind} title={itemBadgeTitle(item)} />
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
              transform="translate(-135%, -115%)"
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
            transform={`translate(calc(-50% + ${nudge}rem), calc(-50% + ${nudge}rem))`}
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
      {preview && (
        <Box
          position="absolute"
          left={`${preview.x}%`}
          top={`${preview.y}%`}
          transform="translate(-50%, -50%)"
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
          title="move preview — click again to keep stepping, or End move to commit"
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
      )}

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
