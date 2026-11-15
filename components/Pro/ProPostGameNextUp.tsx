/**
 * The "Next up" strip of the post-game panel (p2p #1657, onboarding).
 *
 * "What you earned" looks back at the game; this looks at the next one. Up to
 * three rows, ranked by `lib/pro/nextUp`: an upgrade the played hero can
 * already afford (with a button straight to that hero on /collection), then
 * the nearest goals. Winners and losers get the same strip; a guest gets one
 * row pointing at sign-in.
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
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";
import { TbArrowUpRight } from "react-icons/tb";

import { useSignInReturn } from "@/components/Account/AccountChip";
import type { Badge } from "@/lib/account/badges";
import type { CosmeticConstants, HeroCosmetics } from "@/lib/account/cosmetics";
import { FALLBACK_CONSTANTS } from "@/lib/account/cosmetics";
import { signInLink } from "@/lib/account/signInLink";
import type { AccountStats } from "@/lib/account/stats";
import type { AccountState } from "@/lib/account/useAccount";
import { noteAffordableUpgrade } from "@/lib/collection/upgradeSeen";
import { TAP_TARGET } from "@/lib/pro/mobileLayout";
import { NextUpRow, affordableTier, collectionHref, heroAfterGame, nextUpCopy, nextUpRows } from "@/lib/pro/nextUp";
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
  return { rows: nextUpRows({ guest: false, hero, constants, stats, winXp, badges: held.badges }), hero, constants };
};

const Row = ({ row, heroName, compact }: { row: NextUpRow; heroName: string; compact: boolean }) => {
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
          <Row key={rowKey(row)} row={row} heroName={heroName} compact={!panel} />
        ))}
      </Box>
    </Flex>
  );
};
