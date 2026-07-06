/**
 * Top-right "Report bug" affordance for the sandbox game (issue #127,
 * sibling to the Pro top-right button in issue #125). Sits just above the
 * ActionLog panel (which already docks top-right) so it reads as a second,
 * more discoverable HUD element rather than crowding the activity feed.
 * Carries a `beta` badge since the sandbox — and this reporting flow — are
 * both new/experimental.
 */
import { useMemo } from "react";
import { useRouter } from "next/router";
import { Button, Tag, Tooltip, useDisclosure } from "@chakra-ui/react";
import styled from "@emotion/styled";
import { TbBug } from "react-icons/tb";
import { colors, fonts } from "@/styles/style";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { GameState, PlayerState } from "@/lib/gamesocket/message";
import { mergeActionLog } from "@/lib/sandbox/gameLog";
import { ReportBugDialog } from "./ReportBugDialog";

const Trigger = styled(Button)`
  position: fixed;
  top: 2.85rem;
  right: 1rem;
  z-index: 241;
`;

export const ReportBugButton: React.FC = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { gameState } = useWebGame();
  const { query } = useRouter();

  const rawGid = query?.gid;
  const roomId = (Array.isArray(rawGid) ? rawGid[0] : rawGid) ?? null;

  const players = (gameState?.content as GameState | undefined)?.players as
    | Record<string, PlayerState>
    | undefined;
  const entries = useMemo(() => mergeActionLog(players), [players]);

  return (
    <>
      <Tooltip
        label="Sandbox is experimental — hit a bug? Report it with your game log attached."
        placement="bottom"
        hasArrow
      >
        <Trigger
          size="xs"
          leftIcon={<TbBug />}
          bg={colors.brand.parchment}
          color={colors.brand.surfaceDim}
          fontFamily={fonts.SpaceGrotesk}
          borderRadius="10rem"
          border="1px solid rgba(72, 40, 79, 0.25)"
          boxShadow="0 4px 12px rgba(20, 8, 24, 0.35)"
          onClick={onOpen}
        >
          Report bug
          <Tag ml="0.4rem" size="sm" bg="brand.accent" color="brand.surfaceDim" fontWeight={700}>
            beta
          </Tag>
        </Trigger>
      </Tooltip>
      <ReportBugDialog isOpen={isOpen} onClose={onClose} roomId={roomId} entries={entries} />
    </>
  );
};
