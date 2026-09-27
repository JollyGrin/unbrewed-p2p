/**
 * Recent form as chips, newest first (W / L / D). Sizes are the mockups': 20
 * on the leaderboard rows, 32 on the player page. A draw is a neutral grey —
 * still lettered, since colour is never the only signal.
 */
import { Box } from "@chakra-ui/react";

import type { FormResult } from "@/lib/stats/types";

export const FORM_CHIP: Record<FormResult, { bg: string; ink: string; word: string }> = {
  W: { bg: "#2F9E68", ink: "#F3FAF5", word: "Win" },
  L: { bg: "#FF6347", ink: "#2A0F0A", word: "Loss" },
  D: { bg: "#8D8794", ink: "#1E1022", word: "Draw" },
};

export interface FormChipsProps {
  results: readonly FormResult[];
  size?: 20 | 32;
}

export const FormChips = ({ results, size = 20 }: FormChipsProps) => {
  const big = size === 32;
  return (
    <Box
      display="flex"
      gap={big ? "6px" : "3px"}
      flexWrap="wrap"
      role="list"
      aria-label={`Recent form, newest first: ${results.map((r) => FORM_CHIP[r].word).join(", ") || "none"}`}
    >
      {results.map((result, i) => (
        <Box
          key={i}
          role="listitem"
          title={FORM_CHIP[result].word}
          w={`${size}px`}
          h={`${size}px`}
          borderRadius={big ? "6px" : "4px"}
          bg={FORM_CHIP[result].bg}
          color={FORM_CHIP[result].ink}
          fontSize={big ? "14px" : "11px"}
          fontWeight={700}
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          {result}
        </Box>
      ))}
    </Box>
  );
};
