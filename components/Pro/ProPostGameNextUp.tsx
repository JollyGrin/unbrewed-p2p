/**
 * The "Next up" strip of the post-game panel (p2p #1657, onboarding).
 *
 * "What you earned" looks back at the game; this looks at the next one. Up to
 * three rows, ranked by `lib/pro/nextUp`: an upgrade the played hero can
 * already afford (with a button straight to that hero on /collection), then
 * the nearest goals. Winners and losers get the same strip; a guest gets one
 * row pointing at sign-in.
 *
 * Below the near goals it also says what to play next (p2p #1659): the bot
 * ladder's one-tap rematch a tier up after a win, progress toward the hidden
 * bot, and a hero never piloted with a one-tap bot game as it.
 *
 * It draws from what the page already holds — the pre-game cosmetics, stats
 * and badge case — so it is on screen with the panel's first paint, and it
 * re-ranks once the earned poll lands and this game's points and XP are real.
 * It fetches nothing of its own. With nothing to say it renders nothing.
 *
 * It is also where the Collection nav dot learns about a new upgrade: the
 * played hero's affordable tier is written to `lib/collection/upgradeSeen`.
 */
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";
import { TbArrowUpRight, TbPlayerPlayFilled } from "react-icons/tb";

import { useSignInReturn } from "@/components/Account/AccountChip";
import type { Badge } from "@/lib/account/badges";
import type { CosmeticConstants, HeroCosmetics } from "@/lib/account/cosmetics";
import { FALLBACK_CONSTANTS } from "@/lib/account/cosmetics";
import { signInLink } from "@/lib/account/signInLink";
import type { AccountStats } from "@/lib/account/stats";
import type { AccountState } from "@/lib/account/useAccount";
import { noteAffordableUpgrade } from "@/lib/collection/upgradeSeen";
import { availableBotTiers } from "@/lib/pro/botTiers";
import { TAP_TARGET } from "@/lib/pro/mobileLayout";
import {
  NewHeroInput,
  NextUpRow,
  affordableTier,
  botTierPlayed,
  collectionHref,
  heroAfterGame,
  nextUpCopy,
  nextUpRows,
} from "@/lib/pro/nextUp";
import type { HeroListing } from "@/lib/pro/protocol";
import type { FinishedGameSetup } from "@/lib/pro/rematch";
import { TIER_UNLOCK, winsVsRequired } from "@/lib/pro/tierUnlock";
import type { GameEarnedView } from "@/lib/pro/useGameEarned";

/** What the page holds that the strip ranks from (see `ProPostGameContext.nextUp`). */
export interface NextUpHeld {
  /** The hero you played; null when the view never said. */
  heroId: string | null;
  /** The pre-game `/me/cosmetics` rows, as the socket holds them. */
  cosmeticHeroes: readonly HeroCosmetics[];
  /** The api's ladder; null falls back to the client's copy of it. */
  cosmeticConstants: CosmeticConstants | null;
  /** The pre-game `/me/stats`; null when it never arrived. */
  stats: AccountStats | null;
  /** The badge case (the shared store, which the earned poll re-probes on landing). */
  badges: readonly Badge[];
  // --- what to play next (p2p #1659); all optional, absent = no such row ---
  /** The finished game's setup (the Rematch link's source); null until the replay bundle lands. */
  setup?: FinishedGameSetup | null;
  /** The server's hero listings: the playable roster and each hero's bot tiers. */
  roster?: readonly HeroListing[] | null;
  /** The hidden tier is already open to this player (the allowlist), so no progress row. */
  hiddenBotUnlocked?: boolean;
  /** Games per hero across all players, if the page ever holds it (it does not fetch it). */
  heroPlays?: Readonly<Record<string, number>> | null;
}

const DIM = "rgba(250, 235, 215, 0.6)";

const rowKey = (row: NextUpRow): string => (row.kind === "badge" ? `badge:${row.id}` : row.kind);

