import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { font } from "../theme";
import { alpha, mix, type Palette } from "../shared/color";
import type { BonusCard } from "../shared/deck";
import { CARD_ASPECT, type Place } from "./layout";

export { EASE, Eyebrow, SceneFade, Wordmark } from "../shared/ui";

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/**
 * Deck-palette backdrop with a big-top sunburst turning slowly behind it —
 * the stripes are the card frames' own red and blue, kept faint and masked
 * to the centre so it reads as a tent ceiling, not a pinwheel.
 */
export const CircusBackdrop: React.FC<{
  palette: Palette;
  stripes: [string, string];
}> = ({ palette, stripes }) => {
  const frame = useCurrentFrame();
  const [a, b] = stripes.map((colour) => mix(colour, palette.deep, 0.35));
  return (
    <AbsoluteFill style={{ backgroundColor: palette.deep, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 110% at 50% -10%, ${palette.base} 0%, ${palette.deep} 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 960 - 1400,
          top: -260 - 1400,
          width: 2800,
          height: 2800,
          // 24 wedges; the turn is a slow drift, about one wedge per 9s
          background: `repeating-conic-gradient(${a} 0deg 7.5deg, ${b} 7.5deg 15deg)`,
          transform: `rotate(${frame * 0.055}deg)`,
          opacity: 0.16,
          maskImage:
            "radial-gradient(closest-side, #000 0%, rgba(0,0,0,0.55) 45%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(closest-side, #000 0%, rgba(0,0,0,0.55) 45%, transparent 100%)",
        }}
      />
      <AbsoluteFill
        style={{ boxShadow: `inset 0 0 340px 110px ${alpha("#000000", 0.55)}` }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 8,
          background: `linear-gradient(90deg, ${stripes[0]}, ${stripes[1]})`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * One side-deck face, landscape. The deck ships these as portrait files with
 * the art turned on its side (`cardImage.turn`), so the image is laid out
 * portrait inside a landscape box and spun upright.
 */
export const CardArt: React.FC<{ card: BonusCard; w: number }> = ({
  card,
  w,
}) => {
  const h = w * CARD_ASPECT;
  const src = card.cardImage?.url ?? card.imageUrl;
  const turn = card.turn === "ccw" ? -90 : card.turn === "cw" ? 90 : 0;
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: w * 0.035,
        overflow: "hidden",
        backgroundColor: "#111",
      }}
    >
      {src ? (
        <Img
          src={src}
          style={
            turn === 0
              ? { width: "100%", height: "100%", objectFit: "cover" }
              : {
                  position: "absolute",
                  width: h,
                  height: w,
                  left: (w - h) / 2,
                  top: (h - w) / 2,
                  transform: `rotate(${turn}deg)`,
                }
          }
        />
      ) : null}
    </div>
  );
};

/**
 * A two-faced card at a place on screen. `flip` 0→1 turns it over on its
 * vertical axis: the front shows until it is edge-on, then the back, each
 * with its own rotation — so nothing leans on backface-visibility.
 */
export const FlipCard: React.FC<{
  front: BonusCard;
  back: BonusCard;
  place: Place;
  flip: number;
  tilt?: number;
  lift?: number;
  opacity?: number;
  glow?: string;
}> = ({ front, back, place, flip, tilt = 0, lift = 0, opacity = 1, glow }) => {
  const h = place.w * CARD_ASPECT;
  const angle = flip * 180;
  const showBack = angle > 90;
  return (
    <div
      style={{
        position: "absolute",
        left: place.x - place.w / 2,
        top: place.y - h / 2,
        width: place.w,
        height: h,
        perspective: place.w * 2.6,
        opacity,
      }}
    >
      <div
        style={{
          width: place.w,
          height: h,
          borderRadius: place.w * 0.035,
          transform: `translateY(${-lift}px) rotate(${tilt}deg) rotateY(${
            showBack ? angle - 180 : angle
          }deg)`,
          boxShadow: [
            `0 ${place.w * 0.03}px ${place.w * 0.06}px ${alpha("#000000", 0.5)}`,
            glow ? `0 0 ${place.w * 0.08}px ${glow}` : null,
          ]
            .filter(Boolean)
            .join(", "),
        }}
      >
        <CardArt card={showBack ? back : front} w={place.w} />
      </div>
    </div>
  );
};

