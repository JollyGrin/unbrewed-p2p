/**
 * The single-elimination bracket (#1217, mockup v2 "Bracket" tab): the whole
 * tree from md up, one round at a time (tabs + swipe) below it. Everything it
 * draws comes from `buildBracket` (lib/tournaments/bracket).
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useRef, useState } from "react";

import { BAND_INK, BAND_MUTED, GOLD, INK, PARCHMENT, WASH } from "@/components/Stats/tokens";
import {
  defaultRoundIndex,
  type BracketView,
  type CellView,
  type RoundView,
  type SlotView,
} from "@/lib/tournaments/bracket";
import { deadlinePassed } from "@/lib/tournaments/matchPage";
import type { Entry } from "@/lib/tournaments/types";

const SURFACE = "#3A2140";
const DANGER = "#FF6347";
const DANGER_INK = "#B83A26";
const GOLD_INK = "#7A5410";
const SOFT = "rgba(72,40,79,0.55)";
const LINE = "rgba(250,235,215,0.22)";
const GAP = 44;
/** Room per round-1 cell in the tree; later rounds share the same height. */
const CELL_SPACE = 225;

const AV_COLORS = ["#6C4E8D", "#A8720A", "#5E6B3A", "#4A6B5A", "#8A3B2E", "#3F5170", "#2F8F8A", "#2C76AC"];
const avColor = (name: string) =>
  AV_COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AV_COLORS.length];

export const Avatar = ({ name, url, size = 30, tbd = false }: { name: string; url?: string; size?: number; tbd?: boolean }) => (
  <Box
    w={`${size}px`}
    h={`${size}px`}
    flexShrink={0}
    borderRadius="50%"
    overflow="hidden"
    display="grid"
    placeItems="center"
    fontWeight={700}
    fontSize={`${Math.round(size * 0.4)}px`}
    color={tbd ? "rgba(250,235,215,0.45)" : PARCHMENT}
    bg={tbd ? "transparent" : avColor(name)}
    border={tbd ? "2px dashed rgba(250,235,215,0.25)" : "none"}
    boxShadow={tbd ? "none" : "inset 0 -3px 0 rgba(0,0,0,.18)"}
  >
    {tbd ? "?" : url ? <Box as="img" src={url} alt="" w="100%" h="100%" /> : (name[0] ?? "?").toUpperCase()}
  </Box>
);

/** "1d 17h", "5h 12m", "12m". */
export const timeLeft = (deadline: string | null, now: number): string | null => {
  if (!deadline) return null;
  const ms = Date.parse(deadline) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
};

const Caption = (props: React.ComponentProps<typeof Text>) => (
  <Text fontFamily="ArchivoNarrow" fontSize="11px" letterSpacing="0.1em" textTransform="uppercase" {...props} />
);

const Player = ({ s, tbd }: { s: SlotView; tbd: boolean }) => (
  <Flex
    align="center"
    gap="10px"
    px="12px"
    py="9px"
    minH="50px"
    opacity={s.result === "lose" ? 0.55 : 1}
    data-result={s.result ?? undefined}
  >
    <Text as="span" fontFamily="ArchivoNarrow" fontSize="11px" w="14px" textAlign="center" color={tbd ? "rgba(250,235,215,0.4)" : SOFT}>
      {s.seed ?? ""}
    </Text>
    <Avatar name={s.name} url={s.avatarUrl} tbd={s.placeholder} />
    <Box minW={0} flex="1">
      <Text
        fontSize="14px"
        fontWeight={tbd && s.placeholder ? 500 : 700}
        color={tbd ? (s.placeholder ? BAND_MUTED : PARCHMENT) : INK}
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
        textDecoration={s.result === "lose" ? "line-through" : undefined}
        textDecorationColor="rgba(72,40,79,0.35)"
      >
        {s.name}
        {s.result === "win" && (
          <Box as="span" display="inline-block" w="6px" h="6px" borderRadius="50%" bg={GOLD} ml="7px" verticalAlign="2px" />
        )}
      </Text>
      {s.sub && (
        <Text fontSize="11px" color={tbd ? "rgba(250,235,215,0.45)" : "rgba(72,40,79,0.72)"} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
          {s.sub}
        </Text>
      )}
    </Box>
    <Text as="span" fontFamily="LeagueGothic" fontSize="30px" lineHeight="1" w="22px" textAlign="right" color={s.result === "win" ? INK : SOFT}>
      {s.score ?? ""}
    </Text>
  </Flex>
);

