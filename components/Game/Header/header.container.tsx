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
import { HeroRulesPanel } from "./hero-rules.panel";
import { FC, useCallback, useState } from "react";
import { ChipCluster, HudOverlay } from "./header.styles";
import { ConnectionStatus } from "@/lib/gamesocket/socket";
import { ChangeDeckModal } from "@/components/Game/GameMenus/change-deck.modal";
import {
  nextSeat,
  useActiveHotseat,
  useHotseat,
  useSeatLabel,
  useSwitchSeat,
} from "@/lib/hotseat/useHotseat";
import {
  useSwitchSeatHotkey,
  useSwitchSeatKeyLabel,
} from "@/lib/hotseat/switchSeatKey";
import { useHotseatFlag } from "@/lib/hotseat/hotseatSettings";
import { HotseatSettings, KeyBadge } from "./hotseat-settings.popover";

/**
 * Popper modifiers shared by the corner-pinned chip tooltips. `preventOverflow`
 * against the viewport keeps a tooltip from ever spilling past the screen edge
 * (which would widen the document and pop scrollbars on hover).
 */
const CHIP_TOOLTIP_MODIFIERS = [
  {
    name: "preventOverflow",
    options: { rootBoundary: "viewport", altAxis: true, tether: false, padding: 8 },
  },
];

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

  // Which seat's extended rules are pinned open (issue #474). Held here rather
  // than per-PlayerBox so only one panel is ever mounted — two would overlap,
  // since the panel is pinned to a fixed corner.
  const [rulesFor, setRulesFor] = useState<string>();
  const rulesPool = rulesFor ? players?.[rulesFor]?.pool : undefined;

  // Hotseat (issue #1564): both seats are on this device, so each box shows
  // its hero rather than the raw seat key, and the other seat's box offers to
  // play that side.
  const hotseat = useActiveHotseat();
  const seatLabel = useSeatLabel();
  const switchSeat = useSwitchSeat();

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
                  displayName={hotseat ? seatLabel(playerName) : undefined}
                  onPlaySide={
                    hotseat &&
                    player !== playerName &&
                    hotseat.seats.includes(playerName)
                      ? () => switchSeat(playerName)
                      : undefined
                  }
                  isLocal={player === playerName}
                  playerState={players[playerName] as { pool: PoolType }}
                  setGameState={setGameState}
                  openPositionModal={openPositionModal}
                  onOpenRules={() =>
                    setRulesFor((current) =>
                      current === playerName ? undefined : playerName,
                    )
                  }
                  rulesOpen={rulesFor === playerName}
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
        <HotseatChip />
        <ConnectionChip status={connectionStatus} />
      </ChipCluster>
      {rulesFor && rulesPool && (
        <HeroRulesPanel
          pool={rulesPool}
          name={rulesFor}
          onClose={() => setRulesFor(undefined)}
        />
      )}
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
    <Tooltip
      label="Copy an invite link — anyone who clicks it jumps straight into this game"
      placement="bottom-end"
      maxW="220px"
      modifiers={CHIP_TOOLTIP_MODIFIERS}
    >
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

/**
 * Hotseat on /offline (issue #1564): "Add opponent" while solo — seats a
 * second deck from the bag — then "Switch seat" to hand the device over.
 * Renders nothing without hotseat controls (online, /irl).
 */
const HotseatChip = () => {
  const hotseat = useHotseat();
  const switchSeat = useSwitchSeat();
  const seatLabel = useSeatLabel();
  const [pickerOpen, setPickerOpen] = useState(false);
  const next =
    hotseat && hotseat.seats.length > 1 ? nextSeat(hotseat) : undefined;
  const switchToNext = useCallback(() => {
    if (next) switchSeat(next);
  }, [next, switchSeat]);
  // Only with an opponent seated, so the sandbox never listens.
  useSwitchSeatHotkey(!!next, switchToNext);
  const keyLabel = useSwitchSeatKeyLabel();
  const [rotateBoard, setRotateBoard] = useHotseatFlag("rotateBoard");
  if (!hotseat) return null;

  return (
    <>
      <Tooltip
        label={
          next
            ? `Hand the device over and play ${seatLabel(next)}${keyLabel ? ` (${keyLabel})` : ""}`
            : "Play both sides on this device — pick a second deck from your bag"
        }
        placement="bottom-end"
        maxW="220px"
        modifiers={CHIP_TOOLTIP_MODIFIERS}
      >
        <Flex
          as="button"
          aria-label={next ? "Switch seat" : "Add opponent"}
          onClick={() => (next ? switchSeat(next) : setPickerOpen(true))}
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
          <Text
            fontSize="0.65rem"
            color="brand.highlight"
            fontFamily="SpaceGrotesk"
            whiteSpace="nowrap"
          >
            {next ? "⇄ Switch seat" : "+ Add opponent"}
          </Text>
          {next && keyLabel && <KeyBadge label={keyLabel} />}
        </Flex>
      </Tooltip>
      {next && (
        <Tooltip
          label={
            rotateBoard
              ? `Board turns 180° on ${seatLabel(hotseat.seats[1])}'s turn — click to stop`
              : `Turn the board 180° on ${seatLabel(hotseat.seats[1])}'s turn`
          }
          placement="bottom-end"
          maxW="220px"
          modifiers={CHIP_TOOLTIP_MODIFIERS}
        >
          <Flex
            as="button"
            aria-label="Rotate board"
            aria-pressed={rotateBoard}
            onClick={() => setRotateBoard(!rotateBoard)}
            alignItems="center"
            gap="0.25rem"
            px="0.5rem"
            py="0.15rem"
            borderRadius="1rem"
            bg={rotateBoard ? "rgba(231, 204, 152, 0.3)" : "rgba(20, 8, 24, 0.55)"}
            cursor="pointer"
            transition="background 0.15s ease"
            _hover={{
              bg: rotateBoard ? "rgba(231, 204, 152, 0.4)" : "rgba(20, 8, 24, 0.85)",
            }}
          >
            <Text
              fontSize="0.65rem"
              color="brand.highlight"
              fontFamily="SpaceGrotesk"
              whiteSpace="nowrap"
            >
              ↻ 180°
            </Text>
          </Flex>
        </Tooltip>
      )}
      <HotseatSettings />
      <ChangeDeckModal
        mode="opponent"
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        linkToBag
      />
    </>
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
    <Tooltip
      label={display.label}
      placement="bottom-end"
      maxW="220px"
      modifiers={CHIP_TOOLTIP_MODIFIERS}
    >
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
