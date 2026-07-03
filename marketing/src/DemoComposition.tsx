import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { brand, font } from "./theme";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

// ---------- persistent brand frame ----------
const BrandFrame: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        background: `linear-gradient(90deg, ${brand.accent}, ${brand.accentDeep})`,
      }}
    />
    {/* readability vignette */}
    <AbsoluteFill
      style={{ boxShadow: `inset 0 0 260px 40px ${brand.surfaceDim}88` }}
    />
  </AbsoluteFill>
);

// ---------- footage scene with callout ----------
const FootageScene: React.FC<{
  src: string;
  trimBefore: number;
  playbackRate: number;
  step: string;
  title: string;
  sub: string;
  durationInFrames: number;
}> = ({ src, trimBefore, playbackRate, step, title, sub, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, 10, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );

  // callout slides up from bottom
  const rise = spring({ frame: frame - 8, fps, config: { damping: 200 }, durationInFrames: 26 });
  const calloutY = interpolate(rise, [0, 1], [70, 0]);
  const calloutOpacity = interpolate(frame, [8, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: brand.surfaceDim }}>
      <OffthreadVideo
        src={staticFile(src)}
        trimBefore={trimBefore}
        playbackRate={playbackRate}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <BrandFrame />

      {/* bottom gradient for legibility */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 320,
          background: `linear-gradient(180deg, transparent, ${brand.surfaceDim}f2)`,
        }}
      />

      {/* lower-third callout */}
      <div
        style={{
          position: "absolute",
          left: 80,
          bottom: 70,
          display: "flex",
          alignItems: "center",
          gap: 26,
          translate: `0px ${calloutY}px`,
          opacity: calloutOpacity,
        }}
      >
        <div
          style={{
            fontFamily: font.display,
            fontSize: 64,
            color: brand.surfaceDim,
            background: brand.accent,
            width: 92,
            height: 92,
            borderRadius: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 8px 0 ${brand.accentDeep}`,
            paddingTop: 8,
          }}
        >
          {step}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontFamily: font.display,
              fontSize: 84,
              lineHeight: 0.95,
              letterSpacing: 2,
              color: brand.highlight,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: font.body,
              fontSize: 40,
              color: brand.primary,
            }}
          >
            {sub}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- intro / outro cards ----------
const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 26 });
  const opacity = interpolate(frame, [0, 10, 50, 60], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        opacity,
        background: `radial-gradient(120% 100% at 50% 0%, ${brand.parchment}, ${brand.primary} 55%, ${brand.parchmentDeep})`,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontFamily: font.display,
          fontSize: 230,
          lineHeight: 0.9,
          letterSpacing: 6,
          color: brand.secondary,
          translate: `0px ${interpolate(rise, [0, 1], [40, 0])}px`,
          textShadow: `0 6px 0 ${brand.accentDeep}`,
        }}
      >
        UNBREWED
      </div>
      <div
        style={{
          fontFamily: font.body,
          fontSize: 48,
          color: brand.surfaceDim,
          letterSpacing: 1,
        }}
      >
        Play Unmatched with friends — in four steps.
      </div>
    </AbsoluteFill>
  );
};

const CTACard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.7 }, durationInFrames: 40 });
  return (
    <AbsoluteFill
      style={{
        opacity,
        background: `radial-gradient(120% 100% at 50% 0%, ${brand.parchment}, ${brand.primary} 55%, ${brand.parchmentDeep})`,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 28,
      }}
    >
      <div style={{ fontFamily: font.body, fontSize: 46, color: brand.surfaceDim, letterSpacing: 2 }}>
        Free · open source · in your browser
      </div>
      <div
        style={{
          fontFamily: font.display,
          fontSize: 150,
          color: brand.secondary,
          letterSpacing: 4,
          scale: String(interpolate(pop, [0, 1], [0.7, 1])),
          background: brand.accent,
          padding: "18px 70px 8px",
          borderRadius: 20,
          boxShadow: `0 10px 0 ${brand.accentDeep}`,
        }}
      >
        unbrewed.xyz
      </div>
    </AbsoluteFill>
  );
};

// ---------- root ----------
export const DemoComposition: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: brand.surfaceDim }}>
      <Sequence durationInFrames={60}>
        <TitleCard />
      </Sequence>

      <Sequence from={56} durationInFrames={200}>
        <FootageScene
          src="clips/01-deck.mp4"
          trimBefore={40}
          playbackRate={1.2}
          step="1"
          title="Grab a deck"
          sub="One click from 23,000+ community decks"
          durationInFrames={200}
        />
      </Sequence>

      <Sequence from={252} durationInFrames={200}>
        <FootageScene
          src="clips/02-connect.mp4"
          trimBefore={30}
          playbackRate={1.5}
          step="2"
          title="Start a table"
          sub="Share a lobby link — no install, no account"
          durationInFrames={200}
        />
      </Sequence>

      <Sequence from={448} durationInFrames={190}>
        <FootageScene
          src="clips/03-tokens.mp4"
          trimBefore={30}
          playbackRate={1.1}
          step="3"
          title="Move your fighters"
          sub="Drag tokens across any map"
          durationInFrames={190}
        />
      </Sequence>

      <Sequence from={634} durationInFrames={230}>
        <FootageScene
          src="clips/04-hand.mp4"
          trimBefore={30}
          playbackRate={1.15}
          step="4"
          title="Play real cards"
          sub="Your whole deck, fanned and ready"
          durationInFrames={230}
        />
      </Sequence>

      <Sequence from={860} durationInFrames={100}>
        <CTACard />
      </Sequence>
    </AbsoluteFill>
  );
};
