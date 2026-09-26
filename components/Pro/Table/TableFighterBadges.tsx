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
import { Flex, Text } from "@chakra-ui/react";
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
