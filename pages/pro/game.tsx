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
  FighterId,
  PendingPrompt,
  ProMapDef,
  SpaceId,
  ViewFighter,
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

/** Presentational label for a server-offered action. */
const describeAction = (a: Action): string => {
  switch (a.type) {
    case "MANEUVER":
      return "Maneuver";
    case "BOOST_MOVE":
      return `Boost move (discard ${a.card.split("#")[0]})`;
    case "MOVE_FIGHTER":
      return `Move ${a.fighter.split("/")[1]}`;
    case "END_MANEUVER":
      return "End maneuver";
    case "SCHEME":
      return `Scheme: ${a.card.split("#")[0]}`;
    case "DECLARE_ATTACK":
      return `Attack ${a.target.split("/")[1]} with ${a.attacker.split("/")[1]}`;
    case "COMMIT_ATTACK_CARD":
      return `Commit ${a.card.split("#")[0]}`;
    case "COMMIT_DEFENSE_CARD":
      return `Defend with ${a.card.split("#")[0]}`;
    case "DECLINE_DEFENSE":
      return "Don't defend";
    case "DISCARD_TO_LIMIT":
      return `Discard ${a.card.split("#")[0]}`;
    case "PLACE_SIDEKICK":
      return `Place ${a.fighter.split("/")[1]} on ${a.space}`;
  }
};

const PromptPanel = ({
  prompt,
  onRespond,
}: {
  prompt: PendingPrompt;
  onRespond: (promptId: string, optionId: string) => void;
}) => (
  <Box bg="brand.surface" border="2px solid" borderColor="brand.accent" borderRadius="0.5rem" p="1rem">
    <Text fontFamily="ArchivoNarrow" fontWeight="bold" mb="0.5rem" color="brand.accent">
      {prompt.kind.replace(/_/g, " ")}
    </Text>
    <Flex gap="0.5rem" flexWrap="wrap">
      {prompt.options.map((o) => (
        <Button key={o.id} {...BTN_GOLD} onClick={() => onRespond(prompt.promptId, o.id)}>
          {o.label}
        </Button>
      ))}
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

  // v1: hero select happens on /pro; carry heroId via query later. Placeholder
  // until the lobby flow lands (T-019 follow-up).
  const heroId = "kdKM";

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
        {prompt && <PromptPanel prompt={prompt} onRespond={respondToPrompt} />}
        <Flex direction="column" gap="0.4rem">
          {legalActions.map((a, i) => (
            <Button key={i} {...BTN} justifyContent="flex-start" onClick={() => sendAction(a)}>
              {describeAction(a)}
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
          </Text>
          <Flex gap="0.3rem" flexWrap="wrap">
            {view.self.hand.map((c) => (
              <Tag key={c} size="sm">
                {c.split("#")[0]}
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
