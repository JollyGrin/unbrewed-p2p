import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useState } from "react";

import { signInUrl, useAccount } from "@/lib/account/useAccount";
import { joinTournament, leaveTournament, type TournamentFailure } from "@/lib/tournaments/api";
import { useTournament } from "@/lib/tournaments/hooks";
import { joinState, activeEntries } from "@/lib/tournaments/joinState";
import { describeRule } from "@/lib/tournaments/matchup";
import { mapTitle } from "@/lib/tournaments/options";
import {
  WINDOW_LABEL,
  discordPost,
  formatLabel,
  formatWhen,
  tournamentPath,
  tournamentUrl,
} from "@/lib/tournaments/share";
import type { Entry, Tournament } from "@/lib/tournaments/types";
import { statusChip } from "@/lib/tournaments/browse";
import { BracketEventView } from "./BracketEventView";
import { RoundRobinEventView } from "./RoundRobinEventView";
import { SeedingPanel } from "./SeedingPanel";
import { Btn, Card, Chip, Notice, Page } from "./ui";

const JOIN_ERRORS: Partial<Record<TournamentFailure, string>> = {
  signup_closed: "Signup has closed.",
  full: "All seats are taken.",
  unauthorized: "Your session ended. Sign in with Discord again.",
  rate_limited: "Slow down a moment, then try again.",
};

