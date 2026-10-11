/**
 * The "What you earned" card of the post-game panel (p2p #1399, part 3).
 *
 * Three rows under the card header: "Level 7" + "+40 XP" (or "XP counting…")
 * with "1,280 / 1,400 to level 8" on the right; the 10 px level bar — the
 * pre-game fill in parchment, this game's XP as a gold segment once it is
 * real, a hatched placeholder while it is not; and three tiles: cosmetic
 * points on the hero you played, the streak, the badge. Casual-tier games get
 * the account page's "No XP" note instead of the bar; a forfeit keeps the
 * bar but the points tile says what conceding cost.
 *
 * Nothing here computes a number. Every figure is a snapshot the page held
 * before the game or a refetch after it landed (`useGameEarned`); while the
 * api is still counting the card says so, and if it never catches up in time
 * it says that too — in the same calm voice, with no error styling.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { CASUAL_SPLIT_NOTE } from "@/components/Account/AccountStats";
import { FORFEIT_POINTS_NOTE } from "@/components/Pro/ForfeitDialog";
import { BadgeGlyph, badgeArtName } from "@/components/Badges/BadgeGlyph";
import {
  EARNED_NO_BASELINE_LINE,
  EARNED_TIMEOUT_CAPTION,
  EARNED_WAITING_CAPTION,
  LevelBar,
  landedLevelBar,
  pointsCaption,
  streakLabel,
  waitingLevelBar,
  xpLine,
} from "@/lib/pro/earned";
import type { GameEarnedView } from "@/lib/pro/useGameEarned";

const DIM = "rgba(250, 235, 215, 0.6)";
const MUTED = "rgba(250, 235, 215, 0.55)";
const TRACK = "rgba(250, 235, 215, 0.15)";
/** The hatched placeholder: a shape that says "something goes here", never a number. */
export const PLACEHOLDER_HATCH =
  "repeating-linear-gradient(90deg, rgba(224,168,46,.5) 0 4px, rgba(224,168,46,.15) 4px 8px)";

const Header = () => (
  <Text
    fontFamily="SpaceGrotesk"
    fontSize="0.72rem"
    letterSpacing="0.14em"
    textTransform="uppercase"
    color={DIM}
    fontWeight={600}
  >
    What you earned
  </Text>
);

const Card = ({ children, compact, phase }: { children: React.ReactNode; compact: boolean; phase: string }) => (
  <Flex
    direction="column"
    gap={compact ? "0.5rem" : "0.65rem"}
    p={compact ? "0.7rem 0.8rem" : "0.85rem 1rem"}
    borderRadius="10px"
    bg="rgba(20, 8, 24, 0.45)"
    border="1px solid rgba(231, 204, 152, 0.14)"
    data-testid="post-game-earned-card"
    data-phase={phase}
  >
    <Header />
    {children}
  </Flex>
);

const Tile = ({
  title,
  caption,
  tone = "plain",
  testId,
  lead,
  compact,
}: {
  title: string;
  caption: string;
  tone?: "plain" | "gold" | "muted";
  testId: string;
  lead?: React.ReactNode;
  compact: boolean;
}) => (
  <Flex direction="column" gap="0.15rem" minW={0} data-testid={testId}>
    <Flex align="center" gap="0.4rem" minW={0}>
      {lead}
      <Text
        fontSize={compact ? "0.85rem" : "0.92rem"}
        fontWeight={700}
        color={tone === "gold" ? "brand.accent" : tone === "muted" ? MUTED : "brand.parchment"}
        noOfLines={compact ? 2 : 1}
      >
        {title}
      </Text>
    </Flex>
    <Text fontSize="0.7rem" color={DIM}>
      {caption}
    </Text>
  </Flex>
);

/** The 10 px track: parchment base, gold delta, hatched placeholder. */
const Bar = ({ bar, levelUp }: { bar: LevelBar; levelUp: boolean }) => (
  <Box
    h="10px"
    borderRadius="5px"
    bg={TRACK}
    overflow="hidden"
    display="flex"
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={bar.base + bar.delta}
    aria-label={`Level ${bar.level}, ${bar.base + bar.delta}% to the next level`}
    data-testid="post-game-level-bar"
    boxShadow={levelUp ? "0 0 0 1px rgba(224,168,46,0.6), 0 0 12px rgba(224,168,46,0.45)" : undefined}
    transition="box-shadow 400ms ease"
  >
    <Box w={`${bar.base}%`} h="10px" bg="brand.primary" data-testid="post-game-level-base" />
    {bar.delta > 0 && (
      <Box w={`${bar.delta}%`} h="10px" bg="brand.accent" data-testid="post-game-level-delta" transition="width 600ms ease" />
    )}
    {bar.placeholder > 0 && (
      <Box
        w={`${bar.placeholder}%`}
        h="10px"
        style={{ backgroundImage: PLACEHOLDER_HATCH }}
        data-testid="post-game-level-placeholder"
      />
    )}
  </Box>
);

