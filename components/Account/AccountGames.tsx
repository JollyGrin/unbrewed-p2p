/**
 * The match-history shelf — "My games" on /account (issue #573), and the same
 * list on another player's public profile (#590).
 *
 * Read-only history of finished Pro games, newest first, walked a page at a
 * time with the API's opaque cursor. Every non-happy state is a sentence in the
 * same box rather than an error surface: the accounts API is optional
 * infrastructure for a static site, and "not deployed" has to look as calm as
 * "you haven't played yet".
 *
 * Rows link into a replay only when THIS browser saved one for that game — see
 * lib/account/replayLink.ts for why that join is a natural key rather than an
 * id, and why a miss is the normal case. That join is symmetric (all heroes,
 * sorted), so it keeps working on somebody else's profile: a game you played
 * AGAINST them is a game you may well have saved.
 *
 * The history itself is passed in rather than fetched here (#590), so one page
 * decides whose games these are — `/me/games` or `/players/games?u=` — and this
 * file stays a renderer.
 */
import { useEffect, useState } from "react";
import { Badge, Box, Button, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { FaPlay } from "react-icons/fa";

import {
  AccountGame,
  endConditionLabel,
  formatDuration,
  gameOutcome,
  GameOutcome,
  heroLabel,
  mapLabel,
  opponentLabel,
  OUTCOME_LABEL,
  relativeDate,
} from "@/lib/account/gameHistory";
import { localReplayHref, localReplayIdForGame } from "@/lib/account/replayLink";
import { GameHistoryView } from "@/lib/account/useGameHistory";
import { listReplays, type ReplayIndexEntry } from "@/lib/pro/replayStore";

const OUTCOME_STYLE: Record<GameOutcome, { bg: string; color: string }> = {
  win: { bg: "brand.positive", color: "#12210F" },
  loss: { bg: "brand.danger", color: "#FDF4F2" },
  draw: { bg: "rgba(72, 40, 79, 0.45)", color: "brand.parchment" },
};

/** The one-line summary under the matchup: board, length, how it ended. */
const metaLine = (game: AccountGame): string =>
  [
    mapLabel(game.map),
    game.turns !== null ? `${game.turns} turns` : null,
    formatDuration(game.durationSeconds),
    endConditionLabel(game.endCondition),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

export const GameRow = ({
  game,
  replayId,
  now,
}: {
  game: AccountGame;
  replayId: string | null;
  now?: number;
}) => {
  const outcome = gameOutcome(game);
  const opponents = game.opponents.length
    ? game.opponents.map(opponentLabel).join(", ")
    : "an unknown opponent";

  return (
    <Flex
      as="li"
      data-testid="account-game-row"
      align={{ base: "flex-start", sm: "center" }}
      direction={{ base: "column", sm: "row" }}
      gap="0.75rem"
      py="0.7rem"
      borderBottom="1px solid rgba(72, 40, 79, 0.15)"
      _last={{ borderBottom: "none" }}
    >
      <Badge
        {...OUTCOME_STYLE[outcome]}
        flexShrink={0}
        minW="3.4rem"
        textAlign="center"
        borderRadius="0.35rem"
        px="0.5rem"
        py="0.2rem"
        fontFamily="ArchivoNarrow"
        fontSize="0.75rem"
        textTransform="none"
      >
        {OUTCOME_LABEL[outcome]}
      </Badge>

      <Box flex="1" minW={0}>
        <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="0.95rem">
          {heroLabel(game.you)}{" "}
          <Text as="span" fontWeight={400} opacity={0.7}>
            vs
          </Text>{" "}
          {opponents}
        </Text>
        <Text fontSize="0.78rem" opacity={0.7}>
          {metaLine(game)}
        </Text>
      </Box>

      <Flex align="center" gap="0.75rem" flexShrink={0}>
        {replayId ? (
          <Button
            as={NextLink}
            href={localReplayHref(replayId)}
            size="xs"
            variant="outline"
            leftIcon={<FaPlay size="0.6rem" />}
            borderColor="brand.secondary"
            color="brand.secondary"
            fontFamily="ArchivoNarrow"
            fontWeight={400}
            _hover={{ bg: "rgba(72, 40, 79, 0.1)" }}
          >
            Replay
          </Button>
        ) : null}
        <Text fontSize="0.78rem" opacity={0.6} whiteSpace="nowrap">
          {relativeDate(game.endedAt, now)}
        </Text>
      </Flex>
    </Flex>
  );
};

const Quiet = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="0.88rem" opacity={0.75} py="0.6rem">
    {children}
  </Text>
);

/**
 * Copy is the only thing that differs between the two modes: the same shelf
 * reads "My games" for its owner and "<name>'s games" to a visitor.
 */
export const AccountGames = ({
  history,
  owner = true,
  name,
}: {
  history: GameHistoryView;
  /** False on a public profile: read-only, and the copy stops saying "my". */
  owner?: boolean;
  /** Whose games these are. Only used when `owner` is false. */
  name?: string;
}) => {
  const { status, games, hasMore, loadingMore, loadMore } = history;
  // localStorage is client-only, so the replay index arrives after mount; until
  // then rows simply render without a replay link (never a hydration mismatch).
  const [replays, setReplays] = useState<ReplayIndexEntry[]>([]);

  useEffect(() => {
    if (status !== "ready" || games.length === 0) return;
    setReplays(listReplays());
  }, [status, games.length]);

  return (
    <Box
      as="section"
      aria-labelledby="account-games-heading"
      bg="brand.parchment"
      borderRadius="0.75rem"
      p="1.1rem"
      boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
    >
      <Text
        id="account-games-heading"
        as="h2"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="1.15rem"
        mb="0.2rem"
      >
        {owner ? "My games" : "Games"}
      </Text>
      <Text fontSize="0.8rem" opacity={0.65} mb="0.6rem">
        Finished Pro games {owner ? "" : `${name ?? "this player"} `}played
        while signed in. Sandbox tables aren&apos;t recorded.
      </Text>

      {status === "loading" ? (
        <Quiet>{owner ? "Loading your games…" : "Loading games…"}</Quiet>
      ) : null}

      {status === "unavailable" ? (
        <Quiet>
          Game history is unavailable right now. Nothing is lost — check back
          later.
        </Quiet>
      ) : null}

      {status === "ready" && games.length === 0 ? (
        <Quiet>
          {owner
            ? "No games here yet. Play a Pro game while signed in and it'll show up."
            : "No finished Pro games on record yet."}
        </Quiet>
      ) : null}

      {games.length > 0 ? (
        <Box as="ul" listStyleType="none" m={0} p={0}>
          {games.map((game) => (
            <GameRow
              key={game.id}
              game={game}
              replayId={localReplayIdForGame(game, replays)}
            />
          ))}
        </Box>
      ) : null}

      {hasMore ? (
        <Button
          mt="0.8rem"
          size="sm"
          variant="outline"
          borderColor="brand.secondary"
          color="brand.secondary"
          fontFamily="ArchivoNarrow"
          fontWeight={400}
          isLoading={loadingMore}
          loadingText="Loading…"
          onClick={loadMore}
          _hover={{ bg: "rgba(72, 40, 79, 0.1)" }}
        >
          Load more
        </Button>
      ) : null}
    </Box>
  );
};
