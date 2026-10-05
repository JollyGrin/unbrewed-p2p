/**
 * Organizer recourse (#1242): the draft page's Open signup / Edit / Delete,
 * and Edit / Extend signup / Cancel while signup is open or has closed
 * under-filled; Cancel alone once running. Every control is one PATCH; a
 * refusal (cancel-running and extend-after-close wait on unbrewed-api #91)
 * shows the api's own words.
 */
import { Box, Flex, Input, Text } from "@chakra-ui/react";
import { useState } from "react";

import { getTournament, patchTournament, type TournamentPatch } from "@/lib/tournaments/api";
import { WINDOWS, mapSlots, sizesFor } from "@/lib/tournaments/createForm";
import { activeEntries, signupWindowOpen } from "@/lib/tournaments/joinState";
import {
  UNDER_FILLED_COPY,
  cancelConsequence,
  cancelKind,
  cancelLabel,
  closeProblem,
  editFormOf,
  editWithShape,
  editPatch,
  markDraftDeleted,
  signupCloseText,
  toLocalInput,
  underFilledClosed,
  type EditFormState,
} from "@/lib/tournaments/lifecycle";
import { organizerErrorText } from "@/lib/tournaments/organizer";
import type { Entry, Tournament } from "@/lib/tournaments/types";

import { MapChips } from "./MapChips";
import { Btn, Card } from "./ui";

const FIELD = { w: "100%", minH: "44px", px: "10px", borderRadius: "8px", border: "1px solid rgba(72,40,79,0.3)", bg: "white", fontSize: "15px" } as const;

const Label = ({ children }: { children: React.ReactNode }) => (
  <Text as="label" display="block" fontSize="12px" fontFamily="ArchivoNarrow" textTransform="uppercase" letterSpacing="0.08em" opacity={0.7} mb="4px">
    {children}
  </Text>
);

type Panel = "edit" | "extend" | "cancel" | null;

