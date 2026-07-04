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
import mendedDrum from "@/lib/pro/fixtures/mended-drum.map.json";

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

/** The reveal beat + running combat math, straight from the server view. */
const CombatPanel = ({ combat, catalog }: { combat: ViewCombat; catalog: Record<string, CardMeta> }) => (
  <Box bg="brand.surface" border="1px solid" borderColor="whiteAlpha.300" borderRadius="0.5rem" p="0.75rem">
    <Flex gap="0.5rem" alignItems="center" mb="0.4rem">
      <Tag colorScheme="red" size="sm">
        COMBAT
      </Tag>
      <Text fontSize="0.8rem" opacity={0.7}>
        {combat.stage.replace(/_/g, " ").toLowerCase()}
      </Text>
    </Flex>
    <Flex gap="1rem" fontSize="0.9rem">
      <Box>
        <Text opacity={0.6} fontSize="0.75rem">
          attack
        </Text>
        <Text>
          {combat.attackerCard
            ? `${cardLabel(catalog, combat.attackerCard.instance)} → ${combat.attackerCard.effectiveValue}${
                combat.attackerCard.boosts.length ? ` (+${combat.attackerCard.boosts.length} boost)` : ""
              }`
            : "face-down"}
        </Text>
      </Box>
      <Box>
        <Text opacity={0.6} fontSize="0.75rem">
          defense
        </Text>
        <Text>
          {combat.defenderCard
            ? `${cardLabel(catalog, combat.defenderCard.instance)} → ${combat.defenderCard.effectiveValue}${
                combat.defenderCard.boosts.length ? ` (+${combat.defenderCard.boosts.length} boost)` : ""
              }`
            : combat.stage === "COMMIT_DEFENSE"
              ? "deciding…"
              : "none"}
        </Text>
      </Box>
      {combat.outcome && (
        <Box>
          <Text opacity={0.6} fontSize="0.75rem">
            outcome
          </Text>
          <Text>
            {combat.outcome.replace(/_/g, " ").toLowerCase()}
            {combat.attackDamageDealt !== null ? ` · ${combat.attackDamageDealt} dmg` : ""}
          </Text>
        </Box>
      )}
    </Flex>
  </Box>
);

// ---------------------------------------------------------------------------
// LIVE mode
// ---------------------------------------------------------------------------

const LiveGame = ({ room }: { room: string | null }) => {
  const { status, roomId, snapshot, opponentConnected, error, createRoom, joinRoom, sendAction, respondToPrompt } =
    useProSocket(WS_URL);
  const [joined, setJoined] = useState(false);

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
  if (!snapshot)
    return (
      <Text pt="4rem" textAlign="center" opacity={0.7}>
        waiting for game state… ({status}
        {roomId ? `, room ${roomId}` : ""})
      </Text>
    );

  const { view, legalActions, prompt } = snapshot;
  const myTurn = view.activePlayer === view.you;
  // RESPOND_PROMPT actions render through the PromptPanel, not the action list.
  const listActions = legalActions.filter((a) => a.type !== "RESPOND_PROMPT");

  // Board affordances derive ONLY from what the server offered.
  const highlightedSpaces = legalActions.flatMap((a) =>
    a.type === "PLACE_SIDEKICK" ? [a.space] : a.type === "MOVE_FIGHTER" ? [a.path[a.path.length - 1]] : []
  );
  const highlightedFighters = legalActions.flatMap((a) => (a.type === "DECLARE_ATTACK" ? [a.target] : []));

  return (
    <Grid templateColumns={{ base: "1fr", lg: "1fr 22rem" }} gap="1rem" p="1rem" maxW="90rem" mx="auto">
      <ProBoard
        map={view.map}
        fighters={view.fighters}
        highlightedSpaces={[...new Set(highlightedSpaces)]}
        highlightedFighters={[...new Set(highlightedFighters)]}
      />
      <Flex direction="column" gap="0.75rem">
        <Flex gap="0.5rem" alignItems="center" flexWrap="wrap">
          <Tag colorScheme={myTurn ? "yellow" : "gray"}>{myTurn ? "YOUR TURN" : "OPPONENT'S TURN"}</Tag>
          <Tag>turn {view.turnNumber}</Tag>
          <Tag>{view.actionsRemaining} actions left</Tag>
          {!opponentConnected && <Tag colorScheme="red">opponent disconnected</Tag>}
          {roomId && <Tag>room {roomId}</Tag>}
        </Flex>
        {view.combat && <CombatPanel combat={view.combat} catalog={view.catalog} />}
        {prompt && <PromptPanel prompt={prompt} you={view.you} onRespond={respondToPrompt} />}
        <Flex direction="column" gap="0.4rem">
          {listActions.map((a, i) => (
            <Button key={i} {...BTN} justifyContent="flex-start" onClick={() => sendAction(a)}>
              {describeAction(view.catalog, a)}
            </Button>
          ))}
          {legalActions.length === 0 && !prompt && (
            <Text opacity={0.6} fontSize="0.9rem">
              waiting on opponent…
            </Text>
          )}
        </Flex>
        <Box>
          <Text fontSize="0.8rem" opacity={0.6} mb="0.25rem">
            your hand ({view.self.hand.length}) · deck {view.self.deckCount} · opponent hand {view.opponent.handCount}
            {view.opponent.hasCommitted ? " · opponent committed a card" : ""}
          </Text>
          <Flex gap="0.3rem" flexWrap="wrap">
            {view.self.hand.map((c) => (
              <Tag key={c} size="sm">
                {cardLabel(view.catalog, c)}
              </Tag>
            ))}
          </Flex>
        </Box>
        {view.winner && (
          <Text fontFamily="LeagueGothic" fontSize="2rem" color="brand.accent">
            {view.winner === view.you ? "VICTORY!" : "DEFEAT"}
          </Text>
        )}
      </Flex>
    </Grid>
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
    <Box minH="100svh" bg="brand.surfaceDim" color="brand.parchment">
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
