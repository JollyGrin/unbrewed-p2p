import { ADVENTURE_BOARD_WIDTH, DOCK_RIGHT, DOCK_WIDTH } from "./dockLayout";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";
import { useAdventureAnalytics } from "@/lib/pro/useAdventureAnalytics";
import { useEnemyTurn } from "@/lib/pro/useEnemyTurn";
import { enemyTurnSummary } from "@/lib/pro/enemyTurn";
import type { EnemyTurnState } from "@/lib/pro/enemyTurn";
import { TEAM_GUIDANCE, teamChoosingTitle } from "@/lib/pro/adventureCopy";
import {
  adventureBoardModel,
  enemyCombatModel,
  teamDecisionModel,
} from "@/lib/pro/adventureBoard";
import type {
  AdventureBoardModel,
  EnemyCombatSide,
  EnemyDial,
  TeamDecisionModel,
  ThreatModel,
} from "@/lib/pro/adventureBoard";

const LBL = {
  fontFamily: "SpaceGrotesk",
  fontSize: "0.58rem",
  letterSpacing: "0.16em",
  opacity: 0.75,
} as const;
// Purple glass, the same family as the seat plates and the Actions dock.
const PANEL = {
  bg: "rgba(20,8,24,0.72)",
  color: "white",
  border: "1px solid rgba(231,204,152,0.14)",
  borderRadius: "md",
  px: "0.6rem",
  py: "0.4rem",
  backdropFilter: "blur(4px)",
  // #1145: the column is align="flex-end" and clipped, so a panel wider than the column
  // overflowed to its LEFT, out of reach. Panels never exceed the column; rows wrap.
  minW: 0,
  maxW: "100%",
} as const;

export const InitiativeRow = ({ model }: { model: AdventureBoardModel }) => (
  <Flex
    direction="column"
    gap="0.25rem"
    data-testid="adv-initiative"
    {...PANEL}
  >
    {model.scenarioLabel && (
      <Text {...LBL} data-testid="adv-scenario" data-scenario-id={model.scenarioId ?? undefined}>
        {model.scenarioLabel.toUpperCase()}
      </Text>
    )}
    <Flex gap="0.6rem" align="baseline">
      <Text {...LBL}>ROUND</Text>
      <Text data-testid="adv-round" fontWeight="bold">
        {model.round ?? "–"}
      </Text>
      {model.initiativeDeckCount != null && (
        <Text {...LBL} data-testid="adv-initiative-deck">
          DECK {model.initiativeDeckCount}
        </Text>
      )}
    </Flex>
    <Flex gap="0.25rem" wrap="wrap" data-testid="adv-init-chips">
      {model.row.map((e) => (
        <Box
          key={e.card.id}
          data-testid={`adv-init-${e.card.id}`}
          data-card-art={e.artKey}
          data-spawned={e.spawnedFighter ? "true" : undefined}
          data-current={e.current ? "true" : undefined}
          data-face-down={e.card.faceDown ? "true" : undefined}
          px="0.4rem"
          py="0.15rem"
          borderRadius="sm"
          border="1px solid"
          borderColor={e.current ? "yellow.300" : "whiteAlpha.300"}
          bg={
            e.current
              ? "yellow.600"
              : e.card.faceDown
                ? "whiteAlpha.100"
                : "whiteAlpha.200"
          }
          fontSize="0.7rem"
        >
          {e.label}
        </Box>
      ))}
    </Flex>
  </Flex>
);

const Token = ({ name, size = "1.5rem" }: { name: string; size?: string }) => (
  <Flex
    data-testid="adv-token"
    flex="none"
    boxSize={size}
    align="center"
    justify="center"
    borderRadius="50%"
    border="1px solid rgba(224,168,46,0.55)"
    bg="radial-gradient(circle at 50% 30%, #3d2249 0%, #140818 80%)"
    fontSize="0.7rem"
    fontWeight="bold"
  >
    {name.slice(0, 1).toUpperCase()}
  </Flex>
);

