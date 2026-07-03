import { Box, Flex, Skeleton, Text, Tooltip } from "@chakra-ui/react";
import { LinkIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { useLocalServerStorage } from "@/lib/hooks/useLocalStorage";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { buildInviteUrl } from "@/lib/invite";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { PlayerBox } from "./header.components";
import { FC } from "react";
import { ChipCluster, HudOverlay } from "./header.styles";
import { ConnectionStatus } from "@/lib/gamesocket/socket";

export const HeaderContainer: FC<{ openPositionModal: () => void }> = ({
  openPositionModal,
}) => {
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

  return (
    <>
      <HudOverlay>
        {players && playerKeys ? (
          playerKeys.map(
            (playerName) =>
              players?.[playerName]?.pool && (
                <PlayerBox
                  key={playerName}
                  name={playerName}
                  isLocal={player === playerName}
                  playerState={players[playerName] as { pool: PoolType }}
                  setGameState={setGameState}
                  openPositionModal={openPositionModal}
                />
              ),
          )
        ) : (
          <Skeleton
            minHeight={"88px"}
            minWidth={"240px"}
            borderRadius="0.85rem"
          />
        )}
      </HudOverlay>
      <ChipCluster>
        <InviteChip />
        <ConnectionChip status={connectionStatus} />
      </ChipCluster>
    </>
  );
};

/**
 * One-click invite: copies a /join link carrying this lobby + gameserver so
 * a friend can jump straight into the game.
 */
const InviteChip = () => {
  const { query } = useRouter();
  const { activeServer } = useLocalServerStorage();
  const [, copy] = useCopyToClipboard();

  const rawGid = query?.gid;
  const gid = Array.isArray(rawGid) ? rawGid[0] : rawGid;
  if (!gid) return null;

  return (
    <Tooltip label="Copy an invite link — anyone who clicks it jumps straight into this game">
      <Flex
        onClick={() => {
          copy(buildInviteUrl({ gid, server: activeServer }));
          toast.success("Invite link copied — send it to a friend!");
        }}
        alignItems="center"
        gap="0.3rem"
        px="0.5rem"
        py="0.15rem"
        borderRadius="1rem"
        bg="rgba(20, 8, 24, 0.55)"
        cursor="pointer"
        transition="background 0.15s ease"
        _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
      >
        <LinkIcon color="brand.highlight" boxSize="0.65rem" />
        <Text
          fontSize="0.65rem"
          color="brand.highlight"
          fontFamily="SpaceGrotesk"
          whiteSpace="nowrap"
        >
          Invite
        </Text>
      </Flex>
    </Tooltip>
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
