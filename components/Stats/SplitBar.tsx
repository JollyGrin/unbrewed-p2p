/**
 * A 3-way opponent-kind split: one segmented bar, then each kind's count and
 * share. `tiles` is the leaderboard card (big League Gothic numbers under the
 * bar); `legend` is the hero page's compact swatch + count + % line.
 */
import { Box } from "@chakra-ui/react";

import { OPPONENT_KINDS, OpponentKind, type KindCounts } from "@/lib/stats/types";

import { KindSwatch } from "./KindLegend";
import { INK_SOFT, KIND_COLOR } from "./tokens";

const LABELS: Record<OpponentKind, string> = {
  human: "human vs human",
  hardExpert: "vs hard / expert",
  casual: "vs casual bot",
};

/** Whole-percent shares; all zero when there are no games. */
export const kindShares = (counts: KindCounts): Record<OpponentKind, number> => {
  const sum = counts.human + counts.hardExpert + counts.casual;
  const pct = (n: number) => (sum > 0 ? Math.round((n / sum) * 100) : 0);
  return { human: pct(counts.human), hardExpert: pct(counts.hardExpert), casual: pct(counts.casual) };
};

export interface SplitBarProps {
  counts: KindCounts;
  variant?: "tiles" | "legend";
  labels?: Record<OpponentKind, string>;
}

export const SplitBar = ({ counts, variant = "tiles", labels = LABELS }: SplitBarProps) => {
  const shares = kindShares(counts);
  const sum = counts.human + counts.hardExpert + counts.casual;
  const present = OPPONENT_KINDS.filter((k) => counts[k] > 0);
  return (
    <Box display="flex" flexDirection="column" gap={variant === "tiles" ? "16px" : "12px"} minW={0}>
      <Box
        display="flex"
        h="18px"
        gap="2px"
        role="img"
        aria-label={OPPONENT_KINDS.map((k) => `${counts[k]} ${labels[k]} (${shares[k]}%)`).join(", ")}
        bg={sum === 0 ? "rgba(72,40,79,0.1)" : undefined}
        borderRadius="4px"
        overflow="hidden"
      >
        {present.map((kind) => (
          <Box key={kind} w={`${(counts[kind] / sum) * 100}%`} bg={KIND_COLOR[kind]} />
        ))}
      </Box>
      <Box
        display="grid"
        gridTemplateColumns={
          variant === "tiles"
            ? "repeat(3, minmax(0, 1fr))"
            : { base: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))" }
        }
        gap="12px"
        fontSize="13px"
      >
        {OPPONENT_KINDS.map((kind) =>
          variant === "tiles" ? (
            <Box key={kind} minW={0}>
              <Box fontFamily="LeagueGothic" fontSize={{ base: "32px", md: "40px" }} lineHeight={1}>
                {counts[kind].toLocaleString("en-US")}
              </Box>
              <Box color={INK_SOFT}>
                {labels[kind]} · {shares[kind]}%
              </Box>
            </Box>
          ) : (
            <Box key={kind} display="flex" gap="8px" alignItems="center" minW={0}>
              <KindSwatch kind={kind} />
              <span>
                <Box as="span" fontWeight={700}>
                  {counts[kind].toLocaleString("en-US")}
                </Box>{" "}
                {labels[kind]} · {shares[kind]}%
              </span>
            </Box>
          ),
        )}
      </Box>
    </Box>
  );
};
