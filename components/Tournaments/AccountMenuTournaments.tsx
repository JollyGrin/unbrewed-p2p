/**
 * The account menu's tournament items: "Your next match" and "My tournaments".
 * Nothing for a guest or an api failure. The account menu renders this slot
 * only on the navbar chip: a live game has no business with it.
 */
import { MenuItem, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useEffect, useState } from "react";

import { activeCountText, myTournamentCount } from "@/lib/tournaments/browse";
import { useMyTournaments } from "@/lib/tournaments/useNextMatch";

export const AccountMenuTournaments = ({ itemStyles }: { itemStyles: Record<string, unknown> }) => {
  const tournaments = useMyTournaments();
  // The view builder (bracket/match helpers) loads on demand, not with every page.
  const [viewMod, setViewMod] = useState<typeof import("@/lib/tournaments/nextMatch") | null>(null);
  const hasNext = !!tournaments?.next;
  useEffect(() => {
    if (hasNext) import("@/lib/tournaments/nextMatch").then(setViewMod, () => {}); // a failed chunk load just skips the card
  }, [hasNext]);
  const next =
    tournaments?.next && viewMod
      ? viewMod.nextMatchView(tournaments.next.match, tournaments.next.detail, tournaments.next.size, Date.now())
      : null;
  const myCount = tournaments ? myTournamentCount(tournaments.mine.tournaments) : 0;

  return (
    <>
      {next && (
        <MenuItem
          as={NextLink}
          href={next.href}
          {...itemStyles}
          data-testid="menu-next-match"
          flexDir="column"
          alignItems="flex-start"
          gap="0.1rem"
          minW={0}
          maxW="100%"
          whiteSpace="normal"
          borderBottom="1px solid"
          borderColor="whiteAlpha.300"
          pb="0.5rem"
        >
          <Text as="span" fontSize="0.7rem" letterSpacing="0.08em" textTransform="uppercase" color="brand.accent">
            Your next match
          </Text>
          <Text as="span" fontWeight={700} maxW="100%" wordBreak="break-word" overflowWrap="anywhere">{next.title}</Text>
          <Text as="span" fontSize="0.8rem" opacity={0.75} maxW="100%" wordBreak="break-word" overflowWrap="anywhere">
            {[next.tournamentName, next.timeLeft].filter(Boolean).join(" · ")}
          </Text>
          {next.notice && (
            <Text as="span" fontSize="0.8rem" opacity={0.75} whiteSpace="normal" maxW="100%" wordBreak="break-word" overflowWrap="anywhere" data-testid="menu-next-match-notice">
              {next.notice}
            </Text>
          )}
        </MenuItem>
      )}
      {tournaments && (
        <MenuItem as={NextLink} href="/tournaments" {...itemStyles}>
          My tournaments
          {myCount > 0 && (
            <Text as="span" ml="auto" pl="0.6rem" opacity={0.7} data-testid="menu-active-count">
              {activeCountText(myCount)}
            </Text>
          )}
        </MenuItem>
      )}
    </>
  );
};
