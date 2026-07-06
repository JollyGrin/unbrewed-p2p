/**
 * Graceful "game lost" fallback (issue #133). Deploy-safe resume (protocol v8)
 * recovers almost every live Pro game across a backend restart — but when a
 * resume GENUINELY fails (token expired/invalid, no healthy instance in the
 * overlap window, or the reconnect times out) the game view used to dead-end on
 * a "waiting for game state" freeze. This replaces that with an honest, kind
 * screen: apologize, show the activity log up to the drop, and give the player a
 * way to complain.
 *
 * Only ever rendered once `useProSocket` reports `gameLost` — which it sets ONLY
 * after a terminal failure of a game we were actually mid-match in, never for a
 * resume that merely took a moment. See lib/pro/useProSocket (RESUME_DEADLINE_MS
 * + the ERROR terminal branch).
 */
import { useState } from "react";
import { Box, Button, Flex, Link, Text } from "@chakra-ui/react";
import { TbBrandDiscord, TbExternalLink } from "react-icons/tb";
import { CardInstanceId, PlayerView } from "@/lib/pro/protocol";
import { ProLogEntry } from "@/lib/pro/gameLog";
import { ResolveCard } from "@/lib/pro/useProCardArt";
import { ProLog } from "./ProLog";
import { ReportBugDialog } from "./ReportBugDialog";
import { DISCORD_REPORT_HANDLE, DISCORD_REPORT_URL } from "@/lib/pro/discord";

const BTN_GOLD = {
  size: "md" as const,
  bg: "brand.accent",
  color: "brand.surfaceDim",
  _hover: { bg: "brand.accentDeep" },
  _active: { bg: "brand.accentDeep" },
};

export const GameLostScreen = ({
  entries,
  view,
  roomId,
  resolveCard,
  labelFor,
}: {
  /** newest-first activity feed, exactly as the page stores it (reused by ProLog) */
  entries: ProLogEntry[];
  /** last-known view before the drop, if we ever received one — powers the
   *  secondary "file an issue" report; null when we never got a STATE */
  view: PlayerView | null;
  roomId: string | null;
  /** last-known art resolver, so log lines still preview their card faces */
  resolveCard?: ResolveCard;
  labelFor?: (instance: CardInstanceId) => string;
}) => {
  const [reportBugOpen, setReportBugOpen] = useState(false);

  return (
    <Flex
      direction="column"
      alignItems="center"
      justifyContent="center"
      minH="100svh"
      px="1.25rem"
      py="4rem"
      textAlign="center"
      gap="1.1rem"
    >
      <Text fontFamily="LeagueGothic" fontSize={{ base: "2.4rem", md: "3rem" }} letterSpacing="0.04em" color="brand.accent">
        We lost your game
      </Text>

      <Box maxW="34rem">
        <Text fontSize="1.02rem" lineHeight="1.55" opacity={0.92}>
          The server updated mid-match and we couldn&apos;t restore this game afterward.
          We&apos;re genuinely sorry — this is on us, not you.
        </Text>
        <Text fontSize="0.9rem" opacity={0.7} mt="0.6rem">
          Your most recent activity is preserved in the log (bottom-left) so you can see
          exactly where things stood. Telling us what happened helps us stop it recurring.
        </Text>
      </Box>

      <Flex direction="column" alignItems="center" gap="0.5rem" mt="0.3rem">
        {DISCORD_REPORT_URL ? (
          <Button
            as={Link}
            href={DISCORD_REPORT_URL}
            isExternal
            {...BTN_GOLD}
            leftIcon={<TbBrandDiscord size="1.15rem" />}
            _hover={{ ...BTN_GOLD._hover, textDecoration: "none" }}
          >
            Report this in Discord
          </Button>
        ) : (
          <Flex direction="column" alignItems="center" gap="0.3rem">
            {/* TODO(Dean): once DISCORD_REPORT_URL is filled in (lib/pro/discord.ts)
                this becomes a live button. Until then we show an honest, disabled
                placeholder rather than send a frustrated player to a guessed link. */}
            <Button {...BTN_GOLD} leftIcon={<TbBrandDiscord size="1.15rem" />} isDisabled>
              Report this in Discord
            </Button>
            <Text fontSize="0.72rem" opacity={0.6}>
              Discord report link coming soon — reach {DISCORD_REPORT_HANDLE}. For now, please file an issue below.
            </Text>
          </Flex>
        )}

        {/* Secondary path: the existing prefilled `[pro]` GitHub issue (#125),
            available only when we still hold a last-known view to attach. */}
        {view && (
          <Button
            variant="ghost"
            size="sm"
            color="brand.parchment"
            _hover={{ bg: "whiteAlpha.200" }}
            rightIcon={<TbExternalLink size="0.85rem" />}
            onClick={() => setReportBugOpen(true)}
          >
            or file an issue on GitHub
          </Button>
        )}
      </Flex>

      <Button
        variant="link"
        color="brand.parchment"
        opacity={0.7}
        _hover={{ opacity: 1, color: "brand.accent" }}
        fontSize="0.85rem"
        mt="0.4rem"
        onClick={() => {
          if (typeof window !== "undefined") window.location.href = "/pro/game";
        }}
      >
        Start a new game
      </Button>

      {/* the familiar activity panel, reused verbatim (criterion 3) */}
      <ProLog entries={entries} resolveCard={resolveCard} labelFor={labelFor} />

      {view && (
        <ReportBugDialog
          isOpen={reportBugOpen}
          onClose={() => setReportBugOpen(false)}
          view={view}
          roomId={roomId}
          entries={entries}
        />
      )}
    </Flex>
  );
};
