/**
 * `/tournaments?t=<slug>` for a running / complete round robin (#1221): the
 * standings table (with the final cut line), then the match list by round.
 * Mockup v2, "Same page, round-robin format". Standings come from the api.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useMemo } from "react";

import { BAND_MUTED, GOLD, INK, PARCHMENT } from "@/components/Stats/tokens";
import { matchHref } from "@/lib/tournaments/bracket";
import { describeRule } from "@/lib/tournaments/matchup";
import { mapTitle } from "@/lib/tournaments/options";
import {
  buildRoundRobin,
  hasTop2Final,
  type FateTone,
  type FormDot,
  type RrMatchRow,
} from "@/lib/tournaments/roundRobin";
import { WINDOW_LABEL, formatLabel, formatWhen, tournamentPath } from "@/lib/tournaments/share";
import type { Entry, Match, Standing, Tournament } from "@/lib/tournaments/types";

import { Avatar, timeLeft } from "./Bracket";
import { useNow } from "@/lib/tournaments/hooks";
import { LifecyclePanel } from "./LifecyclePanel";
import { AttentionQueue } from "./OrganizerTools";
import { Card, Chip, Notice, Page } from "./ui";

const Stat = ({ value, of, label, live }: { value: number; of?: number; label: string; live?: boolean }) => (
  <Box>
    <Text fontFamily="LeagueGothic" fontSize={{ base: "34px", md: "46px" }} lineHeight="1" color={live && value > 0 ? "#FF8A73" : PARCHMENT}>
      {value}
      {of !== undefined && <Text as="span" color={BAND_MUTED}>/{of}</Text>}
    </Text>
    <Text fontSize="13px" color={BAND_MUTED}>{label}</Text>
  </Box>
);

const FATE_COLOR: Record<FateTone, string> = {
  clinched: "#22774E",
  champion: "#7A5410",
  alive: "#7A5410",
  out: "rgba(72,40,79,0.5)",
};

const Dot = ({ d }: { d: FormDot }) => (
  <Box
    as="span"
    w="20px"
    h="20px"
    borderRadius="5px"
    display="grid"
    placeItems="center"
    fontSize="11px"
    fontWeight={700}
    color={d === "pend" ? "rgba(72,40,79,0.45)" : "white"}
    bg={d === "W" ? "#2F9E68" : d === "L" ? "#D8503A" : "transparent"}
    border={d === "pend" ? "1.5px dashed rgba(72,40,79,0.3)" : "none"}
    title={d === "W" ? "Win" : d === "L" ? "Loss" : "Not played yet"}
  >
    {d === "pend" ? "·" : d}
  </Box>
);

const Th = (props: React.ComponentProps<typeof Box>) => (
  <Box
    as="th"
    textAlign="left"
    fontFamily="ArchivoNarrow"
    fontWeight={400}
    fontSize="12px"
    letterSpacing="0.08em"
    textTransform="uppercase"
    color="rgba(72,40,79,0.72)"
    pb="10px"
    px="12px"
    borderBottom="1px solid rgba(72,40,79,0.15)"
    {...props}
  />
);

const Standings = ({ view, t }: { view: ReturnType<typeof buildRoundRobin>; t: Tournament }) => {
  const withFinal = hasTop2Final(t);
  return (
    <Card p={{ base: "14px", md: "20px" }} data-testid="standings">
      <Flex justify="space-between" align="flex-end" gap="16px" flexWrap="wrap" mb="16px">
        <Box>
          <Text as="h2" fontFamily="LeagueGothic" fontSize="26px" lineHeight="1.05">Standings</Text>
          <Text fontSize="13px" opacity={0.72} mt="2px">
            {view.stats.players} players · everyone plays everyone{withFinal ? ", then the top 2 play a final" : ""} · one game per match
            {!view.groupComplete && view.rounds.length > 0 ? ` · round ${view.stats.currentRound} of ${view.stats.totalRounds}` : ""}
          </Text>
        </Box>
        <Flex gap="6px" flexWrap="wrap">
          <Chip>Ties: head-to-head, then seed</Chip>
          {withFinal && <Chip tone="soon">Top 2 play a final</Chip>}
        </Flex>
      </Flex>
      <Box overflowX="auto">
        <Box as="table" w="100%" fontSize="14px" sx={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th w="44px">#</Th>
              <Th>Player</Th>
              <Th textAlign="right">W–L</Th>
              <Th textAlign="right" display={{ base: "none", md: "table-cell" }}>Played</Th>
              <Th display={{ base: "none", md: "table-cell" }}>Results</Th>
              <Th display={{ base: "none", md: "table-cell" }}>Standing</Th>
            </tr>
          </thead>
          <tbody>
            {view.standings.map((r) => (
              <Box
                as="tr"
                key={r.entry.id}
                data-testid="standing-row"
                data-rank={r.rank}
                opacity={r.tone === "out" ? 0.62 : 1}
                sx={{
                  "& td": {
                    padding: "11px 12px",
                    borderBottom: r.cutLine && view.standings.length > r.rank ? "2px dashed #E0A82E" : "1px solid rgba(72,40,79,0.15)",
                  },
                  "&:last-of-type td": { borderBottom: "0" },
                  "& td:first-of-type": r.inCut ? { boxShadow: `inset 4px 0 0 ${GOLD}` } : {},
                }}
              >
                <Box as="td" fontFamily="LeagueGothic" fontSize="30px" lineHeight="1" color={r.inCut ? INK : "rgba(72,40,79,0.5)"}>{r.rank}</Box>
                <td>
                  <Flex align="center" gap="10px" minW={0}>
                    <Avatar name={r.entry.username ?? "?"} url={r.entry.avatarUrl} size={32} />
                    <Box minW={0}>
                      <Text fontWeight={700} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis" maxW={{ base: "9rem", md: "16rem" }} title={r.entry.username ?? undefined}>{r.entry.username ?? "Player"}</Text>
                      <Text fontSize="12px" opacity={0.65} title={r.tiebreak ? `Level on wins: ${r.tiebreak}` : undefined}>
                        Seed {r.entry.seed ?? "–"}{r.dropped ? " · dropped" : ""}{r.tiebreak ? ` · ${r.tiebreak}` : ""}
                      </Text>
                      <Text display={{ base: "block", md: "none" }} fontFamily="ArchivoNarrow" fontSize="11px" letterSpacing="0.06em" textTransform="uppercase" fontWeight={r.tone === "out" ? 400 : 700} color={FATE_COLOR[r.tone]}>
                        {r.fate}
                      </Text>
                    </Box>
                  </Flex>
                </td>
                <Box as="td" textAlign="right" whiteSpace="nowrap" sx={{ fontVariantNumeric: "tabular-nums" }} fontWeight={700}>{r.wins}–{r.losses}</Box>
                <Box as="td" textAlign="right" sx={{ fontVariantNumeric: "tabular-nums" }} display={{ base: "none", md: "table-cell" }}>{r.played} / {r.scheduled}</Box>
                <Box as="td" display={{ base: "none", md: "table-cell" }}>
                  <Flex gap="4px">{r.form.map((d, i) => <Dot key={i} d={d} />)}</Flex>
                </Box>
                <Box as="td" display={{ base: "none", md: "table-cell" }}>
                  <Text as="span" fontFamily="ArchivoNarrow" fontSize="12px" letterSpacing="0.06em" textTransform="uppercase" fontWeight={r.tone === "out" ? 400 : 700} color={FATE_COLOR[r.tone]}>
                    {r.fate}
                  </Text>
                </Box>
              </Box>
            ))}
          </tbody>
        </Box>
      </Box>
      {withFinal ? (
        <Flex align="center" gap="8px" mt="10px" fontSize="12px" color="#7A5410">
          <Box w="22px" borderTop="2px dashed #E0A82E" />
          Final cut: top 2 advance to a one-game final
        </Flex>
      ) : (
        <Text fontSize="12px" color="#7A5410" mt="10px">Most wins takes the event.</Text>
      )}
    </Card>
  );
};

const stateChip = (m: RrMatchRow): { tone: "plain" | "live" | "soon" | "done"; label: string } => {
  if (m.state === "decided") return { tone: "done", label: m.note ?? "Decided" };
  if (m.state === "cancelled") return { tone: "plain", label: "Cancelled" };
  if (m.state === "in_play") return { tone: "live", label: "In play now" };
  if (m.state === "unverified") return { tone: "soon", label: "Awaiting confirmation" };
  return { tone: "plain", label: "Open" };
};

const Side = ({ s, align }: { s: RrMatchRow["a"]; align: "left" | "right" }) => (
  <Flex align="center" gap="8px" minW={0} flex="1" flexDir={align === "right" ? "row-reverse" : "row"}>
    <Avatar name={s.name} url={s.avatarUrl} size={26} />
    <Text
      fontWeight={s.result === "win" ? 700 : 600}
      fontSize="14px"
      whiteSpace="nowrap"
      overflow="hidden"
      textOverflow="ellipsis"
      opacity={s.result === "lose" ? 0.55 : 1}
    >
      {s.name}
      {s.result === "win" && <Box as="span" display="inline-block" w="6px" h="6px" borderRadius="50%" bg={GOLD} ml="6px" verticalAlign="2px" />}
    </Text>
  </Flex>
);

const MatchRow = ({ slug, m, now }: { slug: string; m: RrMatchRow; now: number }) => {
  const chip = stateChip(m);
  const left = m.state === "decided" ? null : timeLeft(m.deadlineAt, now);
  return (
    <Flex
      as={NextLink}
      href={matchHref(slug, m.id)}
      data-testid="rr-match"
      data-state={m.state}
      align="center"
      gap="10px"
      flexWrap={{ base: "wrap", md: "nowrap" }}
      py="10px"
      borderBottom="1px solid rgba(72,40,79,0.1)"
      _last={{ borderBottom: 0 }}
      _hover={{ bg: "rgba(72,40,79,0.04)" }}
    >
      <Text fontFamily="ArchivoNarrow" fontSize="11px" letterSpacing="0.08em" w="52px" flexShrink={0} opacity={0.6}>{m.code}</Text>
      <Flex flex="1" minW={{ base: "100%", md: 0 }} order={{ base: 3, md: 0 }} align="center" gap="10px">
        <Side s={m.a} align="left" />
        <Text fontSize="12px" opacity={0.5}>vs</Text>
        <Side s={m.b} align="right" />
      </Flex>
      <Flex gap="8px" align="center" ml="auto" flexShrink={0}>
        {left && <Text fontSize="12px" opacity={0.7} whiteSpace="nowrap">{left} left</Text>}
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </Flex>
    </Flex>
  );
};

export const RoundRobinEventView = ({
  t,
  entries,
  matches,
  standings,
  isOrganizer = false,
  reload = () => {},
}: {
  t: Tournament;
  entries: Entry[];
  matches: Match[];
  standings: Standing[] | null;
  isOrganizer?: boolean;
  reload?: () => void;
}) => {
  const view = useMemo(() => buildRoundRobin(t, entries, matches, standings), [t, entries, matches, standings]);
  const now = useNow(30_000);
  const complete = t.status === "complete";
  const cancelled = t.status === "cancelled";
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
            <Chip tone={complete || cancelled ? "done" : "live"} onDark>{cancelled ? "Cancelled" : complete ? "Completed" : "Live"}</Chip>
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
                <Text as="span" color={GOLD}>♛</Text> {hasTop2Final(t) ? "Latest possible final" : "Latest possible finish"}: <Text as="b" color={PARCHMENT}>{formatWhen(t.latestPossibleFinal)}</Text> · if every match runs to its deadline
              </Text>
            )
          )}
        </>
      }
      action={
        <Flex gap={{ base: "22px", md: "34px" }} data-testid="event-stats">
          <Stat value={view.stats.players} label="players" />
          <Stat value={view.stats.currentRound} of={view.stats.totalRounds} label="round" />
          <Stat value={view.stats.gamesPlayed} label="games played" />
          {!complete && !cancelled && <Stat value={view.stats.inPlay} label="in play now" live />}
        </Flex>
      }
    >
      {cancelled && (
        <Box mb="16px" data-testid="cancelled-notice">
          <Notice title="This tournament was cancelled">The organizer cancelled it. Results so far are kept below; unfinished matches are cancelled.</Notice>
        </Box>
      )}
      {isOrganizer && !cancelled && <AttentionQueue t={t} entries={entries} matches={matches} reload={reload} />}
      <Standings view={view} t={t} />

      {view.final && (
        <Card p={{ base: "14px", md: "20px" }} mt="20px" data-testid="rr-final">
          <Text as="h2" fontFamily="LeagueGothic" fontSize="26px" lineHeight="1.05" mb="4px">
            <Text as="span" color="#C48F1E">♛</Text> Final
          </Text>
          <Text fontSize="13px" opacity={0.72} mb="6px">One game between the top two. The winner is champion.</Text>
          <MatchRow slug={t.slug} m={view.final} now={now} />
        </Card>
      )}

      <Card p={{ base: "14px", md: "20px" }} mt="20px" data-testid="rr-matches">
        <Text as="h2" fontFamily="LeagueGothic" fontSize="26px" lineHeight="1.05" mb="4px">Matches</Text>
        <Text fontSize="13px" opacity={0.72} mb="12px">
          Every match is open from the start. Play in any order before its deadline; rounds only group the list.
        </Text>
        {view.rounds.length === 0 ? (
          <Text opacity={0.7} fontSize="14px">No matches yet.</Text>
        ) : (
          <Box display="grid" gridTemplateColumns={{ base: "minmax(0, 1fr)", xl: "repeat(2, minmax(0, 1fr))" }} columnGap="32px" rowGap="18px">
            {view.rounds.map((r) => (
              <Box key={r.round} data-testid="rr-round">
                <Flex justify="space-between" align="baseline" borderBottom="1px solid rgba(72,40,79,0.15)" pb="4px">
                  <Text fontWeight={700}>{r.label}</Text>
                  <Text fontSize="12px" opacity={0.65}>{r.decided} of {r.matches.length} decided</Text>
                </Flex>
                {r.matches.map((m) => <MatchRow key={m.id} slug={t.slug} m={m} now={now} />)}
              </Box>
            ))}
          </Box>
        )}
      </Card>
      {isOrganizer && t.status === "running" && (
        <Box mt="20px">
          <LifecyclePanel t={t} entries={entries} reload={reload} />
        </Box>
      )}
    </Page>
  );
};