const Seats = ({ t, entries }: { t: Tournament; entries: Entry[] }) => {
  const active = activeEntries(entries);
  return (
    <Box>
      <Flex justify="space-between" align="baseline" mb="8px">
        <Text fontSize="12px" fontFamily="ArchivoNarrow" textTransform="uppercase" letterSpacing="0.08em" opacity={0.7}>Seats</Text>
        <Text>
          <Text as="b" fontFamily="LeagueGothic" fontSize="28px" data-testid="seat-count">{active.length}</Text>
          <Text as="span" opacity={0.7}> / {t.size}</Text>
        </Text>
      </Flex>
      <Flex gap="6px" flexWrap="wrap">
        {Array.from({ length: t.size }, (_, i) => {
          const e = active[i];
          return (
            <Box key={i} title={e?.username ?? "Open seat"} w="34px" h="34px" borderRadius="999px" overflow="hidden" bg={e ? "#48284F" : "transparent"} border={e ? "none" : "2px dashed rgba(72,40,79,0.3)"} color="#FAEBD7" display="grid" placeItems="center" fontWeight={700} fontSize="14px">
              {e ? (e.avatarUrl ? <Box as="img" src={e.avatarUrl} alt="" w="34px" h="34px" /> : (e.username ?? "?")[0].toUpperCase()) : null}
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
};

export const JoinPanel = ({
  t,
  entries,
  reload,
}: {
  t: Tournament;
  entries: Entry[];
  reload: () => void;
}) => {
  const { status, account } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = status === "signed-in" && account ? account.id : null;
  const state = joinState(t, entries, userId);

  const run = async (fn: () => Promise<{ ok: boolean; reason?: TournamentFailure }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    // already_joined / already left is the state we wanted: just refresh.
    if (!r.ok && r.reason !== "already_joined" && r.reason !== "not_found")
      setError(JOIN_ERRORS[r.reason ?? "unavailable"] ?? "Couldn't reach the server. Try again.");
    reload();
  };

  return (
    <Flex flexDir="column" gap="14px" data-testid="join-panel" data-state={state.kind}>
      {state.kind === "signed_out" && (
        <>
          <Btn variant="discord" href={signInUrl(`${tournamentPath(t.slug)}&join=1`)} w="100%">
            Sign in with Discord to join
          </Btn>
          <Text fontSize="13px" textAlign="center" opacity={0.7}>
            You&apos;ll come straight back here to confirm. We use Discord to ping you when your match opens.
          </Text>
        </>
      )}
      {state.kind === "can_join" && (
        <>
          <Box border="1px solid rgba(47,158,104,0.4)" bg="rgba(47,158,104,0.08)" borderRadius="10px" p="10px 12px" fontSize="14px">
            <b>Signed in as {account?.username}.</b> One more tap to take a seat.
          </Box>
          <Btn variant="gold" w="100%" disabled={busy} onClick={() => run(() => joinTournament(t.slug))}>
            Join {t.name}
          </Btn>
          <Text fontSize="13px" textAlign="center" opacity={0.7}>You can leave any time until signup closes.</Text>
        </>
      )}
      {(state.kind === "joined" || state.kind === "locked_in") && (
        <>
          <Flex gap="14px" align="center" bg="rgba(224,168,46,0.18)" borderRadius="10px" p="12px 14px">
            <Text fontFamily="LeagueGothic" fontSize="44px" lineHeight="1" data-testid="seat-no">{state.seat}</Text>
            <Box>
              <Text fontWeight={700}>You&apos;re seat {state.seat} of {state.of}.</Text>
              <Text fontSize="14px" opacity={0.8}>
                {t.status === "running"
                  ? `The ${t.format === "round_robin" ? "standings are" : "bracket is"} live. We'll ping you on Discord when your match is ready.`
                  : `${t.format === "round_robin" ? "Every match opens" : "Round 1 opens"} when signup closes${t.signupClosesAt ? ` (${formatWhen(t.signupClosesAt)})` : ""}. We'll ping you on Discord when your match is ready.`}
              </Text>
            </Box>
          </Flex>
          {state.kind === "joined" && (
            <Flex justify="space-between" align="center" gap="12px" flexWrap="wrap" fontSize="14px">
              <Text opacity={0.8}>Plans changed? You can leave until signup closes{t.signupClosesAt ? ` ${formatWhen(t.signupClosesAt)}` : ""}.</Text>
              <Btn variant="ghost" disabled={busy} onClick={() => run(() => leaveTournament(t.slug))}>Leave tournament</Btn>
            </Flex>
          )}
        </>
      )}
      {state.kind === "full" && <Text fontWeight={600}>All seats are taken.</Text>}
      {state.kind === "closed" && (
        <Text fontWeight={600}>
          {t.status === "signup" ? "Signup has closed." : t.status === "running" ? "This bracket is underway." : "This tournament is over."}
        </Text>
      )}
      {error && <Text role="alert" color="#B3361F" fontSize="14px">{error}</Text>}
    </Flex>
  );
};

const SharePanel = ({ t }: { t: Tournament }) => {
  const [copied, setCopied] = useState<"link" | "post" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const link = tournamentUrl(t.slug, origin);
  const copy = async (what: "link" | "post") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : discordPost(t, origin));
      setCopied(what);
    } catch {
      setCopied(null);
    }
  };
  return (
    <Flex flexDir="column" gap="14px" mb="20px" data-testid="share-panel">
      <Card p="20px">
        <Text fontSize="12px" fontFamily="ArchivoNarrow" textTransform="uppercase" letterSpacing="0.08em" opacity={0.7} mb="8px">Tournament link</Text>
        <Flex gap="10px" flexWrap="wrap">
          <Box flex="1" minW="0" bg="rgba(72,40,79,0.07)" borderRadius="8px" p="10px 12px" fontFamily="monospace" fontSize="14px" wordBreak="break-all">{link}</Box>
          <Btn variant="gold" onClick={() => copy("link")}>{copied === "link" ? "Copied" : "Copy link"}</Btn>
        </Flex>
        <Text fontSize="13px" opacity={0.7} mt="8px">Anyone with the link can see the event. Joining needs a Discord sign-in.</Text>
      </Card>
      <Card p="20px">
        <Flex justify="space-between" align="center" gap="12px" flexWrap="wrap" mb="12px">
          <Box>
            <Text fontWeight={700}>Post it somewhere</Text>
            <Text fontSize="13px" opacity={0.7}>For your own server, a group chat, or a forum.</Text>
          </Box>
          <Btn onClick={() => copy("post")}>{copied === "post" ? "Copied" : "Copy Discord post"}</Btn>
        </Flex>
        <Box as="pre" whiteSpace="pre-wrap" bg="rgba(72,40,79,0.07)" borderRadius="8px" p="12px" fontSize="13px">{discordPost(t, origin)}</Box>
      </Card>
    </Flex>
  );
};

export const EventView = ({ slug, justCreated }: { slug: string; justCreated: boolean }) => {
  const [data, reload] = useTournament(slug);
  const { status, account } = useAccount();

  if (data.status === "loading")
    return (
      <Page title="Tournament" path={tournamentPath(slug)} heading="Loading…">
        <Text opacity={0.7}>Loading tournament…</Text>
      </Page>
    );
  if (data.status !== "ready")
    return (
      <Page title="Tournament" path={tournamentPath(slug)} heading="Tournament">
        <Notice title={data.status === "not_found" ? "No tournament here" : "Tournaments unavailable"}>
          {data.status === "not_found" ? "That link doesn't match a tournament. It may have been cancelled." : "Tournaments are unavailable right now. Try again later."}
        </Notice>
        <Flex mt="16px" gap="10px" flexWrap="wrap">
          {data.status === "unavailable" && <Btn variant="gold" onClick={reload}>Try again</Btn>}
          <Btn href="/tournaments" variant="ghost">All tournaments</Btn>
        </Flex>
      </Page>
    );

  const { tournament: t, entries, matches, standings } = data.value;
  const isOrganizer = status === "signed-in" && account?.id === t.organizer.userId;
  if ((t.status === "running" || t.status === "complete") && t.format === "round_robin")
    return <RoundRobinEventView t={t} entries={entries} matches={matches} standings={standings} isOrganizer={isOrganizer} reload={reload} />;
  if (t.status === "running" || t.status === "complete")
    return <BracketEventView t={t} entries={entries} matches={matches} isOrganizer={isOrganizer} reload={reload} />;
  const seeding = isOrganizer && (t.status === "signup" || t.status === "draft");
  const sharing = justCreated && isOrganizer && t.status === "signup";
  const chip = statusChip(t);
  const mapName = (r: Parameters<typeof mapTitle>[0]) => mapTitle(r);

  return (
    <Page
      title={t.name}
      path={tournamentPath(t.slug)}
      eyebrow={sharing ? "✓ Signup is open" : <><NextLink href="/tournaments">Tournaments</NextLink> / {t.name}</>}
      heading={sharing ? "Now get people in." : t.name}
      lede={sharing && t.signupClosesAt ? `Signup closes ${formatWhen(t.signupClosesAt)}, or as soon as all ${t.size} seats fill.` : undefined}
    >
      {sharing && <SharePanel t={t} />}
      <Box display="grid" gridTemplateColumns={{ base: "1fr", md: "3fr 2fr" }} gap="16px" alignItems="start">
        <Card p="20px">
          <Flex gap="8px" align="center" flexWrap="wrap" mb="6px">
            <Chip tone={chip.tone}>{chip.label}</Chip>
            {t.signupClosesAt && t.status === "signup" && <Text fontSize="12px" opacity={0.7}>closes {formatWhen(t.signupClosesAt)}</Text>}
          </Flex>
          <Text fontSize="14px" opacity={0.8} mb="16px">
            {formatLabel(t)} · {t.size} players · one game per match · {WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`} per match
            {t.organizer.username ? ` · by ${t.organizer.username}` : ""}
          </Text>
          <Flex flexDir="column" gap="16px">
            <Seats t={t} entries={entries} />
            <JoinPanel t={t} entries={entries} reload={reload} />
            <Flex as="dl" gap="24px" flexWrap="wrap" fontSize="14px" borderTop="1px solid rgba(72,40,79,0.15)" pt="12px">
              <Box><Text as="dt" opacity={0.6} fontSize="12px">Heroes &amp; map</Text><Text as="dd">{t.settings?.matchupSetBy === "organizer" ? "Organizer sets each match" : describeRule(t.matchupRule, mapName)}</Text></Box>
              <Box><Text as="dt" opacity={0.6} fontSize="12px">Host</Text><Text as="dd">{t.organizer.username ?? "—"}</Text></Box>
            </Flex>
          </Flex>
        </Card>
        <Card p="20px">
          <Text fontWeight={700} mb="10px">How a match works</Text>
          <Box as="ol" pl="18px" fontSize="14px" display="flex" flexDir="column" gap="10px">
            <li><b>Your match opens.</b> {t.format === "round_robin" ? `Every match opens when the event starts, each with ${WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`}. Play them in any order.` : `${WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`} from when both of you are known. We ping you both.`} We ping you both.</li>
            <li><b>Press &ldquo;I&apos;m ready to play&rdquo;.</b> We hold a private room and ping your opponent.</li>
            <li><b>Play.</b> The result and replay land on the {t.format === "round_robin" ? "standings" : "bracket"} by themselves.</li>
          </Box>
        </Card>
      </Box>
      {seeding && (
        <Box mt="16px">
          <SeedingPanel t={t} entries={entries} reload={reload} />
        </Box>
      )}
    </Page>
  );
};
