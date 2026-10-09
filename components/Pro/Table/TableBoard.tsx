/**
 * The tabletop board — same game, same socket, same rules, same handlers as
 * `ProBoard`, only laid down the way a real Unmatched board sits on a table
 * instead of drawn flat. Accepts the exact same `ProBoardProps` the flat
 * board does (imported, not re-declared) so a caller can swap between the two
 * with a plain ternary and nothing else changes — see `pages/pro/game.tsx`'s
 * `boardView` wiring.
 *
 * PHASE 1 SCOPE. This is a full interaction pass — select, legal-move/attack
 * highlights, move, attack, hover cues, relocate mode, item/passage/board-
 * object presence — not a demo. What it deliberately does NOT yet do, because
 * building a 3D-aware equivalent of each is real additional work beyond a
 * first pass, is enumerated where each prop is destructured below (search
 * "PHASE 1:") and summarized in the feature's report. None of the omissions
 * affect the legality of what a player can do — only how a few purely
 * cosmetic beats are (or aren't yet) animated.
 *
 * PHASE 2 additions (see the phase-2 report for the full before/after):
 * heavier perspective convergence and translucent zone fills (tableProjection
 * + TableSpace), a real standee silhouette with an in-plane base
 * (TableStandeeAnchor + TableFighterStandee), the auto-focus-zoom pick effect
 * (TableStage), `pendingMove` tweening, and LARGE (two-space) fighters' tail
 * token + connecting band (this file, reusing lib/pro/twoSpaceBand.ts exactly
 * as the flat board does).
 *
 * HYBRID REGIONS (unbrewed-p2p#922). A region's spaces (Baba Yaga's Hut) are
 * normalized to their OWN inset image, not the main board — excluded from
 * `mainSpaces`/`boardFighters` below (so the 3D board never tries to place
 * them) and drawn instead as the SAME floating 2D panel `ProBoard` uses
 * (`useRegionPanels`, extracted from it), positioned over this 3D frame by
 * `TableStage`'s `regionOverlay` slot. Previously (#914/#915) a region map
 * fell back to the entire flat board before this component ever mounted —
 * superseded: `resolveBoardView` now resolves `"table"` for these maps too.
 */
import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { useReducedMotion } from "framer-motion";
import type { FighterId, ProMapSpace, SpaceId, ViewFighter } from "@/lib/pro/protocol";
import {
  DEFAULT_TILT_DEG,
  BAND_LABEL_OVER_BADGES_PX,
  badgeLayerSlide,
  bandLabelLiftPx,
  eyeRaySlide,
  flatTokenTopPx,
  bandLabelTransform,
  bandLabelZIndex,
  standeeBaseDiameterPx,
} from "@/lib/pro/tableProjection";
import { nearestNeighbourPx } from "@/lib/pro/touchTargets";
import { useCoarsePointer } from "@/lib/pro/useCoarsePointer";
import { bandLabelText, bandMidpoint } from "@/lib/pro/twoSpaceBand";
import { MOVE_STEP_SECONDS, type ProBoardProps } from "@/components/Pro/ProBoard";
import { tokenInitials } from "@/components/Pro/FighterTokenPortrait";
import { SWAP_SECONDS, SWAP_TIMES } from "@/lib/pro/positionSwap";
import { LARGE_FIGURE_SCALE, straddleAnim, type Figure } from "@/lib/pro/figures";
import { boardObjectVisualFor } from "@/lib/pro/boardObjects";
import { useRegionPanels } from "@/components/Pro/RegionPanels";
import { DEFAULT_SPACE_DIAMETER, SEAT_COLOR } from "@/lib/pro/seatColors";
import { mapImageSrc } from "@/lib/pro/mapImage";
import {
  fighterStackBySpace,
  OBJECT_SCALE_BY_SHAPE,
  objectStackOffsets,
  SCALE_BY_SIZE,
  slotIn,
  stackOffsetInBoardUnits,
} from "@/lib/pro/tokenStack";
import {
  TableAnchorAnim,
  TableStandeeAnchor,
  type TableStackDepth,
} from "./TableStandeeAnchor";
import { TableStage } from "./TableStage";
import { TableBoardFx } from "./TableBoardFx";
import { TableBoardLines } from "./TableBoardLines";
import { TableSpace, TableSpaceBadge } from "./TableSpace";
import { EnclosureLayer } from "@/components/Pro/EnclosureLayer";
import { TableFighterStandee } from "./TableFighterStandee";
import { TOKEN_BADGE_PLATE_HEIGHT, TOKEN_THICKNESS } from "./TableFlatToken";
import { heroBadgesDeepestPx } from "./TableFighterBadges";
import { BADGE_PROBE_CHIP, BADGE_PROBE_FLAG, BADGE_PROBE_STATUS, useTableBadgeProbe } from "@/lib/pro/tableBadgeProbe";
import { useTableFigureProbe } from "@/lib/pro/tableFigureProbe";
import { TableFighterTail } from "./TableFighterTail";
import { TableSidekickToken } from "./TableSidekickToken";
import { TableBoardObject } from "./TableBoardObject";
import { TableMoveGhost } from "./TableMoveGhost";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import { useMinis3dDevParams, useMinis3dManifest } from "@/lib/pro/minis3d/useMinis3dSource";
import { TableFallenMini } from "./TableFallenMini";
import { toppleFor, useFallenMinis, type StandingMini } from "./useFallenMinis";
import { miniCuesFor, type TableStrike } from "./tableMiniCues";

// Dev-only measuring aid for scripts/visual-probe/tableMini3d (#931). The
// NODE_ENV check is a build-time constant, so a production build drops the
// import() and never emits the probe's chunk. (React.lazy, not next/dynamic:
// next/dynamic's runtime stayed in the tabletop chunk even with the branch gone.)
const TableMini3dProbe =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./TableMini3dProbe").then((m) => ({ default: m.TableMini3dProbe })))
    : null;

