/**
 * The TRAILING body-space of a LARGE (two-space) fighter — deferred item from
 * the phase-1 report: "only the head renders today". A LARGE fighter's tail
 * is deliberately a PLAIN colored circle, not a second portrait — that is
 * ProBoard's own convention (its `fighterToken` renders art, the HP badge and
 * every status only on the `segment === "head"` pass) and this mirrors it, so
 * a two-space fighter never looks like two independent characters.
 *
 * It lies flat on its space like the head's own token (see TableFlatToken
 * for why pieces without a miniature lie flat); with a miniature it is only
 * a base, since the figure stands between the two spaces.
 */
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import { standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableAnchorAnim, TableStandeeAnchor } from "./TableStandeeAnchor";
import { TableFlatToken } from "./TableFlatToken";

export interface TableFighterTailProps {
  fighter: ViewFighter;
  x: number;
  y: number;
  tiltDeg: number;
  diamPx: number;
  playerColor: string;
  selected: boolean;
  anim?: TableAnchorAnim | null;
  onAnimComplete?: () => void;
  /** The tail forwards a click to the SAME fighter id as the head — clicking
   *  either segment acts on the whole fighter, matching ProBoard. */
  onClick?: (id: FighterId) => void;
  targetable: boolean;
  /** Only the base (and the tap target): the fighter's miniature stands
   *  between its two spaces, so an upright disc here would be a second,
   *  competing figure — the "cut-off circle" next to King Kong. */
  bodyHidden?: boolean;
}

export const TableFighterTail = ({
  fighter,
  x,
  y,
  tiltDeg,
  diamPx,
  playerColor,
  selected,
  anim = null,
  onAnimComplete,
  onClick,
  targetable,
  bodyHidden = false,
}: TableFighterTailProps) => {
  const sizePx = standeeBaseDiameterPx(diamPx);
  const clickable = targetable && !!onClick;

  return (
    <TableStandeeAnchor
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={sizePx}
      heightPx={sizePx}
      spaceDiamPx={diamPx}
      spaceId={fighter.tailSpace}
      baseAccent={playerColor}
      // Behind a miniature only the base; otherwise the token is the base.
      base={bodyHidden}
      ground={
        bodyHidden ? undefined : (
          <TableFlatToken
            sizePx={sizePx}
            rim="#fff"
            fill={playerColor}
            spaceId={fighter.tailSpace}
            selected={selected}
            faceAttrs={{ "data-tail-body": "" }}
          />
        )
      }
      anim={anim}
      onAnimComplete={onAnimComplete}
      pick={clickable}
      onClick={clickable ? () => onClick!(fighter.id) : undefined}
      title={`${fighter.name} (trailing body)`}
      data-fighter-id={`${fighter.id}-tail`}
    >
      {null}
    </TableStandeeAnchor>
  );
};
