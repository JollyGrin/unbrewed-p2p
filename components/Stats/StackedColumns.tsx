/**
 * Weekly games stacked by who was across the table (Main.dc.html "Games
 * played"): human at the base, hard/expert bot above it, casual bot on top.
 * Every column prints its total; hovering, focusing or tapping a column opens
 * a tooltip with the full breakdown and dims the rest of the columns.
 */
import { useState } from "react";
import { Box, Tooltip } from "@chakra-ui/react";

import { OPPONENT_KINDS, type CommunityWeek } from "@/lib/stats/types";

import { KindLegend, KindSwatch } from "./KindLegend";
import { kindShares } from "./SplitBar";
import { captionStyle, INK_MUTED, INK_SOFT, KIND_COLOR, KIND_LABEL } from "./tokens";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-07-06" → "Jul 6" (UTC, like every stats date). */
export const weekLabel = (weekStart: string): string => {
  const [, m, d] = weekStart.split("-").map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : weekStart;
};

const total = (w: CommunityWeek): number => w.human + w.hardExpert + w.casual;

/** "2026-09-21" → "Sep 21 – Sep 27" (UTC); the current week gets a "This week ·" prefix. */
export const weekRangeLabel = (weekStart: string, isCurrent = false): string => {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const fmt = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const range = `${fmt(start)} – ${fmt(end)}`;
  return isCurrent ? `This week · ${range}` : range;
};

/** Plain-text breakdown shared by the tooltip body and the column's aria-label. */
export const weekBreakdown = (w: CommunityWeek): string => {
  const games = total(w);
  if (games === 0) return "no games this week";
  const shares = kindShares(w);
  return `${games} games — ${OPPONENT_KINDS.map((k) => `${KIND_LABEL[k]} ${w[k]} (${shares[k]}%)`).join(", ")}`;
};

export const weekAriaLabel = (w: CommunityWeek, isCurrent: boolean): string =>
  `${weekRangeLabel(w.weekStart, isCurrent)}: ${weekBreakdown(w)}`;

const WeekTooltipBody = ({ week, isCurrent }: { week: CommunityWeek; isCurrent: boolean }) => {
  const games = total(week);
  const shares = kindShares(week);
  return (
    <Box fontSize="12px" lineHeight={1.6} minW="180px">
      <Box fontWeight={700} mb="4px">
        {weekRangeLabel(week.weekStart, isCurrent)}
      </Box>
      {games === 0 ? (
        <Box>No games this week</Box>
      ) : (
        <>
          {OPPONENT_KINDS.map((kind) => (
            <Box key={kind} display="flex" alignItems="center" gap="6px">
              <KindSwatch kind={kind} />
              <Box flex="1">{KIND_LABEL[kind]}</Box>
              <Box sx={{ fontVariantNumeric: "tabular-nums" }}>
                {week[kind]} ({shares[kind]}%)
              </Box>
            </Box>
          ))}
          <Box mt="4px" pt="4px" borderTop="1px solid rgba(255,255,255,0.25)" fontWeight={700}>
            {games} games
          </Box>
        </>
      )}
    </Box>
  );
};

export interface StackedColumnsProps {
  weeks: readonly CommunityWeek[];
  /** Plot height in px, desktop; phones get 160. */
  height?: number;
  legend?: boolean;
}

export const StackedColumns = ({ weeks, height = 220, legend = true }: StackedColumnsProps) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const active = hovered ?? focused;

  const max = Math.max(1, ...weeks.map(total));
  const last = weeks.length - 1;
  // Axis ticks every 4 weeks from the oldest, and "This week" at the end.
  const ticks = weeks
    .map((w, i) => (i === last ? "This week" : i % 4 === 0 && last - i >= 3 ? weekLabel(w.weekStart) : null))
    .filter((t): t is string => t !== null);

  return (
    <Box display="flex" flexDirection="column" gap="18px" minW={0}>
      {legend && <KindLegend />}
      <Box display="flex" gap={{ base: "4px", md: "8px" }} alignItems="flex-end" h={{ base: "160px", md: `${height}px` }} borderBottom="1px solid rgba(72,40,79,0.25)">
        {weeks.map((w, i) => {
          const pct = (n: number) => `${(n / max) * 88}%`;
          const isCurrent = i === last;
          // Every other week's total, plus always the last, fits at phone width without overlap.
          const showTotalOnPhone = isCurrent || i % 2 === 0;
          return (
            <Tooltip
              key={w.weekStart}
              isOpen={active === i}
              hasArrow
              placement="top"
              label={<WeekTooltipBody week={w} isCurrent={isCurrent} />}
            >
              <Box
                data-testid="week-column"
                role="img"
                aria-label={weekAriaLabel(w, isCurrent)}
                tabIndex={0}
                flex="1 1 0"
                minW={0}
                h="100%"
                display="flex"
                flexDirection="column"
                justifyContent="flex-end"
                gap="2px"
                opacity={active === null || active === i ? 1 : 0.55}
                transition="opacity 0.12s ease"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setFocused(i)}
                onBlur={() => setFocused(null)}
                onClick={() => setFocused((f) => (f === i ? null : i))}
              >
                <Box
                  fontSize="11px"
                  textAlign="center"
                  color={INK_SOFT}
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                  minH="14px"
                  display={{ base: showTotalOnPhone ? "block" : "none", md: "block" }}
                >
                  {total(w)}
                </Box>
                <Box h={pct(w.casual)} bg={KIND_COLOR.casual} borderRadius="4px 4px 0 0" />
                <Box h={pct(w.hardExpert)} bg={KIND_COLOR.hardExpert} />
                <Box h={pct(w.human)} bg={KIND_COLOR.human} />
              </Box>
            </Tooltip>
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