export const VillainHeader = ({
  villain,
  wants,
}: {
  villain: EnemyDial;
  wants: string | null;
}) => {
  const pct = villain.maxHp > 0 ? Math.max(0, Math.min(1, villain.hp / villain.maxHp)) : 0;
  return (
    <Flex
      direction="column"
      gap="0.25rem"
      data-testid="adv-villain"
      data-enemy-id={villain.enemyId ?? undefined}
      {...PANEL}
    >
      <Flex gap="0.5rem" align="center">
        <Token name={villain.name} size="2.2rem" />
        <Flex direction="column" minW={0} flex="1">
          <Text {...LBL} data-testid="adv-villain-line">
            {villain.role} · {villain.size} · MOVE {villain.move}
          </Text>
          <Text fontWeight="bold" fontSize="0.95rem" lineHeight="1.1" data-testid="adv-villain-name">
            {villain.name}
          </Text>
        </Flex>
      </Flex>
      <Box h="6px" borderRadius="3px" bg="whiteAlpha.200" overflow="hidden">
        <Box h="100%" w={`${pct * 100}%`} bg="red.400" data-testid="adv-villain-hpbar" />
      </Box>
      <Flex gap="0.6rem" align="baseline">
        <Text data-testid={`adv-enemy-hp-${villain.id}`} fontWeight="bold" fontSize="0.8rem">
          {villain.hp}/{villain.maxHp}
          <Text as="span" {...LBL}>
            {" "}
            HP
          </Text>
        </Text>
        <Text {...LBL} data-testid={`adv-enemy-deck-${villain.id}`}>
          DECK {villain.deckCount}
        </Text>
      </Flex>
      {villain.lastPlayed && (
        <Text fontSize="0.7rem" opacity={0.85} data-testid="adv-villain-last-played">
          Last played: {villain.lastPlayed}
        </Text>
      )}
      {wants && (
        <Text fontSize="0.7rem" opacity={0.85} data-testid="adv-villain-wants">
          Wants: {wants}
        </Text>
      )}
    </Flex>
  );
};

export const ThreatTrack = ({ threat }: { threat: ThreatModel }) => (
  <Flex direction="column" gap="0.3rem" data-testid="adv-threat" {...PANEL}>
    <Flex gap="0.6rem" align="baseline" justify="space-between">
      <Text {...LBL}>THREAT TRACK</Text>
      <Text fontSize="0.7rem">
        level{" "}
        <Text as="span" data-testid="adv-threat-level" fontWeight="bold" fontSize="0.85rem">
          {threat.level}
        </Text>
      </Text>
    </Flex>
    <Flex gap="0.2rem" wrap="wrap">
      {threat.cells.map((c) => (
        <Flex
          key={c.space}
          data-testid={`adv-threat-${c.space}`}
          data-marker={c.marker ? "true" : undefined}
          w="1.5rem"
          h="1.5rem"
          align="center"
          justify="center"
          borderRadius="sm"
          border="1px solid"
          borderColor={c.marker ? "yellow.300" : "whiteAlpha.300"}
          bg={c.marker ? "yellow.600" : "whiteAlpha.100"}
          fontSize="0.75rem"
        >
          {c.value}
        </Flex>
      ))}
      <Flex
        data-testid="adv-threat-terminal"
        data-marker={threat.terminal.marker ? "true" : undefined}
        minW="3.6rem"
        h="1.5rem"
        px="0.25rem"
        align="center"
        justify="center"
        borderRadius="sm"
        border="1px solid"
        borderColor="red.300"
        bg="rgba(160,40,50,0.55)"
        fontSize="0.5rem"
        fontWeight="bold"
        lineHeight="1"
        textAlign="center"
        letterSpacing="0.04em"
      >
        {threat.terminal.label
          ? `${threat.terminal.label.toUpperCase()}`
          : "BREAKOUT"}
      </Flex>
    </Flex>
    <Text fontSize="0.7rem" opacity={0.9} data-testid="adv-threat-steps">
      <b>
        {threat.stepsToBreakout} step{threat.stepsToBreakout === 1 ? "" : "s"}
      </b>{" "}
      to the next breakout
      {threat.overflows > 0 && (
        <Text as="span" data-testid="adv-threat-overflows">
          {" "}
          · {threat.overflows} breakout{threat.overflows === 1 ? "" : "s"} so far
        </Text>
      )}
    </Text>
  </Flex>
);