const Tag = ({ c, late }: { c: CellView; late: boolean }) => {
  let right: React.ReactNode = null;
  if (c.state === "in_play")
    right = (
      <Flex as="span" align="center" gap="6px" color={DANGER_INK} fontWeight={700}>
        <Box as="span" w="8px" h="8px" borderRadius="50%" bg={DANGER} />
        In play now
      </Flex>
    );
  else if (c.state === "unverified")
    right = (
      <Box as="span" bg="rgba(224,168,46,0.25)" color={GOLD_INK} borderRadius="999px" px="9px" fontWeight={700} letterSpacing="0.02em">
        Unverified
      </Box>
    );
  else if (c.note?.tag)
    right = (
      <Text as="b" color={GOLD_INK} fontWeight={700}>
        {c.note.tag}
      </Text>
    );
  else if (c.state === "ready") right = <Text as="span">{late ? "Deadline passed" : "Ready to play"}</Text>;
  return (
    <Caption as="div" display="flex" justifyContent="space-between" gap="8px" px="12px" pt="7px" color={c.state === "waiting" ? "rgba(250,235,215,0.45)" : SOFT}>
      <span>{c.code}</span>
      {right}
    </Caption>
  );
};

const Mu = ({ children }: { children: React.ReactNode }) => (
  <Text as="span" fontSize="11px" fontWeight={600} px="8px" py="2px" borderRadius="999px" bg="rgba(224,168,46,0.2)" color={GOLD_INK} whiteSpace="nowrap">
    {children}
  </Text>
);

export const MatchCell = ({ c, now }: { c: CellView; now: number }) => {
  const tbd = c.state === "waiting";
  const left = c.state === "ready" || c.state === "in_play" ? timeLeft(c.deadlineAt, now) : null;
  const rule = c.state === "decided" && !!c.note?.rule;
  // D4: an open match past its deadline is no longer "waiting for a game" (same state as the match page's deadline_passed).
  const late = c.state === "ready" && deadlinePassed(c.deadlineAt, now);
  const ring =
    c.state === "in_play"
      ? `0 0 0 2px ${DANGER}, `
      : c.state === "unverified"
        ? `0 0 0 2px rgba(224,168,46,0.6), `
        : "";
  const linked = !!c.href;
  return (
    <Box
      as={linked ? NextLink : "div"}
      {...(linked ? { href: c.href } : {})}
      data-testid="match-cell"
      data-match={c.id}
      data-state={c.state}
      data-decided-by={c.decidedBy ?? undefined}
      display="block"
      w="100%"
      borderRadius="10px"
      overflow="hidden"
      textAlign="left"
      color={INK}
      bg={tbd ? "rgba(250,235,215,0.07)" : PARCHMENT}
      border={tbd ? "1.5px dashed rgba(250,235,215,0.25)" : "none"}
      boxShadow={tbd ? "none" : `${ring}0 3px 0 rgba(20,8,24,.35), 0 8px 18px rgba(20,8,24,.25)`}
      cursor={linked ? "pointer" : "default"}
      transition="transform .18s ease, box-shadow .18s ease"
      _hover={linked ? { transform: "translateY(-2px) rotate(-.3deg)" } : undefined}
      sx={{ "@media (prefers-reduced-motion: reduce)": { transition: "none", _hover: { transform: "none" } } }}
    >
      <Tag c={c} late={late} />
      {(c.matchup.heroes || c.matchup.map) && !tbd && c.decidedBy !== "bye" && (
        <Flex gap="6px" flexWrap="wrap" px="12px" pt="6px" pb="2px">
          {c.matchup.heroes && <Mu>{c.matchup.heroes}</Mu>}
          {c.matchup.map && <Mu>{c.matchup.map}</Mu>}
        </Flex>
      )}
      <Player s={c.a} tbd={tbd} />
      <Box borderTop={`1px dashed ${tbd ? "rgba(250,235,215,0.15)" : "rgba(72,40,79,0.15)"}`} />
      <Player s={c.b} tbd={tbd} />
      <Flex
        align="center"
        justify="space-between"
        gap="8px"
        px="12px"
        py="8px"
        minH="38px"
        fontSize="12px"
        lineHeight="1.35"
        borderTop={`1px solid ${tbd ? "rgba(250,235,215,0.12)" : "rgba(72,40,79,0.15)"}`}
        bg={tbd ? "transparent" : c.state === "unverified" ? "rgba(224,168,46,0.2)" : rule ? "rgba(72,40,79,0.1)" : WASH}
        color={tbd ? "rgba(250,235,215,0.55)" : c.state === "unverified" ? GOLD_INK : "rgba(72,40,79,0.72)"}
        fontWeight={c.state === "unverified" ? 600 : 400}
      >
        <Text as="span">{late ? "Deadline passed" : c.foot}</Text>
        {left && (
          <Text as="span" fontWeight={700} color={GOLD_INK} whiteSpace="nowrap" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {left} left
          </Text>
        )}
      </Flex>
    </Box>
  );
};

