/**
 * Weekly games stacked by who was across the table (Main.dc.html "Games
 * played"): human at the base, hard/expert bot above it, casual bot on top.
 * The first and last columns print their total; every column has a tooltip
 * with the full breakdown, so no number lives in colour alone.
 */
import { Box } from "@chakra-ui/react";

import type { CommunityWeek } from "@/lib/stats/types";

import { KindLegend } from "./KindLegend";
import { captionStyle, INK_MUTED, INK_SOFT, KIND_COLOR } from "./tokens";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-06" → "Jul 6" (UTC, like every stats date). */
export const weekLabel = (weekStart: string): string => {
  const [, m, d] = weekStart.split("-").map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : weekStart;
};

const total = (w: CommunityWeek): number => w.human + w.hardExpert + w.casual;

export const weekTip = (w: CommunityWeek): string =>
  `Week of ${weekLabel(w.weekStart)}: ${total(w)} games — ${w.human} human, ${w.hardExpert} hard/expert bot, ${w.casual} casual bot`;

export interface StackedColumnsProps {
  weeks: readonly CommunityWeek[];
  /** Plot height in px, desktop; phones get 160. */
  height?: number;
  legend?: boolean;
}

export const StackedColumns = ({ weeks, height = 220, legend = true }: StackedColumnsProps) => {
  const max = Math.max(1, ...weeks.map(total));
  const last = weeks.length - 1;
  // Axis ticks every 4 weeks from the oldest, and "This week" at the end.
  const ticks = weeks
    .map((w, i) => (i === last ? "This week" : i % 4 === 0 && last - i >= 3 ? weekLabel(w.weekStart) : null))
    .filter((t): t is string => t !== null);

  return (
    <Box display="flex" flexDirection="column" gap="18px" minW={0}>
      {legend && <KindLegend />}
      <Box
        role="img"
        aria-label={`Games per week, last ${weeks.length} weeks, from ${total(weeks[0] ?? { human: 0, hardExpert: 0, casual: 0, weekStart: "" })} to ${weeks[last] ? total(weeks[last]) : 0}`}
        display="flex"
        gap={{ base: "4px", md: "8px" }}
        alignItems="flex-end"
        h={{ base: "160px", md: `${height}px` }}
        borderBottom="1px solid rgba(72,40,79,0.25)"
      >
        {weeks.map((w, i) => {
          const pct = (n: number) => `${(n / max) * 88}%`;
          return (
            <Box
              key={w.weekStart}
              title={weekTip(w)}
              data-testid="week-column"
              flex="1 1 0"
              minW={0}
              h="100%"
              display="flex"
              flexDirection="column"
              justifyContent="flex-end"
              gap="2px"
            >
              <Box fontSize="11px" textAlign="center" color={INK_SOFT} sx={{ fontVariantNumeric: "tabular-nums" }} minH="14px">
                {i === 0 || i === last ? total(w) : ""}
              </Box>
              <Box h={pct(w.casual)} bg={KIND_COLOR.casual} borderRadius="4px 4px 0 0" />
              <Box h={pct(w.hardExpert)} bg={KIND_COLOR.hardExpert} />
              <Box h={pct(w.human)} bg={KIND_COLOR.human} />
            </Box>
          );
        })}
      </Box>
      <Box display="flex" justifyContent="space-between" {...captionStyle} color={INK_MUTED}>
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </Box>
    </Box>
  );
};
