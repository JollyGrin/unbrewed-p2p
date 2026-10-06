import { Box, Flex, Input, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { signInUrl, useAccount } from "@/lib/account/useAccount";
import { createTournament } from "@/lib/tournaments/api";
import {
  PRESETS,
  sizesFor,
  mapSlots,
  rekeyRoundMaps,
  withFormat,
  formatName,
  WINDOWS,
  initialForm,
  latestFinal,
  matchupSummary,
  toCreateBody,
  validateForm,
  type CreateFormState,
  type MatchupChoice,
  type PresetId,
} from "@/lib/tournaments/createForm";
import { formatWhen, tournamentPath } from "@/lib/tournaments/share";
import { MapChips } from "./MapChips";
import { Btn, Card, Chip, Notice, Page } from "./ui";

const Label = ({ children }: { children: React.ReactNode }) => (
  <Text as="label" display="block" fontSize="12px" fontFamily="ArchivoNarrow" textTransform="uppercase" letterSpacing="0.08em" opacity={0.7} mb="6px">
    {children}
  </Text>
);

const Seg = <T extends string | number | boolean>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) => (
  <Flex role="radiogroup" aria-label={label} gap="6px" flexWrap="wrap">
    {options.map((o) => (
      <Box
        as="button"
        type="button"
        key={String(o.id)}
        role="radio"
        aria-checked={value === o.id}
        disabled={o.disabled}
        onClick={() => onChange(o.id)}
        px="14px"
        minH="40px"
        borderRadius="8px"
        fontWeight={600}
        fontSize="14px"
        bg={value === o.id ? "#48284F" : "rgba(72,40,79,0.08)"}
        color={value === o.id ? "#FAEBD7" : "#48284F"}
        opacity={o.disabled ? 0.45 : 1}
      >
        {o.label}
      </Box>
    ))}
  </Flex>
);

const MODES: { id: MatchupChoice; title: string; body: string }[] = [
  { id: "free", title: "Players choose", body: "Each player picks a hero in the room. The board is random. The default." },
  { id: "map", title: "Same map for everyone", body: "Players still pick heroes. You set the board." },
  { id: "organizer", title: "Organizer sets each match", body: "You choose a hero for each seat and the map, on each match as it opens." },
];

const Preview = ({ f }: { f: CreateFormState }) => {
  const final = latestFinal(f);
  return (
    <Card overflow="hidden" alignSelf="start">
      <Box bg="#2C1831" color="#FAEBD7" p="16px">
        <Chip tone="gold">Preview · signup open</Chip>
        <Text fontFamily="LeagueGothic" fontSize="30px" mt="6px">{f.name.trim() || "Your tournament"}</Text>
        <Text fontSize="13px" opacity={0.75}>{formatName(f)} · {f.size} players · first to 1</Text>
      </Box>
      <Box p="16px" fontSize="14px">
        <Text fontSize="12px" opacity={0.65} mb="8px" textTransform="uppercase" fontFamily="ArchivoNarrow" letterSpacing="0.08em">{f.format === "round_robin" ? "With 4 or more players" : `If all ${f.size} seats fill`}</Text>
        <Box as="ol" pl="18px" display="flex" flexDir="column" gap="8px">
          <li><b>{f.format === "round_robin" ? "Signup closes · organizer starts the tournament" : "Signup closes · organizer starts the bracket"}</b><br />{formatWhen(new Date(f.signupCloses || Date.now()).toISOString())}</li>
          <li><b>Each match gets {WINDOWS.find((w) => w.hours === f.matchWindowHours)?.label}</b><br />{f.format === "round_robin" ? "from the moment the event starts" : "from the moment both players are known"}</li>
          {final && <li><b>{f.format === "round_robin" && !f.top2Final ? "Latest possible finish" : "Latest possible final"}</b><br />{formatWhen(final.toISOString())}</li>}
        </Box>
        <Text mt="12px" fontSize="13px" opacity={0.7}>{f.format === "round_robin" ? "Usually sooner: players can play their matches in any order, as soon as the event starts." : "Usually much sooner: a match opens the moment both its players are known."}</Text>
      </Box>
    </Card>
  );
};

