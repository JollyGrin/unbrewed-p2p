/**
 * Organizer tools (#1219), shown to the organizer only: the "Needs your
 * attention" queue, and per-match controls (override a result, set a
 * matchup). The matchup form only chooses a RULE (see lib/tournaments/organizer
 * + matchup); it never writes per-game fields.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useMemo, useState } from "react";

import { useProLiveRosterState } from "@/lib/pro/useProLiveRoster";
import { PRO_WS_URL } from "@/lib/pro/wsUrl";
import {
  confirmGame,
  overrideMatch,
  putMatchup,
  rejectGame,
} from "@/lib/tournaments/api";
import { matchHref, roundCount } from "@/lib/tournaments/bracket";
import { useAttention } from "@/lib/tournaments/hooks";
import { proDeckOptions, proMapOptions } from "@/lib/tournaments/options";
import {
  NOTE_MAX,
  attentionRows,
  buildMatchupRule,
  dueText,
  organizerErrorText,
  overrideBody,
  type AttentionAction,
} from "@/lib/tournaments/organizer";
import type { Entry, MapRef, Match, Tournament } from "@/lib/tournaments/types";

import { Btn, Card } from "./ui";

const FIELD = {
  w: "100%",
  minH: "44px",
  px: "10px",
  borderRadius: "8px",
  border: "1px solid rgba(72,40,79,0.3)",
  bg: "white",
  fontSize: "15px",
} as const;

const nameOf = (entries: readonly Entry[], id: string | null) =>
  entries.find((e) => e.id === id)?.username ?? "Player";

type Run = (
  call: () => Promise<{ ok: boolean } & Record<string, any>>,
) => Promise<boolean>;

/** Busy/error state shared by the forms and rows. */
const useRun = (onDone: () => void) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run: Run = async (call) => {
    setBusy(true);
    setError(null);
    const r = await call();
    setBusy(false);
    if (r.ok) {
      onDone();
      return true;
    }
    setError(organizerErrorText(r as any));
    return false;
  };
  return { busy, error, run };
};

const ErrorLine = ({ text }: { text: string | null }) =>
  text ? (
    <Text
      role="alert"
      color="#B3261E"
      fontSize="13px"
      mt="8px"
      data-testid="organizer-error"
    >
      {text}
    </Text>
  ) : null;

/** Override a match result, with a note. Re-deciding sends `replacesWinner`. */
export const OverrideForm = ({
  slug,
  match,
  entries,
  initialWinner,
  initialNote = "",
  onDone,
}: {
  slug: string;
  match: Match;
  entries: Entry[];
  initialWinner?: string | null;
  initialNote?: string;
  onDone: () => void;
}) => {
  const seats = [match.slotA, match.slotB].filter((x): x is string => !!x);
  const [winner, setWinner] = useState<string | null>(initialWinner ?? null);
  const [note, setNote] = useState(initialNote);
  const { busy, error, run } = useRun(onDone);
  const blocked =
    match.decidedBy === "bye"
      ? "A bye can't be overridden."
      : seats.length < 2
        ? "Both players must be known first."
        : null;
  return (
    <Box data-testid="override-form" mt="10px">
      <Text fontWeight={700} fontSize="14px">
        Override result
      </Text>
      <Text fontSize="13px" opacity={0.75} mb="8px">
        For no-shows, disconnects or a game played outside unbrewed. The
        override replaces what was detected and is shown on the match.
        {match.winner
          ? " The match is already decided; this reverses it, unless the next match has started."
          : ""}
      </Text>
      {blocked ? (
        <Text fontSize="14px">{blocked}</Text>
      ) : (
        <>
          <Flex
            flexDir="column"
            gap="6px"
            role="radiogroup"
            aria-label="Winner"
          >
            {seats.map((id) => (
              <Flex
                as="label"
                key={id}
                align="center"
                gap="8px"
                minH="44px"
                px="10px"
                borderRadius="8px"
                border="1px solid rgba(72,40,79,0.25)"
                bg={winner === id ? "rgba(224,168,46,0.18)" : "transparent"}
                cursor="pointer"
              >
                <input
                  type="radio"
                  name={`ov-${match.id}`}
                  checked={winner === id}
                  onChange={() => setWinner(id)}
                />
                Award match to {nameOf(entries, id)}
              </Flex>
            ))}
          </Flex>
          <Box
            as="textarea"
            {...FIELD}
            mt="8px"
            py="8px"
            minH="64px"
            maxLength={NOTE_MAX}
            placeholder="Note (shown on the match)"
            aria-label="Note"
            value={note}
            onChange={(e: any) => setNote(e.target.value)}
          />
          <Flex gap="8px" mt="8px" flexWrap="wrap">
            <Btn
              variant="gold"
              disabled={!winner || busy}
              onClick={() =>
                winner &&
                run(() =>
                  overrideMatch(
                    slug,
                    match.id,
                    overrideBody(match, winner, note),
                  ),
                )
              }
            >
              {busy ? "Applying…" : "Apply override"}
            </Btn>
          </Flex>
          <ErrorLine text={error} />
        </>
      )}
    </Box>
  );
};

