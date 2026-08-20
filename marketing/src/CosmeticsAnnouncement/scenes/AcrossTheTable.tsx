import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../../theme";
import type { PromoCard } from "../../shared/deck";
import { alpha, type Palette } from "../../shared/color";
import { RimmedCard } from "../RimmedCard";
import { CUE } from "../timeline";
import { EASE, Eyebrow, Headline } from "../ui";

const CARD_H = 600;
const CARD_W = (CARD_H * 63) / 88;
const SEAT_Y = 500;

/** The two seat colours the board paints — flat, single-hue, and nothing to do
 * with cosmetics (that separation is the whole point of the ladder's grammar). */
const SEATS = { them: "#3B8BEB", you: "#E0A82E" };

const Slot: React.FC<{
  card: PromoCard;
  x: number;
  label: string;
  seat: string;
  landed: number;
  palette: Palette;
  tier: "iridescent" | null;
  sweep: number;
}> = ({ card, x, label, seat, landed, palette, tier, sweep }) => (
  <>
    <div
      style={{
        position: "absolute",
        left: x - CARD_W / 2,
        top: SEAT_Y - CARD_H / 2 - 66,
        width: CARD_W,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        opacity: landed,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: seat,
          border: "2px solid #fff",
        }}
      />
      <div
        style={{
          fontFamily: font.body,
          fontSize: 30,
          letterSpacing: 7,
          textTransform: "uppercase",
          color: alpha(palette.ink, 0.8),
        }}
      >
        {label}
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: x - CARD_W / 2,
        top: SEAT_Y - CARD_H / 2,
        opacity: landed,
        transform: [
          `translateY(${interpolate(landed, [0, 1], [-560, 0])}px)`,
          `rotate(${interpolate(landed, [0, 1], [-9, 0])}deg)`,
          `scale(${interpolate(landed, [0, 1], [1.12, 1])})`,
        ].join(" "),
      }}
    >
      <RimmedCard card={card} height={CARD_H} tier={tier} sweep={sweep} />
    </div>
  </>
);

/**
 * Beat 5 — the reveal, framed the way the table frames it: two cards down at
 * once, one seat each. Theirs is base art. Yours is wearing the top of the
 * ladder, and there is nothing to explain about it.
 */
export const AcrossTheTable: React.FC<{
  theirs: PromoCard;
  yours: PromoCard;
  palette: Palette;
}> = ({ theirs, yours, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const land = (at: number) =>
    spring({
      frame: frame - at,
      fps,
      config: { damping: 26, mass: 0.9 },
      durationInFrames: 26,
    });
  const line = interpolate(frame, [CUE.tableLine, CUE.tableLine + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 118, top: 96 }}>
        <Eyebrow label="Combat reveal" color={palette.accent} />
      </div>

      <Slot
        card={theirs}
        x={640}
        label="Them"
        seat={SEATS.them}
        landed={land(CUE.tableThem)}
        palette={palette}
        tier={null}
        sweep={0}
      />
      <Slot
        card={yours}
        x={1280}
        label="You"
        seat={SEATS.you}
        landed={land(CUE.tableYou)}
        palette={palette}
        tier="iridescent"
        sweep={interpolate(
          frame,
          [CUE.tableYou + 8, CUE.tableYou + 40],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 890,
          display: "flex",
          justifyContent: "center",
          opacity: line,
          transform: `translateY(${interpolate(line, [0, 1], [22, 0])}px)`,
        }}
      >
        <Headline
          text="Across the table, they’ll know."
          palette={palette}
          size={86}
          align="center"
          maxWidth={1500}
        />
      </div>
    </AbsoluteFill>
  );
};
