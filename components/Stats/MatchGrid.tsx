/**
 * The hero-vs-hero grid (issue #935): the leaderboard's community grid (games
 * / win-rate toggle), the player page's own-heroes × opponents grid (win rate
 * with a "w of g" sub-label), and conceptually the hero page's row. Every
 * colour decision lives in lib/stats/matchGrid; this file only lays it out.
 *
 * It is a real <table> (row/column headers are announced), and it scrolls
 * horizontally INSIDE its own box with the hero column sticky, so at 375px the
 * grid pans while the page itself never scrolls sideways.
 */
import { Box } from "@chakra-ui/react";

import {
  COMMUNITY_GRID_GAIN,
  matchCell,
  MatchCounts,
  MatchGridMode,
  maxCellGames,
  PLAYER_GRID_GAIN,
} from "@/lib/stats/matchGrid";
import { heroDisplayName } from "@/lib/stats/roster";

import { HeroToken } from "./HeroToken";
import { INK, PARCHMENT } from "./tokens";

export interface MatchGridHero {
  heroId: string;
  heroName?: string | null;
}

export interface MatchGridProps {
  rows: readonly MatchGridHero[];
  cols: readonly MatchGridHero[];
  lookup: (rowHeroId: string, colHeroId: string) => MatchCounts | null;
  mode: MatchGridMode;
  /**
   * `community`: token + name down the side, 60×48 cells, gain 4.4.
   * `player`: name only down the side, 63×56 cells with "w of g", gain 2.2.
   */
  variant?: "community" | "player";
  /** Accessible caption (visually hidden). */
  caption: string;
  /** Background behind the sticky column; must match the card it sits on. */
  surface?: string;
}

const SIZES = {
  community: {
    label: { base: "116px", md: "190px" },
    cellW: { base: "46px", md: "60px" },
    cellH: { base: "42px", md: "48px" },
  },
  player: {
    label: { base: "104px", md: "170px" },
    cellW: { base: "54px", md: "63px" },
    cellH: { base: "50px", md: "56px" },
  },
};

export const MatchGrid = ({
  rows,
  cols,
  lookup,
  mode,
  variant = "community",
  caption,
  surface = PARCHMENT,
}: MatchGridProps) => {
  const size = SIZES[variant];
  const isPlayer = variant === "player";
  const gain = isPlayer ? PLAYER_GRID_GAIN : COMMUNITY_GRID_GAIN;
  const maxGames = maxCellGames(
    rows.map((r) => r.heroId),
    cols.map((c) => c.heroId),
    lookup,
  );

  const sticky = {
    position: "sticky" as const,
    left: 0,
    zIndex: 1,
    bg: surface,
  };

  return (
    <Box
      data-testid="match-grid"
      overflowX="auto"
      maxW="100%"
      pb="4px"
      sx={{ WebkitOverflowScrolling: "touch" }}
    >
      <Box
        as="table"
        sx={{
          borderCollapse: "separate",
          borderSpacing: "3px",
          fontVariantNumeric: "tabular-nums",
        }}
        color={INK}
      >
        <Box
          as="caption"
          position="absolute"
          w="1px"
          h="1px"
          overflow="hidden"
          clipPath="inset(50%)"
          whiteSpace="nowrap"
        >
          {caption}
        </Box>
        <thead>
          <tr>
            <Box as="td" {...sticky} w={size.label} minW={size.label} />
            {cols.map((col) => (
              <Box
                as="th"
                key={col.heroId}
                scope="col"
                w={size.cellW}
                minW={size.cellW}
                pb="6px"
                verticalAlign="bottom"
              >
                <Box display="flex" justifyContent="center">
                  <HeroToken
                    heroId={col.heroId}
                    heroName={col.heroName}
                    size={{ base: 36, md: 40 }}
                  />
                </Box>
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowName = heroDisplayName(row.heroId, row.heroName);
            return (
              <tr key={row.heroId}>
                <Box
                  as="th"
                  scope="row"
                  {...sticky}
                  w={size.label}
                  minW={size.label}
                  maxW={size.label}
                  textAlign="left"
                  fontWeight={500}
                  fontSize={{ base: "13px", md: "14px" }}
                  pr="6px"
                >
                  <Box display="flex" alignItems="center" gap={{ base: "6px", md: "10px" }} minW={0}>
                    {!isPlayer && (
                      <Box display={{ base: "none", md: "block" }}>
                        <HeroToken heroId={row.heroId} heroName={row.heroName} size={36} decorative />
                      </Box>
                    )}
                    <Box
                      as="span"
                      whiteSpace={{ base: "normal", md: "nowrap" }}
                      overflow="hidden"
                      textOverflow="ellipsis"
                      lineHeight={1.2}
                    >
                      {rowName}
                    </Box>
                  </Box>
                </Box>
                {cols.map((col) => {
                  const cell = matchCell({
                    rowHeroId: row.heroId,
                    colHeroId: col.heroId,
                    rowName,
                    colName: heroDisplayName(col.heroId, col.heroName),
                    counts: lookup(row.heroId, col.heroId),
                    mode,
                    maxGames,
                    gain,
                    withSub: isPlayer,
                  });
                  return (
                    <Box
                      as="td"
                      key={col.heroId}
                      title={cell.tip || undefined}
                      data-cell-kind={cell.kind}
                      w={size.cellW}
                      minW={size.cellW}
                      h={size.cellH}
                      p={0}
                      borderRadius="4px"
                      bg={cell.bg}
                      color={cell.ink}
                      textAlign="center"
                      verticalAlign="middle"
                    >
                      {cell.kind === "diagonal" ? (
                        <Box as="span" aria-label="same hero" />
                      ) : (
                        <>
                          <Box
                            fontSize={isPlayer ? "15px" : "14px"}
                            fontWeight={isPlayer ? 700 : 500}
                            lineHeight={1.2}
                          >
                            {cell.label}
                          </Box>
                          {cell.sub && (
                            <Box fontSize="11px" color="rgba(44,24,49,0.78)" lineHeight={1.2}>
                              {cell.sub}
                            </Box>
                          )}
                        </>
                      )}
                    </Box>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
};

/** Legend strip under a grid; the gradient matches the mode's colour scale. */
export const MatchGridLegend = ({
  mode,
  maxGames,
  low,
  high,
  title,
}: {
  mode: MatchGridMode;
  maxGames?: number;
  low?: string;
  high?: string;
  title?: string;
}) => (
  <Box display="flex" flexDirection="column" gap="6px" color={INK}>
    {title && (
      <Box
        fontFamily="ArchivoNarrow"
        fontSize="12px"
        letterSpacing="0.06em"
        textTransform="uppercase"
        color="rgba(72,40,79,0.72)"
      >
        {title}
      </Box>
    )}
    <Box
      h="12px"
      borderRadius="3px"
      bg={
        mode === "games"
          ? "linear-gradient(90deg, rgba(72,40,79,0.08), rgba(72,40,79,0.9))"
          : "linear-gradient(90deg, rgba(255,99,71,0.75), rgba(72,40,79,0.08) 50%, rgba(47,158,104,0.75))"
      }
    />
    <Box display="flex" justifyContent="space-between" fontSize="12px" color="rgba(72,40,79,0.78)">
      <span>{low ?? (mode === "games" ? "0" : "30%")}</span>
      <span>{high ?? (mode === "games" ? String(maxGames ?? "") : "70%")}</span>
    </Box>
  </Box>
);
