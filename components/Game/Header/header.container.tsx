import { Box, Flex, Skeleton, Spacer, Text, Tooltip } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { useScroll } from "@/lib/hooks";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { PlayerBox } from "./header.components";
import { FC, useEffect, useRef } from "react";
import { CarouselTray } from "../game.styles";
import { ConnectionStatus } from "@/lib/gamesocket/socket";

export const HeaderContainer: FC<{ openPositionModal: () => void }> = ({
  openPositionModal,
}) => {
  const carouselRef = useRef();
  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName;

  const { gameState, setPlayerState, connectionStatus } = useWebGame();
  const setGameState = (poolInput: PoolType): void => {
    setPlayerState()({ pool: poolInput });
  };

  const players = gameState?.content?.players as Record<
    string,
    { pool?: PoolType }
  >;
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
  }, [carouselRef, setRef]);

  return (
    <Flex
      bg="rgba(44, 24, 49, 0.9)"
      borderBottom="1px solid rgba(231, 204, 152, 0.35)"
      boxShadow="0 6px 18px rgba(20, 8, 24, 0.35)"
      py={1}
      w="100%"
      justifyContent="space-between"
      alignItems="center"
      gap={"10px"}
      position="relative"
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
              {players && players?.[playerName]?.pool && (
                <PlayerBox
                  name={playerName}
                  isLocal={player === playerName}
                  playerState={players[playerName] as { pool: PoolType }}
                  setGameState={setGameState}
                  openPositionModal={openPositionModal}
                />
              )}
            </Flex>
          ))}
        </CarouselTray>
      ) : (
        <Skeleton minHeight={"97.969px"} minWidth={"150px"} mx={2} />
      )}
      <ConnectionChip status={connectionStatus} />
    </Flex>
  );
};

const STATUS_DISPLAY: Record<
  ConnectionStatus,
  { color: string; label: string }
> = {
  open: { color: "#2F9E68", label: "Connected" },
  connecting: { color: "#E7CC98", label: "Connecting…" },
  closed: { color: "#FF6347", label: "Disconnected — reconnecting" },
};

const ConnectionChip = ({ status }: { status: ConnectionStatus }) => {
  const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.connecting;
  return (
    <Tooltip label={display.label}>
      <Flex
        position="absolute"
        top="0.35rem"
        right="0.35rem"
        alignItems="center"
        gap="0.3rem"
        px="0.4rem"
        py="0.15rem"
        borderRadius="1rem"
        bg="rgba(20, 8, 24, 0.55)"
        cursor="default"
      >
        <Box
          h="0.55rem"
          w="0.55rem"
          borderRadius="100%"
          bg={display.color}
          boxShadow={`0 0 6px ${display.color}`}
        />
        {status !== "open" && (
          <Text
            fontSize="0.65rem"
            color="brand.highlight"
            fontFamily="SpaceGrotesk"
            whiteSpace="nowrap"
          >
            {display.label}
          </Text>
        )}
      </Flex>
    </Tooltip>
  );
};
