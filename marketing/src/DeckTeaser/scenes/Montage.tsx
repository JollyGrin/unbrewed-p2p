import {
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { STILL, trackSlot } from "../../BonusShowcase/layout";
import { mixPlace } from "../../BonusShowcase/scenes/Track";
import {
  Chip,
  clamp,
  EASE,
  FlipCard,
  StillInsert,
} from "../../BonusShowcase/ui";
import type { EffectParams } from "../../BonusShowcase/effects";
import type { Palette } from "../../shared/color";
import type { BonusDeck } from "../../shared/deck";
import { flashPlace } from "../layout";
import { flashLabel } from "../plays";
import { FLASH, FLASH_CUE } from "../timeline";

/**
 * The pairs the teaser does not play in full: each one pops out of its slot,
 * turns over, says in two words what it gives (built from the reward's
 * text), and goes home — so the whole arc reads in a glance.
 */
export const Montage: React.FC<{
  deck: BonusDeck;
  palette: Palette;
  pairs: number[];
  effects: EffectParams[];
  stills: (string | undefined)[];
}> = ({ deck, palette, pairs, effects, stills }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = deck.pairs.length;
  return (
    <>
      {pairs.map((pair, n) => {
        const u = frame - n * FLASH;
        if (u < 0 || u >= FLASH) return null;
        const slot = trackSlot(pair, count);
        const big = flashPlace(pair, count);
        const rise = interpolate(u, [FLASH_CUE.rise, FLASH_CUE.flip], [0, 1], {
          ...clamp,
          easing: EASE,
        });
        const home = interpolate(u, [FLASH_CUE.home, FLASH], [0, 1], {
          ...clamp,
          easing: EASE,
        });
        const place =
          u < FLASH_CUE.home
            ? mixPlace(slot, big, rise)
            : mixPlace(big, slot, home);
        const flip = interpolate(
          u,
          [FLASH_CUE.flip, FLASH_CUE.flipLand],
          [0, 1],
          { ...clamp, easing: EASE },
        );
        const label =
          spring({ frame: u - FLASH_CUE.label, fps, config: { damping: 12 } }) *
          (1 - home);
        const still = stills[pair];
        return [
          <FlipCard
            key={`card-${pair}`}
            front={deck.pairs[pair].front}
            back={deck.pairs[pair].back}
            place={place}
            flip={flip}
            lift={Math.sin(Math.PI * flip) * 30}
            glow={flip > 0.5 ? `${palette.accent}88` : undefined}
          />,
          <div
            key={`label-${pair}`}
            style={{
              position: "absolute",
              left: big.x,
              // above the card: below it is where the still lands
              top: big.y - (big.w * 1146) / 1600 / 2 - 96,
              transform: `translate(-50%, 0) scale(${0.7 + 0.3 * label})`,
              whiteSpace: "nowrap",
              opacity: label,
            }}
          >
            <Chip
              label={`${deck.pairs[pair].back.characterName} ${pair + 1}`}
              palette={palette}
              scale={0.85}
            >
              {flashLabel(effects[pair]).toUpperCase()}
            </Chip>
          </div>,
          still ? (
            <StillInsert
              key={`still-${pair}`}
              src={staticFile(still)}
              x={STILL.x}
              y={STILL.y}
              w={STILL.w}
              enter={
                spring({ frame: u - 6, fps, config: { damping: 14 } }) *
                (1 - home)
              }
              age={u}
              palette={palette}
            />
          ) : null,
        ];
      })}
    </>
  );
};
