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
 * Regions (Baba Yaga's Hut) are the one exception with a rules-visible
 * effect: a region's spaces are normalized to the REGION image, not the main
 * board, so this view — like the piece below that filters them out — cannot
 * place them correctly without also building the inset-panel equivalent
 * (deferred). Rather than silently render such a map with pieces missing
 * (what phase 1 did), this view REFUSES it outright (phase-2 report) with an
 * English message pointing at the flat board, which plays it correctly.
 *
 * PHASE 2 additions (see the phase-2 report for the full before/after):
 * heavier perspective convergence and translucent zone fills (tableProjection
 * + TableSpace), a real standee silhouette with an in-plane base
 * (TableStandeeAnchor + TableFighterStandee), the auto-focus-zoom pick effect
 * (TableStage), `pendingMove` tweening, and LARGE (two-space) fighters' tail
 * token + connecting band (this file, reusing lib/pro/twoSpaceBand.ts exactly
 * as the flat board does).
 */
import { Fragment, useMemo } from "react";
import { Flex, Text } from "@chakra-ui/react";
import { useReducedMotion } from "framer-motion";
import type { FighterId, ProMapSpace, SpaceId, ViewFighter } from "@/lib/pro/protocol";
import { DEFAULT_TILT_DEG, bandLabelZIndex } from "@/lib/pro/tableProjection";
import { bandLabelText, bandMidpoint } from "@/lib/pro/twoSpaceBand";
import { MOVE_STEP_SECONDS, type ProBoardProps } from "@/components/Pro/ProBoard";
import { LARGE_FIGURE_SCALE, straddleAnim, type Figure } from "@/lib/pro/figures";
import { TableAnchorAnim, TableStandeeAnchor, tableBillboardTransform } from "./TableStandeeAnchor";
import { TableStage } from "./TableStage";
import { TableBoardFx } from "./TableBoardFx";
import { TableBoardLines } from "./TableBoardLines";
import { TableSpace } from "./TableSpace";
import { TableFighterStandee } from "./TableFighterStandee";
import { TableFighterTail } from "./TableFighterTail";
import { TableSidekickToken } from "./TableSidekickToken";
import { TableBoardObject } from "./TableBoardObject";

/** Mirrors ProBoard's own `DEFAULT_DIAMETER` (not exported there — see the
 *  table-board report for why this is a deliberate small duplication rather
 *  than an edit to the flat board). Keep the two numbers in sync. */
const DEFAULT_DIAMETER = 0.021;

/** Mirrors ProBoard's own PLAYER_COLOR (same values, same reason as above). */
const PLAYER_COLOR: Record<string, string> = {
  p1: "#E0A82E",
  p2: "#3B8BEB",
  p3: "#2F9E68",
  p4: "#C0449E",
};

/**
 * The flat board's props plus what only the tabletop draws. `fighterFigure`
 * resolves a hero's pre-rendered miniature for its seat (lib/pro/figures);
 * it is null for every hero on a deploy without local figures.
 */
export type TableBoardProps = ProBoardProps & {
  fighterFigure?: (fighter: ViewFighter) => Figure | null;
  /** see TableStage — moved out from under the tabletop HUD's side buttons */
  resetViewSpot?: { left: string; bottom: string };
};

export const TableBoard = ({
  map,
  fighters,
  tokens = [],
  boardObjectArt,
  boardObjectOriginName,
  highlightedSpaces = [],
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
  // PHASE 1: `fighterTokenBadge` (hero-state flags like tide/druid form) and
  // `fighterTokenRim` (the cosmetic metal rim) are deferred — both are
  // purely decorative and neither gates a legal action.
  closedRegions: _closedRegions,
  itemTokens = {},
  pendingMove = null,
  onPendingMoveSettled,
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
  fighterFigure,
  resetViewSpot,
}: TableBoardProps) => {
  const zoneColorMap = useMemo(() => new Map(map.zones.map((z) => [z.id, z.color])), [map.zones]);
  const zoneColor = (id: string) => zoneColorMap.get(id) ?? "#8878A0";
  const itemById = useMemo(() => new Map((map.items ?? []).map((it) => [it.id, it])), [map.items]);
  const reducedMotion = !!useReducedMotion();

  // Regions are normalized to their OWN inset image, not the main board (see
  // the header comment). Phase 1 silently filtered their spaces out of
  // `mainSpaces` below, which is how a Baba Yaga's Hut map ended up playable
  // here with pieces missing. Phase 2 refuses the whole view instead — see
  // the early return after every hook, once `hasRegions` is known.
  const regionIds = useMemo(() => new Set((map.regions ?? []).map((r) => r.id)), [map.regions]);
  const hasRegions = regionIds.size > 0;
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

  const diameterPct = (map.meta.spaceDiameter ?? DEFAULT_DIAMETER) * 100;

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
      extendedReach: isExtendedReachTarget,
      chipText,
      badgeNumber: fighterBadges[f.id],
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
    color: PLAYER_COLOR[f.owner] ?? "#999",
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
  const animFor = (fighterId: FighterId, segment: "head" | "tail"): TableAnchorAnim | null => {
    if (!pendingMove || pendingMove.fighterId !== fighterId) return null;
    return segment === "head" ? pendingHeadAnim : pendingTailAnim;
  };

  // Fault #4 (phase-2 report): re-run the auto-focus-zoom effect whenever the
  // set of currently-pickable spaces/fighters changes — same key shape as
  // ProBoard's own `pickKey`.
  const pickKey = `${highlightedSpaces.join(",")}|${relocateSpaces.join(",")}|${highlightedFighters.join(",")}`;

  // Regions refusal (phase-2 report, deferred item "Regions"): rather than
  // silently drop a Hut's pieces off the board (phase 1's behaviour), refuse
  // the whole tabletop view for a map that has one, in plain English, pointed
  // at the view that DOES play it correctly. This runs after every hook
  // above so the hook order never changes between a normal map and this one.
  if (hasRegions) {
    return (
      <Flex direction="column" align="center" justify="center" h="100%" p="2rem" gap="0.75rem" textAlign="center">
        <Text fontFamily="BebasNeueRegular" fontSize="1.4rem" color="brand.parchment">
          This map isn&rsquo;t ready for the tabletop view yet
        </Text>
        <Text fontSize="0.9rem" maxW="28rem" color="brand.parchment" opacity={0.8}>
          &ldquo;{map.meta.title}&rdquo; uses a region (like Baba Yaga&rsquo;s Hut) that the tabletop view can&rsquo;t
          place correctly yet — its pieces would be missing from the board. Switch to the flat board (the ⋮ menu) to
          play this map with every piece visible.
        </Text>
      </Flex>
    );
  }

  return (
    <TableStage
      imageUrl={map.meta.imageUrl ?? ""}
      imageAlt={map.meta.title}
      imgMaxH={imgMaxH}
      zoomable={zoomable}
      rotated={rotated}
      fitInset={fitInset}
      tiltDeg={DEFAULT_TILT_DEG}
      pickKey={pickKey}
      resetViewSpot={resetViewSpot}
    >
      {({ frameW, frameH, tiltDeg }) => (
        <>
          <TableBoardLines
            spaces={mainSpaces}
            frameW={frameW}
            frameH={frameH}
            attack={attackSpaces}
            moveHintEdges={moveHintEdges}
            twoSpaceBands={twoSpaceBands}
          />

          {mainSpaces.map((space: ProMapSpace) => {
            // Item badges are driven STRICTLY off live server state
            // (itemTokens), never off the static map.items/space.item —
            // matching ProBoard's own rule (protocol v17): a badge exists
            // exactly while its space is in this map.
            const liveItemId = itemTokens[space.id];
            return (
              <TableSpace
                key={space.id}
                space={space}
                zoneColor={zoneColor}
                diameterPct={diameterPct}
                frameW={frameW}
                highlighted={highlightSet.has(space.id)}
                relocateOrigin={relocateSet.has(space.id)}
                relocateArmed={relocateArmed}
                item={liveItemId ? (itemById.get(liveItemId) ?? null) : null}
                passage={!!space.passage}
                onClick={onSpaceClick}
                onHoverChange={onSpaceHover}
              />
            );
          })}

          {boardTokens.map((token) => {
            const space = spaceById.get(token.space);
            if (!space) return null;
            const diamPx = (diameterPct / 100) * Math.max(frameW, 1);
            return (
              <TableBoardObject
                key={token.id}
                token={token}
                x={space.x}
                y={space.y}
                tiltDeg={tiltDeg}
                diamPx={diamPx}
                playerColor={PLAYER_COLOR[token.owner] ?? "#999"}
                artUrl={boardObjectArt?.(token)}
                originName={boardObjectOriginName?.(token)}
              />
            );
          })}

          {boardFighters.map((f) => {
            const space = spaceById.get(f.space)!;
            const diamPx = (diameterPct / 100) * Math.max(frameW, 1);
            const common = fighterProps(f);
            const headAnim = animFor(f.id, "head");
            const straddling = straddles(f);
            const stand = straddling ? bandMidpoint(space, spaceById.get(f.tailSpace as SpaceId)!) : space;
            const standAnim = straddling ? straddleAnim(headAnim, animFor(f.id, "tail")) : headAnim;
            return f.kind === "HERO" ? (
              <Fragment key={f.id}>
                {straddling && (
                  // The head space's own base. It carries the head's tween and
                  // settles the move (the head owns the settle, as below), so a
                  // move the straddling figure cannot follow still completes.
                  <TableStandeeAnchor
                    x={space.x}
                    y={space.y}
                    tiltDeg={tiltDeg}
                    widthPx={0}
                    heightPx={0}
                    spaceDiamPx={diamPx}
                    spaceId={f.space}
                    baseAccent={PLAYER_COLOR[f.owner] ?? "#999"}
                    anim={headAnim}
                    onAnimComplete={headAnim ? onPendingMoveSettled : undefined}
                  >
                    {null}
                  </TableStandeeAnchor>
                )}
                <TableFighterStandee
                  fighter={f}
                  x={stand.x}
                  y={stand.y}
                  tiltDeg={tiltDeg}
                  diamPx={diamPx}
                  playerColor={PLAYER_COLOR[f.owner] ?? "#999"}
                  artUrl={fighterTokenArt?.(f)}
                  figure={figureOf.get(f.id) ?? null}
                  figureScale={straddling ? LARGE_FIGURE_SCALE : 1}
                  baseHidden={straddling}
                  anim={standAnim}
                  onAnimComplete={standAnim && !straddling ? onPendingMoveSettled : undefined}
                  // Same registry, same rule as the flat board (ProBoard registers
                  // only the HEAD segment of a LARGE fighter): the damage-arc layer
                  // looks a fighter up here to know where on screen to land a hit.
                  innerRef={
                    fighterEls
                      ? (el) => {
                          if (el) fighterEls.current.set(f.id, el);
                          else fighterEls.current.delete(f.id);
                        }
                      : undefined
                  }
                  {...common}
                />
              </Fragment>
            ) : (
              <TableSidekickToken
                key={f.id}
                fighter={f}
                x={space.x}
                y={space.y}
                tiltDeg={tiltDeg}
                diamPx={diamPx}
                artUrl={fighterTokenArt?.(f)}
                playerColor={PLAYER_COLOR[f.owner] ?? "#999"}
                selected={common.selected}
                targetable={common.targetable}
                friendly={common.friendly}
                anim={headAnim}
                onAnimComplete={headAnim ? onPendingMoveSettled : undefined}
                onClick={common.onClick}
                onSpaceFallbackClick={common.onSpaceFallbackClick}
                onHoverChange={common.onHoverChange}
              />
            );
          })}

          {/* LARGE (two-space) fighters' trailing body (phase-1 deferred item)
              + the identity label at the band's own midpoint, reusing
              lib/pro/twoSpaceBand.ts exactly as ProBoard does. The label
              billboards to face the camera (same `standeeTransform` a
              standee uses) but is centre-pinned, not foot-pinned — it floats
              at the midpoint between two spaces, it doesn't stand on either
              one, so it has no base of its own. */}
          {twoSpaceFighters.map((f) => {
            const tailSpace = spaceById.get(f.tailSpace as SpaceId);
            if (!tailSpace) return null;
            const diamPx = (diameterPct / 100) * Math.max(frameW, 1);
            const color = PLAYER_COLOR[f.owner] ?? "#999";
            const tailAnim = animFor(f.id, "tail");
            const headSpace = spaceById.get(f.space)!;
            const mid = bandMidpoint(headSpace, tailSpace);
            return (
              <Fragment key={`${f.id}-band`}>
                <TableFighterTail
                  fighter={f}
                  x={tailSpace.x}
                  y={tailSpace.y}
                  tiltDeg={tiltDeg}
                  diamPx={diamPx}
                  playerColor={color}
                  selected={f.id === selectedFighter}
                  targetable={highlightFighterSet.has(f.id)}
                  // No onAnimComplete: the HEAD segment alone owns the settle
                  // (see `animFor`) — a second, late settle from the tail would
                  // clear a new incoming move that landed in between.
                  anim={tailAnim}
                  onClick={onFighterClick}
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
                    // Above both band ends (standees sort by y), so neither
                    // of the fighter's own pieces clips it. Still
                    // pointer-events:none: a pick space under it gets the tap.
                    zIndex={bandLabelZIndex(headSpace.y, tailSpace.y)}
                    style={{
                      transform: `translate(-50%, -50%) ${tableBillboardTransform(tiltDeg)}`,
                      transformOrigin: "50% 50%",
                    }}
                  >
                    {bandLabelText(f.name)}
                  </Flex>
                )}
              </Fragment>
            );
          })}

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
