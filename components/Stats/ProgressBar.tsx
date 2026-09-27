/**
 * A thin rounded meter: XP to the next rank, badge progress, hero-rank track,
 * roster fill. `value` is a fraction and is clamped to 0–1.
 */
import { Box } from "@chakra-ui/react";

import { GOLD_DEEP, TRACK } from "./tokens";

export interface ProgressBarProps {
  value: number;
  /** Accessible name; the meter announces its percentage. */
  label: string;
  height?: 6 | 8 | 10 | 12;
  color?: string;
  /** On the DarkBand the track is a parchment wash. */
  onDark?: boolean;
}

export const ProgressBar = ({ value, label, height = 6, color = GOLD_DEEP, onDark = false }: ProgressBarProps) => {
  const fraction = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const percent = Math.round(fraction * 100);
  return (
    <Box
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      h={`${height}px`}
      borderRadius={`${height / 2}px`}
      bg={onDark ? "rgba(250,235,215,0.14)" : TRACK}
      overflow="hidden"
    >
      <Box h="100%" w={`${percent}%`} borderRadius={`${height / 2}px`} bg={color} />
    </Box>
  );
};
