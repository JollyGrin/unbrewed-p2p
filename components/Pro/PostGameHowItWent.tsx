/**
 * The post-game panel's "How it went" card (p2p #1398, feature/end-screen
 * part 2 of 3). Pure presentation: the page derives the numbers
 * (lib/pro/gameStats.ts) and the panel reads them for its seat; this draws
 * them.
 *
 *   panel — "HOW IT WENT", a 4-column stat row (damage dealt, damage taken,
 *           biggest hit · tN, first blood · who), then a per-turn strip: one
 *           bar pair per turn, light for damage dealt that turn, dim for
 *           damage taken, "turn 1 … turn N" under it.
 *   sheet — the phone's 4 tiles in one row (dealt, taken, big hit, clock),
 *           no strip; first player as a quiet footer when known.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import type { SideSummary } from "@/lib/pro/gameStats";

export interface PostGameHowItWentProps {
  summary: SideSummary;
  layout: "panel" | "sheet";
  /** `mm:ss` of the client-observed clock, or null when the page has no start stamp. The sheet's 4th tile. */
  clock: string | null;
  /** How the caption names the seat that drew first blood: "you" / "bot" / their name. Null = no dealer known. */
  firstBloodBy: string | null;
  /** How the footer names the seat that moved first (sheet only — the panel puts it in the meta column). */
  firstPlayer: string | null;
}

const DEALT = "#E7CC98";
const TAKEN = "rgba(250, 235, 215, 0.3)";
const CAPTION = "rgba(250, 235, 215, 0.6)";

const Header = () => (
  <Text fontFamily="ArchivoNarrow" fontSize="0.78rem" letterSpacing="0.14em" textTransform="uppercase" color={CAPTION} fontWeight={600}>
    How it went
  </Text>
);

const Stat = ({ value, caption, stat }: { value: string; caption: string; stat: string }) => (
  <Flex direction="column" minW={0} data-testid="how-it-went-stat" data-stat={stat}>
    <Text fontFamily="LeagueGothic" fontSize="2.1rem" lineHeight="1" color="brand.parchment" sx={{ fontVariantNumeric: "tabular-nums" }}>
      {value}
    </Text>
    <Text fontSize="11px" lineHeight="1.3" color={CAPTION} noOfLines={1} mt="0.2rem">
      {caption}
    </Text>
  </Flex>
);

/** One bar pair per turn, scaled to the biggest single-turn figure on either side. */
const TurnStrip = ({ perTurn }: { perTurn: SideSummary["perTurn"] }) => {
  const n = perTurn.length;
  if (n === 0) return null;
  const max = Math.max(1, ...perTurn.map((t) => Math.max(t.dealt, t.taken)));
  const H = 48;
  return (
    <Flex direction="column" gap="0.3rem" data-testid="how-it-went-strip">
      <Flex align="flex-end" gap={n > 24 ? "2px" : "4px"} h={`${H}px`} borderBottom="1px solid rgba(231, 204, 152, 0.18)">
        {perTurn.map((t) => (
          <Flex
            key={t.turn}
            flex="1 1 0"
            minW={0}
            align="flex-end"
            gap="1px"
            h="100%"
            data-testid="how-it-went-bar"
            data-turn={t.turn}
            data-dealt={t.dealt}
            data-taken={t.taken}
            title={`turn ${t.turn}: dealt ${t.dealt}, took ${t.taken}`}
          >
            <Box flex="1 1 0" h={`${Math.round((t.dealt / max) * H)}px`} bg={DEALT} borderRadius="1px 1px 0 0" />
            <Box flex="1 1 0" h={`${Math.round((t.taken / max) * H)}px`} bg={TAKEN} borderRadius="1px 1px 0 0" />
          </Flex>
        ))}
      </Flex>
      <Flex justify="space-between" fontSize="11px" color={CAPTION}>
        <Text as="span">turn 1</Text>
        {n > 1 && <Text as="span">turn {n}</Text>}
      </Flex>
    </Flex>
  );
};

export const PostGameHowItWent = ({ summary, layout, clock, firstBloodBy, firstPlayer }: PostGameHowItWentProps) => {
  const panel = layout === "panel";
  const { dealt, taken, biggestHit, firstBlood, perTurn } = summary;
  const bigHit = { value: biggestHit ? String(biggestHit.amount) : "—", stat: "biggest-hit" };
  const stats = panel
    ? [
        { value: String(dealt), caption: "damage dealt", stat: "dealt" },
        { value: String(taken), caption: "damage taken", stat: "taken" },
        { ...bigHit, caption: biggestHit ? `biggest hit · t${biggestHit.turn}` : "biggest hit" },
        {
          value: firstBlood ? `t${firstBlood.turn}` : "—",
          caption: firstBlood && firstBloodBy ? `first blood · ${firstBloodBy}` : "first blood",
          stat: "first-blood",
        },
      ]
    : [
        { value: String(dealt), caption: "dealt", stat: "dealt" },
        { value: String(taken), caption: "taken", stat: "taken" },
        { ...bigHit, caption: biggestHit ? `big hit · t${biggestHit.turn}` : "big hit" },
        ...(clock ? [{ value: clock, caption: "clock", stat: "clock" }] : []),
      ];

  return (
    <Flex
      direction="column"
      gap={panel ? "0.75rem" : "0.55rem"}
      p={panel ? "0.85rem 1rem" : "0.65rem 0.75rem"}
      borderRadius="10px"
      bg="rgba(20, 8, 24, 0.65)"
      border="1px solid rgba(231, 204, 152, 0.2)"
      data-testid="how-it-went"
      data-layout={layout}
    >
      <Header />
      <Box display="grid" gridTemplateColumns={`repeat(${stats.length}, minmax(0, 1fr))`} gap="0.6rem">
        {stats.map((s) => (
          <Stat key={s.stat} {...s} />
        ))}
      </Box>
      {panel && <TurnStrip perTurn={perTurn} />}
      {!panel && firstPlayer && (
        <Text fontSize="11px" color={CAPTION} data-testid="post-game-first-player">
          {firstPlayer} moved first
        </Text>
      )}
    </Flex>
  );
};