/**
 * ProBoard props this view does NOT draw yet, each for a stated reason. They
 * are cut out of `TableBoardProps` below and the component destructures every
 * prop that is left, then asserts nothing else remains (see `unread` in the
 * body) — so a prop ProBoard gains later fails `tsc` here until it is either
 * drawn or added to this list, instead of being dropped in silence (#871).
 *
 *  - `focusFighters` — the live-combat auto-zoom; TableStage re-focuses on
 *    PICKS only (see the note where the props are destructured).
 *  - `fighterTokenRim` — the cosmetic metal rim; decorative, it gates no
 *    legal action.
 *  - `tokenLife` — the #320 beta "lively tokens" layer (recoil / lunge /
 *    brace / breathing + the K.O. topple ghost). Its whole vocabulary is 2D
 *    transforms in % of a flat token CIRCLE (TokenLifeLayer); a tabletop piece
 *    is split into an in-plane ground token and an upright billboard under a
 *    3D tilt, so reusing it would slide the ground token through the board
 *    plane and bob the miniature off its base. It needs its own 3D-aware
 *    gesture pass. Off by default (opt-in beta flag), so nobody loses a beat
 *    they had.
 */
export type TableBoardDeferredProp = "focusFighters" | "fighterTokenRim" | "tokenLife";

/**
 * The flat board's props plus what only the tabletop draws. `fighterFigure`
 * resolves a hero's pre-rendered miniature for its seat (lib/pro/figures);
 * it is null for every hero on a deploy without local figures.
 */
export type TableBoardProps = Omit<ProBoardProps, TableBoardDeferredProp> & {
  fighterFigure?: (fighter: ViewFighter) => Figure | null;
  /** The 3D mini a fighter stands as (#945), already resolved for the
   *  viewer's figure style (#953, lib/pro/figures `pieceForStyle`): null for
   *  its sprite or token. Heroes only today; any fighter may have one (a
   *  sidekick needs only an answer here and a manifest entry). */
  fighterMini3d?: (fighter: ViewFighter) => Mini3d | null;
  /** see TableStage — moved out from under the tabletop HUD's side buttons */
  resetViewSpot?: { left: string; bottom: string };
  /** The combat strike beat that is playing (#962): 3D minis lunge, recoil
   *  and face each other on the combat panel's own clock. */
  fighterStrike?: TableStrike | null;
};

