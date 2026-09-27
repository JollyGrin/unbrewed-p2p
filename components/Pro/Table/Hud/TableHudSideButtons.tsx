/**
 * The tabletop HUD's left column: the activity log, both discard piles and the
 * game menu, as round buttons stacked under the voice pill.
 *
 * They sit on the left edge's upper half because that is table, not board: a
 * tilted board narrows towards its far edge, so its left side slants away
 * from the screen edge as it rises. The bottom-left corner is where the board's
 * near edge reaches out widest, so the column stays out of it.
 */
import { ReactNode } from "react";
import { Flex } from "@chakra-ui/react";
import { TbCards, TbList } from "react-icons/tb";
import { MOBILE_BTN } from "@/components/Pro/ProMobileHud";

/** Below the plates and the voice pill (VoiceDock puts it at 6.2rem on phones). */
const COLUMN_TOP = "9.4rem";

export interface TableHudSideButtonsProps {
  onOpenLog: () => void;
  onOpenDiscards: () => void;
  /** the game menu's own trigger (ProMobileMenu) */
  menu: ReactNode;
}

const ROUND = { ...MOBILE_BTN, px: 0, borderRadius: "50%", pointerEvents: "auto" as const };

export const TableHudSideButtons = ({ onOpenLog, onOpenDiscards, menu }: TableHudSideButtonsProps) => (
  <Flex
    data-table-hud-side=""
    position="fixed"
    zIndex={160}
    direction="column"
    gap="0.45rem"
    pointerEvents="none"
    sx={{
      top: `calc(${COLUMN_TOP} + env(safe-area-inset-top, 0px))`,
      left: "calc(0.6rem + env(safe-area-inset-left, 0px))",
    }}
  >
    <Flex {...ROUND} as="button" aria-label="Activity log" onClick={onOpenLog}>
      <TbList size="1.05rem" />
    </Flex>
    <Flex {...ROUND} as="button" aria-label="Discard piles" onClick={onOpenDiscards}>
      <TbCards size="1.05rem" />
    </Flex>
    <Flex pointerEvents="auto">{menu}</Flex>
  </Flex>
);
