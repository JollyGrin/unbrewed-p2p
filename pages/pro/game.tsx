/**
 * Pro game page — renders the server's view, offers legalActions, answers
 * prompts. Contains ZERO rules logic (docs/pro/01-context.md).
 *
 * Modes:
 * - LIVE (default): WS_URL resolves to the Railway server → connects via
 *   useProSocket. `?room=<id>` joins; no room param creates one. This is what
 *   a plain GitHub Pages build ships, so /pro/game is playable with no env.
 * - PREVIEW (fallback): only reached if WS_URL is somehow empty → renders the
 *   Mended Drum fixture with placeholder fighters so board rendering can be
 *   verified without the backend. Clicking a fighter shows its movement
 *   out-edges (adjacentTo ∪ oneWayTo) — reading MAP data for display, not rules.
 */
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Box, Button, Flex, Grid, Tag, Text, keyframes } from "@chakra-ui/react";
import { ProBoard } from "@/components/Pro/ProBoard";
import {
  Action,
  CardInstanceId,
  CardMeta,
  FighterId,
  HeroListing,
  PlayerView,
  ProMapDef,
  SpaceId,
  ViewCombat,
  ViewFighter,
  ViewPrompt,
} from "@/lib/pro/protocol";
import { ProConnectionStatus, useProSocket } from "@/lib/pro/useProSocket";
import { HERO_DECK_IDS, ResolveCard, useProCardArt } from "@/lib/pro/useProCardArt";
import { POPULAR_DECKS } from "@/lib/constants/top-decks";
import { GiFootprint, GiHearts } from "react-icons/gi";
import { TbBow, TbSword } from "react-icons/tb";
import { CardFace, ProHand } from "@/components/Pro/ProHand";
import { ProHud } from "@/components/Pro/ProHud";
import { ProLog, ProLogEntry } from "@/components/Pro/ProLog";
import { diffViews } from "@/lib/pro/gameLog";
import mendedDrum from "@/lib/pro/fixtures/mended-drum.map.json";

/** same table felt the sandbox game uses (game.layout.tsx) */
const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";

// Live Pro server (Railway). Hardcoded as the default so a plain GitHub Pages
// build with no env still connects to a real backend and is playable. Override
// via NEXT_PUBLIC_PRO_WS_URL (e.g. ws://localhost:8787 in .env for local dev).
// `||` not `??`: CI expands an unset repo variable to "" — an empty string must
// also fall through to this default, and only `||` treats "" as absent.
const DEFAULT_PRO_WS_URL = "wss://unbrewed-engine-production.up.railway.app";
const WS_URL = process.env.NEXT_PUBLIC_PRO_WS_URL || DEFAULT_PRO_WS_URL;

const BTN = {
  size: "sm" as const,
  bg: "whiteAlpha.200",
  color: "brand.parchment",
  _hover: { bg: "whiteAlpha.400" },
  _active: { bg: "whiteAlpha.500" },
};
const BTN_GOLD = {
  ...BTN,
  bg: "brand.accent",
  color: "brand.surfaceDim",
  _hover: { bg: "brand.accentDeep" },
  _active: { bg: "brand.accentDeep" },
};

/** Printed-card label via the server catalog ('king-kong/clobber#2' -> 'clobber (3/2)'). */
const cardLabel = (catalog: Record<string, CardMeta>, instance: CardInstanceId): string => {
  const meta = catalog[instance.split("#")[0]];
  if (!meta) return instance.split("#")[0].split("/").pop() ?? instance;
  const stats = meta.type === "scheme" ? "scheme" : `${meta.value ?? "–"}/${meta.boost ?? "–"}`;
  return `${meta.title} (${stats})`;
};

/** Presentational label for a server-offered action. */
const describeAction = (catalog: Record<string, CardMeta>, a: Action): string => {
  switch (a.type) {
    case "MANEUVER":
      return "Maneuver";
    case "BOOST_MOVE":
      return `Boost move (discard ${cardLabel(catalog, a.card)})`;
    case "MOVE_FIGHTER":
      return `Move ${a.fighter.split("/")[1]}`;
    case "END_MANEUVER":
      return "End maneuver";
    case "SCHEME":
      return `Scheme: ${cardLabel(catalog, a.card)}`;
    case "DECLARE_ATTACK":
      return `Attack ${a.target.split("/")[1]} with ${a.attacker.split("/")[1]}`;
    case "COMMIT_ATTACK_CARD":
      return `Commit ${cardLabel(catalog, a.card)}`;
    case "COMMIT_DEFENSE_CARD":
      return `Defend with ${cardLabel(catalog, a.card)}`;
    case "DECLINE_DEFENSE":
      return "Don't defend";
    case "DISCARD_TO_LIMIT":
      return `Discard ${cardLabel(catalog, a.card)}`;
    case "PLACE_SIDEKICK":
      return `Place ${a.fighter.split("/")[1]} on ${a.space}`;
    case "RESPOND_PROMPT":
      return "Answer prompt"; // rendered by PromptPanel instead — filtered out of the list
  }
};