export const EnclosuresLost = ({
  objectives,
  win,
}: {
  objectives: NonNullable<AdventureBoardModel["objectives"]>;
  win: AdventureBoardModel["win"];
}) => {
  const n = objectives.slots.length;
  return (
    <Flex direction="column" gap="0.3rem" data-testid="adv-objectives" {...PANEL}>
      <Flex align="baseline" justify="space-between" gap="0.4rem">
        <Text {...LBL}>ENCLOSURES LOST</Text>
        <Text fontSize="0.7rem" data-testid="adv-objectives-count">
          <b>{objectives.lost}</b> of {n} · the {n}
          {ordinal(n)} ends the game
        </Text>
      </Flex>
      <Flex gap="0.2rem">
        {objectives.slots.map((o, i) => (
          <Flex
            key={o.id}
            data-testid={`adv-objective-${i + 1}`}
            data-fired={o.fired ? "true" : undefined}
            data-lose={o.lose ? "true" : undefined}
            title={o.label}
            flex="1"
            minW={0}
            h="1.9rem"
            px="0.15rem"
            align="center"
            justify="center"
            borderRadius="sm"
            border="1px solid"
            borderColor={o.fired ? "red.300" : o.lose ? "red.700" : "whiteAlpha.300"}
            bg={o.fired ? "rgba(160,40,50,0.6)" : o.lose ? "rgba(120,30,40,0.25)" : "whiteAlpha.100"}
            fontSize="0.5rem"
            fontWeight="bold"
            textAlign="center"
            lineHeight="1.05"
            overflow="hidden"
          >
            {o.fired ? o.label : o.lose ? "LOSE" : i + 1}
          </Flex>
        ))}
      </Flex>
      {win && (
        <Text fontSize="0.7rem" opacity={0.9} data-testid="adv-win-line">
          To win: {win.villain} to 0
          {win.released.length > 0 && (
            <>
              {" "}
              <b>and</b>{" "}
              {win.released
                .map((r) => `${r.name} (${r.hp}/${r.maxHp})`)
                .join(", ")}{" "}
              defeated
            </>
          )}
        </Text>
      )}
    </Flex>
  );
};

const ordinal = (n: number) =>
  n % 100 >= 11 && n % 100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";

export const ADVENTURE_BOARD_RIGHT = `calc(${DOCK_RIGHT} + ${DOCK_WIDTH} + 0.75rem)`;

export const EnemyDials = ({
  enemies,
}: {
  enemies: AdventureBoardModel["enemies"];
}) => (
  <Flex direction="column" gap="0.3rem" data-testid="adv-enemies" {...PANEL}>
    {enemies.map((e) => (
      <Flex
        key={e.id}
        data-testid={`adv-enemy-${e.id}`}
        data-enemy-id={e.enemyId ?? undefined}
        gap="0.4rem"
        align="center"
        opacity={e.defeated ? 0.45 : 1}
      >
        <Token name={e.name} />
        <Flex direction="column" flex="1" minW={0}>
          <Text fontSize="0.75rem" fontWeight="bold" noOfLines={1}>
            {e.name}
            {e.released === true && (
              <Text
                as="span"
                {...LBL}
                ml="0.3rem"
                px="0.2rem"
                bg="rgba(160,40,50,0.45)"
                borderRadius="sm"
                data-testid={`adv-enemy-released-${e.id}`}
              >
                RELEASED
              </Text>
            )}
          </Text>
          <Text {...LBL} data-testid={`adv-enemy-meta-${e.id}`}>
            {e.size !== "NORMAL" ? `${e.size} · ` : ""}MOVE {e.move} · DECK{" "}
            <span data-testid={`adv-enemy-deck-${e.id}`}>{e.deckCount}</span>
          </Text>
        </Flex>
        {/* slot for the intent badge (p2p #1148) */}
        <Box data-testid={`adv-enemy-intent-slot-${e.id}`} flex="none" />
        <Text
          data-testid={`adv-enemy-hp-${e.id}`}
          fontWeight="bold"
          fontSize="0.8rem"
        >
          {e.hp}/{e.maxHp}
        </Text>
      </Flex>
    ))}
  </Flex>
);

