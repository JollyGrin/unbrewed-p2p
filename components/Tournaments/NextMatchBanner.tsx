/**
 * "Your next match" on /pro (#1220), the mockup v2 banner: a dark card with a
 * gold ring, both avatars, the match and its lines, and one main action.
 * Renders nothing for guests, a player with no open match, or an api failure.
 */
import { Box, Flex, Text } from "@chakra-ui/react";

import { useAccount } from "@/lib/account/useAccount";
import { usePlayMatch } from "@/lib/tournaments/usePlayMatch";
import { useNextMatch } from "@/lib/tournaments/useNextMatch";
import type { NextMatchView } from "@/lib/tournaments/nextMatch";
import { BAND_MUTED, GOLD, INK_DEEP, PARCHMENT } from "@/components/Stats/tokens";

import { Avatar } from "./Bracket";
import { Btn } from "./ui";

const Pill = ({ children }: { children: React.ReactNode }) => (
  <Text as="span" bg="rgba(224,168,46,0.18)" color={PARCHMENT} fontSize="12px" fontWeight={600} px="10px" py="3px" borderRadius="999px" whiteSpace="nowrap">
    {children}
  </Text>
);

export const NextMatchCard = ({ view, myName, myAvatar }: { view: NextMatchView; myName: string; myAvatar?: string }) => {
  const play = usePlayMatch(view.slug, view.matchId);
  const live = view.state === "in_play";
  const busy = play.phase.kind === "busy" || play.phase.kind === "opening";
  const joinNow = view.state === "opponent_ready";
  return (
    <Box
      as="section"
      aria-label="Your next match"
      data-testid="next-match-banner"
      data-state={view.state}
      position="relative"
      overflow="hidden"
      bg={INK_DEEP}
      color={PARCHMENT}
      borderRadius="14px"
      px={{ base: "16px", md: "22px" }}
      py="18px"
      mb="2rem"
      boxShadow={`inset 0 0 0 ${joinNow ? 2 : 1.5}px ${live ? "#B3361F" : GOLD}, 0 2px 8px rgba(20,8,24,0.18)`}
    >
      <Flex align="center" gap={{ base: "14px", md: "20px" }} flexWrap={{ base: "wrap", md: "nowrap" }}>
        <Flex flexShrink={0}>
          <Avatar name={myName} url={myAvatar} size={46} />
          <Box ml="-10px">
            <Avatar name={view.opponent} url={view.opponentAvatar} size={46} />
          </Box>
        </Flex>
        <Box flex="1" minW={{ base: "0", md: "14rem" }}>
          <Text fontFamily="ArchivoNarrow" textTransform="uppercase" letterSpacing="0.08em" fontSize="12px" fontWeight={700} color={live ? "#FF8A73" : GOLD}>
            {live ? "● " : ""}
            {view.caption}
          </Text>
          <Text as="h3" fontFamily="LeagueGothic" fontSize="1.7rem" lineHeight="1.05" my="2px">
            {view.title}
          </Text>
          {live && (
            <Text fontSize="13px" color={BAND_MUTED}>
              {view.tournamentName}
            </Text>
          )}
          <Flex gap="6px 14px" flexWrap="wrap" align="center" fontSize="13px" color={BAND_MUTED} mt="4px">
            {view.youPlay && <Pill>{view.youPlay}</Pill>}
            {view.map && <Pill>{view.map}</Pill>}
            {view.opponentActive && <Text as="span">{view.opponentActive}</Text>}
            {view.timeLeft && <Text as="span">{view.timeLeft}</Text>}
          </Flex>
          {play.phase.kind === "error" && (
            <Text role="alert" fontSize="13px" color="#FF8A73" mt="6px">
              {play.phase.message}
            </Text>
          )}
        </Box>
        <Flex gap="8px" flexWrap="wrap" justify="flex-end" w={{ base: "100%", md: "auto" }}>
          {view.primary !== "view" && (
            <Btn variant="ghost" href={view.href} color={PARCHMENT} borderColor="rgba(250,235,215,0.35)">
              Match page
            </Btn>
          )}
          {view.primary === "view" ? (
            <Btn variant="gold" href={view.href}>
              {view.primaryLabel}
            </Btn>
          ) : (
            <Btn variant="gold" onClick={play.play} disabled={busy} aria-busy={busy}>
              {play.phase.kind === "opening" ? "Opening the room…" : view.primaryLabel}
            </Btn>
          )}
        </Flex>
      </Flex>
    </Box>
  );
};

export const NextMatchBanner = () => {
  const { account } = useAccount();
  const view = useNextMatch();
  if (!view || !account) return null;
  return <NextMatchCard view={view} myName={account.username} myAvatar={account.avatarUrl ?? undefined} />;
};
