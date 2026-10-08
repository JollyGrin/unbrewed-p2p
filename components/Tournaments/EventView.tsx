import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useState } from "react";

import { refreshAccount, signInUrl, useAccount } from "@/lib/account/useAccount";
import { joinTournament, leaveTournament, rateLimitText, type TournamentFailure } from "@/lib/tournaments/api";
import { useTournament } from "@/lib/tournaments/hooks";
import { joinState, activeEntries } from "@/lib/tournaments/joinState";
import { describeTournamentRule } from "@/lib/tournaments/matchup";
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
import { signupCloseText, wasDraftDeleted } from "@/lib/tournaments/lifecycle";
import { BracketEventView } from "./BracketEventView";
import { RoundRobinEventView } from "./RoundRobinEventView";
import { LifecyclePanel } from "./LifecyclePanel";
import { SeedingPanel } from "./SeedingPanel";
import { Btn, Card, Chip, ErrorText, Notice, Page } from "./ui";

const JOIN_ERRORS: Partial<Record<TournamentFailure, string>> = {
  signup_closed: "Signup has closed.",
  full: "All seats are taken.",
  unauthorized: "Your session ended. Sign in with Discord again.",
  rate_limited: "Slow down a moment, then try again.",
};

/** The first character of a name, emoji and astral scripts included (UX S20). */
export const initialOf = (name: string | null | undefined): string => (Array.from(name ?? "")[0] ?? "?").toUpperCase();

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
              {e ? (e.avatarUrl ? <Box as="img" src={e.avatarUrl} alt="" w="34px" h="34px" /> : initialOf(e.username)) : null}
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
  deletedDraft = false,
}: {
  t: Tournament;
  entries: Entry[];
  /** A cancelled event that never had entrants or matches: the organizer deleted a draft (#1256). */
  deletedDraft?: boolean;
  reload: () => void;
}) => {
  const { status, account } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Discord pings are promised only when the api says the bot is live (UX S4).
  const discord = t.notifications === "discord";
  const ready = discord ? "We'll ping you on Discord when your match is ready." : "Check this page for your match: it shows up here when it opens.";
  const userId = status === "signed-in" && account ? account.id : null;
  const state = joinState(t, entries, userId);

  const run = async (fn: () => Promise<{ ok: boolean; reason?: TournamentFailure; code?: string; message?: string; retryAfter?: number }>) => {
    setBusy(true);
    setError(null);
    setSignIn(false);
    const r = await fn();
    setBusy(false);
    // already_joined / already left is the state we wanted: just refresh.
    if (!r.ok && r.reason !== "already_joined" && r.reason !== "not_found")
      setError(
        (r.code === "timeout" && r.message) ||
          (r.reason === "rate_limited" && r.retryAfter ? rateLimitText(r) : null) ||
          (JOIN_ERRORS[r.reason ?? "unavailable"] ?? "Couldn't reach the server. Try again."),
      );
    // A dead session: offer the way back in and re-probe /me (UX B3).
    if (!r.ok && r.reason === "unauthorized") {
      setSignIn(true);
      void refreshAccount().catch(() => {});
    }
    reload();
  };

  return (
    <Flex flexDir="column" gap="14px" data-testid="join-panel" data-state={state.kind}>
      {state.kind === "signed_out" && (
        <>
          <Btn variant="discord" href={signInUrl(tournamentPath(t.slug))} w="100%">
            Sign in with Discord to join
          </Btn>
          <Text fontSize="13px" textAlign="center" opacity={0.7}>
            You&apos;ll come straight back here to confirm.{discord ? " We use Discord to ping you when your match opens." : ""}
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
              <Text fontWeight={700}>You&apos;re in, player {state.seat} of {state.of}.</Text>
              <Text fontSize="14px" opacity={0.8}>
                {t.status === "running"
                  ? `The ${t.format === "round_robin" ? "standings are" : "bracket is"} live. ${ready}`
                  : `${signupCloseText(t) ? `Signup ${signupCloseText(t)}; then the` : "The"} organizer starts the ${t.format === "round_robin" ? "tournament" : "bracket"}${signupCloseText(t) ? "" : " when enough players have joined"}. ${ready}`}
              </Text>
            </Box>
          </Flex>
          {state.kind === "joined" && (
            <Flex justify="space-between" align="center" gap="12px" flexWrap="wrap" fontSize="14px">
              <Text opacity={0.8}>Plans changed? You can leave until signup closes{t.signupClosesAt ? ` ${formatWhen(t.signupClosesAt)}` : ""}.</Text>
              {!leaving && <Btn variant="ghost" disabled={busy} onClick={() => setLeaving(true)}>Leave tournament</Btn>}
            </Flex>
          )}
          {state.kind === "joined" && leaving && (
            <Box border="1px solid rgba(179,38,30,0.35)" bg="rgba(179,38,30,0.06)" borderRadius="10px" p="10px 12px" fontSize="14px" data-testid="leave-confirm">
              <Text>Leave this tournament? You can rejoin while signup is open.</Text>
              <Flex gap="8px" mt="8px" flexWrap="wrap">
                <Btn variant="gold" disabled={busy} onClick={() => run(() => leaveTournament(t.slug)).then(() => setLeaving(false))}>Yes, leave</Btn>
                <Btn variant="ghost" disabled={busy} onClick={() => setLeaving(false)}>Stay in</Btn>
              </Flex>
            </Box>
          )}
        </>
      )}
      {state.kind === "full" && <Text fontWeight={600}>All seats are taken.</Text>}
      {state.kind === "closed" && (
        <Text fontWeight={600}>
          {t.status === "signup" ? "Signup has closed." : t.status === "running" ? "This bracket is underway." : t.status === "cancelled" ? (deletedDraft ? "This draft was deleted." : "This tournament was cancelled.") : "This tournament is over."}
        </Text>
      )}
      {error && <ErrorText fontSize="14px">{error}</ErrorText>}
      {signIn && (
        <Btn variant="discord" href={signInUrl(tournamentPath(t.slug))} w="100%" data-testid="join-sign-in">
          Sign in with Discord
        </Btn>
      )}
    </Flex>
  );
};

