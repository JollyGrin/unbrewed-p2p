import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../theme";
import { alpha, mix, type Palette } from "../shared/color";
import { EASE, Eyebrow } from "../shared/ui";
import { PAGE_PAPER } from "./palette";
import {
  FRAME,
  PAGE_WIDTH,
  pageHeight,
  plate,
  type PageName,
  type Rect,
} from "./shots";

export { EASE, Eyebrow, SceneFade, Wordmark } from "../shared/ui";

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export type Point = { x: number; y: number };

export const Backdrop: React.FC<{ palette: Palette }> = ({ palette }) => (
  <AbsoluteFill style={{ backgroundColor: palette.deep }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(125% 115% at 50% -10%, ${palette.base} 0%, ${palette.deep} 68%)`,
      }}
    />
    <AbsoluteFill
      style={{ boxShadow: `inset 0 0 340px 100px ${alpha("#000000", 0.55)}` }}
    />
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 8,
        background: `linear-gradient(90deg, ${palette.accent}, ${alpha(palette.accent, 0)})`,
      }}
    />
  </AbsoluteFill>
);

/**
 * A camera over a page: `scale`, and which page point (`look`, CSS px) sits at
 * which frame point (`at`). Everything drawn inside a `Page` is in PAGE
 * coordinates, so pieces line up with the plate by construction.
 */
export type Camera = { scale: number; look: Point; at: Point };

const CENTRE: Point = { x: FRAME.width / 2, y: FRAME.height / 2 };

/** The page at the app's own size in the frame, a band's top at the frame's. */
export const topOf = (band: Rect): Camera => ({
  scale: FRAME.width / PAGE_WIDTH,
  look: { x: PAGE_WIDTH / 2, y: band.y + FRAME.height / 3 },
  at: CENTRE,
});

/** Look at a page point; x is held so the frame never leaves the page. */
export const lookAt = (scale: number, x: number, y: number): Camera => {
  const half = FRAME.width / scale / 2;
  return {
    scale,
    look: { x: Math.min(PAGE_WIDTH - half, Math.max(half, x)), y },
    at: CENTRE,
  };
};

export const mixCamera = (a: Camera, b: Camera, t: number): Camera => ({
  // scale travels geometrically, so a push-in reads as one steady move
  scale: a.scale * Math.pow(b.scale / a.scale, t),
  look: {
    x: a.look.x + (b.look.x - a.look.x) * t,
    y: a.look.y + (b.look.y - a.look.y) * t,
  },
  at: {
    x: a.at.x + (b.at.x - a.at.x) * t,
    y: a.at.y + (b.at.y - a.at.y) * t,
  },
});

export const centreOf = (rect: Rect): Point => ({
  x: rect.x + rect.w / 2,
  y: rect.y + rect.h / 2,
});

export const Page: React.FC<{
  page: PageName;
  layer: "full" | "bare";
  camera: Camera;
  opacity?: number;
  children?: React.ReactNode;
}> = ({ page, layer, camera, opacity = 1, children }) => {
  const height = pageHeight(page);
  const x = camera.at.x - camera.look.x * camera.scale;
  const y = camera.at.y - camera.look.y * camera.scale;
  return (
    <AbsoluteFill style={{ opacity, backgroundColor: PAGE_PAPER }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: PAGE_WIDTH,
          height,
          transformOrigin: "0 0",
          transform: `translate(${x}px, ${y}px) scale(${camera.scale})`,
        }}
      >
        <Img
          src={plate(page, layer)}
          style={{
            position: "absolute",
            inset: 0,
            width: PAGE_WIDTH,
            height,
            maxWidth: "none",
          }}
        />
        {children}
      </div>
    </AbsoluteFill>
  );
};

/** One element, cut out of the full plate and put back where it was. */
export const Piece: React.FC<{
  page: PageName;
  rect: Rect;
  opacity?: number;
  transform?: string;
  origin?: string;
  radius?: number | string;
  clipPath?: string;
}> = ({ page, rect, opacity = 1, transform, origin, radius, clipPath }) => (
  <div
    style={{
      position: "absolute",
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      overflow: "hidden",
      opacity,
      transform,
      transformOrigin: origin ?? "50% 50%",
      borderRadius: radius,
      clipPath,
    }}
  >
    <Img
      src={plate(page, "full")}
      style={{
        position: "absolute",
        left: -rect.x,
        top: -rect.y,
        width: PAGE_WIDTH,
        height: pageHeight(page),
        maxWidth: "none",
      }}
    />
  </div>
);

/** A 0→1 spring that starts at `at`; the house "pop". */
export const usePop = (at: number, durationInFrames = 22, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - at,
    fps,
    config: { damping, stiffness: 170, mass: 0.7 },
    durationInFrames,
  });
};

/** A gold ring that draws attention to a rect, in whatever space it sits in. */
export const Ring: React.FC<{
  rect: { x: number; y: number; w: number; h: number };
  at: number;
  color: string;
  radius?: number;
  pad?: number;
  weight?: number;
}> = ({ rect, at, color, radius = 10, pad = 6, weight = 3 }) => {
  const frame = useCurrentFrame();
  const local = frame - at;
  if (local < 0) return null;
  const arrive = interpolate(local, [0, 12], [0, 1], {
    ...clamp,
    easing: EASE,
  });
  const breath = 0.75 + 0.25 * Math.sin(local / 5);
  const grow = pad + (1 - arrive) * 14;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x - grow,
        top: rect.y - grow,
        width: rect.w + grow * 2,
        height: rect.h + grow * 2,
        borderRadius: radius + grow,
        border: `${weight}px solid ${color}`,
        boxShadow: `0 0 ${18 * breath}px ${alpha(color, 0.75)}, inset 0 0 ${10 * breath}px ${alpha(color, 0.35)}`,
        opacity: arrive,
      }}
    />
  );
};

export const Headline: React.FC<{
  text: string;
  palette: Palette;
  size?: number;
  maxWidth?: number;
}> = ({ text, palette, size = 96, maxWidth = 1600 }) => (
  <div
    style={{
      fontFamily: font.display,
      fontSize: size,
      lineHeight: 1.0,
      letterSpacing: 2,
      color: palette.ink,
      textAlign: "center",
      maxWidth,
      textShadow: `0 6px 28px ${alpha("#000000", 0.75)}`,
    }}
  >
    {text}
  </div>
);

/**
 * The ad's one copy block: eyebrow + headline (+ an optional small line),
 * centred along the bottom, rising in at `at`. A scrim sits under it so it
 * reads over a page's pale paper as well as over the backdrop.
 */
export const Copy: React.FC<{
  palette: Palette;
  at: number;
  eyebrow: string;
  headline: string;
  note?: string;
  /** frame the block starts leaving on; omit to let the SceneFade take it */
  out?: number;
  top?: number;
  size?: number;
}> = ({ palette, at, eyebrow, headline, note, out, top = 862, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - at,
    fps,
    config: { damping: 200 },
    durationInFrames: 26,
  });
  const leave =
    out === undefined
      ? 1
      : interpolate(frame, [out, out + 12], [1, 0], { ...clamp, easing: EASE });
  const deep = mix(palette.deep, "#000000", 0.35);
  return (
    <>
      <AbsoluteFill
        style={{
          opacity: enter * leave,
          background: `linear-gradient(180deg, transparent 56%, ${alpha(deep, 0.82)} 76%, ${alpha(deep, 0.96)} 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          opacity: enter * leave,
          transform: `translateY(${interpolate(enter, [0, 1], [34, 0])}px)`,
        }}
      >
        <Eyebrow label={eyebrow} color={palette.accent} />
        <Headline text={headline} palette={palette} size={size} />
        {note ? (
          <div
            style={{
              fontFamily: font.body,
              fontSize: 28,
              letterSpacing: 2,
              color: mix(palette.ink, "#000000", 0.25),
            }}
          >
            {note}
          </div>
        ) : null}
      </div>
    </>
  );
};

/**
 * A recording, entered `lead` seconds before one of its marks and played at
 * `rate`. Everything about where a clip starts lives in its marks, so a
 * recapture retimes the ad by itself.
 */
export const Clip: React.FC<{
  src: string;
  mark: number;
  lead?: number;
  rate?: number;
  style?: React.CSSProperties;
}> = ({ src, mark, lead = 0.6, rate = 1, style }) => (
  <OffthreadVideo
    src={src}
    startFrom={Math.max(0, Math.round((mark - lead) * 30))}
    playbackRate={rate}
    muted
    style={{ width: "100%", height: "100%", ...style }}
  />
);
