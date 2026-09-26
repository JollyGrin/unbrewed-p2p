/**
 * The small badges every fighter standee carries, shared between the hero
 * plate and the sidekick token so they read identically: a red heart with the
 * current HP at the upper right, and a slim reach glyph beside it (issue
 * "small red heart badge with HP... slim vertical glyph beside it for the
 * fighter's attack type / range" from the tabletop design brief), plus the
 * per-pick marks and, on a hero, its flag badge and status row.
 *
 * Icons are the SAME `react-icons/tb` glyphs ProHud/HeroPreviewModal already
 * use for reach (`TbBow` ranged, `TbSword` melee/lunge) — no new art, no new
 * dependency.
 *
 * GEOMETRY IS IN PX, NOT REM (#902). Each badge is placed off the edges of the
 * anchor's upright plate, whose foot is the token's centre. The anchor slides
 * the whole badge layer toward the camera until its LOWEST pixel stands clear
 * of the token top (TableStandeeAnchor's `badges`), so that lowest pixel has to
 * be computable: the `*LowestPx` helpers below read the same constants the
 * styles do. (At the default 16px root these are the rem sizes they replace.)
 * Every badge carries `data-fighter-badge` for the occlusion probe.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { TbBow, TbSword } from "react-icons/tb";
import type { ViewFighter } from "@/lib/pro/protocol";
import type { FlagTokenBadge } from "@/lib/pro/heroStateFlags";
import type { FighterStatusBadge } from "@/lib/pro/fighterStatuses";

export type TableBadgeSize = "hero" | "sidekick";

/** The HP heart / reach glyph column, px. `offset` is how far it hangs out
 *  past the plate's top and right edges. */
export const BADGE_COLUMN = {
  hero: { cell: 25.6, gap: 2.4, offset: 8 },
  sidekick: { cell: 19.2, gap: 2.4, offset: 5.6 },
} as const;
/** The hero's flag badge (top-left), px. */
export const FLAG_BADGE = { size: 22.4, offset: 8 } as const;
/** The status row, centred under the foot: how far below it hangs, and a dot. */
export const STATUS_ROW = { drop: 6.4, dot: 17.6, gap: 2.4 } as const;
/** Pick marks: the "reach 2" tag and pick number hang this far below the
 *  foot; the chip hangs lower still. Positions of their BOTTOM edges, px. */
export const PICK_MARK_DROP_PX = 5.6;
export const PICK_CHIP_DROP_PX = 20.8;

/**
 * The lowest pixel of the HP/reach column, px above the plate's foot
 * (negative = below it). The column hangs from the plate's top, so on a low
 * flat-token plate the reach glyph reaches well below the foot.
 */
export const fighterBadgesLowestPx = (plateHeightPx: number, size: TableBadgeSize = "hero"): number => {
  const c = BADGE_COLUMN[size];
  return plateHeightPx + c.offset - (2 * c.cell + c.gap);
};

/** The flag badge's lowest pixel, px above the foot. */
export const flagBadgeLowestPx = (plateHeightPx: number): number =>
  plateHeightPx + FLAG_BADGE.offset - FLAG_BADGE.size;

/** The status row's lowest pixel, px above the foot. */
export const statusRowLowestPx = (): number => -STATUS_ROW.drop;

/** The pick marks' lowest pixel, px above the foot; none shown = +Infinity. */
export const pickMarksLowestPx = ({
  extendedReach,
  badgeNumber,
  chipText,
}: Pick<TableFighterPickMarksProps, "extendedReach" | "badgeNumber" | "chipText">): number => {
  if (chipText) return -PICK_CHIP_DROP_PX;
  if (extendedReach || badgeNumber != null) return -PICK_MARK_DROP_PX;
  return Infinity;
};

/** The lowest any hero plate's badges can reach, whichever are showing:
 *  what a LARGE fighter's name pill has to stay in front of (TableBoard). */
export const heroBadgesDeepestPx = (plateHeightPx: number): number =>
  Math.min(
    fighterBadgesLowestPx(plateHeightPx, "hero"),
    flagBadgeLowestPx(plateHeightPx),
    statusRowLowestPx(),
    -PICK_CHIP_DROP_PX
  );

export interface TableFighterBadgesProps {
  fighter: Pick<ViewFighter, "hp" | "reach">;
  /** Badge scale — the sidekick token is smaller than the hero plate. */
  size?: TableBadgeSize;
}

