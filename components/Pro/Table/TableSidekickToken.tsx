/**
 * A SIDEKICK on the table: its deck's round token, lying flat on its space
 * (see TableFlatToken for why flat). The HP badge stands up above it.
 *
 * Given a 3D mini (`mini3d`, #945) it stands as that model instead, drawn by
 * the same renderer as a hero's (TableMini3D), sized to its own base. None
 * are wired yet: sidekicks keep their tokens until a manifest entry and a
 * `fighterMiniId` answer name one.
 */
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import { flatTokenTopPx, placeStandee, standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import type { TableRig } from "@/lib/pro/minis3d/camera";
import { standingPose } from "@/lib/pro/minis3d/pose";
import { mini3dPlateSize, TableMini3D, useTableMini3d } from "./TableMini3D";
import { TableAnchorAnim, TableStandeeAnchor, type TableStackDepth } from "./TableStandeeAnchor";
import {
  fighterBadgesLowestPx,
  pickMarksLowestPx,
  TableFighterBadges,
  TableFighterPickMarks,
} from "./TableFighterBadges";
import { TableFlatToken, TOKEN_BADGE_PLATE_HEIGHT } from "./TableFlatToken";

export interface TableSidekickTokenProps {
  fighter: ViewFighter;
  x: number;
  y: number;
  tiltDeg: number;
  /** Set when this piece shares its space — see TableStandeeAnchor. */
  stack?: TableStackDepth;
  diamPx: number;
  artUrl?: string | null;
  /** Owner's token color — carried onto the base disc (fault #3) so a
   *  sidekick's footprint reads as "whose piece" the same way a hero's does.
   *  Optional: an omitted color falls back to the anchor's own neutral. */
  playerColor?: string;
  selected: boolean;
  targetable: boolean;
  friendly: boolean;
  /** Pick marks, as on the hero plate: a reach-2 target, a numbered pick and
   *  a bought-range / step-in chip (see TableFighterPickMarks). */
  extendedReach?: boolean;
  badgeNumber?: number;
  chipText?: string | null;
  /** A just-committed move to glide through (deferred-item pendingMove
   *  tweening). Absent/null = static. */
  anim?: TableAnchorAnim | null;
  onAnimComplete?: () => void;
  onClick?: (id: FighterId) => void;
  onSpaceFallbackClick?: () => void;
  onHoverChange?: (id: FighterId | null) => void;
  /** Registers the token in the damage-arc registry (see TableBoard). */
  innerRef?: (el: HTMLElement | null) => void;
  /** The table plane's size — see TableFighterStandee's. */
  frameW?: number;
  frameH?: number;
  /** A 3D mini to stand here instead of the flat token — see
   *  TableFighterStandee's. Falls back to the token. */
  mini3d?: Mini3d | null;
  rig?: TableRig | null;
}

export const TableSidekickToken = ({
  fighter,
  x,
  y,
  tiltDeg,
  stack,
  diamPx,
  artUrl,
  playerColor,
  selected,
  targetable,
  friendly,
  extendedReach = false,
  badgeNumber,
  chipText,
  anim = null,
  onAnimComplete,
  onClick,
  onSpaceFallbackClick,
  onHoverChange,
  innerRef,
  frameW,
  frameH,
  mini3d = null,
  rig = null,
}: TableSidekickTokenProps) => {
  const sizePx = standeeBaseDiameterPx(diamPx);
  const model3d = useTableMini3d(mini3d, rig);
  const groundScale = placeStandee(stack ? stack.depthY : y, tiltDeg).scale;
  const plate = model3d
    ? mini3dPlateSize(model3d, mini3d!, rig!, standingPose(x, y), sizePx, groundScale, sizePx, sizePx * TOKEN_BADGE_PLATE_HEIGHT)
    : { widthPx: sizePx, heightPx: sizePx * TOKEN_BADGE_PLATE_HEIGHT };
  const plateHeightPx = plate.heightPx;
  const fighterClickable = targetable && !!onClick;
  const clickHandler = fighterClickable ? () => onClick!(fighter.id) : onSpaceFallbackClick;

  return (
    <TableStandeeAnchor
      badgeOwner={fighter.id}
      stack={stack}
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={plate.widthPx}
      heightPx={plateHeightPx}
      spaceDiamPx={diamPx}
      spaceId={fighter.space}
      baseAccent={playerColor}
      // A flat token is its own base; a 3D mini stands on the anchor's disc.
      base={!!model3d}
      innerRef={innerRef}
      ground={
        model3d ? (
          <TableMini3D
            mini={mini3d!}
            model={model3d}
            rig={rig!}
            x={x}
            y={y}
            baseDiamPx={sizePx}
            groundScale={groundScale}
            animating={!!anim}
            hitTarget={fighterClickable}
            canvasAttrs={{ "data-fighter-id": fighter.id }}
          />
        ) : (
          <TableFlatToken
            sizePx={sizePx}
            rim={playerColor ?? "rgba(250, 240, 222, 0.55)"}
            spaceId={fighter.space}
            name={fighter.name}
            artUrl={artUrl}
            selected={selected}
            targetable={targetable}
            friendly={friendly}
            faceAttrs={{ "data-fighter-id": fighter.id }}
          />
        )
      }
      anim={anim}
      onAnimComplete={onAnimComplete}
      pick={fighterClickable}
      onClick={clickHandler}
      onMouseEnter={onHoverChange ? () => onHoverChange(fighter.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
      title={`${fighter.name} — ${fighter.hp}/${fighter.maxHp} HP`}
      frameW={frameW}
      frameH={frameH}
      groundTopPx={model3d ? 0 : flatTokenTopPx(sizePx)}
      badgeLowestPx={Math.min(
        fighterBadgesLowestPx(plateHeightPx, "sidekick"),
        pickMarksLowestPx({ extendedReach, badgeNumber, chipText })
      )}
      badges={
        <>
          <TableFighterBadges fighter={fighter} size="sidekick" />
          <TableFighterPickMarks
            extendedReach={extendedReach}
            badgeNumber={badgeNumber}
            chipText={chipText}
            playerColor={playerColor ?? "rgba(250, 240, 222, 0.55)"}
          />
        </>
      }
    >
      {null}
    </TableStandeeAnchor>
  );
};
