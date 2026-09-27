/**
 * A headline number with a caption. `dark` sits on the DarkBand (translucent
 * parchment wash, light ink), `light` on a parchment card (purple wash).
 * `valueFirst` is the leaderboard band's order (number, then caption); the
 * profile tiles read caption → number → sub-line.
 */
import { ReactNode } from "react";
import { Box } from "@chakra-ui/react";

import { BAND_MUTED, BAND_WASH, captionStyle, INK_MUTED, INK_SOFT, WASH } from "./tokens";

export interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  variant?: "dark" | "light";
  valueFirst?: boolean;
  /** League Gothic size of the number, desktop. Phones get ~75% of it. */
  valueSize?: number;
}

export const StatTile = ({
  label,
  value,
  sub,
  variant = "dark",
  valueFirst = false,
  valueSize = 52,
}: StatTileProps) => {
  const dark = variant === "dark";
  const muted = dark ? BAND_MUTED : INK_MUTED;
  const caption = (
    <Box {...captionStyle} color={muted} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
      {label}
    </Box>
  );
  return (
    <Box
      data-testid="stat-tile"
      bg={dark ? BAND_WASH : WASH}
      borderRadius="10px"
      p={{ base: "12px", md: "16px" }}
      minW={0}
    >
      {!valueFirst && caption}
      <Box
        fontFamily="LeagueGothic"
        fontSize={{ base: `${Math.round(valueSize * 0.75)}px`, md: `${valueSize}px` }}
        lineHeight={1.05}
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Box>
      {valueFirst && caption}
      {sub && (
        <Box fontSize="12px" color={dark ? BAND_MUTED : INK_SOFT}>
          {sub}
        </Box>
      )}
    </Box>
  );
};