export const TeamDecision = ({ model }: { model: TeamDecisionModel }) => (
  <Flex
    direction="column"
    gap="0.25rem"
    data-testid="adv-team-decision"
    data-you-choose={model.youChoose ? "true" : undefined}
    {...PANEL}
    borderWidth="1px"
    borderColor="yellow.300"
  >
    <Text {...LBL}>PLAYERS CHOOSE</Text>
    <Text data-testid="adv-team-decision-who" fontSize="0.8rem">
      {teamChoosingTitle(
        model.youChoose,
        model.chooser,
        model.forName,
        model.description,
      )}
    </Text>
    {model.youChoose && (
      <Text data-testid="adv-team-decision-guidance" fontSize="0.7rem" opacity={0.8}>
        {TEAM_GUIDANCE}
      </Text>
    )}
    {!model.youChoose && model.description && (
      <Text data-testid="adv-team-decision-what" fontSize="0.75rem">
        {model.description}
      </Text>
    )}
    {model.options.length > 0 && (
      <Flex gap="0.25rem" wrap="wrap" justify="center">
        {model.options.map((o) => (
          <Box
            key={o.id}
            data-testid={`adv-team-option-${o.id}`}
            px="0.4rem"
            py="0.15rem"
            borderRadius="sm"
            bg="whiteAlpha.200"
            fontSize="0.7rem"
          >
            {o.label}
          </Box>
        ))}
      </Flex>
    )}
  </Flex>
);

export const EnemyCombat = ({ sides }: { sides: EnemyCombatSide[] }) => (
  <Flex
    direction="column"
    gap="0.2rem"
    data-testid="adv-enemy-combat"
    {...PANEL}
  >
    {sides.map((s) => (
      <Flex
        key={s.role}
        data-testid={`adv-combat-${s.role.toLowerCase()}`}
        gap="0.6rem"
        align="baseline"
      >
        <Text {...LBL}>{s.role === "ATTACK" ? "ATTACK" : "DEFENSE"}</Text>
        <Text fontSize="0.75rem" flex="1">
          {s.title}{" "}
          <Text
            as="span"
            opacity={0.7}
            data-testid={`adv-combat-owner-${s.role.toLowerCase()}`}
          >
            · {s.enemyName} ({s.enemyRole === "VILLAIN" ? "Villain" : "Minion"})
          </Text>
        </Text>
        {s.printed != null && s.printed !== s.effective && (
          <Text
            {...LBL}
            data-testid={`adv-combat-printed-${s.role.toLowerCase()}`}
          >
            PRINTED {s.printed}
          </Text>
        )}
        <Text
          data-testid={`adv-combat-value-${s.role.toLowerCase()}`}
          fontWeight="bold"
        >
          {s.effective}
        </Text>
      </Flex>
    ))}
  </Flex>
);

export const EnemyTurnCard = ({ state }: { state: EnemyTurnState }) => {
  const m = state.model;
  if (state.collapsed)
    return (
      <Text data-testid="adv-enemy-turn-summary" {...PANEL} fontSize="0.7rem" opacity={0.8}>
        {enemyTurnSummary(m)}
      </Text>
    );
  return (
    <Flex
      direction="column"
      gap="0.25rem"
      data-testid="adv-enemy-turn"
      data-outcome={m.outcome}
      {...PANEL}
      borderWidth="1px"
      borderColor="red.400"
    >
      <Flex justify="space-between" align="baseline" gap="0.5rem">
        <Text {...LBL} opacity={1} data-testid="adv-enemy-turn-title">
          {m.enemyName.toUpperCase()}&apos;S TURN
        </Text>
        {m.moveLine && (
          <Text {...LBL} data-testid="adv-enemy-turn-move">
            {m.moveLine}
          </Text>
        )}
      </Flex>
      {m.steps.map((s) => (
        <Flex
          key={s.n}
          data-testid={`adv-enemy-step-${s.n}`}
          data-lit={s.lit ? "true" : "false"}
          gap="0.4rem"
          align="baseline"
          opacity={s.lit ? 1 : 0.4}
          fontWeight={s.lit ? "bold" : "normal"}
          fontSize="0.72rem"
        >
          <Text as="span">{s.n}</Text>
          <Text as="span" flex="1">
            {s.label}
          </Text>
          <Text as="span" opacity={0.85}>
            → {s.does}
          </Text>
        </Flex>
      ))}
      <Text data-testid="adv-enemy-turn-result" fontSize="0.75rem">
        {m.consequence}
      </Text>
      {m.attack && (
        <Flex data-testid="adv-enemy-turn-attack" gap="0.5rem" align="baseline">
          <Text {...LBL}>ATTACK</Text>
          <Text fontSize="0.75rem" flex="1">
            {m.attack.title}
            {m.attack.defender ? (
              <Text as="span" opacity={0.7}>
                {" "}
                · vs {m.attack.defender}
              </Text>
            ) : null}
          </Text>
          {m.attack.value != null && (
            <Text fontWeight="bold" data-testid="adv-enemy-turn-attack-value">
              {m.attack.value}
            </Text>
          )}
        </Flex>
      )}
    </Flex>
  );
};

