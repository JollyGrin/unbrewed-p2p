import { Box, Flex, Skeleton, Spacer } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { PlayerBox } from "./header.components";
import { Carousel } from "../game.carousel";
import { useMemo } from "react";

export const HeaderContainer = () => {
  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName;

  const { gameState, setPlayerState } = useWebGame();

  const playerState = player ? gameState?.content?.players[player] : undefined;
  const setGameState = (poolInput: PoolType): void => {
    setPlayerState()({ pool: poolInput });
  };

  const players = gameState?.content?.players;
  const playerKeys = players && Object.keys(players);

  return (
    <Flex
      bg="purple"
      py={3}
      w="100%"
      justifyContent="space-between"
      alignItems="center"
      gap={"10px"}
    >
      {players && playerKeys ? (
        <Flex w="100%" overflowX={"auto"} overflowY={"clip"}>
          {playerKeys?.map((playerName) => (
            <Flex key={player} width="min-content">
              <Spacer width="0.5rem" />
              {players && players[playerName]?.pool && (
                <PlayerBox
                  key={Math.random()}
                  name={playerName}
                  playerState={players[playerName] as { pool: PoolType }}
                />
              )}
            </Flex>
          ))}
        </Flex>
      ) : (
        <Skeleton minHeight={"97.969px"} minWidth={"150px"} mx={2} />
      )}
    </Flex>
  );
};

// FIX: this causes the entire row to rerender on data updates, but the overflow method does not
//  Update this for the hand row
//
// <Carousel
//   items={playerKeys?.map((playerName) => (
//     <Flex key={player} width="min-content">
//       <Spacer width="0.5rem" />
//       {players[playerName]?.pool && (
//         <PlayerBox
//           key={Math.random()}
//           name={playerName}
//           playerState={players[playerName] as { pool: PoolType }}
//         />
//       )}
//     </Flex>
//   ))}
// />
