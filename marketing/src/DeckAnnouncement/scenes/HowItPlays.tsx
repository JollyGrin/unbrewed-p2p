import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { cardType, font } from "../../theme";
import { CardFace } from "../CardFace";
import type { DeckPromo } from "../deck";
import { alpha, type Palette } from "../palette";
import { EASE, Eyebrow } from "../ui";

const CARD_H = 610;
const CARD_W = (CARD_H * 63) / 88;
const FAN_CENTER_X = 1330;
const FAN_CENTER_Y = 560;

const typeColor = (type: string) =>
  (cardType as Record<string, string | undefined>)[type.toLowerCase()] ??
  cardType.versatile;

/** Fixed final slots: cards arrive into the fan they will end in, so nothing
 * already on screen has to shuffle sideways when the next one lands. */
const slot = (index: number, total: number) => {
  const spacing = total > 3 ? 158 : 196;
  const offset = index - (total - 1) / 2;
  return {
    x: FAN_CENTER_X + offset * spacing,
    y: FAN_CENTER_Y + Math.abs(offset) * 20,
    rotation: offset * 6,
  };
};

const FannedCard: React.FC<{
  deck: DeckPromo;
  index: number;
  perCard: number;
  palette: Palette;
}> = ({ deck, index, perCard, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { card } = deck.featured[index];
  const start = index * perCard;
  const end = start + perCard;
  const { x, y, rotation } = slot(index, deck.featured.length);

  const enter = spring({
    frame: frame - start,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  // stays lifted while it is the card being talked about, settles back after
  const spotlight = interpolate(
    frame,
    [start + 6, start + 26, end, end + 20],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE,
    },
  );

  const scale = interpolate(enter, [0, 1], [0.86, 1]) * (1 + 0.05 * spotlight);

  return (
    <div
      style={{
        position: "absolute",
        left: x - CARD_W / 2,
        top: y - CARD_H / 2,
        opacity: enter * (0.72 + 0.28 * spotlight),
        zIndex: index + 1,
        transform: [
          `translateY(${interpolate(enter, [0, 1], [300, 0]) - 46 * spotlight}px)`,
          `rotate(${rotation + interpolate(enter, [0, 1], [16, 0])}deg)`,
          `scale(${scale})`,
        ].join(" "),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -18,
          borderRadius: 26,
          background: alpha(palette.accent, 0.5 * spotlight),
          filter: "blur(26px)",
        }}
      />
      <CardFace card={card} height={CARD_H} />
    </div>
  );
};

const Caption: React.FC<{
  deck: DeckPromo;
  index: number;
  perCard: number;
  palette: Palette;
}> = ({ deck, index, perCard, palette }) => {
  const frame = useCurrentFrame();
  const { card, caption } = deck.featured[index];
  const start = index * perCard;
  const end = start + perCard;
  const opacity = interpolate(
    frame,
    [start + 8, start + 26, end - 14, end],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );
  const rise = interpolate(frame, [start + 8, start + 30], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 118,
        top: 372,
        width: 700,
        display: "flex",
        flexDirection: "column",
        gap: 22,
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div
          style={{
            fontFamily: font.gothic,
            fontSize: 30,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#fff",
            background: typeColor(card.type),
            padding: "8px 22px 4px",
            borderRadius: 999,
          }}
        >
          {card.type}
        </div>
        <div
          style={{
            fontFamily: font.body,
            fontSize: 28,
            letterSpacing: 2,
            color: palette.inkDim,
          }}
        >
          {[
            card.value === undefined ? null : `VALUE ${card.value}`,
            `BOOST ${card.boost}`,
            `×${card.quantity}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <div
        style={{
          fontFamily: font.display,
          fontSize: 84,
          lineHeight: 0.98,
          letterSpacing: 2,
          color: palette.ink,
        }}
      >
        {card.title}
      </div>
      <div
        style={{
          fontFamily: font.body,
          fontSize: 36,
          lineHeight: 1.4,
          color: palette.inkDim,
        }}
      >
        {caption}
      </div>
    </div>
  );
};

/** Beat 3 — the featured cards land one at a time, each with its own line,
 * and stay on screen so the fan builds into the deck's actual hand. */
export const HowItPlays: React.FC<{
  deck: DeckPromo;
  palette: Palette;
  perCard: number;
}> = ({ deck, palette, perCard }) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", left: 118, top: 292 }}>
      <Eyebrow label="How it plays" color={palette.accent} />
    </div>
    {deck.featured.map((_, index) => (
      <Caption
        key={index}
        deck={deck}
        index={index}
        perCard={perCard}
        palette={palette}
      />
    ))}
    {deck.featured.map((_, index) => (
      <FannedCard
        key={index}
        deck={deck}
        index={index}
        perCard={perCard}
        palette={palette}
      />
    ))}
  </AbsoluteFill>
);
