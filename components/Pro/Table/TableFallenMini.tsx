/**
 * A defeated fighter's 3D mini toppling over (#962). The engine takes a
 * defeated fighter off the board in the same batch, so its standee is gone
 * before anything could play; TableBoard keeps this stand-in on its last
 * space for the topple's length instead. It is only the model — no base,
 * badges or taps (`inert`) — and it fades out as it falls. Never mounted
 * under reduced motion, where a defeated piece just disappears as before.
 */
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import type { TableRig } from "@/lib/pro/minis3d/camera";
import { placeStandee, standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableMini3D, useTableMini3d } from "./TableMini3D";
import { TableStandeeAnchor } from "./TableStandeeAnchor";

export interface TableFallenMiniProps {
  fighterId: string;
  /** null = stand (on its last space) until the board says when it falls. */
  topple: { key: string; delayMs: number } | null;
  mini: Mini3d;
  rig: TableRig;
  x: number;
  y: number;
  diamPx: number;
  /** Who it faced when it fell (its attacker), board coordinates. */
  faceToward?: { x: number; y: number } | null;
  maxPixelRatio?: number | null;
}

export const TableFallenMini = ({ fighterId, topple, mini, rig, x, y, diamPx, faceToward = null, maxPixelRatio }: TableFallenMiniProps) => {
  const model = useTableMini3d(mini, rig);
  if (!model) return null;
  return (
    <TableStandeeAnchor
      x={x}
      y={y}
      tiltDeg={rig.tiltDeg}
      widthPx={0}
      heightPx={0}
      spaceDiamPx={diamPx}
      base={false}
      inert
      ground={
        <TableMini3D
          mini={mini}
          model={model}
          rig={rig}
          x={x}
          y={y}
          baseDiamPx={standeeBaseDiameterPx(diamPx)}
          groundScale={placeStandee(y, rig.tiltDeg).scale}
          animating={false}
          motion={{ topple, faceToward }}
          maxPixelRatio={maxPixelRatio}
          canvasAttrs={{ "data-fallen-fighter-id": fighterId }}
        />
      }
    >
      {null}
    </TableStandeeAnchor>
  );
};
