import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { brand, cardType, font } from "./theme";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

// ---------- shared background ----------
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 300], [0, 40]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 100% at 50% 0%, ${brand.parchment} 0%, ${brand.primary} 55%, ${brand.parchmentDeep} 100%)`,
      }}
    >
      {/* deep-purple vignette frame */}
      <AbsoluteFill
        style={{
          boxShadow: `inset 0 0 340px 80px ${brand.surfaceDim}55`,
        }}
      />
      {/* faint drifting token watermark */}
      <Img
        src={staticFile("img/Fire.svg")}
        style={{
          position: "absolute",
          width: 520,
          top: -60 + drift * 0.4,
          left: -80 - drift,
          opacity: 0.06,
        }}
      />
      <Img
        src={staticFile("img/HandShield.svg")}
        style={{
          position: "absolute",
          width: 440,
          bottom: -40 - drift * 0.4,
          right: -60 + drift,
          opacity: 0.06,
        }}
      />
    </AbsoluteFill>
  );
};

// scene fade helper — fades in over 12f, out over last 12f of the window
const useSceneOpacity = (durationInFrames: number) => {
  const frame = useCurrentFrame();
  return interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );
};

// ---------- Scene 1: wordmark ----------
const SceneLogo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useSceneOpacity(90);
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const tagY = interpolate(frame, [14, 34], [24, 0], {
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const tagOpacity = interpolate(frame, [14, 34], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: font.display,
          fontSize: 260,
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
          fontSize: 46,
          color: brand.surfaceDim,
          translate: `0px ${tagY}px`,
          opacity: tagOpacity,
          letterSpacing: 1,
        }}
      >
        Play Unmatched fan decks online — right in your browser.
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 2: load any deck ----------
const TypePill: React.FC<{ label: string; color: string; delay: number }> = ({
  label,
  color,
  delay,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  return (
    <div
      style={{
        fontFamily: font.gothic,
        fontSize: 40,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "#fff",
        background: color,
        padding: "10px 26px",
        borderRadius: 999,
        opacity: p,
        translate: `0px ${interpolate(p, [0, 1], [18, 0])}px`,
        boxShadow: `0 6px 16px ${brand.surfaceDim}66`,
      }}
    >
      {label}
    </div>
  );
};

const SceneDeck: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useSceneOpacity(105);
  const cardIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 34 });

  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 54,
      }}
    >
      <div
        style={{
          fontFamily: font.display,
          fontSize: 108,
          color: brand.secondary,
          letterSpacing: 3,
        }}
      >
        Load any deck
      </div>

      {/* mock URL bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          background: brand.surfaceDim,
          borderRadius: 16,
          padding: "22px 34px",
          border: `2px solid ${brand.accent}`,
          translate: `0px ${interpolate(cardIn, [0, 1], [30, 0])}px`,
        }}
      >
        <div
          style={{
            fontFamily: font.body,
            fontSize: 40,
            color: brand.highlight,
          }}
        >
          unmatched.cards/decks/
        </div>
        <div
          style={{
            fontFamily: font.body,
            fontSize: 40,
            color: brand.accent,
          }}
        >
          your-hero
        </div>
      </div>

      {/* card-type pills */}
      <div style={{ display: "flex", gap: 22 }}>
        <TypePill label="Attack" color={cardType.attack} delay={40} />
        <TypePill label="Defence" color={cardType.defence} delay={48} />
        <TypePill label="Versatile" color={cardType.versatile} delay={56} />
        <TypePill label="Scheme" color={cardType.scheme} delay={64} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 3: play with friends ----------
const SceneFriends: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = useSceneOpacity(105);
  const zoom = interpolate(frame, [0, 105], [1.08, 1.16], { easing: EASE });

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ scale: String(zoom) }}>
        <Img
          src={staticFile("img/choosefighter.png")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${brand.surfaceDim}22 0%, ${brand.surfaceDim}dd 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 140,
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: font.display,
            fontSize: 132,
            color: brand.highlight,
            letterSpacing: 4,
            textShadow: `0 4px 18px ${brand.surfaceDim}`,
          }}
        >
          Play with friends
        </div>
        <div
          style={{
            fontFamily: font.body,
            fontSize: 44,
            color: brand.primary,
          }}
        >
          Share a lobby link. No install, no account.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- Scene 4: CTA ----------
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.7 }, durationInFrames: 40 });

  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 30,
      }}
    >
      <div
        style={{
          fontFamily: font.body,
          fontSize: 48,
          color: brand.surfaceDim,
          letterSpacing: 2,
        }}
      >
        Free · open source · browser-based
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

// ---------- root composition ----------
export const MyComposition: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: brand.parchment }}>
      <Background />
      <Sequence durationInFrames={90}>
        <SceneLogo />
      </Sequence>
      <Sequence from={82} durationInFrames={105}>
        <SceneDeck />
      </Sequence>
      <Sequence from={179} durationInFrames={105}>
        <SceneFriends />
      </Sequence>
      <Sequence from={276} durationInFrames={84}>
        <SceneCTA />
      </Sequence>
    </AbsoluteFill>
  );
};
