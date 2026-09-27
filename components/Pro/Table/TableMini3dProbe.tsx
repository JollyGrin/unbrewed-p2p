/**
 * 3D minis — DEV-ONLY measuring aid for scripts/visual-probe/tableMini3d/
 * (#931, kept by #945). TableBoard loads it only outside production builds
 * (`next/dynamic` behind a NODE_ENV check), so it never reaches the app
 * bundle, and mounts it only under `?minis3dProbe=1`. Stands extra King Taranis pieces (or any mini id) on
 * chosen spaces, as the 3D mini or as the sprite, so the probe script can
 * compare them on the same space and load the board with 2/4/8 minis:
 *
 *   window.dispatchEvent(new CustomEvent("table-mini3d-probe", { detail: {
 *     pieces: [{ space: "a1", mode: "3d" | "sprite", seat: "p1", miniId: "king-taranis",
 *                path?: ["a1", "a2", "a3"], durationSec?: 1.2 }] } }))
 *
 * A piece with a `path` glides through it with the real anchor tween (send it
 * standing first, then again with the path: framer only tweens an update), then
 * rests on its last space. `pieces: []` clears the probe.
 *
 * `motion` (#962) hands the piece motion cues as the board would: `held`,
 * `dropIn`, `faceSpace` (face that space), and the one-shot beats `lunge`,
 * `recoil` ({ key, delayMs, durMs, strength? }), `flinch` and `topple`
 * ({ key, delayMs? }). A beat plays once per key.
 */
import { useEffect, useState } from "react";
import type { ProMapSpace, ViewFighter } from "@/lib/pro/protocol";
import { figureFor } from "@/lib/pro/figures";
import { useFigureManifest } from "@/lib/pro/useFigureManifest";
import { mini3dFor, type Mini3dManifest } from "@/lib/pro/minis3d/manifest";
import type { TableRig } from "@/lib/pro/minis3d/camera";
import { TableFighterStandee } from "./TableFighterStandee";
import type { MiniMotionCues } from "./TableMini3D";

export interface Mini3dProbePiece {
  space: string;
  mode: "3d" | "sprite";
  seat?: string;
  miniId?: string;
  /** Manifest detail level, e.g. "15k" (default: the URL's, else the manifest's). */
  lod?: string;
  path?: string[];
  durationSec?: number;
  motion?: Omit<MiniMotionCues, "faceToward"> & { faceSpace?: string };
}

const SEAT_COLOR: Record<string, string> = { p1: "#E0A82E", p2: "#3B8BEB", p3: "#2F9E68", p4: "#C0449E" };

export interface TableMini3dProbeProps {
  spaceById: Map<string, ProMapSpace>;
  spaceDiamPx: number;
  rig: TableRig;
  manifest: Mini3dManifest | null;
  lod: string | null;
  maxPixelRatio: number | null;
}

export const TableMini3dProbe = ({ spaceById, spaceDiamPx, rig, manifest, lod, maxPixelRatio }: TableMini3dProbeProps) => {
  const [pieces, setPieces] = useState<Mini3dProbePiece[]>([]);
  const sprites = useFigureManifest(true, "open");
  useEffect(() => {
    const on = (e: Event) => setPieces(((e as CustomEvent).detail?.pieces ?? []) as Mini3dProbePiece[]);
    window.addEventListener("table-mini3d-probe", on);
    return () => window.removeEventListener("table-mini3d-probe", on);
  }, []);

  return (
    <>
      {pieces.map((p, i) => {
        const route = (p.path ?? []).map((id) => spaceById.get(id)).filter(Boolean) as ProMapSpace[];
        const rest = route.length ? route[route.length - 1] : spaceById.get(p.space);
        if (!rest) return null;
        const seat = p.seat ?? "p1";
        const miniId = p.miniId ?? "king-taranis";
        const fighter: ViewFighter = {
          id: `probe-${i}`,
          owner: seat,
          kind: "HERO",
          name: `probe ${i}`,
          space: rest.id,
          tailSpace: null,
          hp: 1,
          maxHp: 1,
          reach: "MELEE",
          size: "NORMAL",
          defeated: false,
        } as ViewFighter;
        const anim =
          route.length > 1
            ? { xs: route.map((s) => s.x), ys: route.map((s) => s.y), durationSec: p.durationSec ?? 0.35 * (route.length - 1) }
            : null;
        const { faceSpace, ...cues } = p.motion ?? {};
        const face = faceSpace ? spaceById.get(faceSpace) : undefined;
        return (
          <TableFighterStandee
            key={`${i}-${p.mode}`}
            fighter={fighter}
            x={rest.x}
            y={rest.y}
            tiltDeg={rig.tiltDeg}
            diamPx={spaceDiamPx}
            playerColor={SEAT_COLOR[seat] ?? "#999"}
            selected={false}
            targetable={false}
            friendly={false}
            extendedReach={false}
            figure={p.mode === "sprite" ? figureFor(sprites, miniId, seat, "open") : null}
            mini3d={p.mode === "3d" ? mini3dFor(manifest, miniId, seat, p.lod ?? lod) : null}
            rig={rig}
            mini3dMaxPixelRatio={maxPixelRatio}
            mini3dMotion={p.motion ? { ...cues, faceToward: face ? { x: face.x, y: face.y } : null } : null}
            anim={anim}
            onAnimComplete={() =>
              setPieces((all) => all.map((q, j) => (j === i ? { ...q, space: rest.id, path: undefined } : q)))
            }
            frameW={rig.frameW}
            frameH={rig.frameH}
          />
        );
      })}
    </>
  );
};