export const TableBoard = ({
  map,
  fighters,
  tokens = [],
  boardObjectArt,
  boardObjectOriginName,
  highlightedSpaces = [],
  chosenSpaces = [],
  highlightedFighters = [],
  // PHASE 1: `focusFighters` drives ProBoard's own mobile "zoom onto the
  // fighters that matter" effect (the live-combat case specifically — auto-
  // focus onto PICKS is now wired, see `pickKey` below and TableStage's own
  // effect). A manual pinch/pan reaches the combat-focus view; that one
  // narrower case is still deferred.
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
  // Hero-state flags and counters (Thetis's tide, druid form, …): drawn on
  // the hero's standee, as ProBoard draws them on the head token (#877).
  fighterTokenBadge,
  closedRegions = [],
  itemTokens = {},
  enclosures = null,
  pendingMove = null,
  onPendingMoveSettled,
  swaps = null,
  previewMove = null,
  // Combat beats and the damage-arc registry. Both arrive on every render
  // and were simply dropped by this view's first pass, which is why a hit
  // landed here in silence and an arc had no token to fly to.
  fx = [],
  fighterEls,
  onSpaceClick,
  onFighterClick,
  onSpaceHover,
  onFighterHover,
  moveHint = null,
  imgMaxH,
  zoomable = false,
  rotated = false,
  fitInset,
  collapseRegionInsets,
  fighterFigure,
  fighterMini3d,
  resetViewSpot,
  fighterStrike = null,
  // Whatever the caller spread in that this view deliberately doesn't draw
  // (TableBoardDeferredProp). Typed as the REST of TableBoardProps, so it is
  // `{}` exactly when every non-deferred prop is destructured above.
  ...unread
}: TableBoardProps) => {
  // Compile-time guard (#871): a ProBoard prop that is neither destructured
  // above nor listed in TableBoardDeferredProp lands in `unread`'s type and
  // makes this assignment fail. Runtime no-op.
  const _allPropsRead: Record<string, never> = unread;
  void _allPropsRead;
  const zoneColorMap = useMemo(() => new Map(map.zones.map((z) => [z.id, z.color])), [map.zones]);
  const zoneColor = (id: string) => zoneColorMap.get(id) ?? "#8878A0";
  const itemById = useMemo(() => new Map((map.items ?? []).map((it) => [it.id, it])), [map.items]);
  const reducedMotion = !!useReducedMotion();

  // Dev-only: every fighter wears every badge, for the occlusion probe.
  const badgeProbe = useTableBadgeProbe();
  // Dev-only: where the figure probe stands the one-space miniatures (#926).
  const figureProbe = useTableFigureProbe();
  // 3D minis (#945): which fighter stands as one is the caller's answer
  // (`fighterMini3d`, from the figure-style dropdown, #953). The URL carries
  // only dev tooling: the canvas density cap and the measuring probe.
  const minis3d = useMinis3dDevParams();
  const probeManifest = useMinis3dManifest(!!TableMini3dProbe && minis3d.probe);
  const mini3dOf = (f: ViewFighter) => fighterMini3d?.(f) ?? null;

  // A region's spaces are normalized to their OWN inset image, not the main
  // board (see the header comment) — excluded from `mainSpaces` here, then
  // drawn as the floating 2D panel `regionOverlay` renders below (#922).
  const regionIds = useMemo(() => new Set((map.regions ?? []).map((r) => r.id)), [map.regions]);
  const mainSpaces = useMemo(
    () => (regionIds.size ? map.spaces.filter((s) => !s.region || !regionIds.has(s.region)) : map.spaces),
    [map.spaces, regionIds]
  );
  const mainSpaceIds = useMemo(() => new Set(mainSpaces.map((s) => s.id)), [mainSpaces]);
  const spaceById = useMemo(() => new Map(mainSpaces.map((s) => [s.id, s])), [mainSpaces]);

  const highlightSet = useMemo(() => new Set(highlightedSpaces), [highlightedSpaces]);
  const highlightFighterSet = useMemo(() => new Set(highlightedFighters), [highlightedFighters]);
  const relocateSet = useMemo(() => new Set(relocateSpaces), [relocateSpaces]);
  const extendedReachSet = useMemo(() => new Set(extendedReachTargets), [extendedReachTargets]);
  const boughtRangeById = useMemo(() => new Map(boughtRangeTargets.map((t) => [t.id, t])), [boughtRangeTargets]);
  const friendlySet = useMemo(() => new Set(friendlyOwners), [friendlyOwners]);

  const diameterPct = (map.meta.spaceDiameter ?? DEFAULT_SPACE_DIAMETER) * 100;

  const attackSpaces = useMemo(() => {
    if (!attack) return null;
    const attackerSpace = fighters.find((f) => f.id === attack.attacker)?.space;
    const targetSpace = fighters.find((f) => f.id === attack.target)?.space;
    return attackerSpace && targetSpace ? { attackerSpace, targetSpace } : null;
  }, [attack, fighters]);

  const moveHintEdges = useMemo(
    () => (moveHint ?? []).map((h) => ({ from: h.from, to: h.to })),
    [moveHint]
  );

  // Fighters actually placeable in THIS view: on the board, and not inside a
  // (currently unsupported) region.
  const boardFighters = fighters.filter((f): f is ViewFighter & { space: SpaceId } => !!f.space && mainSpaceIds.has(f.space));
  const boardTokens = tokens.filter((t) => mainSpaceIds.has(t.space));

  // Defeat topple (#962): the ghosts of 3D minis that just left the board
  // defeated (never under reduced motion).
  const standingMinis = new Map<FighterId, StandingMini>();
  for (const f of boardFighters) {
    const m = !f.tailSpace || f.kind !== "HERO" ? mini3dOf(f) : null;
    if (m) standingMinis.set(f.id, { fighter: f, mini: m });
  }
  const fallen = useFallenMinis({ fighters, standing: standingMinis, attack, strike: fighterStrike, reducedMotion });

  // Shared spaces (protocol v28: up to 4 smalls + 1 non-small; corpses and
  // totems stack too). Laid out by the SAME lib/pro/tokenStack.ts helpers the
  // flat board uses, from the same occupant set (on-board, not defeated), so a
  // crowd lands on exactly the flat board's points.
  const fighterStack = fighterStackBySpace(fighters.filter((f) => f.space && !f.defeated));
  const objectsBySpace = new Map<string, typeof boardTokens>();
  for (const t of boardTokens) objectsBySpace.set(t.space, [...(objectsBySpace.get(t.space) ?? []), t]);

  /**
   * Where a piece on `space` stands: the flat board's stack offset (percent of
   * the token's own width, `tokenScale` × the space diameter wide) turned into
   * board units and added to the space centre. The frame size is needed because
   * that offset is in token WIDTHS while y is a fraction of the board's HEIGHT.
   * `stack` is set only on a SHARED space, so a lone piece renders as before.
   */
  const placeIn = (
    space: ProMapSpace,
    offset: { dx: number; dy: number },
    tokenScale: number,
    depth: TableStackDepth | undefined,
    frameW: number,
    frameH: number
  ) => {
    const aspect = frameW > 0 && frameH > 0 ? frameW / frameH : 1;
    const off = stackOffsetInBoardUnits(offset, (diameterPct / 100) * tokenScale, aspect);
    return { x: space.x + off.x, y: space.y + off.y, stack: depth };
  };
  /** A fighter segment's place plus its diameter (`spaceDiamPx` × the slot's
   *  scale relative to a normal token — a SMALL is drawn small, as on the flat
   *  board). `key` is `<id>` for a head, `<id>-tail` for a LARGE tail. */
  const fighterPlace = (
    space: ProMapSpace,
    key: string,
    spaceDiamPx: number,
    frameW: number,
    frameH: number,
    stack = fighterStack
  ) => {
    const slot = slotIn(stack, space.id, key);
    const shared = (stack.get(space.id)?.size ?? 0) > 1;
    // Each later slot lies one FULL token's thickness (+1px) higher than the
    // one before, so it tops whatever it overlaps (see TableStackDepth.liftPx).
    const liftPx = slot.order * (Math.round(standeeBaseDiameterPx(spaceDiamPx) * TOKEN_THICKNESS) + 1);
    const depth = shared ? { depthY: space.y, order: slot.order, liftPx } : undefined;
    return {
      ...placeIn(space, slot, slot.scale, depth, frameW, frameH),
      diamPx: spaceDiamPx * (slot.scale / SCALE_BY_SIZE.NORMAL),
    };
  };
  /** A board object's place: objects ring among themselves (the flat board's
   *  `objectStackOffsets`) and sort BEHIND every fighter on their space
   *  (negative order), as they draw below fighters there. */
  const objectPlace = (token: (typeof boardTokens)[number], space: ProMapSpace, frameW: number, frameH: number) => {
    const here = objectsBySpace.get(token.space) ?? [token];
    const i = Math.max(0, here.indexOf(token));
    const depth = here.length > 1 ? { depthY: space.y, order: i - here.length, liftPx: 0 } : undefined;
    const scale = OBJECT_SCALE_BY_SHAPE[boardObjectVisualFor(token).shape];
    return placeIn(space, objectStackOffsets(here.length)[i], scale, depth, frameW, frameH);
  };

  // The damage-arc registry (useGameFx looks a defender up here to know where
  // on screen to land a hit). Same rule as the flat board: every fighter's
  // HEAD registers, hero or sidekick (#877 — sidekicks were missed).
  const registerFighterEl = (id: FighterId) =>
    fighterEls
      ? (el: HTMLElement | null) => {
          if (el) fighterEls.current.set(id, el);
          else fighterEls.current.delete(id);
        }
      : undefined;

  const fighterProps = (f: ViewFighter & { space: SpaceId }) => {
    const isSelected = f.id === selectedFighter;
    const isTarget = highlightFighterSet.has(f.id);
    const isFriendly = friendlySet.has(f.owner);
    const isExtendedReachTarget = isTarget && extendedReachSet.has(f.id);
    const boughtRange = isTarget ? (boughtRangeById.get(f.id) ?? null) : null;
    const stepsInAsDefender = defenderStepIn?.fighterId === f.id;
    const spaceHighlighted = highlightSet.has(f.space) && !!onSpaceClick;
    const chipText = stepsInAsDefender ? defenderStepIn!.chip : boughtRange ? boughtRange.chip : null;
    return {
      selected: isSelected,
      targetable: isTarget,
      friendly: isFriendly,
      extendedReach: isExtendedReachTarget || badgeProbe,
      chipText: chipText ?? (badgeProbe ? BADGE_PROBE_CHIP : null),
      badgeNumber: fighterBadges[f.id] ?? (badgeProbe ? 1 : undefined),
      onClick: onFighterClick,
      onSpaceFallbackClick: spaceHighlighted ? () => onSpaceClick!(f.space) : undefined,
      onHoverChange: onFighterHover,
    };
  };

  // v6 two-space (LARGE) fighters (phase-1 deferred item: "only the head
  // renders today"). `space` is the head, `tailSpace` the second body space —
  // same convention ProBoard reads, reusing the SAME lib/pro/twoSpaceBand.ts
  // logic it does for the band's own midpoint + label text, per the report.
  const twoSpaceFighters = boardFighters.filter((f) => f.tailSpace && mainSpaceIds.has(f.tailSpace));
  const twoSpaceBands = twoSpaceFighters.map((f) => ({
    head: f.space,
    tail: f.tailSpace as SpaceId,
    color: SEAT_COLOR[f.owner] ?? "#999",
  }));

  // `pendingMove` tweening (phase-1 deferred item: fighters teleported
  // between spaces). Converts a committed move's node-by-node SpaceId path
  // into normalized 0–1 x/y keyframes TableStandeeAnchor can hand straight to
  // framer-motion — the same idea as ProBoard's own `routeAnim`, simplified
  // because this view never crosses a region-inset frame boundary (regions
  // are refused outright below). `null` under reduced motion: the caller's
  // own `usePendingMoveTimeout` fallback still clears `pendingMove` on
  // schedule either way, so skipping the tween here never strands the state.
  const routeAnim = (route: SpaceId[] | null | undefined): TableAnchorAnim | null => {
    if (!route || reducedMotion) return null;
    const nodes = route.map((id) => spaceById.get(id)).filter((s): s is ProMapSpace => !!s);
    if (nodes.length < 2) return null;
    return {
      xs: nodes.map((n) => n.x),
      ys: nodes.map((n) => n.y),
      durationSec: (nodes.length - 1) * MOVE_STEP_SECONDS,
    };
  };
  // Each hero's miniature, resolved once per render (null = token standee).
  // A LARGE hero WITH a miniature STRADDLES its two spaces, as a big figure
  // does on a real table: the figure stands at their midpoint and each space
  // keeps its own base disc. Before this, the figure stood on the head space
  // and the tail kept its upright disc and name band beside it — which read as
  // "the figure is off its space, next to a cut-off circle" (owner, 2026-09-23).
  const figureOf = new Map(
    boardFighters.map((f) => [f.id, f.kind === "HERO" ? fighterFigure?.(f) ?? null : null] as const)
  );
  const straddles = (f: ViewFighter) =>
    !!figureOf.get(f.id) && !!f.tailSpace && mainSpaceIds.has(f.tailSpace);

  const pendingHeadAnim = pendingMove ? routeAnim(pendingMove.path) : null;
  const pendingTailAnim = pendingMove ? routeAnim(pendingMove.trailPath) : null;
  // One settle per move — the HEAD segment owns it, exactly like ProBoard,
  // so a two-space body's tail tween can't clear pendingMove out from under
  // the head's own (possibly still-running) animation.
  // The stack as it stood BEFORE a relocation, rebuilt by putting each moved
  // fighter back where it came from: a piece that shared a space left from
  // its ring slot there, not from the centre (on top of the other piece).
  const stackBefore = (from: Map<FighterId, { space: SpaceId; tailSpace?: SpaceId | null }>) =>
    fighterStackBySpace(
      fighters.filter((f) => f.space && !f.defeated).map((f) => (from.has(f.id) ? { ...f, ...from.get(f.id) } : f))
    );
  const moveStack = pendingMove
    ? stackBefore(
        new Map([
          [
            pendingMove.fighterId,
            { space: pendingMove.path[0], ...(pendingMove.trailPath?.length ? { tailSpace: pendingMove.trailPath[0] } : {}) },
          ],
        ])
      )
    : fighterStack;
  /** Where a segment stood before the relocation: its slot in `stack` on `spaceId`. */
  const placeBefore = (
    stack: typeof fighterStack,
    spaceId: SpaceId | undefined,
    key: string,
    frameW: number,
    frameH: number
  ) => {
    const space = spaceId ? spaceById.get(spaceId) : undefined;
    return space ? fighterPlace(space, key, 0, frameW, frameH, stack) : undefined;
  };

  // A route tweens through space CENTRES; its ends are moved onto the piece's
  // stack slots — the first onto the slot it left (see `stackBefore`), the
  // last onto the slot it lands in (`at`) — so it neither jumps to the centre
  // when it sets off nor when it settles.
  const animFor = (
    fighterId: FighterId,
    segment: "head" | "tail",
    at: { x: number; y: number },
    frameW: number,
    frameH: number
  ): TableAnchorAnim | null => {
    if (!pendingMove || pendingMove.fighterId !== fighterId) return null;
    const anim = segment === "head" ? pendingHeadAnim : pendingTailAnim;
    if (!anim) return null;
    const route = segment === "head" ? pendingMove.path : pendingMove.trailPath;
    const key = segment === "head" ? fighterId : `${fighterId}-tail`;
    const start = placeBefore(moveStack, route?.[0], key, frameW, frameH) ?? { x: anim.xs[0], y: anim.ys[0] };
    return {
      ...anim,
      xs: [start.x, ...anim.xs.slice(1, -1), at.x],
      ys: [start.y, ...anim.ys.slice(1, -1), at.y],
    };
  };

  // Atomic position swaps (protocol v31) — ProBoard's crossfade on the table.
  // A swap has no route to walk, so the piece fades out at the pose it held
  // BEFORE the swap, jumps while invisible and fades back in where it landed:
  // a teleport, never mistakable for a walk. A committed move tween on the same
  // piece wins (as on the flat board), reduced motion just snaps, and a swap
  // never settles `pendingMove` (it isn't one). A straddling LARGE miniature
  // fades between the midpoints of its two poses.
  const swapByFighter = new Map((swaps ?? []).map((sw) => [sw.fighterId, sw]));
  const swapStack = swapByFighter.size
    ? stackBefore(new Map([...swapByFighter].map(([id, sw]) => [id, { space: sw.from, tailSpace: sw.fromTail ?? null }])))
    : fighterStack;
  const swapAnim = (
    from: { x: number; y: number } | undefined,
    to: { x: number; y: number }
  ): TableAnchorAnim | null =>
    from && !reducedMotion
      ? {
          xs: [from.x, from.x, to.x, to.x],
          ys: [from.y, from.y, to.y, to.y],
          times: SWAP_TIMES,
          opacity: [1, 0, 0, 1],
          durationSec: SWAP_SECONDS,
        }
      : null;
  // A head or tail fades out at the ring SLOT it held before the swap (see
  // `stackBefore`); a straddling figure between its two old space centres.
  const swapFor = (
    f: ViewFighter,
    segment: "head" | "tail" | "stand",
    to: { x: number; y: number },
    frameW: number,
    frameH: number
  ) => {
    const sw = swapByFighter.get(f.id);
    if (!sw) return null;
    const fromHead = spaceById.get(sw.from);
    const fromTail = spaceById.get(sw.fromTail ?? sw.from);
    const from =
      segment === "head"
        ? placeBefore(swapStack, sw.from, f.id, frameW, frameH)
        : segment === "tail"
          ? placeBefore(swapStack, sw.fromTail ?? sw.from, `${f.id}-tail`, frameW, frameH)
          : fromHead && fromTail
            ? bandMidpoint(fromHead, fromTail)
            : undefined;
    return swapAnim(from, to);
  };

  // Walk / effect-move preview (issue #285's ghost, #871 on this board): the
  // stepping fighter's route so far and a translucent ghost where it ends now.
  // Same rules as ProBoard — the real piece stays put, the whole path must
  // resolve (a path through a missing space draws nothing), and a LARGE body
  // also ghosts its trailing space. PRESENTATION ONLY and inert.
  const preview = (() => {
    if (!previewMove) return null;
    const f = fighters.find((x) => x.id === previewMove.fighterId);
    const nodes = previewMove.path.map((id) => spaceById.get(id));
    if (!f || nodes.length < 2 || !nodes.every((n): n is ProMapSpace => !!n)) return null;
    const lead = nodes[nodes.length - 1] as ProMapSpace;
    const trailId = previewMove.trailPath?.[previewMove.trailPath.length - 1] ?? null;
    const trail = trailId ? (spaceById.get(trailId) ?? null) : null;
    return {
      fighterId: f.id,
      path: previewMove.path,
      lead,
      trail,
      color: SEAT_COLOR[f.owner] ?? "#999",
      initials: tokenInitials(f.name),
      isHero: f.kind === "HERO",
    };
  })();

  // Fault #4 (phase-2 report): re-run the auto-focus-zoom effect whenever the
  // set of currently-pickable spaces/fighters changes — same key shape as
  // ProBoard's own `pickKey`.
  // Touch hit circles (#873): distance, in board-plane px, from each pick to
  // its nearest other pick — TableSpace never pads a hit circle past it, so
  // two close gold spaces can't swallow each other's taps. Mirrors ProBoard's
  // `mainPickCaps`, including a target fighter counting at its space(s).
  // Built once per frame size: the stage's render prop asks per space.
  const coarsePointer = useCoarsePointer();
  const hitCapsBySize = new Map<string, Map<SpaceId, number>>();
  const pickHitCaps = (frameW: number, frameH: number): Map<SpaceId, number> => {
    const key = `${frameW}x${frameH}`;
    const cached = hitCapsBySize.get(key);
    if (cached) return cached;
    const caps = new Map<SpaceId, number>();
    hitCapsBySize.set(key, caps);
    if (!coarsePointer) return caps;
    const pickIds = new Set<SpaceId>([
      ...(relocateArmed ? relocateSpaces : [...highlightedSpaces, ...relocateSpaces]),
      ...boardFighters
        .filter((f) => highlightFighterSet.has(f.id))
        .flatMap((f) => [f.space, f.tailSpace].filter((id): id is SpaceId => !!id)),
    ]);
    const picks = mainSpaces.filter((sp) => pickIds.has(sp.id));
    const points = picks.map((sp) => ({ x: sp.x * frameW, y: sp.y * frameH }));
    picks.forEach((sp, i) => caps.set(sp.id, nearestNeighbourPx(points, i)));
    return caps;
  };

  // Where each on-board fighter stands (its head slot), per frame size — the
  // 3D minis' combat facing reads it (#962).
  const positionsBySize = new Map<string, Map<FighterId, { x: number; y: number }>>();
  const fighterPositions = (frameW: number, frameH: number) => {
    const key = `${frameW}x${frameH}`;
    let m = positionsBySize.get(key);
    if (!m) {
      m = new Map();
      for (const f of boardFighters) {
        const sp = spaceById.get(f.space);
        if (sp) m.set(f.id, fighterPlace(sp, f.id, 0, frameW, frameH));
      }
      positionsBySize.set(key, m);
    }
    return m;
  };
  const miniMotion = (f: ViewFighter & { space: SpaceId }, common: { selected: boolean; targetable: boolean }, frameW: number, frameH: number) =>
    miniCuesFor({
      fighter: f,
      selected: common.selected,
      targetable: common.targetable,
      attack,
      strike: fighterStrike,
      positions: fighterPositions(frameW, frameH),
      fx,
    });

  const pickKey = `${highlightedSpaces.join(",")}|${relocateSpaces.join(",")}|${highlightedFighters.join(",")}`;

  // Baba Yaga's Hut, hybrid (unbrewed-p2p#922): a region's own spaces render
  // as the SAME 2D inset panel `ProBoard` uses (useRegionPanels, extracted
  // from it) floating over the 3D main board below. `frameRef`/`framePx` mirror
  // ProBoard's own measuring pattern, on a wrapper TableStage renders inside
  // its zoom/pan frame but OUTSIDE the 3D tilt (see TableStage's `regionOverlay`).
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [framePx, setFramePx] = useState(0);
  useEffect(() => {
    const f = frameRef.current;
    if (!f || typeof ResizeObserver === "undefined") return;
    const apply = () => setFramePx((prev) => (prev === f.offsetWidth ? prev : f.offsetWidth));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(f);
    return () => ro.disconnect();
  }, []);
  const { screenOverlays: regionOverlay } = useRegionPanels({
    map,
    fighters,
    tokens,
    boardObjectArt,
    boardObjectOriginName,
    highlightedSpaces,
    chosenSpaces,
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
    fighterEls,
    collapseRegionInsets,
    frameRef,
    framePx,
  });

  return (
    <TableStage
      imageUrl={mapImageSrc(map.meta)}
      imageAlt={map.meta.title}
      imgMaxH={imgMaxH}
      zoomable={zoomable}
      rotated={rotated}
      fitInset={fitInset}
      tiltDeg={DEFAULT_TILT_DEG}
      pickKey={pickKey}
      resetViewSpot={resetViewSpot}
      regionOverlay={regionOverlay}
      regionFrameRef={frameRef}
    >
      {({ frameW, frameH, tiltDeg, yawDeg, perspectiveRatio, screenScale }) => (
        <>
          <TableBoardLines
            spaces={mainSpaces}
            frameW={frameW}
            frameH={frameH}
            attack={attackSpaces}
            moveHintEdges={moveHintEdges}
            twoSpaceBands={twoSpaceBands}
            previewRoute={
              preview ? { path: preview.path, trail: preview.trail?.id ?? null, color: preview.color } : null
            }
          />

          {mainSpaces.map((space: ProMapSpace) => (
            <TableSpace
              key={space.id}
              space={space}
              zoneColor={zoneColor}
              diameterPct={diameterPct}
              frameW={frameW}
              highlighted={highlightSet.has(space.id)}
              chosenOrder={chosenSpaces.indexOf(space.id) + 1 || undefined}
              relocateOrigin={relocateSet.has(space.id)}
              relocateArmed={relocateArmed}
              coarsePointer={coarsePointer}
              hitCapPx={pickHitCaps(frameW, frameH).get(space.id)}
              onClick={onSpaceClick}
              onHoverChange={onSpaceHover}
            />
          ))}

          {enclosures && (
            <EnclosureLayer enclosures={enclosures} spaces={mainSpaces} diam={diameterPct / 100} framePx={frameW} layoutH={frameH} />
          )}

          {/* Item / passage badges: their own layer, beside each disc, so a
              badge is inspectable without committing the space (#873).
              Item badges are driven STRICTLY off live server state
              (itemTokens), never off the static map.items/space.item —
              matching ProBoard's own rule (protocol v17): a badge exists
              exactly while its space is in this map. */}
          {mainSpaces.map((space: ProMapSpace) => {
            const liveItemId = itemTokens[space.id];
            return (
              <TableSpaceBadge
                key={`${space.id}-badge`}
                space={space}
                diameterPct={diameterPct}
                frameW={frameW}
                item={liveItemId ? (itemById.get(liveItemId) ?? null) : null}
                passage={!!space.passage}
              />
            );
          })}

          {boardTokens.map((token) => {
            const space = spaceById.get(token.space);
            if (!space) return null;
            const diamPx = (diameterPct / 100) * Math.max(frameW, 1);
            const place = objectPlace(token, space, frameW, frameH);
            return (
              <TableBoardObject
                key={token.id}
                token={token}
                x={place.x}
                y={place.y}
                stack={place.stack}
                tiltDeg={tiltDeg}
                diamPx={diamPx}
                playerColor={SEAT_COLOR[token.owner] ?? "#999"}
                artUrl={boardObjectArt?.(token)}
                originName={boardObjectOriginName?.(token)}
              />
            );
          })}

          {boardFighters.map((f) => {
            const space = spaceById.get(f.space)!;
            const head = fighterPlace(space, f.id, (diameterPct / 100) * Math.max(frameW, 1), frameW, frameH);
            const common = fighterProps(f);
            const headAnim = animFor(f.id, "head", head, frameW, frameH);
            const straddling = straddles(f);
            const tailSpace = straddling ? spaceById.get(f.tailSpace as SpaceId)! : null;
            const probed = !tailSpace && f.kind === "HERO" && !!figureOf.get(f.id) ? figureProbe : null;
            const stand = probed ?? (tailSpace ? bandMidpoint(space, tailSpace) : head);
            const standAnim = tailSpace
              ? straddleAnim(
                  headAnim,
                  animFor(f.id, "tail", fighterPlace(tailSpace, `${f.id}-tail`, 0, frameW, frameH), frameW, frameH)
                )
              : headAnim;
            // A swap plays only where no move tween does (see `swapFor`).
            const headSwap = headAnim ? null : swapFor(f, "head", head, frameW, frameH);
            const standSwap = standAnim ? null : swapFor(f, straddling ? "stand" : "head", stand, frameW, frameH);
            return f.kind === "HERO" ? (
              <Fragment key={f.id}>
                {straddling && (
                  // The head space's own base. It carries the head's tween and
                  // settles the move (the head owns the settle, as below), so a
                  // move the straddling figure cannot follow still completes.
                  <TableStandeeAnchor
                    x={head.x}
                    y={head.y}
                    stack={head.stack}
                    tiltDeg={tiltDeg}
                    widthPx={0}
                    heightPx={0}
                    spaceDiamPx={head.diamPx}
                    spaceId={f.space}
                    baseAccent={SEAT_COLOR[f.owner] ?? "#999"}
                    anim={headAnim ?? headSwap}
                    onAnimComplete={headAnim ? onPendingMoveSettled : undefined}
                    // This base is the head space's tap target, like a
                    // one-space figure's own base (#873) — and, like the tail
                    // and the flat board's head, it reports hover (#895).
                    pick={common.targetable && !!common.onClick}
                    onClick={
                      common.targetable && common.onClick ? () => common.onClick!(f.id) : common.onSpaceFallbackClick
                    }
                    onMouseEnter={common.onHoverChange ? () => common.onHoverChange!(f.id) : undefined}
                    onMouseLeave={common.onHoverChange ? () => common.onHoverChange!(null) : undefined}
                  >
                    {null}
                  </TableStandeeAnchor>
                )}
                <TableFighterStandee
                  fighter={badgeProbe ? { ...f, statuses: [...(f.statuses ?? []), BADGE_PROBE_STATUS] } : f}
                  x={stand.x}
                  y={stand.y}
                  stack={straddling || probed ? undefined : head.stack}
                  tiltDeg={tiltDeg}
                  diamPx={head.diamPx}
                  playerColor={SEAT_COLOR[f.owner] ?? "#999"}
                  artUrl={fighterTokenArt?.(f)}
                  figure={figureOf.get(f.id) ?? null}
                  figureScale={straddling ? LARGE_FIGURE_SCALE : 1}
                  baseHidden={straddling}
                  spacePicksLive={highlightSet.size > 0 || relocateSet.size > 0}
                  anim={standAnim ?? standSwap}
                  onAnimComplete={standAnim && !straddling ? onPendingMoveSettled : undefined}
                  badge={fighterTokenBadge?.(f) ?? (badgeProbe ? BADGE_PROBE_FLAG : null)}
                  frameW={frameW}
                  frameH={frameH}
                  // A straddling LARGE figure keeps its sprite (for now).
                  mini3d={straddling ? null : mini3dOf(f)}
                  rig={{ frameW, frameH, tiltDeg, yawDeg, perspectiveRatio, screenScale }}
                  mini3dMaxPixelRatio={minis3d.maxPixelRatio}
                  mini3dMotion={miniMotion(f, common, frameW, frameH)}
                  innerRef={registerFighterEl(f.id)}
                  {...common}
                />
              </Fragment>
            ) : (
              <TableSidekickToken
                key={f.id}
                fighter={f}
                x={head.x}
                y={head.y}
                stack={head.stack}
                tiltDeg={tiltDeg}
                diamPx={head.diamPx}
                artUrl={fighterTokenArt?.(f)}
                playerColor={SEAT_COLOR[f.owner] ?? "#999"}
                selected={common.selected}
                targetable={common.targetable}
                friendly={common.friendly}
                extendedReach={common.extendedReach}
                badgeNumber={common.badgeNumber}
                chipText={common.chipText}
                anim={headAnim ?? headSwap}
                onAnimComplete={headAnim ? onPendingMoveSettled : undefined}
                onClick={common.onClick}
                onSpaceFallbackClick={common.onSpaceFallbackClick}
                onHoverChange={common.onHoverChange}
                innerRef={registerFighterEl(f.id)}
                frameW={frameW}
                frameH={frameH}
                // Tokens unless `fighterMini3d` names a mini for this sidekick.
                mini3d={mini3dOf(f)}
                rig={{ frameW, frameH, tiltDeg, yawDeg, perspectiveRatio, screenScale }}
                mini3dMaxPixelRatio={minis3d.maxPixelRatio}
                mini3dMotion={miniMotion(f, common, frameW, frameH)}
                spacePicksLive={highlightSet.size > 0 || relocateSet.size > 0}
              />
            );
          })}

          {fallen.map((x) => {
            const space = spaceById.get(x.fighter.space);
            if (!space) return null;
            const at = fighterPlace(space, x.fighter.id, (diameterPct / 100) * Math.max(frameW, 1), frameW, frameH);
            return (
              <TableFallenMini
                key={x.key}
                fighterId={x.fighter.id}
                topple={toppleFor(x, fighterStrike)}
                mini={x.mini}
                rig={{ frameW, frameH, tiltDeg, yawDeg, perspectiveRatio, screenScale }}
                x={at.x}
                y={at.y}
                diamPx={at.diamPx}
                faceToward={x.foe ? (fighterPositions(frameW, frameH).get(x.foe) ?? null) : null}
                maxPixelRatio={minis3d.maxPixelRatio}
              />
            );
          })}

          {TableMini3dProbe && minis3d.probe && (
            <Suspense fallback={null}>
              <TableMini3dProbe
                spaceById={spaceById}
                spaceDiamPx={(diameterPct / 100) * Math.max(frameW, 1)}
                rig={{ frameW, frameH, tiltDeg, yawDeg, perspectiveRatio, screenScale }}
                manifest={probeManifest}
                lod={minis3d.lod}
                maxPixelRatio={minis3d.maxPixelRatio}
              />
            </Suspense>
          )}

          {/* LARGE (two-space) fighters' trailing body (phase-1 deferred item)
              + the identity label at the band's own midpoint, reusing
              lib/pro/twoSpaceBand.ts exactly as ProBoard does. The label
              billboards to face the camera (same `standeeTransform` a
              standee uses) and stands on its foot at the midpoint between
              the two spaces, lifted just clear of the band's tokens (#899) —
              it has no base of its own. */}
          {twoSpaceFighters.map((f) => {
            const tailSpace = spaceById.get(f.tailSpace as SpaceId);
            if (!tailSpace) return null;
            const tail = fighterPlace(tailSpace, `${f.id}-tail`, (diameterPct / 100) * Math.max(frameW, 1), frameW, frameH);
            const color = SEAT_COLOR[f.owner] ?? "#999";
            const tailAnim = animFor(f.id, "tail", tail, frameW, frameH);
            const headSpace = spaceById.get(f.space)!;
            const mid = bandMidpoint(headSpace, tailSpace);
            // The pill stands above the TALLER end: a flat token's own
            // thickness plus whatever a shared space lifted it by (#899).
            const head = fighterPlace(headSpace, f.id, (diameterPct / 100) * Math.max(frameW, 1), frameW, frameH);
            const tokenTopPx = flatTokenTopPx(
              standeeBaseDiameterPx(tail.diamPx),
              Math.max(head.stack?.liftPx ?? 0, tail.stack?.liftPx ?? 0)
            );
            // The head token's badges slide toward the camera to clear it
            // (#902); the pill slides further, so where they overlap it is
            // still the pill that reads — by depth, like everything here.
            // Bounded by the deepest the head's badges can ever hang.
            const headTokenPx = standeeBaseDiameterPx(head.diamPx);
            const headBadgesForwardPx = badgeLayerSlide({
              x: head.x,
              y: head.y,
              frameW,
              frameH,
              tiltDeg,
              plateScale: 1,
              tokenTopPx: flatTokenTopPx(headTokenPx, head.stack?.liftPx ?? 0),
              lowestPx: heroBadgesDeepestPx(headTokenPx * TOKEN_BADGE_PLATE_HEIGHT),
            }).forwardPx;
            const pillSlide = eyeRaySlide({
              x: mid.x,
              y: mid.y,
              frameW,
              frameH,
              tiltDeg,
              plateScale: 1,
              forwardPx: headBadgesForwardPx + BAND_LABEL_OVER_BADGES_PX,
            });
            return (
              <Fragment key={`${f.id}-band`}>
                <TableFighterTail
                  fighter={f}
                  x={tail.x}
                  y={tail.y}
                  stack={tail.stack}
                  tiltDeg={tiltDeg}
                  diamPx={tail.diamPx}
                  playerColor={color}
                  selected={f.id === selectedFighter}
                  targetable={highlightFighterSet.has(f.id)}
                  // No onAnimComplete: the HEAD segment alone owns the settle
                  // (see `animFor`) — a second, late settle from the tail would
                  // clear a new incoming move that landed in between.
                  anim={tailAnim ?? swapFor(f, "tail", tail, frameW, frameH)}
                  onClick={onFighterClick}
                  // The tail's face covers its own space, so when that space
                  // is a pick the tap commits it — ProBoard's fallback (#873).
                  onSpaceFallbackClick={
                    highlightSet.has(tailSpace.id) && onSpaceClick ? () => onSpaceClick(tailSpace.id) : undefined
                  }
                  onHoverChange={onFighterHover}
                  bodyHidden={straddles(f)}
                />
                {!straddles(f) && (
                  <Flex
                    position="absolute"
                    left={`${mid.x * 100}%`}
                    top={`${mid.y * 100}%`}
                    align="center"
                    justify="center"
                    pointerEvents="none"
                    bg="brand.surfaceDim"
                    color="brand.parchment"
                    border={`1.5px solid ${color}`}
                    borderRadius="999px"
                    px="0.4em"
                    fontSize="0.62rem"
                    fontWeight="bold"
                    whiteSpace="nowrap"
                    boxShadow="0 1px 3px rgba(0,0,0,0.75)"
                    // The plane is preserve-3d, so it is DEPTH that puts the
                    // pill over both band ends, not z-index (#899): it stands
                    // on its foot, lifted clear of the tokens' tops — see
                    // bandLabelLiftPx. The z-index only orders it for a
                    // browser that flattens the plane. Still
                    // pointer-events:none: a pick space under it gets the tap.
                    zIndex={bandLabelZIndex(headSpace.y, tailSpace.y)}
                    data-band-label={f.id}
                    style={{
                      transform: `${bandLabelTransform(tiltDeg, bandLabelLiftPx(tokenTopPx))} ${pillSlide.transform}`.trim(),
                      transformOrigin: "50% 100%",
                    }}
                  >
                    {bandLabelText(f.name)}
                  </Flex>
                )}
              </Fragment>
            );
          })}

          {preview &&
            [
              { at: preview.lead, end: "lead" as const },
              ...(preview.trail ? [{ at: preview.trail, end: "trail" as const }] : []),
            ].map(({ at, end }) => (
              <TableMoveGhost
                key={`preview-${end}`}
                fighterId={preview.fighterId}
                end={end}
                x={at.x}
                y={at.y}
                spaceId={at.id}
                tiltDeg={tiltDeg}
                diamPx={(diameterPct / 100) * Math.max(frameW, 1)}
                color={preview.color}
                initials={preview.initials}
                isHero={preview.isHero}
              />
            ))}

          <TableBoardFx
            fx={fx}
            spaces={mainSpaces}
            diamPct={diameterPct * 1.5}
            tiltDeg={tiltDeg}
            reducedMotion={reducedMotion}
          />
        </>
      )}
    </TableStage>
  );
};
