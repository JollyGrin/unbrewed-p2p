/**
 * Adventure enclosure mark (engine #689): a closed fence badge over a still-blocked space, or a
 * faint "destroyed" ring over a `startsBlocked` space that has been opened. Fills the box the
 * caller positions over the space (flat board: % of frame; tabletop: px) and never takes pointer
 * events — a CHOOSE_SPACE tie between enclosures is answered by the space's own hit circle.
 * PRESENTATION ONLY. See lib/pro/enclosures.
 */
import { Box, Text } from "@chakra-ui/react";
import { TbFence } from "react-icons/tb";
import type { EnclosureStake } from "@/lib/pro/enclosureStakes";

export interface EnclosureMarkProps {
  state: "closed" | "destroyed";
  /** Printed enclosure number, when the map declares one. */
  number?: number;
  spaceId: string;
  /** #1160: villain contact / next-to-open ring, or the enemy a destroyed one released. */
  stake?: EnclosureStake;
}

const RED = "#E5484D";
const GOLD = "#E0A82E";

export const EnclosureMark = ({ state, number, spaceId, stake }: EnclosureMarkProps) => {
  const label = number != null ? String(number).padStart(2, "0") : null;
  const title =
    state === "closed"
      ? `Enclosure${label ? ` ${label}` : ""} — closed`
      : `Enclosure${label ? ` ${label}` : ""} — destroyed${stake?.release ? `, released ${stake.release.name}` : ""}`;
  const closedStake = state === "closed" ? stake : undefined;
  const rings = [
    closedStake?.adjacent ? `0 0 0 3px ${RED}` : null,
    closedStake?.next && !closedStake.adjacent ? `0 0 0 3px ${GOLD}` : null,
  ].filter(Boolean);
  const release = state === "destroyed" ? stake?.release : undefined;
  return (
    <Box
      position="relative"
      w="100%"
      h="100%"
      pointerEvents="none"
      data-enclosure={spaceId}
      data-enclosure-state={state}
      data-enclosure-number={label ?? undefined}
      data-enclosure-adjacent={closedStake?.adjacent ? "" : undefined}
      data-enclosure-next={closedStake?.next ? "" : undefined}
      data-enclosure-released={release?.name}
      title={title}
      borderRadius="50%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      color={state === "closed" ? "#F4E3B8" : "rgba(244,227,184,0.55)"}
      bg={state === "closed" ? "rgba(52, 34, 18, 0.82)" : "transparent"}
      border={state === "closed" ? "2px solid #C98B2B" : "1.5px dashed rgba(244,227,184,0.5)"}
      boxShadow={state === "closed" ? ["0 0 0 1.5px rgba(12,6,12,0.75)", ...rings].join(", ") : undefined}
      outline={closedStake?.next ? `2px dashed ${GOLD}` : undefined}
      outlineOffset={closedStake?.next ? "3px" : undefined}
      lineHeight="1"
    >
      {state === "closed" && <TbFence style={{ width: "58%", height: "58%" }} aria-hidden />}
      {release && (
        <Text as="span" fontFamily="SpaceGrotesk" fontWeight="bold" fontSize="0.6rem" lineHeight="1" color="#F4E3B8">
          {release.glyph}
        </Text>
      )}
      {label && (
        <Text
          as="span"
          fontFamily="SpaceGrotesk"
          fontWeight="bold"
          fontSize="0.55rem"
          lineHeight="1"
          textDecoration={state === "destroyed" ? "line-through" : undefined}
        >
          {label}
        </Text>
      )}
    </Box>
  );
};
