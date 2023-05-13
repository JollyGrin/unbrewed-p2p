import { Box, Flex, Skeleton, Spacer } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { useScroll } from "@/lib/hooks";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { PlayerBox } from "./header.components";
import { Carousel } from "../game.carousel";
import { RefObject, useEffect, useMemo, useRef } from "react";
import { CarouselTray } from "../game.styles";

export const HeaderContainer = () => {
  const carouselRef = useRef();
  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName;

  const { gameState, setPlayerState } = useWebGame();
  const setGameState = (poolInput: PoolType): void => {
    setPlayerState()({ pool: poolInput });
  };

  const players = gameState?.content?.players;
  const playerKeys = players && Object.keys(players);

  const {
    setRef,
    handleMouseLeave,
    handleMouseUp,
    handleMouseMove,
    handleMouseDown,
  } = useScroll();

  useEffect(() => {
    if (carouselRef === undefined) return;
    if (!carouselRef?.current) return;
    //@ts-ignore
    setRef(carouselRef);
  }, [carouselRef]);

  return (
    <Flex
      bg="purple"
      py={1}
      w="100%"
      justifyContent="space-between"
      alignItems="center"
      gap={"10px"}
    >
      {players && playerKeys ? (
        <CarouselTray
          ref={carouselRef}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
        >
          {playerKeys?.map((playerName) => (
            <Flex key={playerName} width="min-content">
              <Spacer width="0.5rem" />
              {players && players[playerName]?.pool && (
                <PlayerBox
                  key={Math.random()}
                  name={playerName}
                  isLocal={player === playerName}
                  playerState={players[playerName] as { pool: PoolType }}
                  setGameState={setGameState}
                />
              )}
            </Flex>
          ))}
        </CarouselTray>
      ) : (
        <Skeleton minHeight={"97.969px"} minWidth={"150px"} mx={2} />
      )}
    </Flex>
  );
};
