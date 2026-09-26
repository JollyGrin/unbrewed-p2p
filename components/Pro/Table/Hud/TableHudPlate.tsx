/**
 * One seat's plate in a top corner of the tabletop HUD (see lib/pro/tableHud).
 *
 * It carries what a player glances at between actions — which hero, how hurt,
 * and how full the three piles are — and nothing that needs reading: the
 * ability text, counters and the pile contents stay one tap away in the seat
 * sheet the plate opens (the same SeatPlate the corner chips open).
 *
 * The portrait is the hero's own board token, ringed in the seat colour, so it
 * matches the base under that hero's figure on the table. The opponent's plate
 * is mirrored — portrait on the outer edge — so both portraits frame the board
 * and the names face the banner between them.
 */
import { Box, Flex, Image, Text } from "@chakra-ui/react";
import { MoveTimerBar } from "@/components/Pro/ProHud";
import { tokenInitials } from "@/components/Pro/FighterTokenPortrait";

/** How many sidekick hearts a plate spells out before it only counts them. */
const SIDEKICKS_ON_PLATE = 2;

export interface TableHudPlateProps {
  seat: string;
  name: string;
  heroHp: number | null;
  sidekickHps: { id: string; hp: number; defeated: boolean }[];
  portraitUrl: string | null;
  seatColor: string;
  piles: { deck: number; discard: number; hand: number };
  /** this browser's own seat — the parchment rim */
  local: boolean;
  /** it is this seat's turn */
  active: boolean;
  offline: boolean;
  /** which corner: the opponent's plate is mirrored */
  side: "left" | "right";
  /** the move clock, while this seat is on it */
  timer: { deadline: number; totalSeconds: number } | null;
  onOpen: () => void;
}

export const TableHudPlate = ({
  seat,
  name,
  heroHp,
  sidekickHps,
  portraitUrl,
  seatColor,
  piles,
  local,
  active,
  offline,
  side,
  timer,
  onOpen,
}: TableHudPlateProps) => (
  <Flex
    as="button"
    type="button"
    data-table-hud-plate=""
    data-seat={seat}
    data-side={side}
    data-local={local ? "" : undefined}
    data-active={active ? "" : undefined}
    aria-label={`${name} — open seat details`}
    onClick={onOpen}
    position="relative"
    direction={side === "left" ? "row" : "row-reverse"}
    alignItems="center"
    gap="0.55rem"
    minW={0}
    maxW="13.5rem"
    py="0.3rem"
    pl={side === "left" ? "0.3rem" : "0.9rem"}
    pr={side === "left" ? "0.9rem" : "0.3rem"}
    borderRadius="999px"
    pointerEvents="auto"
    color="brand.parchment"
    bg="linear-gradient(180deg, rgba(52, 28, 58, 0.92), rgba(30, 15, 34, 0.92))"
    border="1.5px solid"
    borderColor={local ? "brand.accent" : "rgba(250, 235, 215, 0.28)"}
    // Whose turn it is glows in that seat's colour — the plate lights, not a
    // separate "their turn" tag.
    boxShadow={
      active
        ? `0 0 0 2px ${seatColor}55, 0 0 16px ${seatColor}88, 0 6px 18px rgba(12, 4, 16, 0.55)`
        : "0 6px 18px rgba(12, 4, 16, 0.55)"
    }
    sx={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    overflow="hidden"
  >
    <Flex
      data-plate-portrait=""
      data-seat-color={seatColor}
      flexShrink={0}
      boxSize="2.6rem"
      borderRadius="50%"
      overflow="hidden"
      border="2.5px solid"
      borderColor={seatColor}
      bg="rgba(12, 4, 16, 0.8)"
      alignItems="center"
      justifyContent="center"
    >
      {portraitUrl ? (
        <Image src={portraitUrl} alt="" boxSize="100%" objectFit="cover" draggable={false} />
      ) : (
        <Text fontFamily="BebasNeueRegular" fontSize="1rem" color={seatColor}>
          {tokenInitials(name)}
        </Text>
      )}
    </Flex>
    <Flex direction="column" alignItems={side === "left" ? "flex-start" : "flex-end"} minW={0} gap="0.1rem">
      <Flex direction={side === "left" ? "row" : "row-reverse"} alignItems="baseline" gap="0.4rem" minW={0} maxW="100%">
        <Text
          fontFamily="BebasNeueRegular"
          fontSize="1.15rem"
          lineHeight={1}
          letterSpacing="0.03em"
          noOfLines={1}
          // The name wins the width fight — it is what identifies the seat —
          // so it only yields past its cap; the sidekick hearts squeeze first.
          flexShrink={0}
          maxW="8.2rem"
        >
          {name}
        </Text>
        <Flex alignItems="baseline" gap="0.1rem" flexShrink={0} color="#FF6347">
          <Text as="span" fontSize="0.95rem" lineHeight={1}>
            ♥
          </Text>
          <Text
            as="span"
            fontFamily="BebasNeueRegular"
            fontSize="1.3rem"
            lineHeight={1}
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {heroHp ?? "–"}
          </Text>
        </Flex>
        {sidekickHps.slice(0, SIDEKICKS_ON_PLATE).map((s) => (
          <Text
            key={s.id}
            fontFamily="SpaceGrotesk"
            fontSize="0.68rem"
            lineHeight={1}
            flexShrink={0}
            opacity={s.defeated ? 0.4 : 0.75}
            textDecoration={s.defeated ? "line-through" : undefined}
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            +♥{s.hp}
          </Text>
        ))}
        {sidekickHps.length > SIDEKICKS_ON_PLATE && (
          <Text fontFamily="SpaceGrotesk" fontSize="0.68rem" lineHeight={1} flexShrink={0} opacity={0.75}>
            +{sidekickHps.length - SIDEKICKS_ON_PLATE}
          </Text>
        )}
        {offline && <Box boxSize="0.45rem" borderRadius="999px" bg="#FF6347" flexShrink={0} title="disconnected" />}
      </Flex>
      <Text
        fontFamily="SpaceGrotesk"
        fontSize="0.62rem"
        lineHeight={1.1}
        opacity={0.72}
        whiteSpace="nowrap"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        Deck {piles.deck} · Discard {piles.discard} · Hand {piles.hand}
      </Text>
    </Flex>
    {timer && (
      <Box position="absolute" left="1.2rem" right="1.2rem" bottom="0.1rem" pointerEvents="none">
        <MoveTimerBar deadline={timer.deadline} totalSeconds={timer.totalSeconds} />
      </Box>
    )}
  </Flex>
);