export const ENGINE_FAULT_FIXTURE =
  "room ab12: resolving ENEMY_TURN — TypeError: cannot read properties of undefined (reading 'hp')";

/**
 * Table-level "game stopped" state (engine #666, A26): a persistent banner, not a toast.
 * The board stays as last drawn; the only ways out are leave / new game.
 */
export const EngineFaultBanner = ({
  message,
  onLeave = () => {
    window.location.href = "/pro/game";
  },
}: {
  message: string;
  onLeave?: () => void;
}) => (
  <Flex
    role="alert"
    data-testid="adv-engine-fault"
    direction="column"
    gap="0.4rem"
    align="center"
    pointerEvents="auto"
    {...PANEL}
    maxW="32rem"
    borderWidth="1px"
    borderColor="red.400"
  >
    <Text fontWeight="bold" fontSize="0.9rem" data-testid="adv-engine-fault-title">
      This game hit an engine fault and was stopped
    </Text>
    <Text fontSize="0.7rem" opacity={0.8}>
      Nobody won — the board is frozen as it was. Copy the details below when you report it.
    </Text>
    <Box
      as="pre"
      data-testid="adv-engine-fault-message"
      w="100%"
      p="0.4rem"
      bg="blackAlpha.600"
      borderRadius="sm"
      fontSize="0.65rem"
      whiteSpace="pre-wrap"
      wordBreak="break-word"
      userSelect="all"
    >
      {message}
    </Box>
    <Flex gap="0.4rem">
      <Button
        size="xs"
        data-testid="adv-engine-fault-copy"
        onClick={() => {
          try {
            void navigator.clipboard?.writeText(message);
          } catch {
            /* clipboard unavailable — the text is select-all */
          }
        }}
      >
        Copy diagnostic
      </Button>
      <Button size="xs" colorScheme="red" data-testid="adv-engine-fault-leave" onClick={onLeave}>
        Leave / new game
      </Button>
    </Flex>
  </Flex>
);

/** The whole Adventure overlay cluster. Renders nothing without adventure data. */
export const AdventureBoard = ({
  view,
  events,
  engineFault,
}: {
  view: PlayerView;
  events?: readonly GameEvent[];
  engineFault?: string | null;
}) => {
  useAdventureAnalytics(view, events);
  const turn = useEnemyTurn(view, events);
  const model = adventureBoardModel(view);
  if (!model) return null;
  const faulted = engineFault != null;
  // A stopped table has no one "choosing" and no mover: clear those indicators.
  const decision = faulted ? null : teamDecisionModel(view);
  const enemyTurn = faulted ? null : turn;
  const combat = enemyCombatModel(view);
  const others = model.enemies.filter((e) => e !== model.villain);
  return (
    <Flex
      data-testid="adventure-board"
      position="fixed"
      // Docked to the right edge under the chip cluster, NOT top-centre (#1114): the
      // seat plates flow left-to-right from the top-left and, with an enemy seat
      // among them, reach the middle of the screen at ~1500px. They stop 8.5rem
      // short of the right edge, and five 15rem plates end well before this column.
      top="3.2rem"
      // ...and to the LEFT of the fixed Actions dock (z 140, right 0.75rem, 18.5rem
      // wide, from 7.5rem down) which otherwise fully covers the dials (#1128).
      right={ADVENTURE_BOARD_RIGHT}
      maxW={ADVENTURE_BOARD_WIDTH}
      maxH="calc(100vh - 4rem)"
      overflowY="auto"
      direction="column"
      align="flex-end"
      gap="0.4rem"
      zIndex={5}
      pointerEvents="none"
    >
      {(model.row.length > 0 || model.round != null) && (
        <InitiativeRow model={model} />
      )}
      {model.villain && (
        <VillainHeader villain={model.villain} wants={model.wants} />
      )}
      {model.threat && <ThreatTrack threat={model.threat} />}
      {model.objectives && model.objectives.slots.length > 0 && (
        <EnclosuresLost objectives={model.objectives} win={model.win} />
      )}
      {others.length > 0 && <EnemyDials enemies={others} />}
      {combat && <EnemyCombat sides={combat} />}
      {faulted && <EngineFaultBanner message={engineFault} />}
      {decision && <TeamDecision model={decision} />}
      {enemyTurn && <EnemyTurnCard state={enemyTurn} />}
    </Flex>
  );
};
