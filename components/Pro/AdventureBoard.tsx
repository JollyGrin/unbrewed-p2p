import {
  ADVENTURE_BOARD_MAX_HEIGHT,
  ADVENTURE_BOARD_TOP,
  ADVENTURE_BOARD_WIDTH,
  DOCK_RIGHT,
  DOCK_WIDTH,
} from "./dockLayout";
import { Box, Flex, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { AdventureBriefingModal, RulesButton } from "./AdventureBriefing";
import { EngineFaultBanner } from "./EngineFaultBanner";
import type { ViewFighter } from "@/lib/pro/protocol";
import { useAdventureAnalytics } from "@/lib/pro/useAdventureAnalytics";
import { useEnemyTurn } from "@/lib/pro/useEnemyTurn";
import { enemyTurnArrow, enemyTurnSummary } from "@/lib/pro/enemyTurn";
import { useBreakoutMoment } from "@/lib/pro/useBreakoutMoment";
import { BreakoutMomentOverlay } from "./BreakoutMoment";
import type { FormatOverlayProps } from "./FormatOverlay";
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
  InitiativeRowEntry,
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

const GOLD = "#E0A82E";
const ENEMY_RED = "#E58B8B";

const Portrait = ({ e, src }: { e: InitiativeRowEntry; src: string | null }) => {
  const enemy = e.who === "enemy";
  const initial = (e.name ?? e.label).trim().charAt(0).toUpperCase();
  return (
    <Flex
      w="2rem"
      h="2rem"
      borderRadius="full"
      overflow="hidden"
      align="center"
      justify="center"
      flexShrink={0}
      bg={enemy ? "rgba(229,139,139,0.22)" : "whiteAlpha.300"}
      border="2px solid"
      borderColor={e.state === "now" ? GOLD : enemy ? ENEMY_RED : "whiteAlpha.400"}
      boxShadow={e.state === "now" ? `0 0 8px 1px ${GOLD}` : "none"}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Text fontFamily="LeagueGothic" fontSize="1rem" color={enemy ? ENEMY_RED : "white"}>
          {initial}
        </Text>
      )}
    </Flex>
  );
};

/** Round & turn strip: ROUND n, the revealed row as portrait chips (done / now / up), the
 *  face-down remainder as card backs, and the END OF ROUND state. */