/** The rows for this game, from held data plus whatever the earned poll has landed. */
export const nextUpFor = (
  accountStatus: AccountState["status"],
  held: NextUpHeld,
  earned: GameEarnedView | null,
  victory: boolean,
): { rows: NextUpRow[]; hero: HeroCosmetics | null; constants: CosmeticConstants } => {
  const constants = held.cosmeticConstants ?? FALLBACK_CONSTANTS;
  if (accountStatus !== "signed-in") {
    return { rows: accountStatus === "guest" ? nextUpRows({ guest: true, hero: null, constants, stats: null, winXp: null, badges: [] }) : [], hero: null, constants };
  }
  const landed = earned?.phase === "landed" ? earned : null;
  const heldHero = held.heroId ? (held.cosmeticHeroes.find((row) => row.heroId === held.heroId) ?? null) : null;
  const hero = held.heroId ? heroAfterGame(heldHero, held.heroId, landed?.delta.heroPoints ?? null) : null;
  const stats = landed ? landed.after : earned && "before" in earned ? earned.before.stats : held.stats;
  // What a win pays is the api's to know. The one honest sample the page has is
  // this game, if it was a win that landed: its XP is what "one more" is worth.
  const winXp = landed && victory && !landed.forfeit ? landed.delta.xp : null;

  // --- what to play next (p2p #1659) ---
  const setup = held.setup ?? null;
  const tier = botTierPlayed(setup);
  // The freshest `bonuses` in hand: this game's own once the poll lands.
  const bonuses = (stats && "bonuses" in stats ? stats.bonuses : null) ?? held.stats?.bonuses ?? null;
  const practice = bonuses?.practice ?? null;
  const ladder = setup
    ? {
        setup,
        won: victory,
        offered: availableBotTiers(held.roster ? [...held.roster] : null, [setup.yourHeroId, ...setup.otherSeats.map((seat) => seat.heroId)]),
        practiceSpent: !!practice && practice.cap > 0 && practice.used >= practice.cap,
      }
    : null;
  // The held record is the page-load fetch. When the landed total says it
  // predates this game, a win vs the required tier is one it has not counted.
  const heldIsPreGame = !!landed && !!held.stats && landed.after.totalGames > held.stats.totalGames;
  const expertWins =
    held.stats && !held.hiddenBotUnlocked
      ? winsVsRequired(held.stats) + (heldIsPreGame && victory && tier === TIER_UNLOCK.requires ? 1 : 0)
      : null;
  const newHero = held.roster && held.cosmeticConstants ? newHeroInput(held, landed?.after.playedHeroes ?? [], tier) : null;

  return {
    rows: nextUpRows({ guest: false, hero, constants, stats, winXp, badges: held.badges, ladder, expertWins, newHero }),
    hero,
    constants,
  };
};

/**
 * The new-hero row's facts. "Never piloted" is read from `/me/cosmetics` (a
 * hero's first finished game pays points, so any earned total means a game),
 * widened by every other record of a finished game the page holds. A hero
 * whose points are UNKNOWN (an outage) counts as piloted: never promise a
 * first-game bonus on a guess.
 */
const newHeroInput = (held: NextUpHeld, playedNow: readonly string[], tier: NewHeroInput["tier"]): NewHeroInput => ({
  // The maintained decks only: a suggestion to a newcomer is not the place
  // for a community or lab deck.
  roster: (held.roster ?? []).filter((hero) => hero.deckSection === "recommended" && hero.tier !== "lab" && hero.tier !== "reflavored"),
  piloted: [
    ...(held.heroId ? [held.heroId] : []),
    ...held.cosmeticHeroes.filter((row) => row.earned !== 0).map((row) => row.heroId),
    ...(held.stats?.byHero ?? []).flatMap((row) => (row.heroId && row.games > 0 ? [row.heroId] : [])),
    ...playedNow,
  ],
  points: held.cosmeticConstants?.heroFirstGamePoints ?? null,
  tier,
  heroPlays: held.heroPlays ?? null,
});

const PLAY_BTN = {
  size: "sm",
  minH: TAP_TARGET,
  flexShrink: 0,
  variant: "outline",
  borderColor: "rgba(231, 204, 152, 0.35)",
  color: "brand.parchment",
  fontWeight: 600,
  borderRadius: "8px",
  _hover: { bg: "rgba(255, 255, 255, 0.08)", textDecoration: "none" },
} as const;

