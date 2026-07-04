/**
 * Pro game page — renders the server's view, offers legalActions, answers
 * prompts. Contains ZERO rules logic (docs/pro/01-context.md).
 *
 * Modes:
 * - LIVE: NEXT_PUBLIC_PRO_WS_URL is set → connects via useProSocket.
 *   `?room=<id>` joins; no room param creates one.
 * - PREVIEW (dev only): no WS URL configured → renders the Mended Drum
 *   fixture with placeholder fighters so board rendering can be verified
 *   without the backend. Clicking a fighter shows its movement out-edges
 *   (adjacentTo ∪ oneWayTo) — that's reading MAP data for display, not rules.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Box, Button, Flex, Grid, Tag, Text } from "@chakra-ui/react";
import { ProBoard } from "@/components/Pro/ProBoard";
import {
  Action,
  CardInstanceId,
  CardMeta,
  FighterId,
  PlayerView,
  ProMapDef,
  SpaceId,
  ViewCombat,
  ViewFighter,
  ViewPrompt,
} from "@/lib/pro/protocol";
import { useProSocket } from "@/lib/pro/useProSocket";
import { ResolveCard, useProCardArt } from "@/lib/pro/useProCardArt";
import { CardFace, ProHand } from "@/components/Pro/ProHand";
import { ProHud } from "@/components/Pro/ProHud";
import mendedDrum from "@/lib/pro/fixtures/mended-drum.map.json";

/** same table felt the sandbox game uses (game.layout.tsx) */
const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";

const WS_URL = process.env.NEXT_PUBLIC_PRO_WS_URL;

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

const PromptPanel = ({
  prompt,
  you,
  onRespond,
}: {
  prompt: ViewPrompt;
  you: PlayerView["you"];
  onRespond: (promptId: string, optionId: string) => void;
}) => (
  <Box bg="brand.surface" border="2px solid" borderColor="brand.accent" borderRadius="0.5rem" p="1rem">
    <Text fontFamily="ArchivoNarrow" fontWeight="bold" mb="0.5rem" color="brand.accent">
      {prompt.kind.replace(/_/g, " ")}
    </Text>
    {prompt.player === you ? (
      <Flex gap="0.5rem" flexWrap="wrap">
        {prompt.options.map((o) => (
          <Button key={o.id} {...BTN_GOLD} onClick={() => onRespond(prompt.promptId, o.id)}>
            {o.label}
          </Button>
        ))}
      </Flex>
    ) : (
      <Text opacity={0.7} fontSize="0.9rem">
        opponent is deciding…
      </Text>
    )}
  </Box>
);

/** One combat slot: revealed card face, own face-down commit, or a card back. */
const CombatSlot = ({
  label,
  card,
  detail,
  resolveCard,
  facedownInstance,
  facedownState,
  catalog,
}: {
  label: string;
  card: ViewCombat["attackerCard"];
  detail?: string;
  resolveCard: ResolveCard;
  /** own committed instance when this slot is mine and unrevealed */
  facedownInstance: CardInstanceId | null;
  facedownState: "committed" | "deciding" | "none";
  catalog: Record<string, CardMeta>;
}) => (
  <Box textAlign="center">
    <Text opacity={0.6} fontSize="0.75rem" mb="0.25rem">
      {label}
    </Text>
    <Box w="6.5rem" sx={{ aspectRatio: "63 / 88" }} mx="auto" position="relative">
      {card ? (
        <CardFace card={resolveCard(card.instance)} fallback={cardLabel(catalog, card.instance)} />
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
// LIVE mode
// ---------------------------------------------------------------------------

const LiveGame = ({ room }: { room: string | null }) => {
  const { status, roomId, snapshot, opponentConnected, error, createRoom, joinRoom, sendAction, respondToPrompt } =
    useProSocket(WS_URL);
  const [joined, setJoined] = useState(false);
  const [selectedFighter, setSelectedFighter] = useState<FighterId | null>(null);
  // Art fetch (unbrewed-api, matched by title against the server catalog) —
  // must run unconditionally; no-ops until the first STATE arrives.
  const { resolveCard, resolveHero } = useProCardArt(
    snapshot ? [snapshot.view.self.heroId, snapshot.view.opponent.heroId] : [],
    snapshot?.view.catalog ?? {}
  );

  // v1: single shipped hero. Hero select moves to /pro with LIST_HEROES when
  // deck #2 lands (T-019 follow-up). Server hero ids, not unbrewed-api deck ids.
  const heroId = "king-kong";

  if (!joined) {
    return (
      <Flex direction="column" alignItems="center" gap="1rem" pt="4rem">
        <Text fontFamily="LeagueGothic" fontSize="2.5rem" letterSpacing="0.05em">
          {room ? `JOIN ROOM ${room}` : "CREATE A ROOM"}
        </Text>
        <Text opacity={0.7}>server: {status}</Text>
        <Button
          {...BTN_GOLD}
          isDisabled={status !== "open"}
          onClick={() => {
            room ? joinRoom(room, heroId) : createRoom(heroId);
            setJoined(true);
          }}
        >
          {room ? "Join" : "Create"}
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

  // Optional filter: click one of your movable fighters to see only ITS moves
  // (matters once a deck has sidekicks; harmless in the Kong mirror).
  const spaceMatches = (actions: Action[]) =>
    selectedFighter
      ? actions.filter((a) => a.type !== "MOVE_FIGHTER" || a.fighter === selectedFighter)
      : actions;
  const highlightedSpaces = [...spaceActions.entries()]
    .filter(([, actions]) => spaceMatches(actions).length > 0)
    .map(([space]) => space);
  const highlightedFighters = [...attackActions.keys(), ...movableFighters];

  const onSpaceClick = (space: SpaceId) => {
    const candidates = spaceMatches(spaceActions.get(space) ?? []);
    if (candidates.length === 0) return;
    sendAction(candidates[0]);
    setSelectedFighter(null);
  };
  const onFighterClick = (id: FighterId) => {
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
          {prompt && <PromptPanel prompt={prompt} you={view.you} onRespond={respondToPrompt} />}
          <Flex direction="column" gap="0.4rem">
            {listActions.map((a, i) => (
              <Button key={i} {...BTN} bg="rgba(20, 8, 24, 0.65)" justifyContent="flex-start" onClick={() => sendAction(a)}>
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
          DEV PREVIEW — no server
        </Tag>
        <Text fontSize="0.9rem" opacity={0.8}>
          {PREVIEW_MAP.meta.title} fixture. Click a fighter, then a highlighted space to slide it one step
          (out-edges = adjacentTo ∪ oneWayTo, straight off the map graph — try the stairs at s12: one-way down
          to s13, no way back).
        </Text>
        <Text fontSize="0.8rem" opacity={0.6}>
          Live mode activates when NEXT_PUBLIC_PRO_WS_URL is set.
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

  return (
    <Box minH="100svh" bg={TABLE_BG} color="brand.parchment">
      {WS_URL ? <LiveGame room={room} /> : <PreviewGame />}
    </Box>
  );
};

export default ProGamePage;

// Preview mode must not ship: without a WS URL in prod, 404 the page.
export const getServerSideProps = async () => {
  if (!process.env.NEXT_PUBLIC_PRO_WS_URL && process.env.NODE_ENV === "production") {
    return { notFound: true };
  }
  return { props: {} };
};