export const ProPostGameEarned = ({
  view,
  heroName,
  compact = false,
}: {
  view: GameEarnedView;
  /** The played hero's display name, for the points tile. */
  heroName: string;
  compact?: boolean;
}) => {
  if (view.phase === "casual") {
    return (
      <Card compact={compact} phase="casual">
        <Text fontSize={compact ? "0.82rem" : "0.9rem"} fontWeight={600} color={MUTED} data-testid="post-game-earned-note">
          {CASUAL_SPLIT_NOTE}
        </Text>
        <Text fontSize="0.72rem" color={DIM}>
          Easy and medium bot games are practice — play a hard bot, an expert bot or a person to earn XP and
          cosmetic points.
        </Text>
      </Card>
    );
  }
  if (view.phase === "no-baseline") {
    return (
      <Card compact={compact} phase="no-baseline">
        <Text fontSize={compact ? "0.82rem" : "0.9rem"} color={MUTED} data-testid="post-game-earned-note">
          {EARNED_NO_BASELINE_LINE}
        </Text>
      </Card>
    );
  }

  const landed = view.phase === "landed";
  const bar = landed ? landedLevelBar(view.before.stats, view.after) : waitingLevelBar(view.before.stats);
  const delta = landed ? view.delta : null;
  const levelUp = !!delta?.levelUp;
  const caption = landed
    ? levelUp
      ? "Level up — the bar starts over"
      : null
    : view.phase === "timeout"
      ? EARNED_TIMEOUT_CAPTION
      : EARNED_WAITING_CAPTION;

  const level = bar && (
    <Flex direction="column" gap="0.3rem" data-testid="post-game-level">
      <Flex align="baseline" justify="space-between" gap="0.5rem" flexWrap="wrap">
        <Flex align="baseline" gap="0.5rem">
          <Text
            fontFamily="LeagueGothic"
            fontSize={compact ? "1.4rem" : "1.625rem"}
            lineHeight="1"
            color={levelUp ? "brand.accent" : "brand.parchment"}
            data-testid="post-game-level-title"
            data-level-up={levelUp ? "true" : "false"}
          >
            Level {bar.level}
          </Text>
          {landed ? (
            delta?.xp !== null && delta?.xp !== undefined ? (
              <Text fontSize="0.82rem" fontWeight={700} color="brand.accent" data-testid="post-game-xp-delta">
                +{delta.xp.toLocaleString()} XP
              </Text>
            ) : null
          ) : (
            <Text fontSize="0.82rem" fontWeight={600} color={MUTED} data-testid="post-game-xp-counting">
              XP counting…
            </Text>
          )}
        </Flex>
        <Text fontSize="0.75rem" color={DIM} sx={{ fontVariantNumeric: "tabular-nums" }} data-testid="post-game-xp-line">
          {xpLine(bar)}
        </Text>
      </Flex>
      <Bar bar={bar} levelUp={levelUp} />
      {caption && (
        <Text fontSize="0.7rem" color="rgba(250, 235, 215, 0.5)" data-testid="post-game-earned-caption">
          {caption}
        </Text>
      )}
    </Flex>
  );

  // ----- tiles -------------------------------------------------------------
  const points = view.forfeit ? (
    <Tile compact={compact} testId="post-game-points" title="No points" caption={FORFEIT_POINTS_NOTE} tone="muted" />
  ) : !landed ? (
    <Tile
      compact={compact}
      testId="post-game-points"
      title={`${heroName} pts…`}
      caption={pointsCaption(heroName, view.before.heroPoints, view.thresholds)}
      tone="muted"
    />
  ) : delta?.points === null || delta?.points === undefined ? (
    <Tile compact={compact} testId="post-game-points" title="Points pending" caption={`${heroName} cosmetics`} tone="muted" />
  ) : (
    <Tile
      compact={compact}
      testId="post-game-points"
      title={`+${delta.points.toLocaleString()} pts`}
      caption={pointsCaption(heroName, delta.heroPoints, view.thresholds)}
      tone={delta.points > 0 ? "gold" : "plain"}
    />
  );

  const beforeStreak = view.before.stats.streak;
  const best = (landed ? view.after.streakBest : view.before.stats.streakBest) ?? null;
  const streak =
    landed && delta?.streak ? (
      <Tile
        compact={compact}
        testId="post-game-streak"
        title={streakLabel(delta.streak)}
        caption={best !== null ? (delta.streak.to > best ? `new best ${delta.streak.to}` : `best ${best}`) : ""}
      />
    ) : beforeStreak !== null ? (
      <Tile
        compact={compact}
        testId="post-game-streak"
        title={`Streak ${beforeStreak}`}
        caption={landed ? "" : "updates once recorded"}
        tone="muted"
      />
    ) : null;

  const newBadge = delta?.newBadges[0] ?? null;
  const badge = newBadge ? (
    <Tile
      compact={compact}
      testId="post-game-badge"
      title={badgeArtName(newBadge)}
      caption={delta && delta.newBadges.length > 1 ? `+${delta.newBadges.length - 1} more unlocked` : "badge unlocked"}
      tone="gold"
      lead={<BadgeGlyph id={newBadge} size="1.5rem" />}
    />
  ) : (
    <Tile compact={compact} testId="post-game-badge" title="No new badge" caption={landed ? "" : "checked once recorded"} tone="muted" />
  );

  return (
    <Card compact={compact} phase={view.phase}>
      {level}
      {/* The phone sheet lets the tiles wrap to two rows rather than squeeze three abreast. */}
      <Box
        display="grid"
        gridTemplateColumns={compact ? "repeat(auto-fit, minmax(7.5rem, 1fr))" : "repeat(3, minmax(0, 1fr))"}
        gap={compact ? "0.5rem 0.6rem" : "0.5rem"}
      >
        {points}
        {streak}
        {badge}
      </Box>
    </Card>
  );
};
