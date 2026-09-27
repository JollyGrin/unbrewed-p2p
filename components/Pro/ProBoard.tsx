/**
 * Pro board renderer — pure presentation, zero rules logic.
 *
 * Draws the map image, one hit-circle per space (normalized 0–1 coords,
 * sized by meta.spaceDiameter as a fraction of image width — same convention
 * as the dev map editor), fighter tokens, and gold highlights on whatever
 * spaces the caller says are currently actionable (which the server derives
 * from legalActions — the board never computes legality itself).
 */
import { Box, Button } from "@chakra-ui/react";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import { FighterId, PlayerId, ProMapDef, ProMapSpace, SpaceId, ViewFighter, ViewToken } from "@/lib/pro/protocol";
import { BoardFxItem } from "@/lib/pro/useGameFx";
import { TokenGestures } from "@/lib/pro/tokenLife";
import { ZoomPanInset, useZoomPan } from "@/lib/pro/useZoomPan";
import { useCoarsePointer } from "@/lib/pro/useCoarsePointer";
import { nearestNeighbourPx, touchHitPercent } from "@/lib/pro/touchTargets";
import { PendingSwap } from "@/lib/pro/positionSwap";
import type { FlagTokenBadge } from "@/lib/pro/heroStateFlags";
import type { CosmeticRimTier } from "@/lib/pro/cosmetics";
import { DEFAULT_SPACE_DIAMETER } from "@/lib/pro/seatColors";
import {
  type PendingMove,
  type MoveHint,
  MOVE_STEP_SECONDS as REGION_PANELS_MOVE_STEP_SECONDS,
  useRegionPanels,
} from "./RegionPanels";

export type { PendingMove, MoveHint };
export const MOVE_STEP_SECONDS = REGION_PANELS_MOVE_STEP_SECONDS;