/** A round fighter token, like the board's. `grey` 0→1 drains it (defeated). */
export const Token: React.FC<{
  src?: string;
  size: number;
  ring: string;
  grey?: number;
  label?: string;
}> = ({ src, size, ring, grey = 0, label }) => (
  <div
    style={{
      position: "relative",
      width: size,
      height: size,
      borderRadius: "50%",
      border: `${Math.max(4, size * 0.06)}px solid ${ring}`,
      backgroundColor: "#1d1424",
      overflow: "hidden",
      boxShadow: `0 ${size * 0.08}px ${size * 0.2}px ${alpha("#000000", 0.5)}`,
    }}
  >
    {src ? (
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: `grayscale(${grey}) brightness(${1 - grey * 0.55})`,
        }}
      />
    ) : null}
    {label ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: font.display,
          fontSize: size * 0.42,
          color: alpha("#ffffff", 0.85),
        }}
      >
        {label}
      </div>
    ) : null}
  </div>
);

/** A board space, as a flat disc. */
export const Space: React.FC<{
  x: number;
  y: number;
  size: number;
  fill: string;
  ring: string;
  lit?: number;
  litColour?: string;
}> = ({ x, y, size, fill, ring, lit = 0, litColour = "#ffffff" }) => (
  <div
    style={{
      position: "absolute",
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      borderRadius: "50%",
      backgroundColor: mix(fill, litColour, lit * 0.35),
      border: `4px solid ${mix(ring, litColour, lit * 0.6)}`,
      boxShadow: `inset 0 -${size * 0.08}px 0 ${alpha("#000000", 0.35)}`,
    }}
  />
);

/** A pill chip in the HUD's style — label + value. */
export const Chip: React.FC<{
  label: string;
  children: React.ReactNode;
  palette: Palette;
  scale?: number;
}> = ({ label, children, palette, scale = 1 }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18 * scale,
      padding: `${10 * scale}px ${26 * scale}px`,
      borderRadius: 999,
      backgroundColor: alpha(palette.panel, 0.92),
      border: `3px solid ${alpha(palette.ink, 0.25)}`,
      boxShadow: `0 10px 30px ${alpha("#000000", 0.4)}`,
    }}
  >
    <div
      style={{
        fontFamily: font.body,
        fontSize: 26 * scale,
        letterSpacing: 5 * scale,
        textTransform: "uppercase",
        color: palette.inkDim,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: font.display,
        fontSize: 64 * scale,
        lineHeight: 1,
        color: palette.ink,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  </div>
);

/** Ken-burns window onto a real client render, in a thin device frame. */
export const StillInsert: React.FC<{
  src: string;
  x: number;
  y: number;
  w: number;
  /** 0→1 entry */
  enter: number;
  /** frames since it entered, for the slow push */
  age: number;
  palette: Palette;
}> = ({ src, x, y, w, enter, age, palette }) => {
  const h = w * 0.625;
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px) rotate(${interpolate(
          enter,
          [0, 1],
          [6, 2.5],
        )}deg) scale(${interpolate(enter, [0, 1], [0.86, 1])})`,
      }}
    >
      <div
        style={{
          width: w,
          height: h,
          borderRadius: 18,
          overflow: "hidden",
          border: `6px solid ${mix(palette.panel, "#000000", 0.4)}`,
          boxShadow: `0 24px 50px ${alpha("#000000", 0.55)}`,
          backgroundColor: "#000",
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${1.04 + age * 0.0012})`,
          }}
        />
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: font.body,
          fontSize: 22,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: palette.inkDim,
          textAlign: "right",
        }}
      >
        In the client
      </div>
    </div>
  );
};