/** Hero per seat + map for ONE match: stored as that match's rule override. */
export const MatchupForm = ({
  slug,
  match,
  entries,
  onDone,
}: {
  slug: string;
  match: Match;
  entries: Entry[];
  onDone: () => void;
}) => {
  const { heroes } = useProLiveRosterState(PRO_WS_URL);
  const decks = useMemo(() => proDeckOptions(heroes ?? []), [heroes]);
  const maps = useMemo(() => proMapOptions(), []);
  const cur = match.matchupRule;
  const [a, setA] = useState(cur.heroes?.a ?? "");
  const [b, setB] = useState(cur.heroes?.b ?? "");
  const [map, setMap] = useState<MapRef | null>(cur.map ?? null);
  const { busy, error, run } = useRun(onDone);
  const decided = match.status === "decided";
  const seat = (
    label: string,
    value: string,
    set: (v: string) => void,
    id: string | null,
  ) => (
    <Box flex="1" minW="160px">
      <Text as="label" fontSize="12px" opacity={0.7} display="block" mb="4px">
        {label}
      </Text>
      <Box
        as="select"
        {...FIELD}
        aria-label={`${nameOf(entries, id)} plays`}
        value={value}
        onChange={(e: any) => set(e.target.value)}
      >
        <option value="">Player chooses</option>
        {value && !decks.some((d) => d.heroId === value) && (
          <option value={value}>{value}</option>
        )}
        {decks.map((d) => (
          <option key={d.heroId} value={d.heroId}>
            {d.name}
          </option>
        ))}
      </Box>
    </Box>
  );
  return (
    <Box data-testid="matchup-form" mt="10px">
      <Text fontWeight={700} fontSize="14px">
        Set matchup
      </Text>
      <Text fontSize="13px" opacity={0.75} mb="8px">
        Pick a hero for each seat and the map. Anything left on &ldquo;Player
        chooses&rdquo; stays open. It applies until the first game.
      </Text>
      {decided ? (
        <Text fontSize="14px">
          This match is decided; its matchup can&apos;t change.
        </Text>
      ) : (
        <>
          <Flex gap="10px" flexWrap="wrap">
            {seat(
              `${nameOf(entries, match.slotA)} plays`,
              a,
              setA,
              match.slotA,
            )}
            {seat(
              `${nameOf(entries, match.slotB)} plays`,
              b,
              setB,
              match.slotB,
            )}
          </Flex>
          <Text fontSize="12px" opacity={0.7} mt="10px" mb="4px">
            Map
          </Text>
          <Flex gap="6px" flexWrap="wrap" role="group" aria-label="Map">
            <MapChip sel={!map} onClick={() => setMap(null)}>
              Players choose
            </MapChip>
            {maps.map((m) => (
              <MapChip
                key={m.ref.id}
                sel={map?.id === m.ref.id}
                onClick={() => setMap(m.ref)}
              >
                {m.title}
              </MapChip>
            ))}
          </Flex>
          <Flex gap="8px" mt="12px" flexWrap="wrap">
            <Btn
              variant="gold"
              disabled={busy}
              onClick={() =>
                run(() =>
                  putMatchup(slug, match.id, buildMatchupRule({ a, b, map })),
                )
              }
            >
              {busy ? "Saving…" : "Save matchup"}
            </Btn>
            {match.matchupOverride && (
              <Btn
                variant="ghost"
                disabled={busy}
                onClick={() => run(() => putMatchup(slug, match.id, null))}
              >
                Clear (use event default)
              </Btn>
            )}
          </Flex>
          <ErrorLine text={error} />
        </>
      )}
    </Box>
  );
};

