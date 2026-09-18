/**
 * Combat beats on the tabletop board — the floating damage numbers, heal
 * numbers, BLOCKED calls and K.O. bursts the flat board has always shown.
 *
 * The tabletop view shipped without them, which meant a hit landed in silence:
 * a fighter's life total simply changed and nothing said why. These are the
 * same `BoardFxItem`s `useGameFx` already emits for the flat board, so nothing
 * new is computed here — only drawn, and drawn differently because this board
 * has a ground plane and a camera.
 *
 * Each beat is two marks that want opposite treatment (see `fxRingZIndex` /
 * `fxLabelZIndex` in tableProjection.ts for the ordering rules):
 *
 *  - a RING lying flat in the board plane, expanding out of the space like a
 *    shockwave across the surface. It is NOT counter-rotated, so the tilt
 *    foreshortens it exactly as it foreshortens the space beneath — which is
 *    what makes it read as something happening ON the board rather than as a
 *    halo floating over it.
 *  - a LABEL that billboards upright to face the camera and rises away from
 *    the board as it fades. Text laid flat in the tilted plane would be
 *    unreadable at the far rank, and this is information the player needs.
 */
import { Box, Text, keyframes } from "@chakra-ui/react";
import { BoardFxItem } from "@/lib/pro/useGameFx";
import { ProMapSpace } from "@/lib/pro/protocol";
import { fxLabelZIndex, fxRingZIndex, standeeTransform } from "@/lib/pro/tableProjection";

/** Matches the flat board's own FX vocabulary so the two views never disagree. */
const FX_COLOR: Record<BoardFxItem["kind"], string> = {
  damage: "#FF5C5C",
  heal: "#58D68D",
  blocked: "#B8C4CE",
  defeat: "#E0A82E",
};

/** A number carries further than a word, so it is set larger. */
const isNumeric = (kind: BoardFxItem["kind"]) => kind === "damage" || kind === "heal";

/** How far across its space the shockwave travels before it is gone. */
const RING_REACH = 2.1;

const ringSweep = keyframes`
  0%   { transform: translate(-50%, -50%) scale(0.35); opacity: 0.95; }
  100% { transform: translate(-50%, -50%) scale(${RING_REACH}); opacity: 0; }
`;

/**
 * The label leaves the board rather than merely sliding up the screen: it
 * travels along the camera's own up-axis, so on a tilted board it reads as
 * lifting off the surface.
 */
const labelRise = keyframes`
  0%   { transform: translate(-50%, -50%) scale(0.85); opacity: 0; }
  14%  { transform: translate(-50%, -85%) scale(1.12); opacity: 1; }
  32%  { transform: translate(-50%, -105%) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -190%) scale(0.95); opacity: 0; }
`;

export interface TableBoardFxProps {
  fx: BoardFxItem[];
  /** Main-board spaces only — the caller has already filtered out region insets. */
  spaces: ProMapSpace[];
  /** Space diameter as a percentage of the board frame's width. */
  diamPct: number;
  tiltDeg: number;
  /** Under reduced motion the beats still appear; they just don't travel. */
  reducedMotion?: boolean;
}

export const TableBoardFx = ({
  fx,
  spaces,
  diamPct,
  tiltDeg,
  reducedMotion = false,
}: TableBoardFxProps) => (
  <>
    {fx.flatMap((item) => {
      const space = spaces.find((s) => s.id === item.space);
      // A beat naming a space this view does not draw (a region inset) is
      // dropped rather than parked at the board's origin, where it would claim
      // the hit happened in the top-left corner.
      if (!space) return [];
      const color = FX_COLOR[item.kind];
      const left = `${space.x * 100}%`;
      const top = `${space.y * 100}%`;

      return [
        <Box
          key={`${item.key}-ring`}
          data-table-fx-ring={item.kind}
          position="absolute"
          left={left}
          top={top}
          w={`${diamPct}%`}
          sx={{ aspectRatio: "1", pointerEvents: "none" }}
          border={`3px solid ${color}`}
          borderRadius="50%"
          style={{ transform: "translate(-50%, -50%)", zIndex: fxRingZIndex() }}
          animation={reducedMotion ? undefined : `${ringSweep} 0.7s ease-out both`}
          opacity={reducedMotion ? 0.5 : undefined}
        />,
        <Box
          key={item.key}
          data-table-fx-label={item.kind}
          position="absolute"
          left={left}
          top={top}
          sx={{ pointerEvents: "none" }}
          // Billboard first, then let the keyframes do the rising: the
          // counter-rotation lives on this wrapper so the animation inside is
          // free to own `transform` outright.
          style={{
            transform: standeeTransform(tiltDeg),
            transformOrigin: "50% 50%",
            zIndex: fxLabelZIndex(space.y),
          }}
        >
          <Text
            position="absolute"
            // rem, not vw: these live inside the zoom-transformed frame and
            // must scale with the board, not with the viewport.
            fontFamily="BebasNeueRegular"
            fontSize={isNumeric(item.kind) ? "1.6rem" : "1.1rem"}
            fontWeight="bold"
            letterSpacing="0.04em"
            color={color}
            whiteSpace="nowrap"
            textShadow="0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.6)"
            style={reducedMotion ? { transform: "translate(-50%, -105%)" } : undefined}
            animation={reducedMotion ? undefined : `${labelRise} 1.5s ease-out both`}
          >
            {item.label}
          </Text>
        </Box>,
      ];
    })}
  </>
);
