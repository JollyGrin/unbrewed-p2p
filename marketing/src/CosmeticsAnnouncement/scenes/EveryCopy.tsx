import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../../theme";
import type { DeckPromo } from "../../shared/deck";
import { alpha, type Palette } from "../../shared/color";
import { COPY_SLOTS, STAR_SLOT } from "../cast";
import { FAN_CENTER, FAN_SPACING } from "../flourish";
import { RimmedCard } from "../RimmedCard";
import { CUE } from "../timeline";
import { EASE, Eyebrow, Headline } from "../ui";

const CARD_H = 460;
const CARD_W = (CARD_H * 63) / 88;

/** Fixed final slots, like the deck promo's fan: cards arrive into the shape
 * they end in, so nothing already dealt shuffles sideways. */
const slot = (index: number, total: number) => {
  const offset = index - (total - 1) / 2;
  return {
    x: FAN_CENTER.x + offset * FAN_SPACING,
    y: FAN_CENTER.y + Math.abs(offset) * 24,
    rotation: offset * 5,
  };
};

/**
 * Beat 3b — the payoff of the upgrade. A hand deals, and then every copy of the
 * upgraded card set rims AT ONCE. That is the shipped rule, not a flourish:
 * `CosmeticEquip.cards` is keyed by normalized title, so a cosmetic belongs to
 * a card and two identical cards can never look like two different objects.
 */
export const EveryCopy: React.FC<{ deck: DeckPromo; palette: Palette }> = ({
  deck,
  palette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = deck.featured.length;
  const star = deck.featured[STAR_SLOT].card;

  const rim = interpolate(frame, [CUE.copiesRim, CUE.copiesRim + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const sweep = interpolate(
    frame,
    [CUE.copiesRim, CUE.copiesRim + 30],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 118,
          top: 118,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <Eyebrow label="One upgrade" color={palette.accent} />
        <Headline
          text="Upgrade a card once — every copy wears it."
          palette={palette}
          size={80}
          maxWidth={1600}
        />
      </div>

      {deck.featured.map(({ card }, index) => {
        const { x, y, rotation } = slot(index, total);
        const enter = spring({
          frame: frame - CUE.handDeal[index],
          fps,
          config: { damping: 200 },
          durationInFrames: 28,
        });
        const isCopy = COPY_SLOTS.includes(index);
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x - CARD_W / 2,
              top: y - CARD_H / 2,
              zIndex: index + 1,
              opacity: enter * (isCopy ? 1 : 0.62 + 0.38 * (1 - rim)),
              transform: [
                `translateY(${interpolate(enter, [0, 1], [340, 0]) - 26 * (isCopy ? rim : 0)}px)`,
                `rotate(${rotation + interpolate(enter, [0, 1], [14, 0])}deg)`,
                `scale(${interpolate(enter, [0, 1], [0.88, 1])})`,
              ].join(" "),
            }}
          >
            <RimmedCard
              card={card}
              height={CARD_H}
              tier={isCopy ? "gold" : null}
              blend={isCopy ? rim : 0}
              sweep={isCopy ? sweep : 0}
            />
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 44,
          textAlign: "center",
          fontFamily: font.body,
          fontSize: 34,
          letterSpacing: 3,
          color: alpha(palette.ink, 0.82),
          opacity: rim,
        }}
      >
        {`${star.title} ×${star.quantity} — all of them.`}
      </div>
    </AbsoluteFill>
  );
};
