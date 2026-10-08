/**
 * "Your next match" on /pro (#1220), the mockup v2 banner: a dark card with a
 * gold ring, both avatars, the match and its lines, and one main action.
 * Renders nothing for guests, a player with no open match, or an api failure.
 */
import { useEffect, useRef, useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";

import { signInUrl, useAccount } from "@/lib/account/useAccount";
import { noticedReseatCooldown } from "@/lib/tournaments/api";
import { reseatCooldownText } from "@/lib/tournaments/copy";
import { activeReseatCooldown } from "@/lib/tournaments/matchPage";
import { loadMapTitles } from "@/lib/tournaments/mapTitle";
import { usePlayMatch } from "@/lib/tournaments/usePlayMatch";
import { useNextMatch } from "@/lib/tournaments/useNextMatchView";
import type { NextMatchView } from "@/lib/tournaments/nextMatch";
import { BAND_MUTED, GOLD, INK_DEEP, PARCHMENT } from "@/components/Stats/tokens";

import { Avatar } from "./Bracket";
import { SeatHeldNote } from "./SeatHeldNote";
import { Btn, ERROR_RED, ErrorText } from "./ui";

const Pill = ({ children }: { children: React.ReactNode }) => (
  <Text as="span" bg="rgba(224,168,46,0.18)" color={PARCHMENT} fontSize="12px" fontWeight={600} px="10px" py="3px" borderRadius="999px" whiteSpace="nowrap">
    {children}
  </Text>
);

export const NextMatchCard = ({ view, myName, myAvatar }: { view: NextMatchView; myName: string; myAvatar?: string }) => {
  const play = usePlayMatch(view.slug, view.matchId);
  const live = view.state === "in_play";
  // A re-seat cooldown (interactions F4): from the match, or a 409 this tab already met.
  const cooldown = view.primary === "view" ? null : activeReseatCooldown({ reseatCooldownUntil: view.playOpensAt }, noticedReseatCooldown(view.matchId), Date.now());
  const busy = play.phase.kind === "busy" || play.phase.kind === "opening" || !!cooldown;
  const notice = cooldown ? reseatCooldownText(cooldown) : view.notice;
  // A failed press's message belongs to the situation it was pressed in: once the
  // match moves on (or a re-seat cooldown starts or ends), drop it without a reload (journeys S3).
  const situation = `${view.state}|${view.primary}|${cooldown ? "cooldown" : ""}`;
  const { dismiss } = play;
  const seen = useRef(situation);
  useEffect(() => {
    if (seen.current === situation) return;
    seen.current = situation;
    dismiss();
  }, [situation, dismiss]);
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
      boxShadow={`inset 0 0 0 ${joinNow ? 2 : 1.5}px ${live ? ERROR_RED : GOLD}, 0 2px 8px rgba(20,8,24,0.18)`}
    >
      <Flex align="center" gap={{ base: "14px", md: "20px" }} flexWrap={{ base: "wrap", md: "nowrap" }}>
        <Flex flexShrink={0}>
          <Avatar name={myName} url={myAvatar} size={46} />
          <Box ml="-10px">
            <Avatar name={view.opponent} url={view.opponentAvatar} size={46} />
          </Box>
        </Flex>
        <Box flex="1" minW={{ base: "0", md: "14rem" }}>
          <Text fontFamily="ArchivoNarrow" textTransform="uppercase" letterSpacing="0.08em" fontSize="12px" fontWeight={700} color={live ? "#FF8A73" : GOLD} aria-live="polite" data-testid="next-match-caption">
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
          {notice && (
            <Text fontSize="13px" color={PARCHMENT} mt="6px" data-testid="next-match-notice">
              {notice}
            </Text>
          )}
          {play.phase.kind === "seat_held" && <SeatHeldNote dark roomId={play.phase.roomId} onRetry={play.retry} onBack={play.backToRoom} />}
          {play.phase.kind === "error" && (
            // A lighter red: this banner sits on the dark band.
            <ErrorText color="#FF8A73" mt="6px">
              {play.phase.message}
            </ErrorText>
          )}
          {play.phase.kind === "error" && play.phase.reason === "unauthorized" && (
            // A dead session: the way back in, returning to this page (UX B3).
            <Box mt="8px">
              <Btn variant="discord" href={signInUrl(typeof window === "undefined" ? "/pro" : `${window.location.pathname}${window.location.search}`)} data-testid="next-match-sign-in">Sign in with Discord</Btn>
            </Box>
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
  // The map catalog is not in the shared bundle (#1265): fetch it once there is a match to title.
  const [, setTitlesLoaded] = useState(false);
  const hasMatch = !!view;
  useEffect(() => {
    if (hasMatch) loadMapTitles().then(() => setTitlesLoaded(true), () => {}); // titles fall back to ids
  }, [hasMatch]);
  if (!view || !account) return null;
  return <NextMatchCard view={view} myName={account.username} myAvatar={account.avatarUrl ?? undefined} />;
};