const Champion = ({ champion, final }: { champion: Entry | null; final?: CellView }) => (
  <Box
    w="100%"
    textAlign="center"
    color={BAND_INK}
    px="14px"
    py="22px"
    borderRadius="14px"
    border={`1.5px ${champion ? "solid" : "dashed"} rgba(224,168,46,0.55)`}
    bg="radial-gradient(circle at 50% 30%, rgba(224,168,46,.16), transparent 70%)"
    data-testid="champion"
  >
    <Text fontSize="40px" lineHeight="1" color={GOLD} aria-hidden>♛</Text>
    {champion ? (
      <>
        <Flex justify="center" mt="10px"><Avatar name={champion.username ?? "?"} url={champion.avatarUrl} size={56} /></Flex>
        <Text fontFamily="LeagueGothic" fontSize="34px" lineHeight="1" mt="8px" color={GOLD}>{champion.username ?? "Champion"}</Text>
        <Text fontSize="12px" color={BAND_MUTED} mt="6px">Champion{final?.note?.tag ? ` · final ${final.note.tag.toLowerCase()}` : ""}</Text>
      </>
    ) : (
      <>
        <Text fontFamily="LeagueGothic" fontSize="30px" lineHeight="1" mt="6px">To be crowned</Text>
        <Text fontSize="12px" color={BAND_MUTED} mt="6px">Crowned automatically when the final is decided.</Text>
      </>
    )}
  </Box>
);

const RoundHead = ({ r, sub }: { r: RoundView; sub: string }) => (
  <Box color={BAND_INK} mb="14px" minH="72px" pb="12px" borderBottom="1px solid rgba(250,235,215,0.12)">
    <Text fontFamily="LeagueGothic" fontSize="28px" lineHeight="0.95">{r.name}</Text>
    <Text fontSize="12px" color={BAND_MUTED} mt="4px">
      Round {r.round} · <Text as="b" color={GOLD} fontWeight={600}>{sub}</Text>
    </Text>
  </Box>
);

const line = { content: '""', position: "absolute" } as const;

/** The desktop tree: one column per round, pairs joined by bracket lines. */
const Tree = ({ view, now }: { view: BracketView; now: number }) => {
  const r1 = view.rounds[0]?.cells.length ?? 1;
  const height = Math.max(440, r1 * CELL_SPACE);
  const last = view.rounds.length - 1;
  return (
    <Box overflowX="auto" mx="-8px" px="8px" pb="4px" data-testid="bracket-tree">
      <Box
        display="grid"
        gridTemplateColumns={`repeat(${view.rounds.length}, minmax(220px, 1fr)) minmax(170px, .75fr)`}
        columnGap={`${GAP}px`}
        minW={`${view.rounds.length * (220 + GAP) + 170}px`}
      >
        {view.rounds.map((r, ri) => {
          const pairs: CellView[][] = [];
          for (let i = 0; i < r.cells.length; i += 2) pairs.push(r.cells.slice(i, i + 2));
          return (
            <Box key={r.round} data-round={r.round}>
              <RoundHead r={r} sub={r.summary} />
              <Flex flexDir="column" h={`${height}px`}>
                {pairs.map((pair, pi) => {
                  const solo = pair.length === 1;
                  return (
                    <Flex
                      key={pi}
                      flex="1"
                      flexDir="column"
                      position="relative"
                      _after={solo ? undefined : { ...line, right: `-${GAP / 2}px`, top: "25%", bottom: "25%", borderRight: `2px solid ${LINE}` }}
                    >
                      {pair.map((c) => (
                        <Flex
                          key={c.id}
                          flex="1"
                          align="center"
                          position="relative"
                          _before={ri > 0 ? { ...line, left: `-${GAP / 2}px`, width: `${GAP / 2}px`, top: "50%", borderTop: `2px solid ${LINE}` } : undefined}
                          _after={
                            ri < last || solo
                              ? { ...line, right: `-${GAP / 2}px`, width: `${GAP / 2}px`, top: "50%", borderTop: `2px solid ${c.feedsWinner || (ri === last && view.champion) ? GOLD : LINE}` }
                              : undefined
                          }
                        >
                          <MatchCell c={c} now={now} />
                        </Flex>
                      ))}
                    </Flex>
                  );
                })}
              </Flex>
            </Box>
          );
        })}
        <Box>
          <Box color={BAND_INK} mb="14px" minH="72px" pb="12px" borderBottom="1px solid rgba(250,235,215,0.12)">
            <Text fontFamily="LeagueGothic" fontSize="28px" lineHeight="0.95" color={GOLD}>Champion</Text>
            <Text fontSize="12px" color={BAND_MUTED} mt="4px">Crowned on the final result</Text>
          </Box>
          <Flex h={`${height}px`} align="center" position="relative"
            _before={{ ...line, left: `-${GAP / 2}px`, width: `${GAP / 2}px`, top: "50%", borderTop: `2px solid ${view.champion ? GOLD : LINE}` }}>
            <Champion champion={view.champion} final={view.rounds[last]?.cells[0]} />
          </Flex>
        </Box>
      </Box>
    </Box>
  );
};

