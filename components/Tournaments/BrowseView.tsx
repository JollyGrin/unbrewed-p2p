import { Box, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";

import { useAccount } from "@/lib/account/useAccount";
import {
  FILTERS,
  browsable,
  matchesFilter,
  statusChip,
  type BrowseFilter,
} from "@/lib/tournaments/browse";
import { useTournamentList } from "@/lib/tournaments/hooks";
import {
  WINDOW_LABEL,
  formatLabel,
  formatWhen,
  tournamentPath,
} from "@/lib/tournaments/share";
import type { Tournament } from "@/lib/tournaments/types";
import { Btn, Card, Chip, Notice, Page } from "./ui";

const TournamentCard = ({ t, mine }: { t: Tournament; mine: boolean }) => {
  const chip = statusChip(t);
  return (
    <Card as="article" data-testid="tournament-card" overflow="hidden" display="flex" flexDir="column">
      <Box bg="#2C1831" color="#FAEBD7" p="14px 16px">
        <Flex gap="8px" align="center" flexWrap="wrap">
          <Chip tone={chip.tone} onDark>{chip.label}</Chip>
          {mine && <Chip onDark>You&apos;re in</Chip>}
          {t.status === "signup" && t.signupClosesAt && (
            <Text fontSize="12px" opacity={0.7}>{t.signupOpen ? "closes" : "until"} {formatWhen(t.signupClosesAt)}</Text>
          )}
        </Flex>
        <Text as="h3" fontFamily="LeagueGothic" fontSize="28px" lineHeight="1.05" mt="8px">{t.name}</Text>
        <Text fontSize="13px" opacity={0.75}>
          {formatLabel(t)} · {t.size} players · first to {t.firstTo} · {WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`} per match
          {t.organizer.username ? ` · by ${t.organizer.username}` : ""}
        </Text>
      </Box>
      <Flex p="14px 16px" justify="space-between" align="center" gap="12px" mt="auto">
        <Text fontSize="14px">
          <Text as="b" fontFamily="LeagueGothic" fontSize="26px">{t.entryCount}</Text>
          <Text as="span" opacity={0.7}> / {t.size} seats</Text>
        </Text>
        <Btn href={tournamentPath(t.slug)} variant={t.signupOpen && !mine ? "gold" : "ink"}>
          {t.signupOpen && !mine ? "Join" : t.status === "running" ? "View bracket" : "View"}
        </Btn>
      </Flex>
    </Card>
  );
};

export const BrowseView = () => {
  const { status, account } = useAccount();
  const signedIn = status === "signed-in" && !!account;
  const { all, mine } = useTournamentList(signedIn);
  const [filter, setFilter] = useState<BrowseFilter>("all");

  const mineIds = new Set(
    mine.status === "ready" ? mine.value.map((t) => t.id) : [],
  );
  // The "I'm in" filter only exists for a signed-in visitor.
  const filters = FILTERS.filter((f) => f.id !== "mine" || signedIn);
  const rows = all.status === "ready" ? browsable(all.value) : [];
  const shown = rows.filter((t) => matchesFilter(t, filter, mineIds));
  const count = (f: BrowseFilter) => rows.filter((t) => matchesFilter(t, f, mineIds)).length;

  return (
    <Page
      title="Tournaments"
      path="/tournaments"
      eyebrow="Tournaments · async, played on your own time"
      heading={<>Find a bracket.<br />Play when you can.</>}
      lede="Join during signup. When your match opens, press Play match and we'll ping your opponent on Discord. Results land on the bracket by themselves."
      action={<Btn variant="gold" href="/tournaments?new=1" minH="52px" fontSize="16px">+ Create tournament</Btn>}
    >
      {all.status === "loading" && <Text opacity={0.7}>Loading tournaments…</Text>}
      {(all.status === "unavailable" || all.status === "not_found") && (
        <Notice title="Tournaments">Tournaments are unavailable right now. Everything else on Unbrewed works as usual. Try again later.</Notice>
      )}
      {all.status === "ready" && (
        <>
          <Flex gap="8px" flexWrap="wrap" mb="18px" role="tablist" aria-label="Filter">
            {filters.map((f) => (
              <Box
                as="button"
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                px="14px"
                minH="36px"
                borderRadius="999px"
                fontSize="14px"
                fontWeight={600}
                bg={filter === f.id ? "#48284F" : "rgba(72,40,79,0.08)"}
                color={filter === f.id ? "#FAEBD7" : "#48284F"}
              >
                {f.label} · {count(f.id)}
              </Box>
            ))}
          </Flex>
          {shown.length === 0 ? (
            <Notice title={filter === "mine" ? "Nothing yet" : "No brackets here"}>
              {filter === "mine" ? "You haven't joined a tournament." : "Nothing matches this filter. Create the first one."}
            </Notice>
          ) : (
            <Box display="grid" gridTemplateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }} gap="16px">
              {shown.map((t) => (
                <TournamentCard key={t.id} t={t} mine={mineIds.has(t.id)} />
              ))}
            </Box>
          )}
        </>
      )}
    </Page>
  );
};
