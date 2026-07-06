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
import {
  CardInstanceId,
  CardMeta,
  PlayerId,
  ReplayExpansion,
} from "@/lib/pro/protocol";
import { opponentHand, toPlayerView, turnMarkers } from "@/lib/pro/godView";

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

/** Milliseconds between frames while playing. */
const PLAY_INTERVAL_MS = 700;

export const ReplayScrubber = ({
  expansion,
  onExit,
}: {
  expansion: ReplayExpansion;
  onExit?: () => void;
}) => {
  const { steps, catalog, map, meta } = expansion;
  const lastIndex = steps.length - 1;
  const [index, setIndex] = useState(0);
  const [focus, setFocus] = useState<PlayerId>(meta.winner ?? "p1");
  const [playing, setPlaying] = useState(false);

  const step = steps[Math.min(index, lastIndex)];

  const { resolveCard, resolveHero } = useProCardArt(
    [step.players.p1.heroId, step.players.p2.heroId],
    catalog,
  );

  const view = useMemo(() => toPlayerView(step, { map, catalog }, focus), [step, map, catalog, focus]);
  const oppHand = opponentHand(step, focus);
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

  const oppId: PlayerId = focus === "p1" ? "p2" : "p1";

  return (
    <Box h="100svh" overflow="hidden" bg={TABLE_BG} position="relative" color="brand.parchment">
      {/* God-view banner + exit */}
      <Flex position="fixed" top="0.5rem" left="50%" transform="translateX(-50%)" zIndex={170} gap="0.5rem" alignItems="center">
        <Tag bg="brand.accent" color="brand.surfaceDim" fontFamily="BebasNeueRegular" letterSpacing="0.05em">
          REPLAY · GOD VIEW
        </Tag>
        <Tag bg="rgba(20,8,24,0.65)" color="brand.parchment" fontSize="0.75rem">
          {heroName(meta.heroes[0])} vs {heroName(meta.heroes[1])} · {meta.mapTitle}
        </Tag>
        {onExit && (
          <Button {...BTN} onClick={onExit}>
            ← back to replays
          </Button>
        )}
      </Flex>

      {/* opponent's hand, face-up at the top (God-view only) */}
      <Flex position="fixed" top="2.8rem" left="0" right="0" justifyContent="center" zIndex={155} pointerEvents="none">
        <Box pointerEvents="auto" transform="scale(0.7)" transformOrigin="top center" opacity={0.95}>
          <Flex direction="column" alignItems="center" gap="0.1rem">
            <Text fontSize="0.7rem" opacity={0.7} fontFamily="SpaceGrotesk" letterSpacing="0.06em">
              {heroName(view.opponent.heroId)} · hand ({oppHand.length})
            </Text>
            <ProHand hand={oppHand} resolveCard={resolveCard} labelFor={labelFor} actionsFor={() => []} onAction={() => {}} />
          </Flex>
        </Box>
      </Flex>

      {/* board */}
      <Flex h="100%" alignItems="center" justifyContent="center" p="1rem" pt="9rem" pb="12rem" pr={{ base: "1rem", lg: "20rem" }}>
        <ProBoard
          map={view.map}
          fighters={view.fighters}
          tokens={view.tokens}
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
        labelFor={labelFor}
      />

      {/* right dock — step state + combat readout */}
      <Flex position="fixed" right="0.75rem" top="7.5rem" w="18.5rem" direction="column" gap="0.6rem" zIndex={140}>
        <Flex gap="0.4rem" alignItems="center" flexWrap="wrap">
          <Tag size="sm" bg="whiteAlpha.300">turn {view.turnNumber}</Tag>
          <Tag size="sm" bg={view.activePlayer === focus ? "brand.accent" : "whiteAlpha.300"} color={view.activePlayer === focus ? "brand.surfaceDim" : "brand.parchment"}>
            {heroName(view.activePlayer === "p1" ? meta.heroes[0] : meta.heroes[1])}&apos;s turn
          </Tag>
          <Tag size="sm" bg="whiteAlpha.300">{view.phase.toLowerCase()}</Tag>
        </Flex>

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
            {heroName(view.winner === "p1" ? meta.heroes[0] : meta.heroes[1])} wins
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

        <Tooltip label={`Flip perspective (now: ${heroName(view.self.heroId)})`} hasArrow>
          <Button {...BTN} onClick={() => setFocus(oppId)} leftIcon={<TbArrowsExchange />}>
            {focus === "p1" ? "P1" : "P2"}
          </Button>
        </Tooltip>
      </Flex>
    </Box>
  );
};
