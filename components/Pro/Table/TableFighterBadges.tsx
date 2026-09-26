/**
 * The two small badges every fighter standee carries, shared between the hero
 * plate and the sidekick token so they read identically: a red heart with the
 * current HP at the upper right, and a slim reach glyph beside it (issue
 * "small red heart badge with HP... slim vertical glyph beside it for the
 * fighter's attack type / range" from the tabletop design brief).
 *
 * Icons are the SAME `react-icons/tb` glyphs ProHud/HeroPreviewModal already
 * use for reach (`TbBow` ranged, `TbSword` melee/lunge) — no new art, no new
 * dependency.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { TbBow, TbSword } from "react-icons/tb";
import type { ViewFighter } from "@/lib/pro/protocol";

export interface TableFighterBadgesProps {
  fighter: Pick<ViewFighter, "hp" | "reach">;
  /** Badge scale — the sidekick token is smaller than the hero plate. */
  size?: "hero" | "sidekick";
}

export const TableFighterBadges = ({ fighter, size = "hero" }: TableFighterBadgesProps) => {
  const heartPx = size === "hero" ? "1.6rem" : "1.2rem";
  const fontSize = size === "hero" ? "0.68rem" : "0.55rem";
  return (
    <Flex
      position="absolute"
      top={size === "hero" ? "-0.5rem" : "-0.35rem"}
      right={size === "hero" ? "-0.5rem" : "-0.35rem"}
      direction="column"
      align="center"
      gap="0.15rem"
      pointerEvents="none"
      zIndex={2}
    >
      {/* HP heart */}
      <Flex
        align="center"
        justify="center"
        w={heartPx}
        h={heartPx}
        borderRadius="50%"
        bg="#7A1F2B"
        border="1.5px solid rgba(255,255,255,0.85)"
        boxShadow="0 1px 4px rgba(0,0,0,0.7)"
        title={`${fighter.hp} HP`}
      >
        <Text fontSize={fontSize} fontWeight="bold" color="#FCEEEE" lineHeight={1}>
          {fighter.hp}
        </Text>
      </Flex>
      {/* reach glyph */}
      <Flex
        align="center"
        justify="center"
        w={heartPx}
        h={heartPx}
        borderRadius="0.3rem"
        bg="rgba(20,8,24,0.85)"
        border="1px solid rgba(250,235,215,0.35)"
        title={fighter.reach === "RANGED" ? "Ranged" : fighter.reach === "LUNGE" ? "Lunge" : "Melee"}
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
        bottom="-0.35rem"
        right="-0.35rem"
        bg="rgba(56,217,232,0.9)"
        color="#0A1418"
        borderRadius="0.2rem"
        px="0.2rem"
        fontSize="0.5rem"
        fontWeight="bold"
        zIndex={2}
        data-pick-mark="reach"
      >
        reach 2
      </Box>
    )}

    {badgeNumber != null && (
      <Flex
        position="absolute"
        bottom="-0.35rem"
        left="-0.35rem"
        w="1.1rem"
        h="1.1rem"
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
      >
        {badgeNumber}
      </Flex>
    )}

    {chipText && (
      <Text
        position="absolute"
        bottom="-1.3rem"
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
      >
        {chipText}
      </Text>
    )}
  </>
);