export const InitiativeRow = ({
  model,
  fighterTokenArt,
}: {
  model: AdventureBoardModel;
  fighterTokenArt?: (f: ViewFighter) => string | null;
}) => {
  const eor = model.phase === "END_OF_ROUND";
  return (
    <Flex direction="column" gap="0.3rem" data-testid="adv-initiative" data-phase={model.phase ?? undefined} {...PANEL}>
      {model.scenarioLabel && (
        <Text {...LBL} data-testid="adv-scenario" data-scenario-id={model.scenarioId ?? undefined}>
          {model.scenarioLabel.toUpperCase()}
        </Text>
      )}
      <Flex gap="0.6rem" align="baseline" wrap="wrap">
        <Text fontFamily="LeagueGothic" fontSize="1.3rem" letterSpacing="0.1em" lineHeight="1">
          ROUND{" "}
          <Text as="span" data-testid="adv-round">
            {model.round ?? "–"}
          </Text>
        </Text>
        {eor ? (
          <Text {...LBL} color={GOLD} opacity={1} data-testid="adv-phase">
            END OF ROUND{model.nowName ? ` · ${model.nowName.toUpperCase()}` : ""}
          </Text>
        ) : model.nowName ? (
          <Text {...LBL} color={GOLD} opacity={1} data-testid="adv-now">
            NOW · {model.nowName.toUpperCase()}
          </Text>
        ) : null}
        {model.initiativeDeckCount != null && (
          <Text {...LBL} data-testid="adv-initiative-deck">
            DECK {model.initiativeDeckCount}
          </Text>
        )}
      </Flex>
      <Flex gap="0.3rem" wrap="wrap" align="center" data-testid="adv-init-chips">
        {model.row.map((e) => {
          const down = e.state === "down";
          const src = e.fighter && fighterTokenArt ? fighterTokenArt(e.fighter) : null;
          return (
            <Flex
              key={e.card.id}
              data-testid={`adv-init-${e.card.id}`}
              data-card-art={e.artKey}
              data-spawned={e.spawnedFighter ? "true" : undefined}
              data-current={e.current ? "true" : undefined}
              data-face-down={down ? "true" : undefined}
              data-state={e.state}
              position="relative"
              direction="column"
              align="center"
              gap="0.1rem"
              opacity={e.state === "done" ? 0.45 : 1}
              title={e.name ?? e.label}
            >
              {down ? (
                <Box
                  w="1.5rem"
                  h="2rem"
                  borderRadius="sm"
                  border="1px solid"
                  borderColor="whiteAlpha.400"
                  bg="repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0 3px, rgba(255,255,255,0.04) 3px 6px)"
                />
              ) : (
                <Portrait e={e} src={src} />
              )}
              {e.state === "done" && (
                <Text position="absolute" top="-0.2rem" right="-0.2rem" fontSize="0.6rem" color="green.300" lineHeight="1">
                  ✓
                </Text>
              )}
              {!down && (
                <Text fontSize="0.55rem" maxW="3rem" noOfLines={1} color={e.state === "now" ? GOLD : "whiteAlpha.800"}>
                  {e.name ?? e.label}
                </Text>
              )}
            </Flex>
          );
        })}
        {model.stillToFlip > 0 && (
          <Text {...LBL} data-testid="adv-still-to-flip">
            {model.stillToFlip} STILL TO FLIP
          </Text>
        )}
      </Flex>
    </Flex>
  );
};

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
  objective,
}: {
  villain: EnemyDial;
  objective: string | null;
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
      {objective && (
        <Text fontSize="0.7rem" opacity={0.85} data-testid="adv-villain-objective">
          Objective: {objective}
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
      {win?.heroesDownSidekick && (
        <Text fontSize="0.7rem" fontWeight="bold" color="red.200" data-testid="adv-heroes-down">
          Your heroes are down — {win.heroesDownSidekick} is still standing
        </Text>
      )}
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

export { ENGINE_FAULT_FIXTURE, EngineFaultBanner } from "./EngineFaultBanner";

/** The whole Adventure overlay cluster. Renders nothing without adventure data. */
export const AdventureBoard = ({
  view,
  events,
  engineFault,
  fighterTokenArt,
  onBoardArrow,
}: FormatOverlayProps) => {
  useAdventureAnalytics(view, events);
  const [rulesOpen, setRulesOpen] = useState(false);
  // The ONE enemy-turn state (#1156): the narrator card below and the board's enemy→target arrow.
  const turn = useEnemyTurn(view, events);
  const arrow = enemyTurnArrow(turn);
  useEffect(() => {
    onBoardArrow?.(arrow);
  }, [onBoardArrow, arrow?.attacker, arrow?.target]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onBoardArrow?.(null), [onBoardArrow]);
  const breakout = useBreakoutMoment(view, events);
  const model = adventureBoardModel(view);
  if (!model) return null;
  const faulted = engineFault != null;
  // A stopped table has no one "choosing" and no mover: clear those indicators.
  const decision = faulted ? null : teamDecisionModel(view);
  // Nor does a finished one narrate (#1182): the end screen owns GAME_OVER.
  const enemyTurn = faulted || view.winner ? null : turn;
  const combat = enemyCombatModel(view);
  const others = model.enemies.filter((e) => e !== model.villain);
  return (
    <>
    <Flex
      data-testid="adventure-board"
      position="fixed"
      // Docked to the right edge under the chip cluster, NOT top-centre (#1114): the
      // seat plates flow left-to-right from the top-left and, with an enemy seat
      // among them, reach the middle of the screen at ~1500px. They stop 8.5rem
      // short of the right edge, and five 15rem plates end well before this column.
      top={ADVENTURE_BOARD_TOP}
      // ...and to the LEFT of the fixed Actions dock (z 140, right 0.75rem, 18.5rem
      // wide, from 7.5rem down) which otherwise fully covers the dials (#1128).
      right={ADVENTURE_BOARD_RIGHT}
      maxW={ADVENTURE_BOARD_WIDTH}
      // Capped to end above the hand fan (#1178) so nothing is tucked under it; the
      // static panels scroll inside, the live decision/narrator panels stay pinned.
      maxH={ADVENTURE_BOARD_MAX_HEIGHT}
      direction="column"
      align="flex-end"
      gap="0.4rem"
      zIndex={5}
      pointerEvents="none"
    >
      <Flex
        data-testid="adventure-board-scroll"
        direction="column"
        align="flex-end"
        gap="0.4rem"
        flex="1 1 auto"
        minH={0}
        w="100%"
        overflowY="auto"
        sx={{ "& > *": { pointerEvents: "auto", flexShrink: 0 } }}
      >
      {(model.row.length > 0 || model.round != null) && (
        <InitiativeRow model={model} fighterTokenArt={fighterTokenArt} />
      )}
      {model.villain && (
        <VillainHeader villain={model.villain} objective={model.objective} />
      )}
      <RulesButton onClick={() => setRulesOpen(true)} />
      <AdventureBriefingModal
        isOpen={rulesOpen}
        onClose={() => setRulesOpen(false)}
        label={view.scenario?.label ?? null}
        briefing={view.scenario?.briefing}
      />
      {model.threat && <ThreatTrack threat={model.threat} />}
      {model.objectives && model.objectives.slots.length > 0 && (
        <EnclosuresLost objectives={model.objectives} win={model.win} />
      )}
      {others.length > 0 && <EnemyDials enemies={others} />}
      {combat && <EnemyCombat sides={combat} />}
      </Flex>
      <Flex
        data-testid="adventure-board-live"
        direction="column"
        align="flex-end"
        gap="0.4rem"
        flex="none"
        w="100%"
      >
        {faulted && <EngineFaultBanner message={engineFault} />}
        {decision && <TeamDecision model={decision} />}
        {enemyTurn && <EnemyTurnCard state={enemyTurn} />}
      </Flex>
    </Flex>
    {/* A sibling, not a child: the column above is its own stacking context (z 5). */}
    <BreakoutMomentOverlay
      moment={breakout.moment}
      compact={!!view.prompt && view.prompt.player === view.you}
      onDone={breakout.dismiss}
    />
    </>
  );
};
