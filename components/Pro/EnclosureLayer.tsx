/**
 * One layer of enclosure badges for a positioning frame (flat board and tabletop share it):
 * the fence marks, plus the #1160 stake chips placed by `placeStakeChips` so none covers a
 * space or a fighter token. Crowded ⇒ ring only. Chips are skipped when `upright` (the
 * portrait board is rotated; the rings still show). PRESENTATION ONLY, no pointer events.
 */
import { Box } from "@chakra-ui/react";
import { EnclosureMark } from "@/components/Pro/EnclosureMark";
import type { EnclosureModel } from "@/lib/pro/enclosures";
import { ADJACENT_CHIP, CHIP_LINE_PX, placeStakeChips, stakeChipText } from "@/lib/pro/enclosureStakes";
import type { ProMapSpace } from "@/lib/pro/protocol";

export const EnclosureLayer = ({
  enclosures,
  spaces,
  diam,
  framePx,
  layoutPx = framePx,
  layoutH = 0,
  upright = false,
  zIndex,
}: {
  enclosures: EnclosureModel;
  spaces: readonly ProMapSpace[];
  /** Pawn diameter as a fraction of the frame width. */
  diam: number;
  /** On-screen frame width, px (geometry for the chip placer). */
  framePx: number;
  /** The frame's unscaled layout width, px; the zoom transform is `framePx / layoutPx`. Defaults
   *  to `framePx` (tabletop: no scale). 0 = unmeasured ⇒ no chips. */
  layoutPx?: number;
  /** The frame's unscaled layout height, px (the chip placer needs the aspect). */
  layoutH?: number;
  upright?: boolean;
  zIndex?: number;
}) => {
  const stateOf = (id: string) => (enclosures.blocked.has(id) ? "closed" : enclosures.destroyed.has(id) ? "destroyed" : null);
  const chips =
    upright || framePx <= 0 || layoutPx <= 0 || layoutH <= 0
      ? {}
      : placeStakeChips(
          spaces
            .filter((s) => stateOf(s.id) === "closed" && enclosures.stakes[s.id])
            .map((s) => ({ id: s.id, texts: stakeChipText(enclosures.stakes[s.id]) })),
          spaces,
          diam,
          framePx,
          layoutH / layoutPx
        );
  const k = layoutPx > 0 ? framePx / layoutPx : 1;
  return (
    <>
      {spaces.map((s) => {
        const state = stateOf(s.id);
        if (!state) return null;
        const stake = enclosures.stakes[s.id];
        const chip = chips[s.id];
        return (
          <Box
            key={`${s.id}-enclosure`}
            position="absolute"
            left={`${s.x * 100}%`}
            top={`${s.y * 100}%`}
            w={`${diam * 100}%`}
            sx={{ aspectRatio: "1" }}
            transform="translate(-50%, -50%)"
            pointerEvents="none"
            zIndex={zIndex}
          >
            <EnclosureMark state={state} number={enclosures.numbers[s.id]} spaceId={s.id} stake={stake} />
            {chip && stake && (
              <Box
                position="absolute"
                left="50%"
                top="50%"
                transform={`translate(calc(-50% + ${chip.dx / k}px), calc(-50% + ${chip.dy / k}px)) scale(${1 / k})`}
                w={`${chip.w}px`}
                data-enclosure-chip={s.id}
                pointerEvents="none"
              >
                {chip.blocks.map((blk, i) => (
                  <Box
                    key={blk.text}
                    lineHeight={`${CHIP_LINE_PX}px`}
                    py="2px"
                    textAlign="center"
                    whiteSpace="nowrap"
                    fontSize="10px"
                    fontWeight="bold"
                    fontFamily="SpaceGrotesk"
                    color="#FFF3E0"
                    bg={blk.text === ADJACENT_CHIP ? "rgba(166,28,36,0.92)" : "rgba(86,62,12,0.92)"}
                    borderRadius="4px"
                    border={`1px ${blk.text === ADJACENT_CHIP ? "solid #E5484D" : "dashed #E0A82E"}`}
                    boxSizing="border-box"
                    data-chip-text={blk.text}
                    data-chip-i={i}
                  >
                    {blk.lines.map((l) => (
                      <Box key={l}>{l}</Box>
                    ))}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </>
  );
};