export const TableFighterBadges = ({ fighter, size = "hero" }: TableFighterBadgesProps) => {
  const c = BADGE_COLUMN[size];
  const cellPx = `${c.cell}px`;
  const fontSize = size === "hero" ? "0.68rem" : "0.55rem";
  return (
    <Flex
      position="absolute"
      top={`${-c.offset}px`}
      right={`${-c.offset}px`}
      direction="column"
      align="center"
      gap={`${c.gap}px`}
      pointerEvents="none"
      zIndex={2}
    >
      {/* HP heart */}
      <Flex
        align="center"
        justify="center"
        flexShrink={0}
        w={cellPx}
        h={cellPx}
        borderRadius="50%"
        bg="#7A1F2B"
        border="1.5px solid rgba(255,255,255,0.85)"
        boxShadow="0 1px 4px rgba(0,0,0,0.7)"
        title={`${fighter.hp} HP`}
        data-fighter-badge="hp"
      >
        <Text fontSize={fontSize} fontWeight="bold" color="#FCEEEE" lineHeight={1}>
          {fighter.hp}
        </Text>
      </Flex>
      {/* reach glyph */}
      <Flex
        align="center"
        justify="center"
        flexShrink={0}
        w={cellPx}
        h={cellPx}
        borderRadius="0.3rem"
        bg="rgba(20,8,24,0.85)"
        border="1px solid rgba(250,235,215,0.35)"
        title={fighter.reach === "RANGED" ? "Ranged" : fighter.reach === "LUNGE" ? "Lunge" : "Melee"}
        data-fighter-badge="reach"
      >
        {fighter.reach === "RANGED" ? (
          <TbBow size={size === "hero" ? "0.8rem" : "0.6rem"} color="#F1E0C1" />
        ) : (
          <TbSword size={size === "hero" ? "0.8rem" : "0.6rem"} color="#F1E0C1" />
        )}
      </Flex>
    </Flex>
  );
};

export interface TableFighterPickMarksProps {
  /** A reach-2 target (extended reach) — the flat board's "reach 2" tag. */
  extendedReach?: boolean;
  /** A numbered pick (e.g. an ordered multi-target prompt). */
  badgeNumber?: number;
  /** The target's chip — a bought-range cost or a defender step-in note. */
  chipText?: string | null;
  playerColor: string;
}

/**
 * The per-pick marks a fighter carries while it is a target: the "reach 2"
 * tag, the pick number and the cost/step-in chip. Shared by the hero plate
 * and the sidekick token so a sidekick target reads exactly like a hero one,
 * as it does on the flat board (#895 — the sidekick dropped all three).
 */
export const TableFighterPickMarks = ({ extendedReach, badgeNumber, chipText, playerColor }: TableFighterPickMarksProps) => (
  <>
    {extendedReach && (
      <Box
        position="absolute"
        bottom={`${-PICK_MARK_DROP_PX}px`}
        right={`${-PICK_MARK_DROP_PX}px`}
        bg="rgba(56,217,232,0.9)"
        color="#0A1418"
        borderRadius="0.2rem"
        px="0.2rem"
        fontSize="0.5rem"
        fontWeight="bold"
        zIndex={2}
        data-pick-mark="reach"
        data-fighter-badge="pick-reach"
      >
        reach 2
      </Box>
    )}

    {badgeNumber != null && (
      <Flex
        position="absolute"
        bottom={`${-PICK_MARK_DROP_PX}px`}
        left={`${-PICK_MARK_DROP_PX}px`}
        w="17.6px"
        h="17.6px"
        borderRadius="50%"
        align="center"
        justify="center"
        bg="brand.surfaceDim"
        color="brand.parchment"
        border={`1.5px solid ${playerColor}`}
        fontSize="0.55rem"
        fontWeight="bold"
        zIndex={2}
        data-pick-mark="number"
        data-fighter-badge="pick-number"
      >
        {badgeNumber}
      </Flex>
    )}

    {chipText && (
      <Text
        position="absolute"
        bottom={`${-PICK_CHIP_DROP_PX}px`}
        left="50%"
        transform="translateX(-50%)"
        whiteSpace="nowrap"
        fontSize="0.55rem"
        bg="rgba(20,8,24,0.85)"
        color="brand.highlight"
        px="0.3rem"
        borderRadius="0.2rem"
        zIndex={2}
        data-pick-mark="chip"
        data-fighter-badge="pick-chip"
      >
        {chipText}
      </Text>
    )}
  </>
);

/** A hero's flag / counter badge (Thetis's tide, druid form, …), top-left. */
export const TableFighterFlagBadge = ({ badge }: { badge: FlagTokenBadge }) => (
  <Box
    position="absolute"
    top={`${-FLAG_BADGE.offset}px`}
    left={`${-FLAG_BADGE.offset}px`}
    minW={`${FLAG_BADGE.size}px`}
    h={`${FLAG_BADGE.size}px`}
    px="0.15rem"
    borderRadius="999px"
    bg={badge.bg}
    color={badge.color}
    border="1.5px solid #fff"
    display="flex"
    alignItems="center"
    justifyContent="center"
    fontSize="0.6rem"
    fontWeight="bold"
    title={badge.title}
    zIndex={2}
    data-fighter-badge="flag"
  >
    {badge.icon}
    {badge.showLabel && <Text as="span">{badge.label}</Text>}
  </Box>
);

/** A hero's status-effect row (Rooted, Meridian, …), centred under the foot. */
export const TableFighterStatusBadges = ({ badges }: { badges: FighterStatusBadge[] }) => (
  <Box
    position="absolute"
    bottom={`${-STATUS_ROW.drop}px`}
    left="50%"
    transform="translateX(-50%)"
    display="flex"
    gap={`${STATUS_ROW.gap}px`}
    zIndex={2}
  >
    {badges.map((sb) => (
      <Box
        key={sb.key}
        w={`${STATUS_ROW.dot}px`}
        h={`${STATUS_ROW.dot}px`}
        borderRadius="50%"
        bg={sb.bg}
        color={sb.color}
        border="1px solid #fff"
        display="flex"
        alignItems="center"
        justifyContent="center"
        fontSize="0.55rem"
        title={sb.title}
        data-fighter-badge="status"
      >
        {sb.icon}
      </Box>
    ))}
  </Box>
);
