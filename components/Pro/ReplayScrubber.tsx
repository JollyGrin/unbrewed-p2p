/**
 * Full-match God-view replay scrubber (#122). Feeds the God-view render adapter
 * (lib/pro/godView) into the SAME ProBoard / ProHud / ProHand the live table uses,
 * so every step shows both hands/decks/discards/tokens face-up. Contains zero rules
 * logic — it only scrubs a precomputed step sequence from the server's /replay.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Flex, Select, Tag, Text, Tooltip } from "@chakra-ui/react";
import {
  TbPlayerPlay,
  TbPlayerPause,
  TbPlayerTrackNext,
  TbPlayerTrackPrev,
  TbPlayerSkipBack,
  TbPlayerSkipForward,
  TbArrowsExchange,
} from "react-icons/tb";
import { ProBoard } from "@/components/Pro/ProBoard";
import { ProHud } from "@/components/Pro/ProHud";
import { CardFace, ProHand } from "@/components/Pro/ProHand";
import { useProCardArt } from "@/lib/pro/useProCardArt";
import { fighterTokenStateByOwner } from "@/lib/pro/heroStateFlags";
import {
  CardInstanceId,
  CardMeta,
  PlayerId,
  ReplayExpansion,
} from "@/lib/pro/protocol";
import { opponentSeats, toPlayerView, turnMarkers } from "@/lib/pro/godView";
import { replayHeroFor, replayHeroList, replaySeatIds } from "@/lib/pro/replayHeroes";

const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";

const BTN = {
  size: "sm" as const,
  bg: "whiteAlpha.200",
  color: "brand.parchment",
  _hover: { bg: "whiteAlpha.400" },
  _active: { bg: "whiteAlpha.500" },
};

/** Printed-card label from the server catalog ('king-kong/clobber#2' -> 'Clobber (3/2)'). */
const labelForCard = (catalog: Record<string, CardMeta>, instance: CardInstanceId): string => {
  const meta = catalog[instance.split("#")[0]];
  if (!meta) return instance.split("#")[0].split("/").pop() ?? instance;
  const stats = meta.type === "scheme" ? "scheme" : `${meta.value ?? "–"}/${meta.boost ?? "–"}`;
  return `${meta.title} (${stats})`;
};

const heroName = (heroId: string) =>
  heroId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

type ReplayAction = {
  type: string;
  player?: string;
  fighter?: string;
  space?: string;
  card?: string;
  path?: string[];
  form?: string;
  attacker?: string;
  target?: string;
  ability?: string;
  promptId?: string;
  optionId?: string;
  attachItem?: boolean;
};

type ReplayPrompt = {
  promptId: string;
  kind: string;
  description?: string;
  options: Array<{ id: string; label: string }>;
  source?: { card?: CardInstanceId; hero?: string } | null;
};

type ReplayFrameForLog = { prompt?: ReplayPrompt | null };

const shortId = (id: string) => id.split("/").pop()?.split("#")[0]?.replace(/-/g, " ") ?? id;
const cardLabel = (card: CardInstanceId) => shortId(card);
const fighterLabel = (fighter: string) => fighter.replace("/hero", " hero").replace("/sidekick-", " sidekick ");
const spaceLabel = (space: string) => space.toUpperCase();

const promptLabel = (action: ReplayAction, beforeStep?: ReplayFrameForLog): string => {
  const prompt = beforeStep?.prompt;
  const option = prompt?.options.find((o) => o.id === action.optionId);
  const choice = option?.label ?? action.optionId ?? "?";
  const source = prompt?.source?.card ? ` for ${cardLabel(prompt.source.card)}` : "";
  const detail = prompt?.description ? `${prompt.description}: ` : "";
  return `${action.player ?? "?"}: choose ${detail}${choice}${source}`;
};

