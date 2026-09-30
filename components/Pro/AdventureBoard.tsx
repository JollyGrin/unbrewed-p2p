import { Box, Flex, Text } from "@chakra-ui/react";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";
import {
  adventureBoardModel,
  enemyCombatModel,
  moverIntent,
  teamDecisionModel,
} from "@/lib/pro/adventureBoard";
import type {
  AdventureBoardModel,
  EnemyCombatSide,
  TeamDecisionModel,
} from "@/lib/pro/adventureBoard";

const LBL = {
  fontFamily: "SpaceGrotesk",
  fontSize: "0.58rem",
  letterSpacing: "0.16em",
  opacity: 0.75,
} as const;
const PANEL = {
  bg: "rgba(10,10,14,0.78)",
  color: "white",
  borderRadius: "md",
  px: "0.6rem",
  py: "0.4rem",
  backdropFilter: "blur(4px)",
} as const;

export const InitiativeRow = ({ model }: { model: AdventureBoardModel }) => (
  <Flex
    direction="column"
    gap="0.25rem"
    data-testid="adv-initiative"
    {...PANEL}
  >
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
    <Flex gap="0.25rem">
      {model.row.map((e) => (
        <Box
          key={e.card.id}
          data-testid={`adv-init-${e.card.id}`}
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

export const ThreatTrack = ({
  threat,
}: {
  threat: NonNullable<AdventureBoardModel["threat"]>;
}) => (
  <Flex direction="column" gap="0.25rem" data-testid="adv-threat" {...PANEL}>
    <Flex gap="0.6rem" align="baseline">
      <Text {...LBL}>THREAT</Text>
      <Text data-testid="adv-threat-level" fontWeight="bold">
        {threat.level}
      </Text>
    </Flex>
    <Flex gap="0.2rem">
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
          borderColor={c.marker ? "red.300" : "whiteAlpha.300"}
          bg={c.marker ? "red.600" : "whiteAlpha.100"}
          fontSize="0.75rem"
        >
          {c.value}
        </Flex>
      ))}
    </Flex>
  </Flex>
);

export const EnemyDials = ({
  enemies,
}: {
  enemies: AdventureBoardModel["enemies"];
}) => (
  <Flex direction="column" gap="0.2rem" data-testid="adv-enemies" {...PANEL}>
    {enemies.map((e) => (
      <Flex
        key={e.id}
        data-testid={`adv-enemy-${e.id}`}
        gap="0.6rem"
        align="baseline"
        opacity={e.defeated ? 0.45 : 1}
      >
        <Text fontSize="0.75rem" flex="1">
          {e.name}
        </Text>
        <Text
          data-testid={`adv-enemy-hp-${e.id}`}
          fontWeight="bold"
          fontSize="0.8rem"
        >
          {e.hp}/{e.maxHp}
        </Text>
        <Text {...LBL} data-testid={`adv-enemy-deck-${e.id}`}>
          DECK {e.deckCount}
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
      {model.youChoose ? "You choose" : `${model.chooser} is choosing`}
      {model.forName ? ` for ${model.forName}` : ""}
    </Text>
    {model.description && (
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

/** The whole Adventure overlay cluster. Renders nothing without adventure data. */
export const AdventureBoard = ({
  view,
  events,
}: {
  view: PlayerView;
  events?: readonly GameEvent[];
}) => {
  const model = adventureBoardModel(view);
  if (!model) return null;
  const decision = teamDecisionModel(view);
  const intent = moverIntent(events, view);
  const combat = enemyCombatModel(view);
  return (
    <Flex
      data-testid="adventure-board"
      position="fixed"
      top="4.5rem"
      left="50%"
      transform="translateX(-50%)"
      direction="column"
      align="center"
      gap="0.4rem"
      zIndex={5}
      pointerEvents="none"
    >
      {(model.row.length > 0 || model.round != null) && (
        <InitiativeRow model={model} />
      )}
      {model.threat && <ThreatTrack threat={model.threat} />}
      {model.enemies.length > 0 && <EnemyDials enemies={model.enemies} />}
      {combat && <EnemyCombat sides={combat} />}
      {decision && <TeamDecision model={decision} />}
      {intent && (
        <Text data-testid="adv-intent" {...PANEL} fontSize="0.75rem">
          {intent}
        </Text>
      )}
    </Flex>
  );
};