export const SharePanel = ({ t }: { t: Tournament }) => {
  const [copied, setCopied] = useState<"link" | "post" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const link = tournamentUrl(t.slug, origin);
  const copy = async (what: "link" | "post") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : discordPost(t, origin));
      setCopied(what);
      setCopyFailed(false);
    } catch {
      // No clipboard permission (or an insecure context): say so, never fail silently.
      setCopied(null);
      setCopyFailed(true);
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
        {copyFailed && (
          <ErrorText mt="8px" data-testid="copy-failed">
            Couldn&apos;t copy. Select the text and copy it by hand.
          </ErrorText>
        )}
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
  // A draft is private: anyone but its organizer gets the normal "no tournament here" page.
  if (t.status === "draft" && !isOrganizer)
    return (
      <Page title="Tournament" path={tournamentPath(slug)} heading="Tournament">
        <Notice title="No tournament here">That link doesn&apos;t match a tournament. It may have been cancelled.</Notice>
        <Flex mt="16px" gap="10px" flexWrap="wrap">
          <Btn href="/tournaments" variant="ghost">All tournaments</Btn>
        </Flex>
      </Page>
    );
  // A cancelled tournament that had started keeps its results visible (api #91).
  const started = t.status === "running" || t.status === "complete" || (t.status === "cancelled" && matches.length > 0);
  if (started && t.format === "round_robin")
    return <RoundRobinEventView t={t} entries={entries} matches={matches} standings={standings} isOrganizer={isOrganizer} reload={reload} />;
  if (started)
    return <BracketEventView t={t} entries={entries} matches={matches} isOrganizer={isOrganizer} reload={reload} />;
  const seeding = isOrganizer && t.status === "signup";
  const draft = t.status === "draft";
  const cancelled = t.status === "cancelled";
  const deletedDraft = cancelled && entries.length === 0 && matches.length === 0 && wasDraftDeleted(t.slug);
  const sharing = justCreated && isOrganizer && t.status === "signup";
  const chip = deletedDraft ? { tone: "plain" as const, label: "Draft deleted" } : statusChip(t);
  const mapName = (r: Parameters<typeof mapTitle>[0]) => mapTitle(r);

  return (
    <Page
      title={t.name}
      path={tournamentPath(t.slug)}
      eyebrow={sharing ? "✓ Signup is open" : <><NextLink href="/tournaments">Tournaments</NextLink> / {t.name}</>}
      heading={sharing ? "Now get people in." : t.name}
      lede={draft ? "Draft: not public yet." : sharing && t.signupClosesAt ? `Signup closes ${formatWhen(t.signupClosesAt)}, or as soon as all ${t.size} seats fill.` : undefined}
    >
      {sharing && <SharePanel t={t} />}
      {isOrganizer && (draft || t.status === "signup") && <LifecyclePanel t={t} entries={entries} reload={reload} />}
      <Box display="grid" gridTemplateColumns={{ base: "minmax(0, 1fr)", md: "minmax(0, 3fr) minmax(0, 2fr)" }} gap="16px" alignItems="start">
        <Card p="20px">
          <Flex gap="8px" align="center" flexWrap="wrap" mb="6px">
            <Chip tone={chip.tone}>{chip.label}</Chip>
            {t.signupClosesAt && t.status === "signup" && <Text fontSize="12px" opacity={0.7}>{signupCloseText(t)}</Text>}
          </Flex>
          <Text fontSize="14px" opacity={0.8} mb="16px" overflowWrap="anywhere">
            {formatLabel(t)} · {t.size} players · one game per match · {WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`} per match
            {t.organizer.username ? ` · by ${t.organizer.username}` : ""}
          </Text>
          <Flex flexDir="column" gap="16px">
            <Seats t={t} entries={entries} />
            {!draft && <JoinPanel t={t} entries={entries} reload={reload} deletedDraft={deletedDraft} />}
            <Flex as="dl" gap="24px" flexWrap="wrap" fontSize="14px" borderTop="1px solid rgba(72,40,79,0.15)" pt="12px">
              <Box><Text as="dt" opacity={0.6} fontSize="12px">Heroes &amp; map</Text><Text as="dd">{describeTournamentRule(t, mapName)}</Text></Box>
              <Box><Text as="dt" opacity={0.6} fontSize="12px">Host</Text><Text as="dd" overflowWrap="anywhere">{t.organizer.username ?? "—"}</Text></Box>
            </Flex>
          </Flex>
        </Card>
        {!cancelled && (
        <Card p="20px">
          <Text fontWeight={700} mb="10px">How a match works</Text>
          <Box as="ol" pl="18px" fontSize="14px" display="flex" flexDir="column" gap="10px">
            <li><b>Your match opens.</b> {t.format === "round_robin" ? `Every match opens when the event starts, each with ${WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`}. Play them in any order.` : `${WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`} from when both of you are known. We ping you both.`}</li>
            <li><b>Press &ldquo;I&apos;m ready to play&rdquo;.</b> We hold a private room and ping your opponent.</li>
            <li><b>Play.</b> The result and replay land on the {t.format === "round_robin" ? "standings" : "bracket"} by themselves.</li>
          </Box>
        </Card>
        )}
      </Box>
      {seeding && (
        <Box mt="16px">
          <SeedingPanel t={t} entries={entries} reload={reload} />
        </Box>
      )}
    </Page>
  );
};
