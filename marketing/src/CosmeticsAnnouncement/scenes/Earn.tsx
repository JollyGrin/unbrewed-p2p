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
import { BoardToken } from "../BoardToken";
import { EARNED_POINTS, STAR_SLOT } from "../cast";
import { cardTierCosts, labelOf } from "../ladder";
import { RimmedCard } from "../RimmedCard";
import { CUE } from "../timeline";
import { PARCHMENT, PARCHMENT_INK } from "../palette";
import { EASE, Eyebrow, Headline, withCommas } from "../ui";

/**
 * Beat 3a — where the points come from.
 *
 * The panel is /collection's own furniture: a parchment sheet, the hero it is
 * scoped to, an EARNED / AVAILABLE pair, and one card set priced at the next
 * step of its ladder. The prices are the shipped ones (`cardTierCosts`), so the
 * ad quotes the page rather than inventing an economy.
 *
 * The buy is bronze → silver: `cardTierCosts[1]`, the second rung's price.
 */
const STEP_COST = cardTierCosts[1];

const StatTile: React.FC<{ label: string; value: string; wide?: boolean }> = ({
  label,
  value,
  wide,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 2,
      minWidth: wide ? 280 : 220,
      padding: "16px 28px 12px",
      borderRadius: 14,
      background: "rgba(72, 40, 79, 0.08)",
    }}
  >
    <div
      style={{
        fontFamily: font.body,
        fontSize: 24,
        letterSpacing: 5,
        textTransform: "uppercase",
        color: alpha(PARCHMENT_INK, 0.7),
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: font.display,
        fontSize: 76,
        lineHeight: 1,
        color: PARCHMENT_INK,
      }}
    >
      {value}
    </div>
  </div>
);

export const Earn: React.FC<{ deck: DeckPromo; palette: Palette }> = ({
  deck,
  palette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = deck.featured[STAR_SLOT].card;

  const panel = spring({
    frame: frame - CUE.earnPanel,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  const counted = Math.round(
    interpolate(
      frame,
      [CUE.earnCountFrom, CUE.earnCountTo],
      [0, EARNED_POINTS],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE,
      },
    ),
  );
  // the press: the confirm row flashes, the balance drops, the card steps up
  const bought = interpolate(frame, [CUE.earnBuy, CUE.earnBuy + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const press = interpolate(
    frame,
    [CUE.earnBuy - 5, CUE.earnBuy, CUE.earnBuy + 8],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const available = Math.round(counted - STEP_COST * bought);

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
        <Eyebrow label="How you earn" color={palette.accent} />
        <Headline
          text="Every win earns points — per hero."
          palette={palette}
          size={88}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 118,
          right: 118,
          top: 392,
          display: "flex",
          gap: 44,
          padding: "40px 46px",
          borderRadius: 20,
          background: PARCHMENT,
          boxShadow: `0 26px 60px ${alpha("#000000", 0.5)}`,
          opacity: panel,
          transform: `translateY(${interpolate(panel, [0, 1], [56, 0])}px)`,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 26,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <BoardToken
              size={92}
              portraitUrl={deck.hero.portraitUrl}
              initials="T"
              tier={null}
            />
            <div
              style={{
                fontFamily: font.display,
                fontSize: 74,
                lineHeight: 1,
                letterSpacing: 2,
                color: PARCHMENT_INK,
              }}
            >
              {deck.hero.name}
            </div>
          </div>
          <div style={{ display: "flex", gap: 22 }}>
            <StatTile label="Earned" value={withCommas(counted)} wide />
            <StatTile label="Available" value={withCommas(available)} />
          </div>
          <div
            style={{
              fontFamily: font.body,
              fontSize: 30,
              lineHeight: 1.35,
              color: alpha(PARCHMENT_INK, 0.8),
              maxWidth: 620,
            }}
          >
            Every finished Pro game pays the hero you piloted. Spend it on that
            hero&apos;s cards.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <RimmedCard
            card={card}
            height={330}
            tier="silver"
            from="bronze"
            blend={bought}
            sweep={interpolate(frame, [CUE.earnBuy, CUE.earnBuy + 26], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              width: 340,
            }}
          >
            <div
              style={{
                fontFamily: font.body,
                fontSize: 26,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: alpha(PARCHMENT_INK, 0.7),
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontFamily: font.body,
                fontSize: 30,
                color: PARCHMENT_INK,
              }}
            >
              {bought > 0.5
                ? `${labelOf("silver")} · fully paid`
                : `Spend ${STEP_COST} points for ${labelOf("silver").toLowerCase()}?`}
            </div>
            <div
              style={{
                fontFamily: font.display,
                fontSize: 44,
                letterSpacing: 3,
                textAlign: "center",
                padding: "14px 0 8px",
                borderRadius: 12,
                color: palette.onAccent,
                background: palette.accent,
                transform: `scale(${1 - 0.05 * press})`,
                boxShadow: `0 ${8 - 6 * press}px 0 ${alpha("#000000", 0.3)}`,
              }}
            >
              {bought > 0.5 ? "Upgraded" : "Confirm"}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