/**
 * Best-effort source card for a prompt (issue #72 fix #2). ViewPrompt has no
 * source-card field, so we only trust an explicit `option.data.card` instance
 * id the server chose to attach — never a fabricated mapping. Returns null when
 * no option carries one (caller then falls back to combat context).
 */
const optionCardInstance = (options: ViewPrompt["options"]): CardInstanceId | null => {
  for (const o of options) {
    const d = o.data;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const card = (d as { card?: unknown }).card;
      if (typeof card === "string") return card;
    }
  }
  return null;
};

const PromptPanel = ({
  prompt,
  you,
  onRespond,
  buttonOptions,
  boardHint,
  previewInstance,
  resolveCard,
  catalog,
}: {
  prompt: ViewPrompt;
  you: PlayerView["you"];
  onRespond: (promptId: string, optionId: string) => void;
  /** options NOT answerable via the board (e.g. "Decline move") */
  buttonOptions: ViewPrompt["options"];
  /** set when some options are answered by clicking the board */
  boardHint: string | null;
  /**
   * Best-effort card behind this prompt (issue #72 fix #2). ViewPrompt carries
   * NO source-card field, so the caller approximates it from `option.data.card`
   * or the live combat card; null = no reliable signal, render header-only.
   */
  previewInstance: CardInstanceId | null;
  resolveCard: ResolveCard;
  catalog: Record<string, CardMeta>;
}) => (
  <Box bg="brand.surface" border="2px solid" borderColor="brand.accent" borderRadius="0.5rem" p="1rem">
    <Text fontFamily="ArchivoNarrow" fontWeight="bold" mb="0.5rem" color="brand.accent">
      {prompt.kind.replace(/_/g, " ")}
    </Text>
    {prompt.player === you ? (
      <>
        {previewInstance && (
          <Box w="6.5rem" sx={{ aspectRatio: "63 / 88" }} mb="0.5rem">
            <CardFace card={resolveCard(previewInstance)} fallback={cardLabel(catalog, previewInstance)} />
          </Box>
        )}
        {boardHint && (
          <Text fontSize="0.85rem" mb={buttonOptions.length ? "0.5rem" : 0} color="brand.parchment">
            {boardHint}
          </Text>
        )}
        <Flex gap="0.5rem" flexWrap="wrap">
          {buttonOptions.map((o) => (
            <Button
              key={o.id}
              {...BTN_GOLD}
              whiteSpace="normal"
              height="auto"
              minH="2rem"
              py="0.35rem"
              textAlign="left"
              onClick={() => onRespond(prompt.promptId, o.id)}
            >
              {o.label}
            </Button>
          ))}
        </Flex>
      </>
    ) : (
      <Text opacity={0.7} fontSize="0.9rem">
        opponent is deciding…
      </Text>
    )}
  </Box>
);

/** The reveal beat: cards flip in from edge-on, defender a breath later. */
const flipIn = keyframes`
  from { transform: perspective(600px) rotateY(88deg) scale(1.12); opacity: 0.4; }
  60%  { transform: perspective(600px) rotateY(-8deg) scale(1.06); opacity: 1; }
  to   { transform: perspective(600px) rotateY(0) scale(1); opacity: 1; }
`;

/** One combat slot: revealed card face, own face-down commit, or a card back. */
const CombatSlot = ({
  label,
  card,
  detail,
  resolveCard,
  facedownInstance,
  facedownState,
  catalog,
  revealDelay = "0s",
}: {
  label: string;
  card: ViewCombat["attackerCard"];
  detail?: string;
  resolveCard: ResolveCard;
  /** own committed instance when this slot is mine and unrevealed */
  facedownInstance: CardInstanceId | null;
  facedownState: "committed" | "deciding" | "none";
  catalog: Record<string, CardMeta>;
  revealDelay?: string;
}) => (
  <Box textAlign="center">
    <Text opacity={0.6} fontSize="0.75rem" mb="0.25rem">
      {label}
    </Text>
    <Box w="6.5rem" sx={{ aspectRatio: "63 / 88" }} mx="auto" position="relative">
      {card ? (
        // keyed by instance: mounts fresh at reveal, so the flip plays exactly once
        <Box
          key={card.instance}
          w="100%"
          h="100%"
          animation={`${flipIn} 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.1) ${revealDelay} both`}
        >
          <CardFace card={resolveCard(card.instance)} fallback={cardLabel(catalog, card.instance)} />
        </Box>
      ) : facedownInstance ? (
        <Box position="relative" w="100%" h="100%">
          <CardFace
            card={resolveCard(facedownInstance)}
            fallback={cardLabel(catalog, facedownInstance)}
          />
          <Tag position="absolute" top="-0.4rem" left="50%" transform="translateX(-50%)" size="sm">
            face-down
          </Tag>
        </Box>
      ) : (
        <Flex
          w="100%"
          h="100%"
          bg={facedownState === "committed" ? "brand.surface" : "transparent"}
          border="1px dashed"
          borderColor="whiteAlpha.400"
          borderRadius="0.5rem"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="0.7rem" opacity={0.6}>
            {facedownState === "committed" ? "face-down" : facedownState === "deciding" ? "deciding…" : "no card"}
          </Text>
        </Flex>
      )}
    </Box>
    {card && (
      <Text fontSize="0.95rem" fontWeight="bold" color="brand.accent">
        {card.effectiveValue}
        {card.boosts.length ? ` (+${card.boosts.length} boost)` : ""}
      </Text>
    )}
    {detail && (
      <Text fontSize="0.75rem" opacity={0.7}>
        {detail}
      </Text>
    )}
  </Box>
);

