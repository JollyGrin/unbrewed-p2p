/**
 * `/tournaments?t=<slug>` once the bracket exists (running / complete, #1217):
 * header with the event's numbers, the bracket, then the entrants.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useMemo } from "react";

import { BAND_MUTED, GOLD, PARCHMENT } from "@/components/Stats/tokens";
import { buildBracket, entrantRows } from "@/lib/tournaments/bracket";
import { describeRule } from "@/lib/tournaments/matchup";
import { mapTitle } from "@/lib/tournaments/options";
import { WINDOW_LABEL, formatLabel, formatWhen, tournamentPath } from "@/lib/tournaments/share";
import type { Entry, Match, Tournament } from "@/lib/tournaments/types";

import { Avatar, Bracket } from "./Bracket";
import { AttentionQueue } from "./OrganizerTools";
import { Card, Chip, Page } from "./ui";

const Stat = ({ value, of, label, live }: { value: number; of?: number; label: string; live?: boolean }) => (
  <Box>
    <Text fontFamily="LeagueGothic" fontSize={{ base: "34px", md: "46px" }} lineHeight="1" color={live && value > 0 ? "#FF8A73" : PARCHMENT}>
      {value}
      {of !== undefined && <Text as="span" color={BAND_MUTED}>/{of}</Text>}
    </Text>
    <Text fontSize="13px" color={BAND_MUTED}>{label}</Text>
  </Box>
);

export const BracketEventView = ({
  t,
  entries,
  matches,
  isOrganizer = false,
  reload = () => {},
}: {
  t: Tournament;
  entries: Entry[];
  matches: Match[];
  isOrganizer?: boolean;
  reload?: () => void;
}) => {
  const view = useMemo(() => buildBracket(t, entries, matches), [t, entries, matches]);
  const rows = useMemo(() => entrantRows(t.size, entries, matches), [t.size, entries, matches]);
  const complete = t.status === "complete";
  const rule =
    t.settings?.matchupSetBy === "organizer" ? "Matchups set by organizer" : describeRule(t.matchupRule, mapTitle);

  return (
    <Page
      title={t.name}
      path={tournamentPath(t.slug)}
      wide
      eyebrow={<><NextLink href="/tournaments">Tournaments</NextLink> / {t.name}</>}
      heading={t.name}
      lede={
        <>
          <Flex gap="8px" flexWrap="wrap" mt="6px">
            <Chip tone={complete ? "done" : "live"} onDark>{complete ? "Completed" : "Live"}</Chip>
            <Chip onDark>{formatLabel(t).replace(/^./, (c) => c.toUpperCase())}</Chip>
            <Chip onDark>One game per match</Chip>
            <Chip onDark>{WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`} per match</Chip>
            <Chip onDark>{rule}</Chip>
            {t.organizer.username && <Chip onDark>Organizer · {t.organizer.username}</Chip>}
          </Flex>
          {complete && view.champion ? (
            <Text mt="12px" fontSize="14px" data-testid="champion-line">
              <Text as="span" color={GOLD}>♛</Text> Champion: <Text as="b" color={PARCHMENT}>{view.champion.username}</Text>
            </Text>
          ) : (
            t.latestPossibleFinal && (
              <Text mt="12px" fontSize="13px">
                <Text as="span" color={GOLD}>♛</Text> Latest possible final: <Text as="b" color={PARCHMENT}>{formatWhen(t.latestPossibleFinal)}</Text> · if every match runs to its deadline
              </Text>
            )
          )}
        </>
      }
      action={
        <Flex gap={{ base: "22px", md: "34px" }} data-testid="event-stats">
          <Stat value={view.stats.players} label="players" />
          <Stat value={view.stats.currentRound} of={view.rounds.length} label="round" />
          <Stat value={view.stats.gamesPlayed} label="games played" />
          {!complete && <Stat value={view.stats.inPlay} label="in play now" live />}
        </Flex>
      }
    >
      {isOrganizer && <AttentionQueue t={t} entries={entries} matches={matches} reload={reload} />}
      <Bracket view={view} />
      <Card p="20px" mt="20px" data-testid="entrants">
        <Text fontWeight={700} mb="10px">Entrants</Text>
        <Box display="grid" gridTemplateColumns={{ base: "1fr", md: "1fr 1fr" }} columnGap="24px">
          {rows.map(({ entry, status, tone }) => (
            <Flex key={entry.id} align="center" gap="10px" py="8px" borderBottom="1px solid rgba(72,40,79,0.1)" opacity={tone === "done" ? 0.65 : 1}>
              <Text fontFamily="LeagueGothic" fontSize="22px" w="24px" textAlign="center" opacity={0.6}>{entry.seed ?? "–"}</Text>
              <Avatar name={entry.username ?? "?"} url={entry.avatarUrl} size={30} />
              <Text flex="1" minW={0} fontWeight={600} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">{entry.username ?? "Player"}</Text>
              <Chip tone={tone}>{status}</Chip>
            </Flex>
          ))}
        </Box>
      </Card>
    </Page>
  );
};
