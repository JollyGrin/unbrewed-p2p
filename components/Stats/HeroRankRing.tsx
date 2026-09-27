/**
 * A roster slot: the hero token ringed in its hero-rank colour (Tried /
 * Bronze / Silver / Gold), name and "Silver · 24" underneath. A hero never
 * played is greyed out with a faint ring and "Not played". Thresholds and
 * colours come from lib/stats/heroRank — the one place they are defined.
 */
import { Box } from "@chakra-ui/react";

import { HERO_RANKS, heroRank } from "@/lib/stats/heroRank";
import { heroDisplayName } from "@/lib/stats/roster";

import { HeroToken, HeroTokenSize } from "./HeroToken";
import { INK, INK_SOFT } from "./tokens";

export interface HeroRankRingProps {
  heroId: string;
  heroName?: string | null;
  games: number;
  size?: HeroTokenSize;
  /** Show name + rank caption under the token. */
  labelled?: boolean;
}

export const HeroRankRing = ({ heroId, heroName, games, size = 72, labelled = true }: HeroRankRingProps) => {
  const rank = heroRank(games);
  const name = heroDisplayName(heroId, heroName);
  const caption = rank ? `${rank.name} · ${games}` : "Not played";
  return (
    <Box
      data-testid="hero-rank-ring"
      data-rank={rank?.name ?? "none"}
      title={rank ? `${name}: ${games} ${games === 1 ? "game" : "games"} · ${rank.name}` : `${name}: not played yet`}
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="6px"
      color={INK}
      minW={0}
    >
      <HeroToken
        heroId={heroId}
        heroName={heroName}
        size={size}
        ring={{ color: rank ? rank.ring : "rgba(72,40,79,0.2)", width: size >= 64 ? 4 : 3 }}
        muted={!rank}
        decorative={labelled}
      />
      {labelled && (
        <>
          <Box fontSize="12px" fontWeight={700} textAlign="center" lineHeight={1.2} h="29px" overflow="hidden" opacity={rank ? 1 : 0.55}>
            {name}
          </Box>
          <Box fontFamily="ArchivoNarrow" fontSize="11px" letterSpacing="0.06em" textTransform="uppercase" color={INK_SOFT}>
            {caption}
          </Box>
        </>
      )}
    </Box>
  );
};

/** "Hero rank" key: one ring per tier with its threshold. */
export const HeroRankLegend = () => (
  <Box display="flex" flexWrap="wrap" gap={{ base: "10px 16px", md: "24px" }} fontSize="13px" color={INK_SOFT}>
    <Box fontWeight={700} color={INK}>
      Hero rank
    </Box>
    {HERO_RANKS.map((tier) => (
      <Box key={tier.name} display="flex" gap="6px" alignItems="center">
        <Box as="span" w="14px" h="14px" borderRadius="50%" boxSizing="border-box" border={`3px solid ${tier.ring}`} />
        {tier.name} · {tier.minGames} {tier.minGames === 1 ? "game" : "games"}
      </Box>
    ))}
  </Box>
);
