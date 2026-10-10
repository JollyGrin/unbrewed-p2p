import { Flex, Text } from "@chakra-ui/react";
import { enemyHpAt, enemySizeMove, heroSeatRange, waitingRoster } from "@/lib/pro/adventureLobby";
import { useScenarios } from "@/lib/pro/adventureScenarios";
import type { ProRoomInfo } from "@/lib/pro/useProSocket";
import { EnemyToken } from "@/components/Pro/EnemyToken";

/**
 * The Adventure waiting room (#1153): says it is an Adventure — never the duel
 * "opponent / random board" line — names the scenario and shows the resolved roster
 * from `ROOM_STATUS.scenario` (null slots = still Random until the game starts).
 * Seen by the host and by a guest who joined by link.
 */
export const AdventureWaitingRoom = ({ roomInfo }: { roomInfo: ProRoomInfo }) => {
  const { scenarios } = useScenarios();
  const status = roomInfo.scenario ?? null;
  const label = status?.label ?? scenarios[0]?.label ?? null;
  const required = roomInfo.requiredPlayers;
  const seated = roomInfo.seats.length;
  const rows = status ? waitingRoster(status, scenarios) : [];
  const seatRange = heroSeatRange(scenarios.find((s) => s.id === status?.id) ?? null);
  return (
    <Flex direction="column" align="center" gap="0.6rem" data-testid="adventure-waiting">
      <Text opacity={0.85} textAlign="center" data-testid="adventure-waiting-line">
        Adventure{label ? ` · ${label}` : ""} · co-op
        {required > 1
          ? ` — waiting for heroes, ${seated}/${required} seats joined. Share the same link with everyone.`
          : " — starting."}
      </Text>
      {rows.length > 0 && (
        <Flex direction="column" gap="0.35rem" p="0.6rem 0.8rem" borderRadius="10px" bg="rgba(180,60,60,0.12)" border="1px solid rgba(229,139,139,0.28)" minW="16rem" data-testid="adventure-waiting-roster">
          <Text fontFamily="SpaceGrotesk" fontSize="0.58rem" letterSpacing="0.16em" color="#E58B8B" fontWeight="bold">
            YOU FACE
          </Text>
          {rows.map((r, i) => (
            <Flex key={i} align="center" gap="0.5rem" data-testid={`adventure-waiting-enemy-${i}`}>
              <EnemyToken name={r.name} size="1.8rem" villain={r.role === "VILLAIN"} />
              <Flex direction="column" flex="1" minW={0}>
                <Text fontFamily="SpaceGrotesk" fontSize="0.52rem" letterSpacing="0.14em" opacity={0.7}>
                  {r.role}
                </Text>
                <Text fontFamily="SpaceGrotesk" fontSize="0.8rem" fontWeight="bold">
                  {r.name}
                </Text>
              </Flex>
              {r.enemy && (
                <Text fontFamily="SpaceGrotesk" fontSize="0.64rem" textAlign="right" opacity={0.85}>
                  <b>{enemyHpAt(r.enemy, required, seatRange) ?? "?"}</b> HP · {enemySizeMove(r.enemy)}
                </Text>
              )}
            </Flex>
          ))}
        </Flex>
      )}
    </Flex>
  );
};