const MapChip = ({
  sel,
  onClick,
  children,
}: {
  sel: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Box
    as="button"
    type="button"
    aria-pressed={sel}
    onClick={onClick}
    minH="36px"
    px="12px"
    borderRadius="999px"
    fontSize="13px"
    fontWeight={600}
    border="1px solid rgba(72,40,79,0.3)"
    bg={sel ? "#48284F" : "transparent"}
    color={sel ? "#FAEBD7" : "inherit"}
  >
    {children}
  </Box>
);

/** Controls on a match page: matchup (until decided) + override. */
export const MatchOrganizerPanel = ({
  slug,
  match,
  entries,
  reload,
}: {
  slug: string;
  match: Match;
  entries: Entry[];
  reload: () => void;
}) => {
  const [open, setOpen] = useState<"override" | "matchup" | null>(null);
  const done = () => {
    setOpen(null);
    reload();
  };
  return (
    <Card p="16px" data-testid="organizer-panel">
      <Text
        fontSize="12px"
        fontFamily="ArchivoNarrow"
        textTransform="uppercase"
        letterSpacing="0.08em"
        opacity={0.7}
      >
        Organizer only
      </Text>
      <Flex gap="8px" mt="8px" flexWrap="wrap">
        {match.status !== "decided" && (
          <Btn
            variant="ghost"
            onClick={() => setOpen(open === "matchup" ? null : "matchup")}
          >
            Set matchup…
          </Btn>
        )}
        <Btn
          variant="ghost"
          onClick={() => setOpen(open === "override" ? null : "override")}
        >
          Override result…
        </Btn>
      </Flex>
      {open === "matchup" && (
        <MatchupForm
          slug={slug}
          match={match}
          entries={entries}
          onDone={done}
        />
      )}
      {open === "override" && (
        <OverrideForm
          slug={slug}
          match={match}
          entries={entries}
          onDone={done}
        />
      )}
    </Card>
  );
};

const ICON: Record<string, string> = {
  gold: "#E0A82E",
  ink: "#48284F",
  red: "#B3261E",
};

/** "Needs your attention": first thing the organizer sees while it's non-empty. */
export const AttentionQueue = ({
  t,
  entries,
  matches,
  reload,
  now = Date.now(),
}: {
  t: Tournament;
  entries: Entry[];
  matches: Match[];
  reload: () => void;
  now?: number;
}) => {
  const [data, reloadQueue] = useAttention(t.slug, t.status === "running");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [form, setForm] = useState<"override" | "matchup" | null>(null);
  const [rejecting, setRejecting] = useState<{ key: string; gameIndex: number } | null>(null);
  const [errRow, setErrRow] = useState<string | null>(null);
  const [award, setAward] = useState<{
    key: string;
    entryId: string;
    note: string;
  } | null>(null);
  const refresh = () => {
    setOpenRow(null);
    setForm(null);
    setAward(null);
    setRejecting(null);
    reload();
    reloadQueue();
  };
  const { busy, error, run } = useRun(refresh);
  const rows = useMemo(
    () =>
      data.status === "ready"
        ? attentionRows(data.value, entries, matches, roundCount(t.size))
        : [],
    [data, entries, matches, t.size],
  );
  if (data.status !== "ready" || rows.length === 0) return null;

  /** "Not valid" on an unverified game: reject it (api #75); the match stays undecided. */
  const rejectUnverified = (row: { matchId: string }, gameIndex: number) =>
    void run(() => rejectGame(t.slug, row.matchId, gameIndex));

  const act = (row: (typeof rows)[number], a: AttentionAction) => {
    const match = matches.find((m) => m.id === row.matchId);
    if (!match) return;
    setErrRow(row.key);
    if (a.type === "confirm")
      void run(() => confirmGame(t.slug, row.matchId, a.gameIndex));
    else if (a.type === "award") {
      setOpenRow(row.key);
      setForm("override");
      setAward({ key: row.key, entryId: a.entryId, note: a.note });
    } else if (a.type === "reject") {
      setRejecting({ key: row.key, gameIndex: a.gameIndex });
    } else if (a.type === "override" || a.type === "matchup") {
      setOpenRow(row.key);
      setForm(a.type);
      setAward(null);
    }
  };

  return (
    <Card p="0" overflow="hidden" mb="20px" data-testid="attention-queue">
      <Flex
        px="18px"
        py="12px"
        borderBottom="1px solid rgba(72,40,79,0.12)"
        align="baseline"
        justify="space-between"
        gap="8px"
        flexWrap="wrap"
      >
        <Text as="h2" fontFamily="LeagueGothic" fontSize="30px" lineHeight="1">
          Needs your attention · {rows.length}
        </Text>
        <Text fontSize="12px" opacity={0.7}>
          Organizer only
        </Text>
      </Flex>
      {rows.map((row) => {
        const match = matches.find((m) => m.id === row.matchId);
        const isOpen = openRow === row.key;
        const left = dueText(row.due, now);
        return (
          <Box
            key={row.key}
            px="18px"
            py="14px"
            borderBottom="1px solid rgba(72,40,79,0.1)"
            data-testid="attention-item"
            data-kind={row.key.split(":")[0]}
          >
            <Flex gap="12px" align="start">
              <Box
                mt="6px"
                w="10px"
                h="10px"
                borderRadius="999px"
                flexShrink={0}
                bg={ICON[row.tone]}
              />
              <Box flex="1" minW={0}>
                <Flex justify="space-between" gap="8px" flexWrap="wrap">
                  <Text fontWeight={700}>{row.title}</Text>
                  {left && (
                    <Text
                      fontSize="12px"
                      fontWeight={700}
                      color={row.tone === "red" ? "#B3261E" : "inherit"}
                    >
                      {left}
                    </Text>
                  )}
                </Flex>
                <Text fontSize="12px" opacity={0.65}>
                  {row.context}
                </Text>
                <Text fontSize="14px" mt="4px">
                  {row.body}
                </Text>
                <Flex gap="8px" mt="10px" flexWrap="wrap">
                  {row.actions.map((a) =>
                    a.type === "open" ? (
                      <Btn
                        key={a.label}
                        as={NextLink}
                        href={matchHref(t.slug, row.matchId)}
                        variant="ghost"
                        px="14px"
                      >
                        {a.label}
                      </Btn>
                    ) : (
                      <Btn
                        key={a.label}
                        variant={
                          a.type === "confirm" || a.type === "matchup"
                            ? "gold"
                            : "ghost"
                        }
                        px="14px"
                        disabled={busy}
                        onClick={() => act(row, a)}
                      >
                        {a.label}
                      </Btn>
                    ),
                  )}
                </Flex>
                {rejecting?.key === row.key && (
                  <Box mt="10px" p="12px" borderRadius="8px" bg="rgba(179,38,30,0.08)" data-testid="reject-confirm">
                    <Text fontSize="14px">Reject this game? It will not count and can&apos;t be undone. The match stays undecided.</Text>
                    <Flex gap="8px" mt="8px" flexWrap="wrap">
                      <Btn variant="gold" px="14px" disabled={busy} onClick={() => rejectUnverified(row, rejecting.gameIndex)}>
                        Yes, reject game
                      </Btn>
                      <Btn variant="ghost" px="14px" disabled={busy} onClick={() => setRejecting(null)}>
                        Keep it
                      </Btn>
                    </Flex>
                  </Box>
                )}
                {isOpen && match && form === "override" && (
                  <OverrideForm
                    key={award?.entryId ?? "o"}
                    slug={t.slug}
                    match={match}
                    entries={entries}
                    initialWinner={award?.entryId}
                    initialNote={award?.note}
                    onDone={refresh}
                  />
                )}
                {isOpen && match && form === "matchup" && (
                  <MatchupForm
                    slug={t.slug}
                    match={match}
                    entries={entries}
                    onDone={refresh}
                  />
                )}
                {!isOpen && errRow === row.key && <ErrorLine text={error} />}
              </Box>
            </Flex>
          </Box>
        );
      })}
    </Card>
  );
};
