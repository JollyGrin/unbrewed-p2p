/**
 * The quests panel (issue #1658): a "Getting started" checklist and a "Today"
 * block with the day streak. Mounted on the /pro launcher (dark) and on
 * /account (parchment).
 *
 * It renders NOTHING — not a frame, not a skeleton — while loading, when the
 * API has no quests to send (404 on an older deploy, 503, unreachable) and for
 * an empty payload. The client ships ahead of the API, so for most of this
 * feature's first days "nothing" is the page exactly as it was. It also means a
 * player with no quests payload never sees the layout move.
 *
 * Nothing here knows the economy. Titles, rewards, progress and the XP numbers
 * in the streak line all come off the wire; the only client-side knowledge is
 * where a quest's row links (lib/account/quests `questHref`) and the titles a
 * guest is teased with.
 *
 * `QuestsPanelView` is the pure half (state in, markup out) so every fixture
 * renders without a store; `QuestsPanel` connects it to `useQuests`.
 */
import { useEffect, useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/router";

import {
  GUEST_STARTER_TEASER,
  type DailyBonus,
  type Quest,
  allDone,
  doneCount,
  isEmptyBoard,
  progressLabel,
  questActionLabel,
  questHref,
  resetCountdown,
  rewardLabel,
} from "@/lib/account/quests";
import { signInLink } from "@/lib/account/signInLink";
import { type QuestsState, useQuests } from "@/lib/account/useQuests";

/** `dark` sits on the /pro launcher, `parchment` on the account pages. */
export type QuestsTone = "dark" | "parchment";

interface Palette {
  frame: Record<string, string>;
  accent: string;
  done: string;
  rule: string;
  chipBg: string;
  rowHover: string;
  headFont: string;
}

const PALETTES: Record<QuestsTone, Palette> = {
  dark: {
    // The launcher's side-card look (components/Pro/ProLanding CARD).
    frame: {
      p: "0.9rem 1rem",
      borderRadius: "0.6rem",
      bg: "rgba(224,168,46,0.07)",
      border: "1px solid rgba(224,168,46,0.4)",
    },
    accent: "brand.accent",
    done: "#39B7A8",
    rule: "rgba(250,235,215,0.12)",
    chipBg: "rgba(224,168,46,0.16)",
    rowHover: "rgba(250,235,215,0.07)",
    headFont: "BebasNeueRegular",
  },
  parchment: {
    // components/Account/Shell Panel.
    frame: {
      p: "1.1rem",
      borderRadius: "0.75rem",
      bg: "brand.parchment",
      boxShadow: "0 2px 8px rgba(20, 8, 24, 0.25)",
    },
    accent: "brand.secondary",
    done: "#2E7D6B",
    rule: "rgba(72, 40, 79, 0.15)",
    chipBg: "rgba(72, 40, 79, 0.1)",
    rowHover: "rgba(72, 40, 79, 0.07)",
    headFont: "LeagueGothic",
  },
};

const Head = ({
  palette,
  children,
  aside,
}: {
  palette: Palette;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) => (
  <Flex justifyContent="space-between" alignItems="baseline" gap="0.6rem">
    <Text as="h2" fontFamily={palette.headFont} fontSize="1.25rem" letterSpacing="0.05em" lineHeight="1.1">
      {children}
    </Text>
    {aside}
  </Flex>
);

const Pill = ({
  palette,
  children,
  ...rest
}: { palette: Palette; children: React.ReactNode } & React.ComponentProps<typeof Text>) => (
  <Text
    as="span"
    flexShrink={0}
    fontFamily="SpaceGrotesk"
    fontSize="0.65rem"
    fontWeight={700}
    lineHeight="1.5"
    px="0.4rem"
    borderRadius="full"
    bg={palette.chipBg}
    color={palette.accent}
    whiteSpace="nowrap"
    {...rest}
  >
    {children}
  </Text>
);

/** The round tick at the start of a row: filled when done, hollow when open. */
const Tick = ({ palette, done }: { palette: Palette; done: boolean }) => (
  <Box
    aria-hidden
    flexShrink={0}
    boxSize="1.05rem"
    mt="0.1rem"
    borderRadius="full"
    border="1.5px solid"
    borderColor={done ? palette.done : palette.rule}
    bg={done ? palette.done : "transparent"}
    color={done ? "white" : "transparent"}
    fontSize="0.65rem"
    fontWeight={700}
    lineHeight="1"
    display="flex"
    alignItems="center"
    justifyContent="center"
  >
    ✓
  </Box>
);

/**
 * One quest. An OPEN row is a link to where the quest is done; a done row is
 * plain text, struck back, with nowhere left to send the player.
 */
const QuestRow = ({
  quest,
  palette,
  withHref,
}: {
  quest: Quest;
  palette: Palette;
  withHref: (href: string) => string;
}) => {
  const reward = rewardLabel(quest.reward);
  const progress = quest.done ? null : progressLabel(quest);
  const body = (
    <>
      <Tick palette={palette} done={quest.done} />
      <Box flex="1" minW={0}>
        <Flex alignItems="center" gap="0.4rem" flexWrap="wrap">
          <Text
            fontFamily="SpaceGrotesk"
            fontSize="0.82rem"
            fontWeight={600}
            lineHeight="1.25"
            opacity={quest.done ? 0.6 : 1}
            textDecoration={quest.done ? "line-through" : undefined}
          >
            {quest.title}
          </Text>
          {progress && (
            <Text as="span" fontFamily="SpaceGrotesk" fontSize="0.7rem" opacity={0.65}>
              {progress}
            </Text>
          )}
          {reward && (
            <Pill palette={palette} data-testid="quest-reward" opacity={quest.done ? 0.6 : 1} whiteSpace="normal">
              {reward}
            </Pill>
          )}
        </Flex>
        {!quest.done && quest.description && (
          <Text fontFamily="ArchivoNarrow" fontSize="0.82rem" lineHeight="1.3" opacity={0.7}>
            {quest.description}
          </Text>
        )}
      </Box>
      {!quest.done && (
        <Text as="span" flexShrink={0} fontFamily="SpaceGrotesk" fontSize="0.7rem" color={palette.accent} whiteSpace="nowrap" mt="0.1rem">
          {questActionLabel(quest.id)} →
        </Text>
      )}
    </>
  );

  const rowProps = {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    p: "0.3rem 0.35rem",
    mx: "-0.35rem",
    borderRadius: "0.4rem",
  } as const;

  return (
    <Box as="li" data-testid={`quest-${quest.id}`} data-done={quest.done ? "true" : "false"}>
      {quest.done ? (
        <Box {...rowProps}>
          {body}
          <Text as="span" srOnly>
            (done)
          </Text>
        </Box>
      ) : (
        <Box
          as={NextLink}
          href={withHref(questHref(quest.id))}
          {...rowProps}
          _hover={{ bg: palette.rowHover, textDecoration: "none" }}
        >
          {body}
        </Box>
      )}
    </Box>
  );
};

const QuestList = ({
  quests,
  palette,
  withHref,
  label,
}: {
  quests: Quest[];
  palette: Palette;
  withHref: (href: string) => string;
  label: string;
}) => (
  <Flex as="ul" aria-label={label} listStyleType="none" flexDir="column" gap="0.1rem" mt="0.35rem">
    {quests.map((quest) => (
      <QuestRow key={quest.id} quest={quest} palette={palette} withHref={withHref} />
    ))}
  </Flex>
);

/**
 * "Day N" and what it pays. `streak` stays alive through the day after the
 * last game, so a player who hasn't played yet today is told what they would
 * be keeping rather than shown yesterday's number as if it were banked.
 */
const StreakLine = ({
  daily,
  countdown,
  palette,
}: {
  daily: DailyBonus | null;
  countdown: string | null;
  palette: Palette;
}) => {
  const parts: string[] = [];
  if (daily) {
    if (daily.playXpToday > 0) {
      parts.push(
        daily.playedToday
          ? `Today's bonus: +${daily.playXpToday} XP, earned`
          : `Today's bonus: +${daily.playXpToday} XP for your first game`,
      );
    }
    if (daily.playXpTomorrow > 0) parts.push(`Tomorrow: +${daily.playXpTomorrow} XP`);
  }
  if (countdown) parts.push(`Resets in ${countdown}`);
  if (parts.length === 0) return null;
  return (
    <Text
      data-testid="quests-streak-line"
      mt="0.4rem"
      pt="0.4rem"
      borderTop="1px solid"
      borderColor={palette.rule}
      fontFamily="SpaceGrotesk"
      fontSize="0.7rem"
      lineHeight="1.5"
      opacity={0.75}
    >
      {parts.join(" · ")}
    </Text>
  );
};

const streakHeadline = (daily: DailyBonus | null): string | null => {
  if (!daily) return null;
  if (daily.playedToday) return `Day ${Math.max(1, daily.streak)}`;
  // Not played yet: today would be the NEXT day of a live run, or day 1.
  return daily.streak > 0 ? `Day ${daily.streak + 1} if you play today` : null;
};

/** The guest teaser: the starter titles and the way in. No play links. */
const GuestTeaser = ({ palette, returnTo }: { palette: Palette; returnTo: string }) => (
  <Box as="section" aria-label="Getting started" data-testid="quests-teaser" {...palette.frame}>
    <Head palette={palette}>Getting started</Head>
    <Text fontFamily="ArchivoNarrow" fontSize="0.85rem" lineHeight="1.4" opacity={0.8} mt="0.2rem">
      {GUEST_STARTER_TEASER.map((quest) => quest.title).join(" · ")}
    </Text>
    <Text fontFamily="SpaceGrotesk" fontSize="0.75rem" mt="0.45rem">
      <Box
        as="a"
        // A plain anchor: a cross-origin OAuth handoff must be a real navigation.
        {...signInLink(returnTo)}
        color={palette.accent}
        fontWeight={700}
        textDecoration="underline"
      >
        Sign in with Discord
      </Box>{" "}
      <Box as="span" opacity={0.75}>
        to earn XP for each one and keep a daily streak.
      </Box>
    </Text>
  </Box>
);

export interface QuestsPanelViewProps {
  state: QuestsState;
  tone: QuestsTone;
  /** `Date.now()` for the reset countdown; null (the server render) hides it. */
  now?: number | null;
  /** Where sign-in returns a guest to. */
  returnTo?: string;
  /** Decorates internal links (the launcher keeps `?debug` alive). */
  withHref?: (href: string) => string;
}

const identity = (href: string) => href;

export const QuestsPanelView = ({
  state,
  tone,
  now = null,
  returnTo = "/pro",
  withHref = identity,
  ...rest
}: QuestsPanelViewProps & Omit<React.ComponentProps<typeof Box>, "children">) => {
  const palette = PALETTES[tone];

  if (state.status === "guest") {
    return (
      <Box {...rest}>
        <GuestTeaser palette={palette} returnTo={returnTo} />
      </Box>
    );
  }
  if (state.status !== "ready" || !state.board || isEmptyBoard(state.board)) return null;

  const { starter, daily: dailyQuests } = state.board;
  const daily = state.daily;
  const starterDone = allDone(starter);
  const resetsAt = state.board.resetsAt ?? daily?.resetsAt ?? null;
  const countdown = now === null ? null : resetCountdown(resetsAt, now);
  const headline = streakHeadline(daily);
  const showToday = dailyQuests.length > 0 || !!daily;

  return (
    <Box as="section" aria-label="Quests" data-testid="quests-panel" {...palette.frame} {...rest}>
      {starter.length > 0 &&
        (starterDone ? (
          // All done: the checklist has said its piece; one line, no rows.
          <Text data-testid="quests-starter-summary" fontFamily="SpaceGrotesk" fontSize="0.78rem" opacity={0.8}>
            <Box as="span" color={palette.done} fontWeight={700} mr="0.35rem">
              ✓
            </Box>
            Getting started: all {starter.length} done
          </Text>
        ) : (
          <Box data-testid="quests-starter">
            <Head
              palette={palette}
              aside={
                <Text fontFamily="SpaceGrotesk" fontSize="0.7rem" opacity={0.65} whiteSpace="nowrap">
                  {doneCount(starter)} of {starter.length} done
                </Text>
              }
            >
              Getting started
            </Head>
            <QuestList quests={starter} palette={palette} withHref={withHref} label="Getting started" />
          </Box>
        ))}

      {showToday && (
        <Box
          data-testid="quests-today"
          mt={starter.length > 0 ? "0.7rem" : 0}
          pt={starter.length > 0 ? "0.6rem" : 0}
          borderTop={starter.length > 0 ? "1px solid" : undefined}
          borderColor={palette.rule}
        >
          <Head
            palette={palette}
            aside={
              headline && (
                <Pill palette={palette} data-testid="quests-streak">
                  {headline}
                </Pill>
              )
            }
          >
            Today
          </Head>
          {dailyQuests.length > 0 && (
            <QuestList quests={dailyQuests} palette={palette} withHref={withHref} label="Today" />
          )}
          <StreakLine daily={daily} countdown={countdown} palette={palette} />
        </Box>
      )}
    </Box>
  );
};

/** How often the reset countdown re-reads the clock. It shows minutes. */
const TICK_MS = 30_000;

/**
 * The connected panel. `Date.now()` is read only after mount, so the static
 * export and the first client render agree (no countdown in either).
 */
export const QuestsPanel = ({
  tone,
  withHref,
  ...rest
}: {
  tone: QuestsTone;
  withHref?: (href: string) => string;
} & Omit<React.ComponentProps<typeof Box>, "children">) => {
  const state = useQuests();
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const ticking = state.status === "ready";

  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);

  return (
    <QuestsPanelView
      state={state}
      tone={tone}
      now={now}
      returnTo={router?.asPath ?? "/pro"}
      withHref={withHref}
      {...rest}
    />
  );
};