/** Phone: one round at a time; tap a tab or swipe the panel. */
export const RoundTabs = ({ view, now }: { view: BracketView; now: number }) => {
  const [sel, setSel] = useState(() => defaultRoundIndex(view));
  const startX = useRef<number | null>(null);
  const r = view.rounds[sel];
  const go = (i: number) => setSel(Math.max(0, Math.min(view.rounds.length - 1, i)));
  return (
    <Box data-testid="round-tabs">
      <Flex role="tablist" gap="4px" bg="rgba(250,235,215,0.08)" borderRadius="10px" p="4px" mb="14px">
        {view.rounds.map((rv, i) => (
          <Box
            as="button"
            type="button"
            role="tab"
            key={rv.round}
            aria-selected={i === sel}
            onClick={() => go(i)}
            flex="1"
            minH="40px"
            borderRadius="7px"
            fontSize="13px"
            fontWeight={700}
            lineHeight="1.1"
            bg={i === sel ? PARCHMENT : "transparent"}
            color={i === sel ? INK : BAND_MUTED}
          >
            {rv.short}
            <Text as="small" display="block" fontWeight={400} fontSize="11px" opacity={0.8}>{rv.summary}</Text>
          </Box>
        ))}
      </Flex>
      {r && (
        <Flex
          role="tabpanel"
          aria-label={r.name}
          flexDir="column"
          gap="12px"
          onTouchStart={(e) => (startX.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const x0 = startX.current;
            const x1 = e.changedTouches[0]?.clientX;
            startX.current = null;
            if (x0 === null || x1 === undefined || Math.abs(x1 - x0) < 50) return;
            go(sel + (x1 < x0 ? 1 : -1));
          }}
        >
          <Text fontSize="12px" color={BAND_MUTED}>Round {r.round} · {r.name} · {r.summary}</Text>
          {r.cells.map((c) => <MatchCell key={c.id} c={c} now={now} />)}
          {sel === view.rounds.length - 1 && <Champion champion={view.champion} final={r.cells[0]} />}
        </Flex>
      )}
      <Caption textAlign="center" color="rgba(250,235,215,0.45)" mt="12px">Swipe or tap a round</Caption>
    </Box>
  );
};

const KEY: { label: string; swatch: React.ComponentProps<typeof Box> }[] = [
  { label: "Decided", swatch: { bg: PARCHMENT } },
  { label: "In play now", swatch: { bg: PARCHMENT, boxShadow: `0 0 0 2px ${DANGER}` } },
  { label: "Unverified", swatch: { bg: "rgba(224,168,46,.6)" } },
  { label: "Waiting on players", swatch: { border: "1.5px dashed rgba(250,235,215,.4)" } },
  { label: "Path of a winner", swatch: { bg: GOLD, h: "2px", borderRadius: 0 } },
];

export const Bracket = ({ view, now = Date.now() }: { view: BracketView; now?: number }) => (
  <Box
    bg={SURFACE}
    borderRadius={{ base: "12px", md: "16px" }}
    p={{ base: "18px 14px 20px", md: "28px 28px 32px" }}
    boxShadow="inset 0 0 0 1px rgba(250,235,215,.06), 0 10px 30px rgba(20,8,24,.35)"
    data-testid="bracket"
  >
    <Flex justify="space-between" align="center" gap="16px" mb="18px" color={BAND_INK} flexWrap="wrap">
      <Text as="h2" fontFamily="LeagueGothic" fontSize={{ base: "30px", md: "38px" }} lineHeight="1">Bracket</Text>
      <Flex display={{ base: "none", md: "flex" }} gap="16px" fontSize="12px" color={BAND_MUTED} flexWrap="wrap">
        {KEY.map((k) => (
          <Flex as="span" key={k.label} align="center" gap="6px">
            <Box as="i" w="10px" h="10px" borderRadius="3px" display="inline-block" {...k.swatch} />
            {k.label}
          </Flex>
        ))}
      </Flex>
    </Flex>
    <Box display={{ base: "none", md: "block" }}>
      <Tree view={view} now={now} />
    </Box>
    <Box display={{ base: "block", md: "none" }}>
      <RoundTabs view={view} now={now} />
    </Box>
  </Box>
);
