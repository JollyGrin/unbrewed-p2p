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
 * Onboarding (#1656): an easy/medium game that pays is drawn like a counted
 * one (bar, XP, tiles) with a "Practice game 3 of 5" caption; the bonuses a
 * game triggered are line items under the bar ("First game +100", and since
 * #1666 the practice pay and any starter quest it completed, so the rows add
 * up to the headline); and when
 * the api sends the `daily` block a fourth tile shows the day streak and what
 * tomorrow pays. With neither block in the payload the card is the #1399 one.
 *
 * Nothing here computes a number. Every figure is a snapshot the page held
 * before the game or a refetch after it landed (`useGameEarned`); while the
 * api is still counting the card says so, and if it never catches up in time
 * it says that too — in the same calm voice, with no error styling.
 *
 * #1670: every bonus row, the practice caption and the no-XP practice note
 * carry a "?" that says what the line is (`bonusRowHelp`, `EarnedHelpTip`),
 * and the landing is animated once: the gold segment grows, "+N XP" counts
 * up, a sheen sweeps the track, the rows arrive in turn, and a level-up fills
 * the old bar first. All of it is transforms, opacity and `aria-hidden`
 * overlays over a DOM that already holds the final values (`earnedMotion`).
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { EarnedHelpTip } from "@/components/Pro/EarnedHelpTip";
import { CASUAL_SPLIT_NOTE } from "@/components/Account/AccountStats";
import { FORFEIT_POINTS_NOTE } from "@/components/Pro/ForfeitDialog";
import { BadgeGlyph, badgeArtName } from "@/components/Badges/BadgeGlyph";
import {
  EARNED_NO_BASELINE_LINE,
  EARNED_TIMEOUT_CAPTION,
  EARNED_WAITING_CAPTION,
  LevelBar,
  PRACTICE_POINTS_NOTE,
  bonusRowHelp,
  bonusRowKey,
  bonusRowText,
  dailyStreakTitle,
  dailyTomorrowCaption,
  landedLevelBar,
  pointsCaption,
  practiceCaptionFor,
  practiceHelp,
  practicePaidBody,
  practicePaidNote,
  streakLabel,
  waitingLevelBar,
  xpLine,
} from "@/lib/pro/earned";
import { LandingTimeline, landingTimeline } from "@/lib/pro/earnedMotion";
import { useCountUp, useLandingMotion } from "@/lib/pro/useEarnedLanding";
import type { GameEarnedView } from "@/lib/pro/useGameEarned";

const DIM = "rgba(250, 235, 215, 0.6)";
const MUTED = "rgba(250, 235, 215, 0.55)";
const TRACK = "rgba(250, 235, 215, 0.15)";
/** The hatched placeholder: a shape that says "something goes here", never a number. */
export const PLACEHOLDER_HATCH =
  "repeating-linear-gradient(90deg, rgba(224,168,46,.5) 0 4px, rgba(224,168,46,.15) 4px 8px)";

// --- the landing animation (#1670) -------------------------------------------

const EASE_OUT = "cubic-bezier(.22, 1, .36, 1)";
const growX = keyframes`from { transform: scaleX(0); } to { transform: scaleX(1); }`;
const rowIn = keyframes`from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); }`;
const sweep = keyframes`from { transform: translateX(-110%); } to { transform: translateX(360%); }`;
const flash = keyframes`0% { opacity: 0; } 35% { opacity: 1; } 100% { opacity: 0; }`;
const vanish = keyframes`from { opacity: 1; } to { opacity: 0; }`;
const appear = keyframes`from { opacity: 0; } to { opacity: 1; }`;

/**
 * One animation, held at its first frame until its delay and at its last
 * after it. The media query is the second lock on reduced motion; the first
 * is that the card never asks to play there.
 */
const once = (name: string, ms: number, delayMs: number, easing = EASE_OUT) => ({
  animation: `${name} ${ms}ms ${easing} ${delayMs}ms both`,
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
});

/** What the bar needs to play the landing; null draws it still. */
interface BarMotion {
  timeline: LandingTimeline;
  /** Level-up: the old level's fill, which runs to the end before the reset. */
  wrapFrom: number | null;
}

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

const Card = ({
  children,
  compact,
  phase,
  landing,
}: {
  children: React.ReactNode;
  compact: boolean;
  phase: string;
  /** True while the landing animation plays. */
  landing?: boolean;
}) => (
  <Flex
    direction="column"
    gap={compact ? "0.5rem" : "0.65rem"}
    p={compact ? "0.7rem 0.8rem" : "0.85rem 1rem"}
    borderRadius="10px"
    bg="rgba(20, 8, 24, 0.45)"
    border="1px solid rgba(231, 204, 152, 0.14)"
    data-testid="post-game-earned-card"
    data-phase={phase}
    data-landing={landing ? "playing" : undefined}
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
const Bar = ({ bar, levelUp, motion = null }: { bar: LevelBar; levelUp: boolean; motion?: BarMotion | null }) => {
  const wrap = motion?.timeline.wrap ?? null;
  return (
    <Box
      h="10px"
      borderRadius="5px"
      bg={TRACK}
      overflow="hidden"
      display="flex"
      position="relative"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bar.base + bar.delta}
      aria-label={`Level ${bar.level}, ${bar.base + bar.delta}% to the next level`}
      data-testid="post-game-level-bar"
      boxShadow={levelUp ? "0 0 0 1px rgba(224,168,46,0.6), 0 0 12px rgba(224,168,46,0.45)" : undefined}
      transition="box-shadow 400ms ease"
      sx={{ "@media (prefers-reduced-motion: reduce)": { transition: "none" } }}
    >
      <Box w={`${bar.base}%`} h="10px" bg="brand.primary" data-testid="post-game-level-base" />
      {bar.delta > 0 && (
        // The width is final from the first render; what grows is the scale.
        <Box
          w={`${bar.delta}%`}
          h="10px"
          bg="brand.accent"
          data-testid="post-game-level-delta"
          transformOrigin="left center"
          sx={motion ? once(growX, motion.timeline.fill.ms, motion.timeline.fill.startMs) : undefined}
        />
      )}
      {bar.placeholder > 0 && (
        <Box
          w={`${bar.placeholder}%`}
          h="10px"
          style={{ backgroundImage: PLACEHOLDER_HATCH }}
          data-testid="post-game-level-placeholder"
        />
      )}
      {motion && wrap && motion.wrapFrom !== null && (
        // Level-up, first half: the OLD level's bar runs to the end, the track
        // flashes, and the whole overlay goes at the reset.
        <Box
          aria-hidden
          position="absolute"
          inset={0}
          display="flex"
          pointerEvents="none"
          data-testid="post-game-level-wrap"
          sx={once(vanish, 120, wrap.resetMs - 120, "linear")}
        >
          <Box w={`${motion.wrapFrom}%`} h="10px" bg="brand.primary" />
          <Box
            w={`${100 - motion.wrapFrom}%`}
            h="10px"
            bg="brand.accent"
            transformOrigin="left center"
            sx={once(growX, wrap.ms, wrap.startMs)}
          />
          <Box
            position="absolute"
            inset={0}
            bg="rgba(255, 246, 220, 0.95)"
            sx={once(flash, wrap.flashMs, wrap.startMs + wrap.ms, "ease-out")}
          />
        </Box>
      )}
      {motion && (
        <Box
          aria-hidden
          position="absolute"
          top={0}
          bottom={0}
          left={0}
          w="30%"
          pointerEvents="none"
          data-testid="post-game-level-sheen"
          style={{ backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.85), rgba(255,255,255,0))" }}
          sx={once(sweep, motion.timeline.sheen.ms, motion.timeline.sheen.startMs, "ease-in-out")}
        />
      )}
    </Box>
  );
};

/** "2× Quick Play", "1.5× Quick Play". */
export const quickPlayCaption = (multiplier: number): string =>
  `${Number.isInteger(multiplier) ? multiplier : Math.round(multiplier * 10) / 10}× Quick Play`;

export const ProPostGameEarned = ({
  view,
  heroName,
  compact = false,
  xpMultiplier = null,
}: {
  view: GameEarnedView;
  /** The played hero's display name, for the points tile. */
  heroName: string;
  compact?: boolean;
  /**
   * The room's locked-in XP multiplier (#1542 ↔ engine #1035). Above 1 it adds a
   * "2× Quick Play" caption beside the XP; the number itself still comes from
   * `/me/stats`, which already paid it.
   */
  xpMultiplier?: number | null;
}) => {
  // The landing (#1670), decided before any early return: a landing is the
  // `delta` object the poll built, the same one on every re-render and remount.
  const landing = view.phase === "landed" ? view.delta : null;
  const timeline = landingTimeline(!!landing?.levelUp, landing?.bonuses.length ?? 0);
  const playing = useLandingMotion(landing, timeline.totalMs);
  const counted = useCountUp(landing, landing?.xp ?? null, playing, timeline.count);

  if (view.phase === "casual") {
    // The api's practice cap, when it sent one: the note then owns up to the
    // games that DID pay. Without it this is the #592 note, word for word.
    const cap = view.practiceCap !== null && view.practiceCap > 0 ? view.practiceCap : null;
    return (
      <Card compact={compact} phase="casual">
        <Flex align="center" gap="0.35rem">
          <Text fontSize={compact ? "0.82rem" : "0.9rem"} fontWeight={600} color={MUTED} data-testid="post-game-earned-note">
            {cap !== null ? practicePaidNote(cap) : CASUAL_SPLIT_NOTE}
          </Text>
          <EarnedHelpTip help={practiceHelp(cap !== null ? { cap } : null)} />
        </Flex>
        {cap !== null ? (
          <Text fontSize="0.72rem" color={DIM} data-testid="post-game-earned-note-body">
            {practicePaidBody(cap)}
          </Text>
        ) : (
          <Text fontSize="0.72rem" color={DIM}>
            Easy and medium bot games are practice — play a hard bot, an expert bot or a person to earn XP and
            cosmetic points.
          </Text>
        )}
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
  const practiceUsed = landed && view.practice ? (view.after.bonuses?.practice ?? null) : null;
  // What the help copy may quote: the landed blocks, as the api sent them.
  const helpContext = landed ? { practice: view.after.bonuses?.practice ?? null, daily: view.after.daily } : {};
  const motion = playing ? { timeline, wrapFrom: levelUp ? (waitingLevelBar(view.before.stats)?.base ?? null) : null } : null;
  const fromLevel = motion && motion.wrapFrom !== null ? view.before.stats.level : null;
  const caption = landed
    ? levelUp
      ? "Level up — the bar starts over"
      : null
    : view.phase === "timeout"
      ? EARNED_TIMEOUT_CAPTION
      : EARNED_WAITING_CAPTION;

  // The bonuses this game triggered, as line items: only once landed, only
  // the ones the two snapshots show flipping (`earnedBonuses`).
  const bonuses = delta?.bonuses ?? [];
  const bonusRows = bonuses.length > 0 && (
    <Flex as="ul" direction="column" gap="0.1rem" listStyleType="none" m={0} p={0} data-testid="post-game-bonuses">
      {bonuses.map((bonus, index) => {
        const text = bonusRowText(bonus, heroName);
        return (
          <Flex
            as="li"
            key={bonusRowKey(bonus)}
            justify="space-between"
            align="baseline"
            gap="0.75rem"
            fontSize="0.78rem"
            data-testid="post-game-bonus"
            data-bonus={bonus.kind}
            sx={motion ? once(rowIn, timeline.rows.ms, timeline.rows.startMs + index * timeline.rows.staggerMs, "ease-out") : undefined}
          >
            <Flex align="center" gap="0.3rem" minW={0}>
              <Text color="rgba(250, 235, 215, 0.85)">{text.label}</Text>
              <EarnedHelpTip help={bonusRowHelp(bonus, heroName, helpContext)} />
            </Flex>
            <Text fontWeight={700} color="brand.accent" flexShrink={0} sx={{ fontVariantNumeric: "tabular-nums" }}>
              {text.amount}
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );

  const level = bar && (
    <Flex direction="column" gap="0.3rem" data-testid="post-game-level">
      <Flex align="baseline" justify="space-between" gap="0.5rem" flexWrap="wrap">
        <Flex align="baseline" gap="0.5rem">
          {/* The title reads the landed level from the first render; on a
              level-up the old one is laid over it until the bar resets. */}
          <Box display="inline-grid">
            <Text
              gridArea="1 / 1"
              fontFamily="LeagueGothic"
              fontSize={compact ? "1.4rem" : "1.625rem"}
              lineHeight="1"
              color={levelUp ? "brand.accent" : "brand.parchment"}
              data-testid="post-game-level-title"
              data-level-up={levelUp ? "true" : "false"}
              sx={motion?.timeline.wrap && fromLevel !== null ? once(appear, 160, motion.timeline.wrap.resetMs - 80, "linear") : undefined}
            >
              Level {bar.level}
            </Text>
            {motion?.timeline.wrap && fromLevel !== null && (
              <Text
                aria-hidden
                gridArea="1 / 1"
                fontFamily="LeagueGothic"
                fontSize={compact ? "1.4rem" : "1.625rem"}
                lineHeight="1"
                color="brand.parchment"
                data-testid="post-game-level-title-from"
                sx={once(vanish, 160, motion.timeline.wrap.resetMs - 80, "linear")}
              >
                Level {fromLevel}
              </Text>
            )}
          </Box>
          {landed ? (
            delta?.xp !== null && delta?.xp !== undefined ? (
              // The real figure is there (and read out) from the start; while
              // the landing plays it is transparent under the counting one.
              <Box display="inline-grid">
                <Text
                  gridArea="1 / 1"
                  fontSize="0.82rem"
                  fontWeight={700}
                  color="brand.accent"
                  opacity={counted !== null ? 0 : undefined}
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                  data-testid="post-game-xp-delta"
                >
                  +{delta.xp.toLocaleString()} XP
                </Text>
                {counted !== null && (
                  <Text
                    aria-hidden
                    gridArea="1 / 1"
                    fontSize="0.82rem"
                    fontWeight={700}
                    color="brand.accent"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                    data-testid="post-game-xp-count"
                  >
                    +{counted.toLocaleString()} XP
                  </Text>
                )}
              </Box>
            ) : null
          ) : (
            <Text fontSize="0.82rem" fontWeight={600} color={MUTED} data-testid="post-game-xp-counting">
              XP counting…
            </Text>
          )}
          {xpMultiplier !== null && xpMultiplier > 1 && (
            <Text
              as="span"
              fontFamily="BebasNeueRegular"
              letterSpacing="0.06em"
              fontSize="0.8rem"
              px="0.4rem"
              borderRadius="3px"
              bg="brand.accent"
              color="brand.surfaceDim"
              data-testid="post-game-xp-multiplier"
            >
              {quickPlayCaption(xpMultiplier)}
            </Text>
          )}
        </Flex>
        <Text fontSize="0.75rem" color={DIM} sx={{ fontVariantNumeric: "tabular-nums" }} data-testid="post-game-xp-line">
          {xpLine(bar)}
        </Text>
      </Flex>
      <Bar bar={bar} levelUp={levelUp} motion={motion} />
      {bonusRows}
      {practiceUsed && (
        <Flex align="center" gap="0.3rem">
          <Text fontSize="0.7rem" color="rgba(250, 235, 215, 0.5)" data-testid="post-game-practice-caption">
            {practiceCaptionFor(practiceUsed, bonuses)}
          </Text>
          <EarnedHelpTip help={practiceHelp(practiceUsed)} />
        </Flex>
      )}
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
  ) : view.practice && delta.points === 0 ? (
    <Tile compact={compact} testId="post-game-points" title="No points" caption={PRACTICE_POINTS_NOTE} tone="muted" />
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

  // The daily tile (#1656): only when the api sent the block. Before the game
  // lands it shows the day the page already knew about, muted; a player whose
  // day had not started yet has no number to show until it does.
  const dailyBefore = view.before.stats.daily;
  const dailyAfter = landed ? view.after.daily : null;
  const daily = dailyAfter ? (
    <Tile
      compact={compact}
      testId="post-game-daily"
      title={dailyStreakTitle(dailyAfter)}
      caption={dailyTomorrowCaption(dailyAfter)}
      tone={delta?.bonuses.some((bonus) => bonus.kind === "daily") ? "gold" : "plain"}
    />
  ) : dailyBefore && !landed ? (
    <Tile
      compact={compact}
      testId="post-game-daily"
      title={dailyBefore.playedToday ? dailyStreakTitle(dailyBefore) : "Daily streak…"}
      caption="updates once recorded"
      tone="muted"
    />
  ) : null;
  // Four tiles do not fit abreast in the panel's half-width slot: two rows of two.
  const tileCount = 2 + (streak ? 1 : 0) + (daily ? 1 : 0);

  return (
    <Card compact={compact} phase={view.phase} landing={playing}>
      {level}
      {/* The phone sheet lets the tiles wrap to two rows rather than squeeze three abreast. */}
      <Box
        display="grid"
        gridTemplateColumns={compact ? "repeat(auto-fit, minmax(7.5rem, 1fr))" : tileCount > 3 ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))"}
        gap={compact ? "0.5rem 0.6rem" : "0.5rem"}
      >
        {points}
        {streak}
        {daily}
        {badge}
      </Box>
    </Card>
  );
};