export const CreateView = () => {
  const router = useRouter();
  const { status } = useAccount();
  const [preset, setPreset] = useState<PresetId>("weekend");
  const [form, setForm] = useState<CreateFormState>(() => initialForm());
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<CreateFormState>) => setForm((f) => ({ ...f, ...p }));

  const choosePreset = (id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPreset(id);
    set(p.patch);
  };

  const submit = async (kind: "draft" | "signup") => {
    const found = validateForm(form);
    setProblems(found.map((p) => p.message));
    if (found.length) return;
    setBusy(true);
    const r = await createTournament(toCreateBody(form, kind));
    setBusy(false);
    if (r.ok) {
      void router.push(`${tournamentPath(r.value.slug)}${kind === "signup" ? "&share=1" : ""}`);
      return;
    }
    setProblems([
      r.reason === "unauthorized"
        ? "Sign in with Discord to create a tournament."
        : r.message ?? "Couldn't create the tournament. Check the settings and try again.",
    ]);
  };

  const heading = <>Create a tournament</>;
  const base = { title: "New tournament", path: "/tournaments?new=1", heading, eyebrow: <><NextLink href="/tournaments">Tournaments</NextLink> / New</> };

  if (status === "guest" || status === "offline")
    return (
      <Page {...base} lede="Pick a starting point. You'll be the organizer.">
        <Notice title="Sign in to create">Tournaments are organized from a Discord account, so we can ping your players.</Notice>
        <Box mt="16px">
          <Btn variant="discord" href={signInUrl("/tournaments?new=1")}>Sign in with Discord</Btn>
        </Box>
      </Page>
    );

  const custom = preset === "custom";
  const slots = mapSlots(form);

  return (
    <Page {...base} lede="Pick a starting point. You'll be the organizer and can edit everything until signup closes.">
      <Box display="grid" gridTemplateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap="12px" mb="20px" role="radiogroup" aria-label="Preset">
        {PRESETS.map((p) => (
          <Box
            as="button"
            type="button"
            key={p.id}
            role="radio"
            aria-checked={preset === p.id}
            onClick={() => choosePreset(p.id)}
            textAlign="left"
            p="14px 16px"
            borderRadius="12px"
            border={preset === p.id ? "2px solid #E0A82E" : "1px solid rgba(72,40,79,0.2)"}
            bg="#FAEBD7"
          >
            <Text fontFamily="LeagueGothic" fontSize="26px" lineHeight="1.05">{p.title}</Text>
            <Text fontSize="13px" opacity={0.75}>{p.blurb}</Text>
            <Box as="ul" mt="8px" pl="16px" fontSize="13px">
              {p.bullets.map((b) => <li key={b}>{b}</li>)}
            </Box>
          </Box>
        ))}
      </Box>

      <Box display="grid" gridTemplateColumns={{ base: "1fr", lg: "3fr 2fr" }} gap="16px" alignItems="start">
        <Card p="20px" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); void submit("signup"); }}>
          <Flex flexDir="column" gap="18px">
            {!custom && (
              <Flex gap="6px" flexWrap="wrap">
                <Chip>{formatName(form)}</Chip>
                {form.format === "round_robin" && form.top2Final && <Chip>Top 2 play a final</Chip>}
                <Chip>{form.size} players</Chip>
                <Chip>First to 1</Chip>
                <Chip>{WINDOWS.find((w) => w.hours === form.matchWindowHours)?.label} per match</Chip>
                <Chip>{matchupSummary(form)}</Chip>
              </Flex>
            )}
            <Box>
              <Label>Tournament name</Label>
              <Input aria-label="Tournament name" value={form.name} maxLength={80} placeholder="Autumn Skirmish" onChange={(e) => set({ name: e.target.value })} bg="white" />
            </Box>
            <Box>
              <Label>Signup closes</Label>
              <Input aria-label="Signup closes" type="datetime-local" value={form.signupCloses} onChange={(e) => set({ signupCloses: e.target.value })} bg="white" />
              <Text fontSize="12px" opacity={0.65} mt="4px">Shown to players in their local time.</Text>
            </Box>

            {custom && (
              <>
                <Box>
                  <Label>Format</Label>
                  <Seg label="Format" value={form.format} onChange={(v) => setForm((f) => withFormat(f, v))} options={[
                    { id: "single_elim", label: "Single elimination" },
                    { id: "round_robin", label: "Round robin" },
                  ]} />
                  <Text fontSize="12px" opacity={0.65} mt="4px">
                    {form.format === "round_robin" ? "Everyone plays everyone, 4 to 6 players. Most wins takes the event." : "Lose once and you're out. 4, 8 or 16 players."}
                  </Text>
                </Box>
                <Box>
                  <Label>Capacity</Label>
                  <Seg label="Capacity" value={form.size} onChange={(v) => setForm((f) => ({ ...f, size: v, roundMaps: rekeyRoundMaps(f.roundMaps, f, { ...f, size: v }) }))} options={sizesFor(form.format).map((s) => ({ id: s, label: String(s) }))} />
                </Box>
                {form.format === "round_robin" && (
                  <Box>
                    <Label>Final</Label>
                    <Seg label="Final" value={form.top2Final} onChange={(v) => setForm((f) => ({ ...f, top2Final: v, roundMaps: rekeyRoundMaps(f.roundMaps, f, { ...f, top2Final: v }) }))} options={[
                      { id: false, label: "Standings decide it" },
                      { id: true, label: "Top 2 play a final" },
                    ]} />
                    <Text fontSize="12px" opacity={0.65} mt="4px">The final is one game, opened once every group match is decided.</Text>
                  </Box>
                )}
                <Box>
                  <Label>Time per match</Label>
                  <Seg label="Time per match" value={form.matchWindowHours} onChange={(v) => set({ matchWindowHours: v })} options={WINDOWS.map((w) => ({ id: w.hours, label: w.label }))} />
                  <Text fontSize="12px" opacity={0.65} mt="4px">Each match is first to 1 — one game decides it. Best-of-3 and best-of-5 are coming later.</Text>
                </Box>
                <Box>
                  <Label>Matchups</Label>
                  <Flex flexDir="column" gap="8px" role="radiogroup" aria-label="Matchups">
                    {MODES.map((m) => (
                      <Box as="button" type="button" key={m.id} role="radio" aria-checked={form.matchup === m.id} onClick={() => set({ matchup: m.id })} textAlign="left" p="10px 12px" borderRadius="10px" border={form.matchup === m.id ? "2px solid #E0A82E" : "1px solid rgba(72,40,79,0.2)"}>
                        <Text fontWeight={700}>{m.title}</Text>
                        <Text fontSize="13px" opacity={0.75}>{m.body}</Text>
                      </Box>
                    ))}
                    <Box p="10px 12px" borderRadius="10px" border="1px dashed rgba(72,40,79,0.25)" opacity={0.5}>
                      <Text fontWeight={700}>Hero pool / pick &amp; ban draft <em>Coming later</em></Text>
                    </Box>
                  </Flex>
                  {form.matchup === "map" && (
                    <Flex flexDir="column" gap="10px" mt="12px">
                      <Seg label="Map scope" value={form.mapScope} onChange={(v) => set({ mapScope: v })} options={[{ id: "event", label: "Whole event" }, { id: "round", label: "Per round" }]} />
                      {form.mapScope === "event" ? (
                        <MapChips label="Map" value={form.map} onPick={(map) => set({ map })} />
                      ) : (
                        slots.map(({ key, label }) => (
                          <Box key={key}>
                            <Text fontSize="13px" fontWeight={700} mb="4px">{label}</Text>
                            <MapChips label={`Map for ${label}`} value={form.roundMaps[key] ?? null} onPick={(m) => set({ roundMaps: { ...form.roundMaps, [key]: m } })} />
                          </Box>
                        ))
                      )}
                    </Flex>
                  )}
                  {form.matchup === "organizer" && (
                    <Text fontSize="13px" opacity={0.75} mt="8px">Matches you haven&apos;t set when they open fall back to Players choose.</Text>
                  )}
                </Box>
              </>
            )}

            <Text fontSize="13px" opacity={0.75}>
              When the unbrewed Discord bot is switched on, it posts the signup and each match in Discord. Nothing to set up here.
            </Text>

            {problems.length > 0 && (
              <Box role="alert" color="#B3361F" fontSize="14px">
                {problems.map((p) => <Text key={p}>{p}</Text>)}
              </Box>
            )}
            <Flex gap="10px" justify="space-between" flexWrap="wrap">
              {custom ? (
                <Btn variant="ghost" disabled={busy} onClick={() => void submit("draft")}>Save draft</Btn>
              ) : (
                <Btn variant="ghost" onClick={() => choosePreset("custom")}>Customize every setting</Btn>
              )}
              <Btn variant="gold" type="submit" disabled={busy}>{busy ? "Opening…" : "Open signup"}</Btn>
            </Flex>
          </Flex>
        </Card>
        <Preview f={form} />
      </Box>
    </Page>
  );
};
