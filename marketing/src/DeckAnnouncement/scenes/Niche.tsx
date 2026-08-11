import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../../theme";
import type { Ability, DeckPromo } from "../deck";
import { alpha, type Palette } from "../palette";
import { EASE, Eyebrow } from "../ui";

/** Copy length varies wildly between decks, so type scale is derived, never
 * hand-tuned per deck — the template has to hold for the next deck too. */
const taglineSize = (tagline: string) =>
  tagline.length > 78 ? 78 : tagline.length > 52 ? 92 : 112;

const abilitySize = (abilities: Ability[]) => {
  const chars = abilities.reduce(
    (sum, a) => sum + a.text.length + (a.name?.length ?? 0),
    0,
  );
  return chars > 520 ? 26 : chars > 340 ? 29 : 33;
};

const AbilityBlock: React.FC<{
  ability: Ability;
  palette: Palette;
  fontSize: number;
}> = ({ ability, palette, fontSize }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {ability.name ? (
      <div
        style={{
          fontFamily: font.display,
          fontSize: fontSize + 24,
          letterSpacing: 3,
          color: palette.accent,
        }}
      >
        {ability.name}
      </div>
    ) : null}
    <div
      style={{
        fontFamily: font.body,
        fontSize,
        lineHeight: 1.4,
        color: palette.ink,
      }}
    >
      {ability.text}
    </div>
  </div>
);

/** Beat 2 — what the deck is FOR (the props' tagline), backed by the hero's
 * own special ability so the claim is immediately evidenced. */
export const Niche: React.FC<{
  deck: DeckPromo;
  palette: Palette;
  tagline: string;
}> = ({ deck, palette, tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headline = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 28,
  });
  const panel = spring({
    frame: frame - 26,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  const rule = interpolate(frame, [16, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <AbsoluteFill
      style={{
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 46,
        padding: "0 190px 40px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          opacity: headline,
          transform: `translateY(${interpolate(headline, [0, 1], [46, 0])}px)`,
        }}
      >
        <Eyebrow
          label={`${deck.hero.name} plays like`}
          color={palette.accent}
        />
        <div
          style={{
            fontFamily: font.display,
            fontSize: taglineSize(tagline),
            lineHeight: 1.02,
            letterSpacing: 2,
            textAlign: "center",
            color: palette.ink,
            maxWidth: 1500,
            textShadow: `0 6px 26px ${alpha("#000000", 0.5)}`,
          }}
        >
          {tagline}
        </div>
      </div>

      <div
        style={{
          width: interpolate(rule, [0, 1], [0, 420]),
          height: 5,
          background: palette.accent,
          borderRadius: 3,
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: 1480,
          display: "flex",
          flexDirection: "column",
          gap: 26,
          padding: "44px 54px",
          borderRadius: 22,
          borderLeft: `10px solid ${palette.accent}`,
          background: alpha(palette.panel, 0.94),
          boxShadow: `0 26px 60px ${alpha("#000000", 0.45)}`,
          opacity: panel,
          transform: `translateY(${interpolate(panel, [0, 1], [56, 0])}px)`,
        }}
      >
        {deck.hero.abilities.map((ability, index) => (
          <AbilityBlock
            key={index}
            ability={ability}
            palette={palette}
            fontSize={abilitySize(deck.hero.abilities)}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
