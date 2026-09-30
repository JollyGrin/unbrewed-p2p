import { Button, Flex, Menu, MenuButton, MenuItem, MenuList, Text } from "@chakra-ui/react";
import { useEffect, type ReactNode } from "react";
import { TbChevronDown } from "react-icons/tb";
import type { PlayerId } from "@/lib/pro/protocol";
import { publishAdventureSetup, useScenarios } from "@/lib/pro/adventureScenarios";
import { trackFormatOpened, trackLobbyConfigured } from "@/lib/analytics/adventure";
import {
  ADVENTURE_MAX_HUMANS,
  ADVENTURE_MIN_HUMANS,
  AdventureEnemyOption,
  AdventureSetup,
  NO_SCENARIO_REASON,
  adventureSeats,
  minionSlotCount,
  rosterOptions,
  scenarioFor,
  setHumans,
  setMinion,
  setScenario,
  setVillain,
} from "@/lib/pro/adventureLobby";

const LBL = { fontFamily: "SpaceGrotesk", fontSize: "0.58rem", letterSpacing: "0.16em", opacity: 0.75 } as const;

/** One villain / minion pick: Random, or a roster entry. Empty pool → Random only. */
const EnemyPick = ({
  testId,
  label,
  value,
  options,
  taken = [],
  allowRandom = true,
  onPick,
}: {
  testId: string;
  label: string;
  value: string | null;
  options: AdventureEnemyOption[];
  /** ids already held by another slot (no duplicate minions, R5) */
  taken?: Array<string | null>;
  /** false for a pick that has no random (the scenario) */
  allowRandom?: boolean;
  onPick: (id: string | null) => void;
}) => {
  const current = options.find((o) => o.id === value);
  return (
    <Flex align="center" gap="0.4rem">
      <Text {...LBL} w="4.2rem" flexShrink={0}>
        {label}
      </Text>
      <Menu placement="bottom-start">
        <MenuButton
          as={Button}
          data-testid={testId}
          size="xs"
          flex="1"
          minW="0"
          textAlign="left"
          fontFamily="SpaceGrotesk"
          fontWeight="normal"
          fontSize="0.66rem"
          bg="whiteAlpha.200"
          color="brand.parchment"
          _hover={{ bg: "whiteAlpha.400" }}
          _active={{ bg: "whiteAlpha.500" }}
          rightIcon={<TbChevronDown />}
        >
          {current ? current.name : allowRandom ? "Random" : "—"}
        </MenuButton>
        <MenuList bg="brand.surface" borderColor="whiteAlpha.300" maxH="14rem" overflowY="auto">
          {allowRandom && (
            <MenuItem onClick={() => onPick(null)} bg="transparent" _hover={{ bg: "whiteAlpha.100" }}>
              Random
            </MenuItem>
          )}
          {options.map((o) => (
            <MenuItem
              key={o.id}
              onClick={() => onPick(o.id)}
              isDisabled={taken.includes(o.id)}
              bg="transparent"
              _hover={{ bg: "whiteAlpha.100" }}
            >
              {o.name}
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    </Flex>
  );
};

/**
 * The Adventure lobby panel — mounted by format id in place of the regular seat
 * plates (Wave 4.2). The seat rail changes shape (1–4 hero seats + an engine
 * villain side), so it is its own surface rather than branches inside the regular
 * panel. Hero picks reuse the existing pickers: the creator picks theirs in the
 * roster, every other human picks on joining, a bot seat gets a server-rolled
 * hero. Seat plates come from the page via `renderSeat` so they stay identical to
 * the other formats'.
 */
export const AdventureLobby = ({
  setup,
  onChange,
  youSeat,
  renderSeat,
}: {
  setup: AdventureSetup;
  onChange: (next: AdventureSetup) => void;
  youSeat: ReactNode;
  renderSeat: (seat: PlayerId) => ReactNode;
}) => {
  const seats = adventureSeats(setup.humans);
  const { scenarios, loaded } = useScenarios();
  const scenario = scenarioFor(setup, scenarios);
  const roster = rosterOptions(scenario);
  const perPlayer = scenario?.minionsPerPlayer ?? 1;
  // No scenario listed once the server has answered: Create is refused at the wire
  // (never a fallback board, #1113) — say why here instead of failing on click.
  const noScenario = loaded && !scenario;
  // The socket builds CREATE_ROOM from this, not from page state.
  useEffect(() => {
    publishAdventureSetup(setup);
  }, [setup]);
  // Mounted only while the Adventure format is selected, so mount = tab opened.
  useEffect(() => {
    trackFormatOpened();
  }, []);
  const configure = (next: AdventureSetup) => {
    trackLobbyConfigured(next);
    onChange(next);
  };
  return (
    <Flex direction="column" gap="0.6rem" flex="1" minW="0" data-testid="adventure-lobby">
      <Flex align="center" gap="0.4rem">
        <Text {...LBL} w="4.2rem" flexShrink={0}>
          HEROES
        </Text>
        <Flex gap="0.3rem" role="group" aria-label="Number of heroes">
          {Array.from({ length: ADVENTURE_MAX_HUMANS - ADVENTURE_MIN_HUMANS + 1 }, (_, i) => ADVENTURE_MIN_HUMANS + i).map((n) => {
            const active = n === setup.humans;
            return (
              <Button
                key={n}
                type="button"
                size="xs"
                data-testid={`adventure-humans-${n}`}
                aria-pressed={active}
                onClick={() => configure(setHumans(setup, n, perPlayer))}
                fontFamily="SpaceGrotesk"
                fontWeight={active ? "bold" : "normal"}
                bg={active ? "brand.accent" : "rgba(0,0,0,0.25)"}
                color={active ? "brand.surfaceDim" : "brand.parchment"}
                _hover={{ bg: active ? "brand.accentDeep" : "whiteAlpha.300" }}
              >
                {n}
              </Button>
            );
          })}
        </Flex>
      </Flex>
      {noScenario && (
        <Text role="alert" data-testid="adventure-no-scenario" fontSize="0.7rem" color="#E58B8B">
          {NO_SCENARIO_REASON}
        </Text>
      )}
      {scenarios.length > 1 && (
        <EnemyPick
          testId="adventure-scenario"
          label="SCENARIO"
          value={scenario?.id ?? null}
          options={scenarios.map((s) => ({ id: s.id, name: s.label }))}
          allowRandom={false}
          onPick={(id) => configure(setScenario(setup, scenarios.find((s) => s.id === id) ?? null))}
        />
      )}
      <Flex gap="8px" align="stretch" minW="0" flexWrap="wrap" data-testid="adventure-seats">
        {youSeat}
        {seats.map((seat) => (
          <Flex key={seat} flex="1 1 0" minW="5.5rem">
            {renderSeat(seat)}
          </Flex>
        ))}
      </Flex>
      <Flex
        direction="column"
        gap="0.35rem"
        p="0.45rem 0.55rem"
        borderRadius="8px"
        border="1px solid rgba(255,255,255,0.12)"
        bg="rgba(180,60,60,0.12)"
        data-testid="adventure-enemy"
      >
        <Text {...LBL} color="#E58B8B">
          THE ENGINE PLAYS
        </Text>
        <EnemyPick
          testId="adventure-villain"
          label="VILLAIN"
          value={setup.villainId}
          options={roster.villains}
          onPick={(id) => configure(setVillain(setup, id))}
        />
        {setup.minionIds.slice(0, minionSlotCount(setup.humans, perPlayer)).map((m, slot) => (
          <EnemyPick
            key={slot}
            testId={`adventure-minion-${slot + 1}`}
            label={`MINION ${slot + 1}`}
            value={m}
            options={roster.minions}
            taken={setup.minionIds}
            onPick={(id) => configure(setMinion(setup, slot, id))}
          />
        ))}
      </Flex>
    </Flex>
  );
};
