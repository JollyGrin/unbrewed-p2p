/**
 * Organizer, before start (#1217): drag-to-reorder seeding, then Start.
 *
 * Start always saves the order on screen first (`PUT …/seeds`), so the bracket
 * is built from exactly what the organizer sees — the api only random-seeds
 * when no seeds are saved.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { putSeeds, startTournament, type Result } from "@/lib/tournaments/api";
import { activeEntries } from "@/lib/tournaments/joinState";
import { UNDER_FILLED_COPY, canStartWith, underFilledClosed } from "@/lib/tournaments/lifecycle";
import {
  byeCopy,
  hasSavedSeeds,
  initialSeedOrder,
  moveSeed,
  opponentOfSeed,
  seedPayload,
  shuffleSeeds,
} from "@/lib/tournaments/seeding";
import type { Entry, Tournament } from "@/lib/tournaments/types";

import { Avatar } from "./Bracket";
import { Btn, Card } from "./ui";

const START_ERRORS: Record<string, string> = {
  not_enough_entries: "More than half the seats must be filled to start.",
  invalid_status_transition: "This tournament can't be started from its current state.",
  already_started: "The bracket has already started.",
  invalid_seed_order: "Someone joined or left. Reload and check the order again.",
};

const errorText = (r: Extract<Result<unknown>, { ok: false }>): string =>
  (r.code && START_ERRORS[r.code]) ||
  (r.reason === "unauthorized" ? "Your session ended. Sign in with Discord again." : "Couldn't reach the server. Try again.");

export const SeedingPanel = ({
  t,
  entries,
  reload,
}: {
  t: Tournament;
  entries: Entry[];
  reload: () => void;
}) => {
  const saved = hasSavedSeeds(entries);
  const baseKey = activeEntries(entries).map((e) => `${e.id}:${e.seed}`).join(",");
  // Unsaved organizers start from a random order, like the mockup's "Random".
  const fresh = () => (saved ? initialSeedOrder(entries) : shuffleSeeds(initialSeedOrder(entries)));
  const [order, setOrder] = useState<string[]>(fresh);
  const [dirty, setDirty] = useState(!saved);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Roster changed under us (join/leave): rebuild the list.
  useEffect(() => {
    setOrder(fresh());
    setDirty(!saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);

  const byId = new Map(entries.map((e) => [e.id, e]));
  const n = order.length;
  const rr = t.format === "round_robin";
  const canStart = canStartWith(t, n);
  // Signup is over and it never filled: no dead Start, say what to do (#1242).
  const stuck = underFilledClosed(t, n);
  const reorder = (next: string[]) => {
    setOrder(next);
    setDirty(true);
    setConfirming(false);
  };

  const save = async (): Promise<boolean> => {
    const body = seedPayload(order, entries);
    if (!body) {
      setError(START_ERRORS.invalid_seed_order);
      return false;
    }
    const r = await putSeeds(t.slug, body.order);
    if (!r.ok) {
      setError(errorText(r));
      return false;
    }
    setDirty(false);
    return true;
  };

  const run = async (withStart: boolean) => {
    setBusy(true);
    setError(null);
    const ok = await save();
    if (ok && withStart) {
      const r = await startTournament(t.slug);
      if (!r.ok) setError(errorText(r));
    }
    setBusy(false);
    setConfirming(false);
    reload();
  };

  return (
    <Card p="20px" data-testid="seeding-panel">
      <Flex justify="space-between" align="baseline" gap="12px" flexWrap="wrap">
        <Box>
          <Text fontWeight={700}>Seeding</Text>
          <Text fontSize="13px" opacity={0.75}>{rr ? "Seed order breaks ties. Seeds lock when the event starts." : "Who meets whom in round 1. Seeds lock when the bracket starts."}</Text>
        </Box>
        <Btn variant="ghost" minH="36px" px="14px" fontSize="14px" disabled={busy || n < 2} onClick={() => reorder(shuffleSeeds(order))}>
          Shuffle
        </Btn>
      </Flex>
      <Text fontSize="13px" opacity={0.75} mt="8px">
        {n === 0
          ? "No one has joined yet."
          : rr
            ? "Drag to reorder, or use the arrows. Seeds only break ties and decide who takes slot A; everyone plays everyone."
            : `Drag to reorder, or use the arrows. ${n < t.size ? `${byeCopy(t.size - n)} for the top seeds.` : `Seed 1 meets seed ${t.size}.`}`}
      </Text>
      <Box as="ol" listStyleType="none" m="10px 0 0" p={0} display="flex" flexDir="column" gap="6px" data-testid="seed-list">
        {order.map((id, i) => {
          const e = byId.get(id);
          const opp = rr ? null : opponentOfSeed(i + 1, t.size, n);
          return (
            <Flex
              as="li"
              key={id}
              data-entry={id}
              draggable
              onDragStart={(ev: React.DragEvent) => {
                setDrag(i);
                ev.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(ev: React.DragEvent) => {
                ev.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(ev: React.DragEvent) => {
                ev.preventDefault();
                if (drag !== null) reorder(moveSeed(order, drag, i));
                setDrag(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              align="center"
              gap="10px"
              bg="#FFF8EC"
              border={`1.5px solid ${over === i && drag !== i ? "#E0A82E" : "rgba(72,40,79,0.15)"}`}
              boxShadow={over === i && drag !== i ? "0 0 0 2px rgba(224,168,46,.35)" : "none"}
              opacity={drag === i ? 0.4 : 1}
              borderRadius="8px"
              px="10px"
              py="6px"
              fontSize="14px"
              cursor="grab"
            >
              <Text fontFamily="LeagueGothic" fontSize="22px" w="22px" textAlign="center" opacity={0.6}>{i + 1}</Text>
              <Avatar name={e?.username ?? "?"} url={e?.avatarUrl} size={26} />
              <Text flex="1" minW={0} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis" fontWeight={600}>
                {e?.username ?? "Player"}
              </Text>
              <Text fontSize="12px" opacity={0.65} whiteSpace="nowrap">{rr ? "" : opp ? `vs ${opp}` : "bye"}</Text>
              <Flex gap="2px">
                <Box as="button" type="button" aria-label={`Move ${e?.username ?? "player"} up`} disabled={i === 0 || busy} onClick={() => reorder(moveSeed(order, i, i - 1))} w="32px" h="32px" borderRadius="6px" _disabled={{ opacity: 0.25 }} _hover={{ bg: "rgba(72,40,79,0.08)" }}>↑</Box>
                <Box as="button" type="button" aria-label={`Move ${e?.username ?? "player"} down`} disabled={i === n - 1 || busy} onClick={() => reorder(moveSeed(order, i, i + 1))} w="32px" h="32px" borderRadius="6px" _disabled={{ opacity: 0.25 }} _hover={{ bg: "rgba(72,40,79,0.08)" }}>↓</Box>
              </Flex>
            </Flex>
          );
        })}
      </Box>
      <Flex gap="10px" mt="14px" flexWrap="wrap" align="center">
        {stuck ? null : !confirming ? (
          <Btn variant="gold" disabled={busy || !canStart} onClick={() => setConfirming(true)} data-testid="start-bracket">
            {rr ? "Start round robin" : "Start bracket"}
          </Btn>
        ) : (
          <>
            <Btn variant="gold" disabled={busy} onClick={() => run(true)} data-testid="confirm-start">
              Start now · round 1 opens
            </Btn>
            <Btn variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Not yet</Btn>
          </>
        )}
        {dirty && n > 1 && !confirming && (
          <Btn variant="ghost" disabled={busy} onClick={() => run(false)} data-testid="save-seeds">Save order</Btn>
        )}
        <Text fontSize="13px" opacity={0.7}>
          {stuck
            ? UNDER_FILLED_COPY
            : !canStart
            ? rr
              ? `Start needs at least ${Math.max(4, Math.floor(t.size / 2) + 1)} players (${t.size} seats).`
              : `Start needs more than half the seats filled (${Math.floor(t.size / 2) + 1} of ${t.size}).`
            : confirming
              ? rr ? "Signup closes and every match opens for everyone." : "Signup closes and round 1 opens for everyone."
              : dirty
                ? "Not saved yet. Start saves this order."
                : "Order saved."}
        </Text>
      </Flex>
      {error && <Text role="alert" color="#B3361F" fontSize="14px" mt="10px">{error}</Text>}
    </Card>
  );
};