const actionLabel = (action: ReplayAction, beforeStep?: ReplayFrameForLog): string => {
  switch (action.type) {
    case "PLACE_SIDEKICK":
      return `${action.player ?? "?"}: place ${fighterLabel(action.fighter ?? "fighter")} at ${spaceLabel(action.space ?? "?")}`;
    case "MANEUVER":
      return `${action.player ?? "?"}: maneuver`;
    case "BOOST_MOVE":
      return `${action.player ?? "?"}: boost move with ${cardLabel(action.card ?? "card")}`;
    case "MOVE_FIGHTER": {
      const to = action.path?.[action.path.length - 1];
      return `${action.player ?? "?"}: move ${fighterLabel(action.fighter ?? "fighter")}${to ? ` to ${spaceLabel(to)}` : ""}`;
    }
    case "SHAPESHIFT":
      return `${action.player ?? "?"}: shapeshift to ${action.form ?? "form"}`;
    case "END_MANEUVER":
      return `${action.player ?? "?"}: end maneuver`;
    case "SCHEME":
      return `${action.player ?? "?"}: scheme ${cardLabel(action.card ?? "card")}`;
    case "USE_SCHEME_ITEM":
      return `${action.player ?? "?"}: use scheme item at ${spaceLabel(action.space ?? "?")}`;
    case "DECLARE_ATTACK":
      return `${action.player ?? "?"}: attack ${fighterLabel(action.target ?? "target")} with ${fighterLabel(action.attacker ?? "attacker")}`;
    case "COMMIT_ATTACK_CARD":
      return `${action.player ?? "?"}: attack card ${cardLabel(action.card ?? "card")}${action.attachItem ? " + item" : ""}`;
    case "COMMIT_DEFENSE_CARD":
      return `${action.player ?? "?"}: defense card ${cardLabel(action.card ?? "card")}${action.attachItem ? " + item" : ""}`;
    case "DECLINE_DEFENSE":
      return `${action.player ?? "?"}: decline defense`;
    case "DISCARD_TO_LIMIT":
      return `${action.player ?? "?"}: discard ${cardLabel(action.card ?? "card")}`;
    case "RESPOND_PROMPT":
      return promptLabel(action, beforeStep);
    case "FORFEIT":
      return `${action.player ?? "?"}: forfeit`;
    case "USE_ENCOUNTER_ABILITY":
      return `${action.player ?? "?"}: ability ${action.ability ?? "ability"}`;
    default:
      return `${action.player ?? "?"}: ${action.type.toLowerCase().replace(/_/g, " ")}`;
  }
};

/** Milliseconds between frames while playing. */
const PLAY_INTERVAL_MS = 700;