/** The reveal beat + running combat math, straight from the server view. */
const CombatPanel = ({
  combat,
  catalog,
  resolveCard,
  you,
  selfCommitted,
}: {
  combat: ViewCombat;
  catalog: Record<string, CardMeta>;
  resolveCard: ResolveCard;
  you: PlayerView["you"];
  selfCommitted: CardInstanceId | null;
}) => {
  const attackerCommitted = combat.stage !== "COMMIT_ATTACK";
  const pastReveal = !["COMMIT_ATTACK", "COMMIT_DEFENSE"].includes(combat.stage);
  return (
    <Box bg="brand.surface" border="1px solid" borderColor="whiteAlpha.300" borderRadius="0.5rem" p="0.75rem">
      <Flex gap="0.5rem" alignItems="center" mb="0.5rem">
        <Tag colorScheme="red" size="sm">
          COMBAT
        </Tag>
        <Text fontSize="0.8rem" opacity={0.7}>
          {combat.stage.replace(/_/g, " ").toLowerCase()}
        </Text>
      </Flex>
      <Flex gap="1rem" justifyContent="center">
        <CombatSlot
          label="attack"
          card={combat.attackerCard}
          resolveCard={resolveCard}
          facedownInstance={
            !combat.attackerCard && combat.attackerPlayer === you ? selfCommitted : null
          }
          facedownState={attackerCommitted ? "committed" : "deciding"}
          catalog={catalog}
        />
        <CombatSlot
          label="defense"
          card={combat.defenderCard}
          revealDelay="0.18s"
          resolveCard={resolveCard}
          facedownInstance={
            !combat.defenderCard && combat.defenderPlayer === you && !pastReveal ? selfCommitted : null
          }
          facedownState={combat.stage === "COMMIT_DEFENSE" ? "deciding" : pastReveal ? "none" : "committed"}
          catalog={catalog}
        />
      </Flex>
      {combat.outcome && (
        <Text textAlign="center" mt="0.5rem" fontWeight="bold">
          {combat.outcome.replace(/_/g, " ").toLowerCase()}
          {combat.attackDamageDealt !== null ? ` · ${combat.attackDamageDealt} dmg` : ""}
        </Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Pre-join lobby — hero select (T-021)
// ---------------------------------------------------------------------------

const sessionTokenKey = (roomId: string) => `unbrewed-pro-token-${roomId}`;

/** server hero id -> pretty display fallback ('king-kong' -> 'King Kong') */
const prettyHeroId = (heroId: string) =>
  heroId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const heroNameOf = (heroes: HeroListing[] | null, heroId: string | null) => {
  if (!heroId) return null;
  return heroes?.find((h) => h.heroId === heroId)?.name ?? prettyHeroId(heroId);
};

/** cardback art for a server hero via the deck-id bridge (a nicety; may be undefined) */
const heroCardback = (heroId: string): string | undefined => {
  const deckId = HERO_DECK_IDS[heroId];
  return POPULAR_DECKS.find((d) => d.id === deckId)?.cardbackUrl;
};

const skeletonPulse = keyframes`
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.7; }
`;

const StatPip = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <Flex align="center" gap="0.25rem" fontSize="0.8rem" fontWeight="bold">
    {icon}
    <Text sx={{ fontVariantNumeric: "tabular-nums" }}>{label}</Text>
  </Flex>
);

/** One selectable hero card in the lobby picker. */
const HeroTile = ({
  hero,
  selected,
  onSelect,
}: {
  hero: HeroListing;
  selected: boolean;
  onSelect: () => void;
}) => {
  const cardback = heroCardback(hero.heroId);
  return (
    <Flex
      as="button"
      type="button"
      direction="column"
      onClick={onSelect}
      w="10rem"
      minH="8rem"
      p="0.75rem"
      borderRadius="0.6rem"
      border="2px solid"
      borderColor={selected ? "brand.accent" : "whiteAlpha.300"}
      bg={cardback ? undefined : "rgba(20, 8, 24, 0.55)"}
      bgImage={cardback ? `url(${cardback})` : undefined}
      bgSize="cover"
      bgPos="center"
      position="relative"
      overflow="hidden"
      textAlign="left"
      transition="border-color 0.15s, transform 0.15s, box-shadow 0.15s"
      transform={selected ? "translateY(-2px)" : undefined}
      boxShadow={selected ? "0 0 0 2px #E0A82E, 0 6px 16px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.4)"}
      _hover={{ borderColor: "brand.accent" }}
    >
      <Box
        position="absolute"
        inset="0"
        bg="linear-gradient(180deg, rgba(20,8,24,0.15) 0%, rgba(20,8,24,0.85) 100%)"
      />
      <Flex direction="column" position="relative" gap="0.5rem" flex="1" justify="flex-end">
        <Text
          fontFamily="BebasNeueRegular"
          fontSize="1.35rem"
          letterSpacing="0.03em"
          lineHeight="1.05"
          textShadow="0 1px 3px rgba(0,0,0,0.9)"
        >
          {hero.name}
        </Text>
        <Flex gap="0.75rem" color="brand.parchment" textShadow="0 1px 2px rgba(0,0,0,0.9)">
          <StatPip icon={<GiHearts color="#C0392B" size="15px" />} label={String(hero.hp)} />
          <StatPip icon={<GiFootprint size="14px" />} label={String(hero.move)} />
          <StatPip
            icon={hero.reach === "RANGED" ? <TbBow size="15px" /> : <TbSword size="15px" />}
            label={hero.reach === "RANGED" ? "rng" : "mel"}
          />
        </Flex>
      </Flex>
    </Flex>
  );
};

const SkeletonTile = () => (
  <Box
    w="10rem"
    minH="8rem"
    borderRadius="0.6rem"
    border="2px solid"
    borderColor="whiteAlpha.200"
    bg="whiteAlpha.100"
    animation={`${skeletonPulse} 1.3s ease-in-out infinite`}
  />
);

/**
 * The create/join screen. Renders one tile per server-fed hero. While the
 * roster hasn't arrived (`heroes === null`) it shows skeletons — or, if the
 * creator arrived with a valid `?hero=`, that hero as preselected text so they
 * can Create the instant the socket opens (the server validates the hero id).
 */
const HeroSelectLobby = ({
  room,
  status,
  heroes,
  heroParam,
  selectedHeroId,
  onSelectHero,
  onConfirm,
}: {
  room: string | null;
  status: ProConnectionStatus;
  heroes: HeroListing[] | null;
  heroParam: string | null;
  selectedHeroId: string | null;
  onSelectHero: (heroId: string) => void;
  onConfirm: () => void;
}) => {
  // While the list is loading, a valid-looking `?hero=` stands in so the
  // creator isn't blocked; once the list arrives the real selection takes over.
  const effective = selectedHeroId ?? (heroes === null ? heroParam : null);
  const canConfirm = status === "open" && !!effective;

  return (
    <Flex direction="column" alignItems="center" gap="1.25rem" pt="3.5rem" px="1rem" pb="3rem">
      <Text fontFamily="LeagueGothic" fontSize="2.5rem" letterSpacing="0.05em" textAlign="center">
        {room ? `JOIN ROOM ${room}` : "CREATE A ROOM"}
      </Text>
      <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.08em" opacity={0.75}>
        Choose your fighter
      </Text>

      <Flex gap="0.75rem" flexWrap="wrap" justifyContent="center" maxW="42rem">
        {heroes === null ? (
          heroParam ? (
            <Flex
              direction="column"
              align="center"
              gap="0.4rem"
              w="10rem"
              minH="8rem"
              justify="center"
              borderRadius="0.6rem"
              border="2px solid"
              borderColor="brand.accent"
              bg="rgba(20, 8, 24, 0.55)"
              p="0.75rem"
            >
              <Text fontFamily="BebasNeueRegular" fontSize="1.35rem" textAlign="center">
                {prettyHeroId(heroParam)}
              </Text>
              <Text fontSize="0.7rem" opacity={0.6}>
                loading roster…
              </Text>
            </Flex>
          ) : (
            <>
              <SkeletonTile />
              <SkeletonTile />
              <SkeletonTile />
            </>
          )
        ) : heroes.length === 0 ? (
          <Text opacity={0.7}>no heroes available — try again shortly</Text>
        ) : (
          heroes.map((h) => (
            <HeroTile
              key={h.heroId}
              hero={h}
              selected={effective === h.heroId}
              onSelect={() => onSelectHero(h.heroId)}
            />
          ))
        )}
      </Flex>

      <Button {...BTN_GOLD} isDisabled={!canConfirm} onClick={onConfirm}>
        {room ? "Join" : "Create"}
      </Button>
      <Text fontSize="0.8rem" opacity={0.55}>
        server: {status === "open" ? "connected" : status}
      </Text>
    </Flex>
  );
};

// ---------------------------------------------------------------------------
// LIVE mode
// ---------------------------------------------------------------------------

const LiveGame = ({ room, heroParam }: { room: string | null; heroParam: string | null }) => {
  const { status, roomId, snapshot, opponentConnected, error, heroes, createRoom, joinRoom, sendAction, respondToPrompt } =
    useProSocket(WS_URL);
  const [joined, setJoined] = useState(false);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [selectedFighter, setSelectedFighter] = useState<FighterId | null>(null);
  // Art fetch (unbrewed-api, matched by title against the server catalog) —
  // must run unconditionally; no-ops until the first STATE arrives.
  const { resolveCard, resolveHero } = useProCardArt(
    snapshot ? [snapshot.view.self.heroId, snapshot.view.opponent.heroId] : [],
    snapshot?.view.catalog ?? {}
  );

  // Activity feed: diff each view against the previous one (see gameLog.ts).
  const [logEntries, setLogEntries] = useState<ProLogEntry[]>([]);
  const prevViewRef = useRef<PlayerView | null>(null);
  const logSeqRef = useRef(0);
  useEffect(() => {
    if (!snapshot) return;
    const next = snapshot.view;
    const lines = diffViews(prevViewRef.current, next, (c) => cardLabel(next.catalog, c));
    prevViewRef.current = next;
    if (lines.length === 0) return;
    setLogEntries((cur) =>
      [...lines.map((l) => ({ ...l, key: `log-${logSeqRef.current++}` })).reverse(), ...cur].slice(0, 120)
    );
  }, [snapshot]);

  // Returning player: a saved reconnect token for this room means we skip the
  // hero picker entirely and RECONNECT straight into the same seat (joinRoom
  // replays the token when one exists). Runs once when a `?room=` has a token.
  const reconnectedRef = useRef(false);
  useEffect(() => {
    if (joined || !room || reconnectedRef.current || typeof window === "undefined") return;
    if (sessionStorage.getItem(sessionTokenKey(room))) {
      reconnectedRef.current = true;
      joinRoom(room, ""); // heroId ignored on the RECONNECT path
      setJoined(true);
    }
  }, [joined, room, joinRoom]);

  // Preselect a hero once the server roster arrives: honor a valid `?hero=`
  // (invalid ids are ignored → manual pick), and auto-select when only one
  // hero ships so the picker reads as a confirmation.
  useEffect(() => {
    if (selectedHeroId || !heroes) return;
    if (heroParam && heroes.some((h) => h.heroId === heroParam)) {
      setSelectedHeroId(heroParam);
    } else if (heroes.length === 1) {
      setSelectedHeroId(heroes[0].heroId);
    }
  }, [heroes, heroParam, selectedHeroId]);

  // UNKNOWN_HERO shouldn't happen when picking from the server list, but if the
  // server rejects the hero, drop back to the picker instead of a dead end.
  useEffect(() => {
    if (error?.code === "UNKNOWN_HERO") {
      setJoined(false);
      setSelectedHeroId(null);
    }
  }, [error]);

  if (!joined) {
    const effectiveHeroId = selectedHeroId ?? (heroes === null ? heroParam : null);
    return (
      <HeroSelectLobby
        room={room}
        status={status}
        heroes={heroes}
        heroParam={heroParam}
        selectedHeroId={selectedHeroId}
        onSelectHero={setSelectedHeroId}
        onConfirm={() => {
          if (!effectiveHeroId) return;
          room ? joinRoom(room, effectiveHeroId) : createRoom(effectiveHeroId);
          setSelectedHeroId(effectiveHeroId); // lock it for the lobby label
          setJoined(true);
        }}
      />
    );
  }

  // Room-level errors surface on a friendly screen with a create-new fallback.
  if (error && (error.code === "ROOM_NOT_FOUND" || error.code === "ROOM_FULL")) {
    const msg =
      error.code === "ROOM_NOT_FOUND"
        ? "This room expired or never existed."
        : "This room is already full.";
    return (
      <Flex direction="column" alignItems="center" gap="1rem" pt="4rem" px="1rem" textAlign="center">
        <Text fontFamily="LeagueGothic" fontSize="2rem" letterSpacing="0.05em" color="red.300">
          {msg}
        </Text>
        <Button {...BTN_GOLD} onClick={() => (window.location.href = "/pro/game")}>
          Create a new room instead
        </Button>
      </Flex>
    );
  }

  if (error)
    return (
      <Text color="red.300" pt="4rem" textAlign="center">
        {error.code}: {error.message}
      </Text>
    );
  // The server sends the first STATE only once BOTH seats are filled — a
  // created room sits here (correctly) until the opponent joins.
  if (!snapshot) {
    if (roomId && !room) {
      const joinUrl =
        typeof window !== "undefined" ? `${window.location.origin}/pro/game?room=${roomId}` : "";
      return (
        <Flex direction="column" alignItems="center" gap="1rem" pt="4rem" px="1rem">
          <Text fontFamily="LeagueGothic" fontSize="2.5rem" letterSpacing="0.05em">
            ROOM {roomId}
          </Text>
          {heroNameOf(heroes, selectedHeroId) && (
            <Text fontFamily="BebasNeueRegular" fontSize="1.3rem" letterSpacing="0.05em" color="brand.accent">
              You are {heroNameOf(heroes, selectedHeroId)}
            </Text>
          )}
          <Text opacity={0.8}>Waiting for an opponent — the game starts the moment they join.</Text>
          <Flex gap="0.5rem" alignItems="center" flexWrap="wrap" justifyContent="center">
            <Tag fontFamily="mono" px="0.75rem" py="0.4rem">
              {joinUrl}
            </Tag>
            <Button {...BTN_GOLD} onClick={() => navigator.clipboard?.writeText(joinUrl)}>
              copy link
            </Button>
          </Flex>
          <Text fontSize="0.8rem" opacity={0.5}>
            (testing solo? open that link in a second browser tab)
          </Text>
        </Flex>
      );
    }
    return (
      <Text pt="4rem" textAlign="center" opacity={0.7}>
        waiting for game state… ({status}
        {roomId ? `, room ${roomId}` : ""})
      </Text>
    );
  }

  const { view, legalActions, prompt } = snapshot;
  const myTurn = view.activePlayer === view.you;
  // RESPOND_PROMPT renders through the PromptPanel; MOVE_FIGHTER and
  // PLACE_SIDEKICK render as clickable board spaces — listing one button per
  // destination just floods the sidebar (and card actions live on the hand).
  const listActions = legalActions.filter(
    (a) => !["RESPOND_PROMPT", "MOVE_FIGHTER", "PLACE_SIDEKICK"].includes(a.type)
  );

  // Board affordances derive ONLY from what the server offered. Each
  // highlighted space maps back to the exact server-offered action so a click
  // sends it verbatim (incl. the enumerated MOVE_FIGHTER path).
  const spaceActions = new Map<SpaceId, Action[]>();
  for (const a of legalActions) {
    const dest =
      a.type === "PLACE_SIDEKICK" ? a.space : a.type === "MOVE_FIGHTER" ? a.path[a.path.length - 1] : null;
    if (dest) spaceActions.set(dest, [...(spaceActions.get(dest) ?? []), a]);
  }
  const attackActions = new Map<FighterId, Action>();
  for (const a of legalActions) if (a.type === "DECLARE_ATTACK") attackActions.set(a.target, a);
  const movableFighters = new Set(
    legalActions.flatMap((a) => (a.type === "MOVE_FIGHTER" ? [a.fighter] : []))
  );

  // Prompts answer via the board too: CHOOSE_SPACE options carry a space id
  // as option.id (plus e.g. 'decline'), CHOOSE_TARGET options a fighter id.
  // Board-answerable options become highlights; the rest stay panel buttons.
  const promptForMe = prompt && prompt.player === view.you ? prompt : null;
  const mapSpaceIds = new Set(view.map.spaces.map((s) => s.id));
  const fighterIds = new Set(view.fighters.map((f) => f.id));
  const promptSpaceIds =
    promptForMe?.kind === "CHOOSE_SPACE"
      ? promptForMe.options.map((o) => o.id).filter((id) => mapSpaceIds.has(id))
      : [];
  const promptTargetIds =
    promptForMe?.kind === "CHOOSE_TARGET"
      ? promptForMe.options.map((o) => o.id).filter((id) => fighterIds.has(id))
      : [];
  const promptBoardIds = new Set([...promptSpaceIds, ...promptTargetIds]);
  const promptButtonOptions = promptForMe
    ? promptForMe.options.filter((o) => !promptBoardIds.has(o.id))
    : [];
  const promptBoardHint =
    promptSpaceIds.length > 0
      ? `click a gold space on the board (${promptSpaceIds.length} option${promptSpaceIds.length === 1 ? "" : "s"})`
      : promptTargetIds.length > 0
        ? "click a pulsing fighter on the board"
        : null;

  // Card behind the current prompt (issue #72 fix #2), best-effort: trust an
  // explicit option.data.card first, else show the live combat card as the most
  // likely cause. DOCUMENTED GAP: the protocol's ViewPrompt has no source-card
  // field, so a non-combat effect prompt whose server never attaches option.data
  // still degrades to the header-only panel — we never guess a mapping.
  const promptCardInstance = promptForMe
    ? optionCardInstance(promptForMe.options) ??
      view.combat?.attackerCard?.instance ??
      view.combat?.defenderCard?.instance ??
      null
    : null;

  // Optional filter: click one of your movable fighters to see only ITS moves
  // (matters once a deck has sidekicks; harmless in the Kong mirror).
  const spaceMatches = (actions: Action[]) =>
    selectedFighter
      ? actions.filter((a) => a.type !== "MOVE_FIGHTER" || a.fighter === selectedFighter)
      : actions;
  const highlightedSpaces = [
    ...[...spaceActions.entries()].filter(([, actions]) => spaceMatches(actions).length > 0).map(([space]) => space),
    ...promptSpaceIds,
  ];
  const highlightedFighters = [...attackActions.keys(), ...movableFighters, ...promptTargetIds];

  const onSpaceClick = (space: SpaceId) => {
    // an open prompt owns the board — answer it first
    if (promptForMe && promptSpaceIds.includes(space)) {
      respondToPrompt(promptForMe.promptId, space);
      setSelectedFighter(null);
      return;
    }
    const candidates = spaceMatches(spaceActions.get(space) ?? []);
    if (candidates.length === 0) return;
    sendAction(candidates[0]);
    setSelectedFighter(null);
  };
  const onFighterClick = (id: FighterId) => {
    if (promptForMe && promptTargetIds.includes(id)) {
      respondToPrompt(promptForMe.promptId, id);
      setSelectedFighter(null);
      return;
    }
    const attack = attackActions.get(id);
    if (attack) {
      sendAction(attack);
      setSelectedFighter(null);
    } else if (movableFighters.has(id)) {
      setSelectedFighter((cur) => (cur === id ? null : id));
    }
  };

  // Hand affordances: a card is playable iff a server-offered action carries
  // its instance id. Short verb labels; the full sentence stays in the sidebar.
  const actionsForCard = (instance: CardInstanceId) =>
    legalActions.flatMap((a) => {
      if (!("card" in a) || a.card !== instance) return [];
      const label =
        a.type === "SCHEME"
          ? "Scheme"
          : a.type === "BOOST_MOVE"
            ? "Boost move"
            : a.type === "COMMIT_ATTACK_CARD"
              ? "Attack with"
              : a.type === "COMMIT_DEFENSE_CARD"
                ? "Defend with"
                : "Discard"; // DISCARD_TO_LIMIT — the only remaining card-carrying type
      return [{ action: a, label }];
    });

  return (
    <Box h="100svh" overflow="hidden" bg={TABLE_BG} position="relative">
      {/* board — fills the stage, capped so the whole field stays in view */}
      <Flex
        h="100%"
        alignItems="center"
        justifyContent="center"
        p="1rem"
        pt="7.5rem"
        pb="8.5rem"
        pr={{ base: "1rem", lg: "20rem" }}
      >
        <ProBoard
          map={view.map}
          fighters={view.fighters}
          tokens={view.tokens}
          highlightedSpaces={[...new Set(highlightedSpaces)]}
          highlightedFighters={[...new Set(highlightedFighters)]}
          selectedFighter={selectedFighter}
          onSpaceClick={onSpaceClick}
          onFighterClick={onFighterClick}
          imgMaxH="calc(100svh - 16rem)"
        />
      </Flex>

      {/* floating player plates + room/connection chips (sandbox HUD DNA) */}
      <ProHud
        view={view}
        status={status}
        roomId={roomId}
        resolveCard={resolveCard}
        resolveHero={resolveHero}
        labelFor={(c) => cardLabel(view.catalog, c)}
      />

      {/* right control dock — turn state, combat, prompts, actions */}
      <Flex
        position="fixed"
        right="0.75rem"
        top="7.5rem"
        bottom="1rem"
        w="18.5rem"
        direction="column"
        gap="0.6rem"
        zIndex={140}
        overflowY="auto"
        sx={{ "::-webkit-scrollbar": { display: "none" } }}
        pointerEvents="none"
      >
        <Flex direction="column" gap="0.6rem" sx={{ "& > *": { pointerEvents: "auto" } }}>
          <Flex gap="0.4rem" alignItems="center" flexWrap="wrap">
            <Tag size="sm" bg={myTurn ? "brand.accent" : "whiteAlpha.300"} color={myTurn ? "brand.surfaceDim" : "brand.parchment"}>
              {myTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
            </Tag>
            <Tag size="sm" bg="whiteAlpha.300" color="brand.parchment">
              turn {view.turnNumber}
            </Tag>
            <Tag size="sm" bg="whiteAlpha.300" color="brand.parchment">
              {view.actionsRemaining} actions left
            </Tag>
            {!opponentConnected && (
              <Tag size="sm" colorScheme="red">
                opponent disconnected
              </Tag>
            )}
          </Flex>
          {(highlightedSpaces.length > 0 || attackActions.size > 0) && (
            <Text fontSize="0.8rem" color="brand.accent" textShadow="0 1px 3px rgba(0,0,0,0.6)">
              {selectedFighter
                ? `showing moves for ${selectedFighter.split("/")[1]} — click a gold space (click the fighter again to unselect)`
                : [
                    highlightedSpaces.length > 0 &&
                      `click a gold space to move there (${highlightedSpaces.length} option${
                        highlightedSpaces.length === 1 ? "" : "s"
                      })`,
                    attackActions.size > 0 && "click a pulsing enemy to attack",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </Text>
          )}
          {view.combat && (
            <CombatPanel
              combat={view.combat}
              catalog={view.catalog}
              resolveCard={resolveCard}
              you={view.you}
              selfCommitted={view.self.committedCard}
            />
          )}
          {prompt && (
            <PromptPanel
              prompt={prompt}
              you={view.you}
              onRespond={respondToPrompt}
              buttonOptions={promptButtonOptions}
              boardHint={promptBoardHint}
              previewInstance={promptCardInstance}
              resolveCard={resolveCard}
              catalog={view.catalog}
            />
          )}
          <Flex direction="column" gap="0.4rem">
            {listActions.map((a, i) => (
              <Button
                key={i}
                {...BTN}
                bg="rgba(20, 8, 24, 0.65)"
                justifyContent="flex-start"
                whiteSpace="normal"
                height="auto"
                minH="2rem"
                py="0.4rem"
                textAlign="left"
                onClick={() => sendAction(a)}
              >
                {describeAction(view.catalog, a)}
              </Button>
            ))}
            {legalActions.length === 0 && !prompt && (
              <Text opacity={0.7} fontSize="0.9rem" color="brand.parchment">
                waiting on opponent…
              </Text>
            )}
          </Flex>
          {view.winner && (
            <Text
              fontFamily="LeagueGothic"
              fontSize="3rem"
              color="brand.accent"
              textShadow="0 2px 12px rgba(224,168,46,0.5)"
            >
              {view.winner === view.you ? "VICTORY!" : "DEFEAT"}
            </Text>
          )}
        </Flex>
      </Flex>

      {/* activity feed — bottom-left parchment panel, sandbox style */}
      <ProLog entries={logEntries} />

      {/* hand — docked fan over the bottom edge, sandbox style */}
      <Flex position="fixed" bottom="-0.75rem" left="0" right="0" justifyContent="center" zIndex={160} pointerEvents="none">
        <Box pointerEvents="auto">
          <ProHand
            hand={view.self.hand}
            resolveCard={resolveCard}
            labelFor={(c) => cardLabel(view.catalog, c)}
            actionsFor={actionsForCard}
            onAction={sendAction}
          />
        </Box>
      </Flex>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// PREVIEW mode (dev only, no server)
// ---------------------------------------------------------------------------

const PREVIEW_MAP = mendedDrum as ProMapDef;

const previewFighters = (map: ProMapDef): ViewFighter[] => {
  const start = (slot: number) => map.spaces.find((s) => s.start?.slot === slot)?.id ?? null;
  return [
    { id: "p1/hero", owner: "p1", kind: "HERO", name: "King Kong", space: start(1), hp: 18, maxHp: 18, reach: "MELEE", defeated: false },
    { id: "p2/hero", owner: "p2", kind: "HERO", name: "Baba Yaga", space: start(2), hp: 14, maxHp: 14, reach: "RANGED", defeated: false },
  ];
};

const PreviewGame = () => {
  const [fighters, setFighters] = useState<ViewFighter[]>(() => previewFighters(PREVIEW_MAP));
  const [selected, setSelected] = useState<FighterId | null>(null);

  const spaceById = useMemo(
    () => new Map(PREVIEW_MAP.spaces.map((s) => [s.id, s])),
    []
  );
  const selectedSpace = selected ? fighters.find((f) => f.id === selected)?.space : null;
  const outEdges: SpaceId[] = selectedSpace
    ? [...(spaceById.get(selectedSpace)?.adjacentTo ?? []), ...(spaceById.get(selectedSpace)?.oneWayTo ?? [])]
    : [];

  return (
    <Grid templateColumns={{ base: "1fr", lg: "1fr 20rem" }} gap="1rem" p="1rem" maxW="90rem" mx="auto">
      <ProBoard
        map={PREVIEW_MAP}
        fighters={fighters}
        highlightedSpaces={outEdges}
        highlightedFighters={selected ? [] : fighters.map((f) => f.id)}
        selectedFighter={selected}
        onFighterClick={(id) => setSelected(id)}
        onSpaceClick={(spaceId) => {
          if (!selected) return;
          setFighters((fs) => fs.map((f) => (f.id === selected ? { ...f, space: spaceId } : f)));
          setSelected(null);
        }}
      />
      <Flex direction="column" gap="0.75rem">
        <Tag colorScheme="orange" w="fit-content">
          BOARD DEMO — no server connected
        </Tag>
        <Text fontSize="0.9rem" opacity={0.8}>
          A feel for the rules-enforced table on {PREVIEW_MAP.meta.title}: click a fighter, then a gold
          space to slide it one step along the printed paths (the stairs by s12 only go one way — the
          board knows). In a real match the referee server decides what lights up.
        </Text>
        <Text fontSize="0.8rem" opacity={0.6}>
          Live matches activate when a game server is configured (NEXT_PUBLIC_PRO_WS_URL at build time).
        </Text>
        {selected && (
          <Button {...BTN} onClick={() => setSelected(null)} w="fit-content">
            deselect
          </Button>
        )}
      </Flex>
    </Grid>
  );
};

// ---------------------------------------------------------------------------

const ProGamePage = () => {
  const router = useRouter();
  const room = typeof router.query.room === "string" ? router.query.room : null;
  const heroParam = typeof router.query.hero === "string" ? router.query.hero : null;

  return (
    <Box minH="100svh" bg={TABLE_BG} color="brand.parchment">
      {WS_URL ? <LiveGame room={room} heroParam={heroParam} /> : <PreviewGame />}
    </Box>
  );
};

export default ProGamePage;

// No getServerSideProps: the GitHub Pages deploy is a static `next export`,
// which has no server and no runtime env. NEXT_PUBLIC_PRO_WS_URL is baked in
// at build time; when it's absent the page falls back to the self-contained
// board demo above, so a Pages build with no backend still shows something
// honest instead of a broken table. Setting the variable in the Pages build
// (or any host) flips the same page to live mode.