const Row = ({
  row,
  heroName,
  compact,
  leavesTable,
}: {
  row: NextUpRow;
  heroName: string;
  compact: boolean;
  /** A human is (or may be) still at this table: a new game opens beside it, like every other link out. */
  leavesTable: boolean;
}) => {
  const onSignInClick = useSignInReturn();
  const copy = nextUpCopy(row, heroName);
  const gold = row.kind === "unlock";
  const action =
    row.kind === "unlock" ? (
      <Button
        as="a"
        // A new tab: the panel still holds a live socket (rematch offers), and
        // every other link out of it opens beside the game for the same reason.
        href={collectionHref(row.heroId)}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
        minH={TAP_TARGET}
        flexShrink={0}
        bg="brand.accent"
        color="brand.surfaceDim"
        fontWeight={700}
        borderRadius="8px"
        _hover={{ bg: "brand.accentDeep", textDecoration: "none" }}
        rightIcon={<TbArrowUpRight size="0.9rem" />}
        data-testid="next-up-upgrade"
      >
        Upgrade
      </Button>
    ) : row.kind === "sign-in" ? (
      <Button
        as="a"
        {...signInLink("/pro", onSignInClick)}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
        minH={TAP_TARGET}
        flexShrink={0}
        variant="outline"
        borderColor="rgba(231, 204, 152, 0.35)"
        color="brand.parchment"
        fontWeight={600}
        borderRadius="8px"
        _hover={{ bg: "rgba(255, 255, 255, 0.08)", textDecoration: "none" }}
        leftIcon={<FaDiscord size="0.95rem" />}
        data-testid="next-up-sign-in"
      >
        Sign in
      </Button>
    ) : row.kind === "ladder" ? (
      // The Rematch button's own link with the bots a tier up: same tab, same flow.
      <Button as={Link} href={row.href} {...PLAY_BTN} leftIcon={<TbPlayerPlayFilled size="0.8rem" />} data-testid="next-up-ladder">
        Play
      </Button>
    ) : row.kind === "new-hero" ? (
      <Button
        as={Link}
        href={row.href}
        {...(leavesTable ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...PLAY_BTN}
        leftIcon={<TbPlayerPlayFilled size="0.8rem" />}
        data-testid="next-up-new-hero"
      >
        Play
      </Button>
    ) : null;
  const progress = "progress" in row ? Math.round(Math.max(0, Math.min(1, row.progress)) * 100) : null;

  return (
    <Flex
      align="center"
      gap="0.6rem"
      minW={0}
      p={compact ? "0.5rem 0.65rem" : "0.6rem 0.75rem"}
      borderRadius="8px"
      bg={gold ? "rgba(224, 168, 46, 0.12)" : "rgba(250, 235, 215, 0.05)"}
      border={gold ? "1px solid rgba(224, 168, 46, 0.45)" : "1px solid rgba(231, 204, 152, 0.1)"}
      data-testid="next-up-row"
      data-kind={row.kind}
    >
      <Flex direction="column" gap="0.2rem" minW={0} flex="1 1 0">
        <Text fontSize={compact ? "0.82rem" : "0.88rem"} fontWeight={700} color={gold ? "brand.accent" : "brand.parchment"} lineHeight="1.2">
          {copy.title}
        </Text>
        <Text fontSize="0.7rem" color={DIM}>
          {copy.caption}
        </Text>
        {progress !== null && (
          <Box h="4px" borderRadius="2px" bg="rgba(250, 235, 215, 0.15)" overflow="hidden" aria-hidden>
            <Box w={`${progress}%`} h="4px" bg="brand.primary" />
          </Box>
        )}
      </Flex>
      {action}
    </Flex>
  );
};

export const ProPostGameNextUp = ({
  accountStatus,
  held,
  earned,
  heroName,
  victory,
  layout,
}: {
  accountStatus: AccountState["status"];
  held: NextUpHeld;
  earned: GameEarnedView | null;
  /** The played hero's display name, for the cosmetics rows. */
  heroName: string;
  victory: boolean;
  layout: "panel" | "sheet";
}) => {
  const { rows, hero, constants } = useMemo(
    () => nextUpFor(accountStatus, held, earned, victory),
    [accountStatus, held, earned, victory],
  );

  // The nav dot's side of it: say what the hero just played can afford now.
  // Only once that is actually known — an unknown balance must not clear a dot.
  const affordable = hero && hero.available !== null ? affordableTier(hero, constants) : null;
  const heroId = hero?.heroId ?? null;
  useEffect(() => {
    if (heroId && affordable !== null) noteAffordableUpgrade(heroId, affordable);
  }, [heroId, affordable]);

  if (rows.length === 0) return null;
  const panel = layout === "panel";
  const leavesTable = botTierPlayed(held.setup ?? null) === null;
  return (
    <Flex
      direction="column"
      gap={panel ? "0.55rem" : "0.45rem"}
      p={panel ? "0.85rem 1rem" : "0.7rem 0.8rem"}
      borderRadius="10px"
      bg="rgba(20, 8, 24, 0.45)"
      border="1px solid rgba(231, 204, 152, 0.14)"
      data-testid="post-game-next-up"
    >
      <Text
        fontFamily="SpaceGrotesk"
        fontSize="0.72rem"
        letterSpacing="0.14em"
        textTransform="uppercase"
        color={DIM}
        fontWeight={600}
      >
        Next up
      </Text>
      <Box
        display="grid"
        gridTemplateColumns={panel && rows.length > 1 ? `repeat(${rows.length}, minmax(0, 1fr))` : "1fr"}
        gap="0.5rem"
      >
        {rows.map((row) => (
          <Row key={rowKey(row)} row={row} heroName={heroName} compact={!panel} leavesTable={leavesTable} />
        ))}
      </Box>
    </Flex>
  );
};