export const ReplayScrubber = ({
  expansion,
  onExit,
  exitLabel = "← back to replays",
}: {
  expansion: ReplayExpansion;
  onExit?: () => void;
  exitLabel?: string;
}) => {
  const { steps, catalog, map, meta } = expansion;
  const actionLog = (expansion as ReplayExpansion & { actionLog?: ReplayAction[] }).actionLog ?? [];
  const lastIndex = steps.length - 1;
  // Runtime-ordered seats from the bundle — 2 for a duel, 3+ for ffa/team.
  const seatList = useMemo(() => replaySeatIds(meta.heroes), [meta.heroes]);
  const heroList = useMemo(() => replayHeroList(meta.heroes), [meta.heroes]);
  const isDuel = seatList.length <= 2;
  const [index, setIndex] = useState(0);
  const [focus, setFocus] = useState<PlayerId>(meta.winner ?? seatList[0] ?? "p1");
  const [playing, setPlaying] = useState(false);

  const step = steps[Math.min(index, lastIndex)];

  // Prefetch art for EVERY seat's hero so focusing any seat renders instantly.
  const { resolveCard, resolveHero, resolveRuleCards, resolveFighterToken } = useProCardArt(heroList, catalog);

  const view = useMemo(() => toPlayerView(step, { map, catalog }, focus), [step, map, catalog, focus]);
  // owner seat -> heroId, so the board resolves each fighter's token art by hero
  // (ViewFighter carries owner + kind, not heroId). Mirrors pages/pro/game.tsx.
  const ownerHeroIds = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of view.players) m[p.id] = p.heroId;
    return m;
  }, [view]);
  // owner seat -> { badge, heroArtUrl }: one map feeding both the token badge and
  // the flag-driven portrait swap, so replay tide art tracks the scrubbed step.
  const ownerTokenState = useMemo(() => fighterTokenStateByOwner(view.players), [view]);
  const oppSeats = opponentSeats(step, focus);
  const markers = useMemo(() => turnMarkers(steps), [steps]);
  const labelFor = (c: CardInstanceId) => labelForCard(catalog, c);

  // Play/pause: advance one frame per tick; stop at the end.
  const playRef = useRef(playing);
  playRef.current = playing;
  useEffect(() => {
    if (!playing) return;
    if (index >= lastIndex) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, lastIndex)), PLAY_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [playing, index, lastIndex]);

  const go = (i: number) => setIndex(Math.max(0, Math.min(i, lastIndex)));
  const jumpToTurn = (turn: number) => {
    const hit = steps.findIndex((s) => s.turnNumber >= turn);
    go(hit === -1 ? lastIndex : hit);
  };

  // Duel keeps its one-tap toggle; multiplayer flips to the next seat in order.
  const focusPos = Math.max(0, seatList.indexOf(focus));
  const nextSeat: PlayerId = seatList[(focusPos + 1) % seatList.length] ?? focus;

  return (
    <Box h="100svh" overflow="hidden" bg={TABLE_BG} position="relative" color="brand.parchment">
      {/* God-view banner + exit */}
      <Flex position="fixed" top="0.5rem" left="50%" transform="translateX(-50%)" zIndex={170} gap="0.5rem" alignItems="center">
        <Tag bg="brand.accent" color="brand.surfaceDim" fontFamily="BebasNeueRegular" letterSpacing="0.05em">
          REPLAY · GOD VIEW
        </Tag>
        <Tag bg="rgba(20,8,24,0.65)" color="brand.parchment" fontSize="0.75rem">
          {heroList.map(heroName).join(" vs ")} · {meta.mapTitle}
        </Tag>
        {onExit && (
          <Button {...BTN} onClick={onExit}>
            {exitLabel}
          </Button>
        )}
      </Flex>

      {/* every non-focus seat's hand, face-up at the top (God-view only). A duel
          shows one fan; ffa-3/team-2v2 fan each opponent side by side. */}
      <Flex position="fixed" top="2.8rem" left="0" right="0" justifyContent="center" zIndex={155} pointerEvents="none">
        <Box pointerEvents="auto" transform="scale(0.7)" transformOrigin="top center" opacity={0.95}>
          <Flex alignItems="flex-start" justifyContent="center" gap="1.5rem" flexWrap="wrap">
            {oppSeats.map((seat) => (
              <Flex key={seat.id} direction="column" alignItems="center" gap="0.1rem">
                <Text fontSize="0.7rem" opacity={0.7} fontFamily="SpaceGrotesk" letterSpacing="0.06em">
                  {heroName(seat.heroId)} · hand ({seat.hand.length})
                </Text>
                <ProHand hand={seat.hand} resolveCard={resolveCard} labelFor={labelFor} actionsFor={() => []} onAction={() => {}} />
              </Flex>
            ))}
          </Flex>
        </Box>
      </Flex>

      {/* board */}
      <Flex h="100%" alignItems="center" justifyContent="center" p="1rem" pt="9rem" pb="12rem" pr={{ base: "1rem", lg: "20rem" }}>
        <ProBoard
          map={view.map}
          fighters={view.fighters}
          tokens={view.tokens}
          fighterTokenArt={(f) => {
            // Flag-driven portrait swap (Thetis tide) wins for the HERO token;
            // else the deck's fixed per-hero token art.
            const st = ownerTokenState[f.owner];
            if (f.kind === "HERO" && st?.heroArtUrl) return st.heroArtUrl;
            const heroId = ownerHeroIds[f.owner];
            return heroId ? resolveFighterToken(heroId, f.kind) : null;
          }}
          fighterTokenBadge={(f) => ownerTokenState[f.owner]?.badge ?? null}
          imgMaxH="calc(100svh - 21rem)"
        />
      </Flex>

      {/* both player plates (discards clickable for both — God-view) */}
      <ProHud
        view={view}
        status="open"
        roomId={null}
        resolveCard={resolveCard}
        resolveHero={resolveHero}
        resolveRuleCards={resolveRuleCards}
        labelFor={labelFor}
      />

      {/* right dock — step state + combat readout */}
      <Flex position="fixed" right="0.75rem" top="7.5rem" w="18.5rem" direction="column" gap="0.6rem" zIndex={140}>
        <Flex gap="0.4rem" alignItems="center" flexWrap="wrap">
          <Tag size="sm" bg="whiteAlpha.300">turn {view.turnNumber}</Tag>
          <Tag size="sm" bg={view.activePlayer === focus ? "brand.accent" : "whiteAlpha.300"} color={view.activePlayer === focus ? "brand.surfaceDim" : "brand.parchment"}>
            {heroName(replayHeroFor(meta.heroes, view.activePlayer))}&apos;s turn
          </Tag>
          <Tag size="sm" bg="whiteAlpha.300">{view.phase.toLowerCase()}</Tag>
        </Flex>

        {actionLog.length > 0 && (
          <Box bg="brand.surface" border="1px solid" borderColor="whiteAlpha.300" borderRadius="0.5rem" p="0.65rem">
            <Flex justify="space-between" align="center" mb="0.45rem">
              <Text fontFamily="BebasNeueRegular" fontSize="1rem" letterSpacing="0.04em">ACTION LOG</Text>
              <Tag size="sm" bg="whiteAlpha.200">step {index}/{lastIndex}</Tag>
            </Flex>
            <Box maxH="12rem" overflowY="auto" pr="0.15rem">
              {actionLog.map((action, actionIndex) => {
                const stepIndex = actionIndex + 1;
                const active = stepIndex === index;
                return (
                  <Flex
                    key={`${actionIndex}-${action.type}`}
                    gap="0.45rem"
                    align="baseline"
                    px="0.45rem"
                    py="0.3rem"
                    borderRadius="0.35rem"
                    bg={active ? "brand.accent" : stepIndex < index ? "whiteAlpha.100" : "transparent"}
                    color={active ? "brand.surfaceDim" : "brand.parchment"}
                    opacity={stepIndex > index ? 0.45 : 1}
                  >
                    <Text fontSize="0.68rem" fontFamily="monospace" flexShrink={0}>{stepIndex}</Text>
                    <Text fontSize="0.75rem" noOfLines={2}>{actionLabel(action, steps[actionIndex] as ReplayFrameForLog | undefined)}</Text>
                  </Flex>
                );
              })}
            </Box>
          </Box>
        )}

        {step.combat && (
          <Box bg="brand.surface" border="1px solid" borderColor="whiteAlpha.300" borderRadius="0.5rem" p="0.75rem">
            <Flex gap="0.5rem" alignItems="center" mb="0.5rem">
              <Tag colorScheme="red" size="sm">COMBAT</Tag>
              <Text fontSize="0.8rem" opacity={0.7}>{step.combat.stage.replace(/_/g, " ").toLowerCase()}</Text>
            </Flex>
            <Flex gap="0.75rem" justifyContent="center">
              {(["attackerCard", "defenderCard"] as const).map((slot) => {
                const card = step.combat![slot];
                return (
                  <Box key={slot} textAlign="center">
                    <Text opacity={0.6} fontSize="0.7rem" mb="0.2rem">{slot === "attackerCard" ? "attack" : "defense"}</Text>
                    <Box w="5rem" sx={{ aspectRatio: "63 / 88" }} mx="auto">
                      {card ? (
                        <CardFace card={resolveCard(card.instance)} fallback={labelFor(card.instance)} />
                      ) : (
                        <Flex w="100%" h="100%" border="1px dashed" borderColor="whiteAlpha.400" borderRadius="0.5rem" alignItems="center" justifyContent="center">
                          <Text fontSize="0.65rem" opacity={0.6}>—</Text>
                        </Flex>
                      )}
                    </Box>
                    {card && <Text fontSize="0.85rem" fontWeight="bold" color="brand.accent">{card.effectiveValue}{card.boosts.length ? ` (+${card.boosts.length})` : ""}</Text>}
                  </Box>
                );
              })}
            </Flex>
            {step.combat.outcome && (
              <Text textAlign="center" mt="0.4rem" fontSize="0.85rem" fontWeight="bold">
                {step.combat.outcome.replace(/_/g, " ").toLowerCase()}
                {step.combat.attackDamageDealt !== null ? ` · ${step.combat.attackDamageDealt} dmg` : ""}
              </Text>
            )}
          </Box>
        )}

        {view.winner && (
          <Tag size="lg" bg="brand.accent" color="brand.surfaceDim" fontFamily="LeagueGothic" alignSelf="flex-start">
            {heroName(replayHeroFor(meta.heroes, view.winner))} wins
          </Tag>
        )}
      </Flex>

      {/* self hand, face-up at the bottom */}
      <Flex position="fixed" bottom="4.5rem" left="0" right="0" justifyContent="center" zIndex={160} pointerEvents="none">
        <Box pointerEvents="auto" transform="scale(0.85)" transformOrigin="bottom center">
          <Flex direction="column" alignItems="center" gap="0.1rem">
            <Text fontSize="0.7rem" opacity={0.7} fontFamily="SpaceGrotesk" letterSpacing="0.06em">
              {heroName(view.self.heroId)} · hand ({view.self.hand.length})
            </Text>
            <ProHand hand={view.self.hand} resolveCard={resolveCard} labelFor={labelFor} actionsFor={() => []} onAction={() => {}} />
          </Flex>
        </Box>
      </Flex>

      {/* transport bar */}
      <Flex
        position="fixed"
        bottom="0"
        left="0"
        right="0"
        zIndex={180}
        bg="rgba(20,8,24,0.85)"
        borderTop="1px solid"
        borderColor="whiteAlpha.200"
        px="1rem"
        py="0.6rem"
        gap="0.75rem"
        alignItems="center"
        backdropFilter="blur(6px)"
      >
        <Flex gap="0.25rem">
          <Tooltip label="First frame" hasArrow><Button {...BTN} onClick={() => go(0)} px="0.5rem"><TbPlayerSkipBack /></Button></Tooltip>
          <Tooltip label="Step back" hasArrow><Button {...BTN} onClick={() => go(index - 1)} px="0.5rem"><TbPlayerTrackPrev /></Button></Tooltip>
          <Button {...BTN} onClick={() => setPlaying((p) => !p)} px="0.75rem">
            {playing ? <TbPlayerPause /> : <TbPlayerPlay />}
          </Button>
          <Tooltip label="Step forward" hasArrow><Button {...BTN} onClick={() => go(index + 1)} px="0.5rem"><TbPlayerTrackNext /></Button></Tooltip>
          <Tooltip label="Last frame" hasArrow><Button {...BTN} onClick={() => go(lastIndex)} px="0.5rem"><TbPlayerSkipForward /></Button></Tooltip>
        </Flex>

        <input
          type="range"
          min={0}
          max={lastIndex}
          value={Math.min(index, lastIndex)}
          onChange={(e) => { setPlaying(false); go(Number(e.target.value)); }}
          style={{ flex: 1, accentColor: "#E0A82E", cursor: "pointer" }}
          aria-label="Replay timeline"
        />

        <Text fontSize="0.75rem" opacity={0.8} sx={{ fontVariantNumeric: "tabular-nums" }} minW="5.5rem" textAlign="right">
          {index} / {lastIndex}
        </Text>

        <Select
          size="sm"
          w="8rem"
          bg="whiteAlpha.200"
          borderColor="whiteAlpha.300"
          value=""
          onChange={(e) => { if (e.target.value) { setPlaying(false); jumpToTurn(Number(e.target.value)); } }}
        >
          <option value="">jump to turn…</option>
          {markers.filter((t) => t > 0).map((t) => (
            <option key={t} value={t} style={{ color: "#2C1831" }}>turn {t}</option>
          ))}
        </Select>

        {isDuel ? (
          <Tooltip label={`Flip perspective (now: ${heroName(view.self.heroId)})`} hasArrow>
            <Button {...BTN} onClick={() => setFocus(nextSeat)} leftIcon={<TbArrowsExchange />}>
              {focus.toUpperCase()}
            </Button>
          </Tooltip>
        ) : (
          <Select
            size="sm"
            w="10rem"
            bg="whiteAlpha.200"
            borderColor="whiteAlpha.300"
            value={focus}
            onChange={(e) => setFocus(e.target.value as PlayerId)}
            aria-label="Focus seat"
          >
            {seatList.map((id) => (
              <option key={id} value={id} style={{ color: "#2C1831" }}>
                {heroName(replayHeroFor(meta.heroes, id))}
              </option>
            ))}
          </Select>
        )}
      </Flex>
    </Box>
  );
};