export const LifecyclePanel = ({
  t,
  entries,
  reload,
  onCancelled,
}: {
  t: Tournament;
  entries: Entry[];
  reload: () => void;
  /** After a successful cancel (the page then shows the cancelled state). */
  onCancelled?: () => void;
}) => {
  const players = activeEntries(entries).length;
  const [panel, setPanel] = useState<Panel>(null);
  const [form, setForm] = useState<EditFormState>(() => editFormOf(t));
  const [extendTo, setExtendTo] = useState(() => toLocalInput(t.signupClosesAt));
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = t.status === "draft";
  const editable = draft || t.status === "signup";
  const kind = cancelKind(t);
  const stuck = underFilledClosed(t, players);
  if (!editable && t.status !== "running") return null;

  const open = (p: Panel) => {
    setPanel(panel === p ? null : p);
    setProblems([]);
    setError(null);
    if (p === "edit") setForm(editFormOf(t));
  };

  const send = async (body: TournamentPatch, after?: () => void) => {
    setBusy(true);
    setError(null);
    const r = await patchTournament(t.slug, body);
    setBusy(false);
    if (!r.ok) {
      // A 409 means our view is stale (cancelled/started elsewhere): re-read it and re-render.
      let status: string | undefined;
      if (r.reason === "conflict") {
        const fresh = await getTournament(t.slug);
        if (fresh.ok) status = fresh.value.tournament.status;
        reload();
      }
      setError(organizerErrorText(r, status));
      return;
    }
    setPanel(null);
    after?.();
    reload();
  };

  const saveEdit = () => {
    const { patch, problems: found } = editPatch(t, form, players);
    setProblems(found);
    if (found.length) return;
    if (Object.keys(patch).length === 0) return setPanel(null);
    void send(patch);
  };

  const saveExtend = () => {
    const bad = closeProblem(extendTo);
    setProblems(bad ? [bad] : []);
    if (!bad) void send({ signupClosesAt: new Date(extendTo).toISOString() });
  };

  return (
    <Card p="20px" mb="16px" data-testid="lifecycle-panel" data-status={t.status}>
      <Flex justify="space-between" align="baseline" gap="12px" flexWrap="wrap">
        <Box minW={0}>
          <Text as="h2" fontFamily="LeagueGothic" fontSize="28px" lineHeight="1.05">
            {draft ? "Draft: not public yet" : "Organizer controls"}
          </Text>
          <Text fontSize="13px" opacity={0.75} data-testid="lifecycle-note">
            {draft
              ? "Only you can see this. Open signup to publish it, or edit it first."
              : stuck
                ? UNDER_FILLED_COPY
                : t.status === "signup"
                  ? `Signup ${signupCloseText(t) || "has no close time"}. You can edit everything until the bracket starts.`
                  : "Once it is running, the only change left is calling it off."}
          </Text>
        </Box>
        <Text fontSize="12px" opacity={0.7}>Organizer only</Text>
      </Flex>

      <Flex gap="10px" mt="14px" flexWrap="wrap">
        {draft && (
          <Btn variant="gold" disabled={busy} data-testid="open-signup" onClick={() => void send({ status: "signup" })}>
            Open signup
          </Btn>
        )}
        {editable && (
          <Btn variant="ghost" disabled={busy} data-testid="edit-toggle" onClick={() => open("edit")}>
            Edit
          </Btn>
        )}
        {t.status === "signup" && (
          <Btn variant={stuck ? "gold" : "ghost"} disabled={busy} data-testid="extend-toggle" onClick={() => open("extend")}>
            Extend signup
          </Btn>
        )}
        {kind && (
          <Btn variant="ghost" disabled={busy} data-testid="cancel-toggle" onClick={() => open("cancel")} color="#B3261E">
            {cancelLabel(kind)}
          </Btn>
        )}
      </Flex>

      {panel === "edit" && (
        <Flex as="form" flexDir="column" gap="12px" mt="14px" data-testid="edit-form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); saveEdit(); }}>
          <Box>
            <Label>Tournament name</Label>
            <Input aria-label="Tournament name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} bg="white" />
          </Box>
          <Box>
            <Label>Seats</Label>
            <Box as="select" {...FIELD} aria-label="Seats" value={form.size} onChange={(e: any) => setForm(editWithShape(t, form, { size: Number(e.target.value) }))}>
              {sizesFor(t.format).map((s) => (
                <option key={s} value={s} disabled={s < players}>{s}{s < players ? " (fewer than joined)" : ""}</option>
              ))}
            </Box>
          </Box>
          <Box>
            <Label>Time per match</Label>
            <Box as="select" {...FIELD} aria-label="Time per match" value={form.matchWindowHours} onChange={(e: any) => setForm({ ...form, matchWindowHours: Number(e.target.value) })}>
              {WINDOWS.map((w) => <option key={w.hours} value={w.hours}>{w.label}</option>)}
            </Box>
          </Box>
          <Box>
            <Label>Signup closes</Label>
            <Input aria-label="Signup closes" type="datetime-local" value={form.signupCloses} onChange={(e) => setForm({ ...form, signupCloses: e.target.value })} bg="white" />
          </Box>
          {t.format === "round_robin" && (
            <Flex as="label" align="center" gap="8px" minH="44px">
              <input type="checkbox" checked={form.top2Final} onChange={(e) => setForm(editWithShape(t, form, { top2Final: e.target.checked }))} />
              Top 2 play a final
            </Flex>
          )}
          {form.roundMaps && (
            <Box data-testid="edit-round-maps">
              <Label>Map for each round</Label>
              <Flex flexDir="column" gap="10px">
                {mapSlots({ format: t.format, size: form.size, top2Final: t.format === "round_robin" && form.top2Final }).map(({ key, label }) => (
                  <Box key={key}>
                    <Text fontSize="13px" fontWeight={700} mb="4px">{label}</Text>
                    <MapChips label={`Map for ${label}`} value={form.roundMaps?.[key] ?? null} onPick={(m) => setForm({ ...form, roundMaps: { ...form.roundMaps, [key]: m } })} />
                  </Box>
                ))}
              </Flex>
            </Box>
          )}
          <Flex gap="8px" flexWrap="wrap">
            <Btn variant="gold" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Btn>
            <Btn variant="ghost" disabled={busy} onClick={() => setPanel(null)}>Never mind</Btn>
          </Flex>
        </Flex>
      )}

      {panel === "extend" && (
        <Box mt="14px" data-testid="extend-form">
          <Label>New signup close</Label>
          <Flex gap="8px" flexWrap="wrap">
            <Box flex="1" minW="200px">
              <Input aria-label="New signup close" type="datetime-local" value={extendTo} onChange={(e) => setExtendTo(e.target.value)} bg="white" />
            </Box>
            <Btn variant="gold" disabled={busy} onClick={saveExtend}>{busy ? "Saving…" : "Extend signup"}</Btn>
          </Flex>
          {!signupWindowOpen(t) && <Text fontSize="12px" opacity={0.7} mt="6px">Signup already closed; this reopens it until the new time.</Text>}
        </Box>
      )}

      {panel === "cancel" && kind && (
        <Box mt="14px" p="12px" borderRadius="8px" bg="rgba(179,38,30,0.08)" data-testid="cancel-confirm">
          <Text fontSize="14px">{cancelConsequence(kind, players)}</Text>
          <Flex gap="8px" mt="8px" flexWrap="wrap">
            <Btn variant="gold" disabled={busy} onClick={() => void send({ status: "cancelled" }, () => { if (kind === "draft") markDraftDeleted(t.slug); onCancelled?.(); })}>
              {busy ? "Working…" : kind === "draft" ? "Yes, delete it" : "Yes, cancel it"}
            </Btn>
            <Btn variant="ghost" disabled={busy} onClick={() => setPanel(null)}>Keep it</Btn>
          </Flex>
        </Box>
      )}

      {problems.length > 0 && (
        <Box role="alert" color="#B3361F" fontSize="14px" mt="10px">
          {problems.map((p) => <Text key={p}>{p}</Text>)}
        </Box>
      )}
      {error && <Text role="alert" color="#B3261E" fontSize="13px" mt="10px" data-testid="organizer-error">{error}</Text>}
    </Card>
  );
};