export interface ProBoardProps {
  map: ProMapDef;
  fighters: ViewFighter[];
  /** Neutral board OBJECTS (protocol v26) — non-interactive sprites, public to both
   *  players. Kind-driven presentation via the BOARD_OBJECT_VISUALS registry; two
   *  objects MAY share a space (a corpse and a totem, or two corpses), so they stack
   *  with the same diagonal offset living fighters use. */
  tokens?: ViewToken[];
  /** Portrait art for a CORPSE-style object, clipped into its disc (issue #553).
   *  PRESENTATION ONLY — the caller resolves it from `ViewToken.origin` (the fighter
   *  the object came from) exactly the way `fighterTokenArt` resolves a live token.
   *  Absent/null → the object draws its registry glyph instead. */
  boardObjectArt?: (token: ViewToken) => string | null | undefined;
  /** Display name of the fighter an object came from (`ViewToken.origin`), for the
   *  hover title. Absent/null → the title omits the provenance clause. */
  boardObjectOriginName?: (token: ViewToken) => string | null | undefined;
  /** Spaces the current player can act on right now (move targets, placements…) */
  highlightedSpaces?: SpaceId[];
  /** Fighters the current player can act on right now (attack targets, movable…) */
  highlightedFighters?: FighterId[];
  /** phones: fighters to zoom onto when there is nothing to pick — the two
   *  sides of a live combat (mobile polish). Board picks always win. */
  focusFighters?: FighterId[];
  /** Maneuver-ORIGIN relocation picks (engine #535 ↔ protocol 34): spaces the
   *  selected fighter may START its maneuver from, offered by the server as
   *  RELOCATE_FIGHTER actions. A teleport, not a step — drawn as a dashed cyan
   *  ring, deliberately unlike the solid gold walk highlight — and one click
   *  relocates. The picks arrive only while the dock row has ARMED the mode
   *  (review of #748); absent/empty = no pick, board unchanged. */
  relocateSpaces?: SpaceId[];
  /** The relocate mode is ARMED: the dashed origins are the only clickable
   *  spaces, and hovering one must not fire the "who would move here" walk
   *  preview (review of #748). False = the board is exactly as on main. */
  relocateArmed?: boolean;
  selectedFighter?: FighterId | null;
  /** Active combat pairing (view.combat) — draws an attacker→target arrow so it's
   *  clear who is attacking whom during the attack phase (issue #148). null = no
   *  combat in progress, no arrow. */
  attack?: { attacker: FighterId; target: FighterId } | null;
  /** The live combat's defender is NOT the fighter that was attacked — either a
   *  card moved the DEFENDING FIGHTER mid-combat (protocol v34 ↔ engine #494) or
   *  the combat opened against somebody the attacker never declared against
   *  (#694, Grievous's Multi-Arm Barrage Combat 2). Either way the attack arrow
   *  lands on a figure nobody picked. `fighterId` is the fighter actually taking
   *  the hit — it gets the violet ring and a chip, so the arrow reads as a
   *  redirect instead of a glitch. PRESENTATION ONLY: the caller derives it
   *  (lib/pro/combatDefender.ts + useDefenderSwap.ts) and the board just draws it,
   *  chip text and all. Absent/null = nothing extra, exactly today's board. */
  defenderStepIn?: { fighterId: FighterId; chip: string; blurb: string } | null;
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
  /** Attack targets the server offered only because tokens will be SPENT to reach
   *  them (issue #668 ↔ engine #456 — Cecil Palmer's Broadcast dial), each with
   *  the price the engine will auto-deduct on declaration. PRESENTATION ONLY: the
   *  caller reprices the server's own legalActions (lib/pro/rangePurchase.ts) so
   *  the cost is visible BEFORE the click, and gets a DISTINCT highlight from a
   *  free adjacent target so the two never read alike. Attacker-side only — a
   *  bought reach is never drawn on the opponent's board. Absent/empty = nothing
   *  extra, exactly today's board. */
  boughtRangeTargets?: { id: FighterId; chip: string; blurb: string }[];
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
  /** Cosmetic metal rim tier for a fighter token (issue #613, design doc §10).
   *  PURELY DECORATIVE and HERO-ONLY — a masked metallic band painted INSIDE the
   *  token's existing white border, below every badge, with no pointer events. It
   *  never changes a token's position, size, hitbox, colours or badges, so nothing
   *  a player reads off the board depends on it; the caller resolves the tier
   *  client-side (today from the local `pro:cosmetics:debug` registry) and the
   *  board just paints it. Absent prop / null / a token too small to carry it
   *  (see COSMETIC_RIM_MIN_PX) = the plain token, byte-identical to today. */
  fighterTokenRim?: (fighter: ViewFighter) => CosmeticRimTier | null | undefined;
  /** transient effect overlays (floating damage numbers…) — keyed, caller-expired */
  fx?: BoardFxItem[];
  /** a just-committed move to tween through node-by-node instead of snapping */
  pendingMove?: PendingMove | null;
  /** fired once the tween finishes — caller clears its pendingMove state */
  onPendingMoveSettled?: () => void;
  /** Atomic position swaps to play (protocol v31), derived by usePositionSwaps.
   *  A swap is a TELEPORT: these tokens crossfade between the two spaces instead
   *  of tweening a route, so the beat can never be mistaken for a walk. Both
   *  segments of a LARGE body play it. Absent/empty = nothing extra drawn and
   *  the token DOM is byte-identical to today. PRESENTATION ONLY. */
  swaps?: PendingSwap[] | null;
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
   * the `zoomMap` flag). Off (default) = no handlers, no transform, no
   * added DOM — the board behaves exactly as before. On, the board FILLS its
   * parent box and that box becomes the pan/zoom viewport, so the parent must
   * give it a height (issue #450). */
  zoomable?: boolean;
  /**
   * Stand the map on end (issue #708, mobile portrait only). Unmatched maps are
   * landscape art; on a phone held upright the unrotated fit is width-bound and
   * leaves two thirds of the screen as empty table. `zoomable` only — the
   * rotation rides the pan/zoom transform (see lib/pro/useZoomPan) so a drag
   * still moves the board the way the finger went, and every token, badge and
   * panel below counter-rotates so its text still reads upright.
   */
  rotated?: boolean;
  /** px of this box hidden behind the caller's fixed overlays (HUD, dock,
   *  hand). The initial fit centers the board in what's left, so the whole
   *  field is visible on load without any user interaction. `zoomable` only. */
  fitInset?: ZoomPanInset;
  /** Per-fighter combat gestures for the `tokenLife` beta feature (issue #320),
   *  derived from snapshot diffs by useTokenLife. PRESENTATION ONLY. Absent/null
   *  (flag off) = no wrapper, no idle motion — the token DOM is byte-identical to
   *  today. Present (even if empty) = tokens breathe and react to combat. */
  tokenLife?: TokenGestures | null;
  /** Registry of fighter-token DOM elements, keyed by fighter id (issue #382). The
   *  caller reads it at damage-arc launch to measure the defender token's viewport
   *  rect — correct under the board's zoom/pan transform, where board coords aren't.
   *  Only the head token registers; cleared on unmount. Absent = no registration. */
  fighterEls?: MutableRefObject<Map<FighterId, HTMLElement>>;
}

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
  focusFighters = [],
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
  boardObjectArt,
  boardObjectOriginName,
  fx = [],
  pendingMove = null,
  onPendingMoveSettled,
  swaps = null,
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
  rotated = false,
  fitInset,
  tokenLife = null,
  fighterEls,
}: ProBoardProps) => {
  const diameter = (map.meta.spaceDiameter ?? DEFAULT_SPACE_DIAMETER) * 100; // % of width
  const highlightFighterSet = new Set(highlightedFighters);

  // v9 regions (Baba Yaga's Hut): a region's spaces carry x/y normalized to the
  // REGION image, not the main board — each region renders as its own inset
  // panel with its own positioning frame. A space naming an unknown region id
  // falls back to the main frame rather than vanishing.
  const regions = map.regions ?? [];
  const regionIds = new Set(regions.map((r) => r.id));
  const frameOf = (s: ProMapSpace): string =>
    s.region && regionIds.has(s.region) ? s.region : "main";
  const mainSpaces = regions.length ? map.spaces.filter((s) => frameOf(s) === "main") : map.spaces;

  // The board frame region panels drag/clamp against (useRegionPanels).
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Pinch/scroll zoom + drag pan (issue #120). The transform rides the
  // shrink-wrap frame below so the art and every overlay move as one unit;
  // when `zoomable` is false the hook attaches nothing and returns no transform.
  const zoom = useZoomPan(zoomable, frameRef, fitInset, zoomable && rotated);
  // Rotated-portrait hoist (issue #708): region panels + the zone legend pin
  // to the untransformed screen instead of the board's own zoom/pan frame —
  // see useRegionPanels's own `upright` doc.
  const upright = zoomable && rotated;

  // Phones (mobile step 1): a gold space can render at ~18px, far below a
  // fingertip. Actionable circles get an invisible hit area of at least 44px on
  // screen, and the board zooms onto the picks when they are too small to hit.
  // Fine pointers (mouse, trackpad) keep today's exact hit circles and view.
  const coarsePointer = useCoarsePointer();
  /** sx for an invisible, centred hit area around an actionable circle on the
   *  main board. Region insets get none: their spacing is not measured here. */
  const touchHitSx = (spaceId: SpaceId, renderedDiameterPx: number) => {
    const maxPx = mainPickCaps.get(spaceId);
    const pct = coarsePointer && maxPx !== undefined ? touchHitPercent(renderedDiameterPx, maxPx) : null;
    return pct === null
      ? {}
      : {
          "&::before": {
            content: '""',
            position: "absolute",
            left: "50%",
            top: "50%",
            width: `${pct}%`,
            height: `${pct}%`,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
          },
        };
  };
  const pickKey = `${highlightedSpaces.join(",")}|${relocateSpaces.join(",")}|${highlightedFighters.join(",")}|${focusFighters.join(",")}`;
  const { focusOn, releaseFocus } = zoom;
  useEffect(() => {
    if (!zoomable || !coarsePointer) return;
    // Measure after paint, so the gold rings of the new prompt are in the DOM.
    const raf = requestAnimationFrame(() => {
      // Only elements INSIDE the transformed board frame count: they are the
      // ones the zoom actually moves. A region inset panel (Baba Yaga's Hut) is
      // hoisted out of the frame and pinned to the screen in rotated portrait,
      // so its picks sit at panel-relative screen spots that have nothing to do
      // with the board — folding them in zoomed the board onto whatever lay
      // under the panel (#834). Unrotated, the panel rides inside the frame and
      // its picks are measured like any other. The same scoping guards the
      // combat fallback below: a combatant standing on a Hut space renders a
      // token in the pinned panel too, and it must not corrupt the box (#852).
      const frame = frameRef.current;
      const picks = Array.from(frame?.querySelectorAll<HTMLElement>("[data-pick]") ?? []);
      // Nothing to pick: frame the fighters the page asked for (a live combat).
      const targets = picks.length
        ? picks
        : focusFighters.flatMap((id) => Array.from(frame?.querySelectorAll<HTMLElement>(`[data-fighter-id="${id}"]`) ?? []));
      const rects = targets.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
      if (rects.length === 0) {
        releaseFocus();
        return;
      }
      focusOn(
        {
          left: Math.min(...rects.map((r) => r.left)),
          top: Math.min(...rects.map((r) => r.top)),
          right: Math.max(...rects.map((r) => r.right)),
          bottom: Math.max(...rects.map((r) => r.bottom)),
        },
        Math.min(...rects.map((r) => Math.min(r.width, r.height)))
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [pickKey, zoomable, coarsePointer, focusOn, releaseFocus]);

  // Layout width (px, BEFORE the zoom transform) of the shrink-wrap frame every
  // board overlay is positioned against. Read for one reason only: the cosmetic
  // fighter-token rim (#613) auto-retires below a rendered pixel size, and a
  // token's size is a percentage of this box times the live zoom scale, so it
  // cannot be known without measuring. Nothing that affects play reads this.
  // 0 = not measured yet (SSR, or a DOM with no ResizeObserver) and is treated
  // as UNKNOWN, never as "tiny".
  const [frameW, setFrameW] = useState(0);
  // Height alongside it, for the on-screen spacing between touch picks.
  const [frameH, setFrameH] = useState(0);
  useEffect(() => {
    const f = frameRef.current;
    if (!f || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      setFrameW((prev) => (prev === f.offsetWidth ? prev : f.offsetWidth));
      setFrameH((prev) => (prev === f.offsetHeight ? prev : f.offsetHeight));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(f);
    return () => ro.disconnect();
  }, []);
  // On-screen width of the main board frame. useRegionPanels sizes each
  // region inset panel as a fixed fraction of it.
  const framePx = frameW * zoom.scale;
  // Distance (on-screen px) from each main-board pick to its nearest other pick:
  // a hit area stops there, so two close gold spaces never swallow each other's
  // taps. A target token counts at its space's centre.
  const mainPickCaps = new Map<SpaceId, number>();
  if (coarsePointer) {
    const mainIds = new Set(mainSpaces.map((sp) => sp.id));
    const pickIds = new Set<SpaceId>(
      [
        ...(relocateArmed ? relocateSpaces : [...highlightedSpaces, ...relocateSpaces]),
        ...fighters
          .filter((f) => highlightFighterSet.has(f.id))
          .flatMap((f) => [f.space, f.tailSpace].filter((id): id is SpaceId => !!id)),
      ].filter((id) => mainIds.has(id))
    );
    const pickSpaces = mainSpaces.filter((sp) => pickIds.has(sp.id));
    const points = pickSpaces.map((sp) => ({ x: sp.x * frameW * zoom.scale, y: sp.y * frameH * zoom.scale }));
    pickSpaces.forEach((sp, i) => mainPickCaps.set(sp.id, nearestNeighbourPx(points, i)));
  }

  const { spaceLayers, screenOverlays } = useRegionPanels({
    map,
    fighters,
    tokens,
    boardObjectArt,
    boardObjectOriginName,
    highlightedSpaces,
    highlightedFighters,
    relocateSpaces,
    relocateArmed,
    selectedFighter,
    attack,
    defenderStepIn,
    friendlyOwners,
    fighterBadges,
    extendedReachTargets,
    boughtRangeTargets,
    fighterTokenArt,
    fighterTokenBadge,
    fighterTokenRim,
    fx,
    pendingMove,
    onPendingMoveSettled,
    swaps,
    previewMove,
    closedRegions,
    itemTokens,
    onSpaceClick,
    onFighterClick,
    onSpaceHover,
    onFighterHover,
    moveHint,
    tokenLife,
    fighterEls,
    fitInset,
    upright,
    frameRef,
    framePx,
  });

  return (
    // Outer box may be stretched by a parent grid/flex row; the INNER box is
    // the positioning context: it shrink-wraps the image exactly, so the
    // %-positioned overlays stay glued to the art at any size. When zoomable,
    // this outer box FILLS the parent stage and is the wheel/pointer target +
    // the zoom viewport (clipping whatever the transform pushes past the
    // screen edge); the transform rides the inner frame.
    <Box
      ref={zoom.containerRef}
      maxW="100%"
      w={zoomable ? "100%" : undefined}
      h={zoomable ? "100%" : undefined}
      position={zoomable ? "relative" : undefined}
      overflow={zoomable ? "hidden" : undefined}
      sx={zoomable ? { touchAction: "none", cursor: "grab" } : undefined}
      {...zoom.handlers}
    >
      {/* Zoomable: pinned to the viewport's top-left so the fit transform is
          plain container coordinates (no auto-centering offset to back out of),
          and freed from the flow so its natural height can exceed the stage —
          the fit scale, not a max-height cap, is what brings it into view. */}
      <Box
        ref={frameRef}
        position={zoomable ? "absolute" : "relative"}
        top={zoomable ? 0 : undefined}
        left={zoomable ? 0 : undefined}
        w="fit-content"
        maxW="100%"
        mx={zoomable ? undefined : "auto"}
        userSelect="none"
        transform={zoom.transform}
        transformOrigin={zoom.transformOrigin}
        // Programmatic view moves (auto-focus, its release, reset) ease; a
        // gesture clears this so a drag tracks the finger exactly (#835).
        transition={zoom.transition}
        sx={zoom.transition ? { "@media (prefers-reduced-motion: reduce)": { transition: "none" } } : undefined}
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

      {spaceLayers(mainSpaces, diameter, framePx, touchHitSx)}

      {/* region inset panels (v9 — e.g. Baba Yaga's Hut) and the zone legend.
          Both are screen-oriented HTML, not board art — so when the frame takes
          its portrait quarter-turn they are hoisted OUT of it entirely (see
          `screenOverlays` below) rather than counter-rotated in place, which is
          what swung the panel off the left edge of a phone. Unrotated, they
          render here exactly as they always have. */}
      {!upright && screenOverlays}
      </Box>

      {/* Rotated portrait: the screen-oriented overlays live out here, in the
          untransformed viewport box, so a region panel can never swing off the
          edge of a phone. */}
      {upright && screenOverlays}

      {/* reset-to-fit control — appears only once the view has moved off the
          initial fit. Sits in the outer (untransformed) box so it stays put on
          screen regardless of the board's transform, tucked just inside the
          caller's overlay inset so the hand/dock never buries it. */}
      {zoom.active && (
        <Button
          size="xs"
          position="absolute"
          bottom={`${(fitInset?.bottom ?? 0) + 8}px`}
          left={`${(fitInset?.left ?? 0) + 8}px`}
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
