/**
 * The token-rim section of /collection (ticket #614, design doc §10).
 *
 * The card grid is about points you SPEND; this is about points you have
 * EARNED. A token rim is not bought — it unlocks at a threshold and is measured
 * against earned points forever, so buying card art can never walk it back.
 * The only choice the player makes here is whether to wear it.
 *
 * The preview is the real `FighterTokenRim` over the deck's real board
 * portrait, at board scale, so "what will the table see" is answered by looking
 * rather than by imagining. It shows the rim only while the toggle is ON —
 * otherwise the switch would appear to do nothing, and an honest preview of
 * "hidden" is a plain token.
 */
import { Box, Flex, Switch, Text } from "@chakra-ui/react";

import { FighterTokenRim } from "@/components/Pro/FighterTokenRim";
import {
  CosmeticConstants,
  HeroCosmetics,
  rimProgress,
  rimTierName,
} from "@/lib/account/cosmetics";
import { COSMETIC_RIM_PAINTS } from "@/lib/pro/cosmetics";

/** Board-token look, shrunk to a preview: seat disc, white border, portrait. */
const TokenPreview = ({
  tokenUrl,
  initials,
  tier,
}: {
  tokenUrl: string | null;
  initials: string;
  tier: number | null;
}) => {
  const rim = rimTierName(tier);
  return (
    <Flex
      data-testid="token-preview"
      data-cosmetic-tier={rim ?? "none"}
      position="relative"
      align="center"
      justify="center"
      flexShrink={0}
      w="4.5rem"
      h="4.5rem"
      borderRadius="50%"
      // The p1 seat disc + white border, i.e. what the board actually draws.
      bg="#E0A82E"
      border="2px solid #fff"
      boxShadow="0 2px 6px rgba(0,0,0,0.35)"
    >
      {tokenUrl && (
        <Box position="absolute" inset={0} borderRadius="50%" overflow="hidden" zIndex={0}>
          <Box
            as="img"
            src={tokenUrl}
            alt=""
            draggable={false}
            w="100%"
            h="100%"
            sx={{ objectFit: "cover", objectPosition: "center top" }}
          />
          <Box
            position="absolute"
            inset={0}
            bg="radial-gradient(circle at 50% 42%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.35) 100%)"
          />
        </Box>
      )}
      {rim && <FighterTokenRim tier={rim} />}
      <Text
        fontSize="0.9rem"
        fontWeight="bold"
        zIndex={1}
        color={tokenUrl ? "brand.parchment" : "brand.surfaceDim"}
        textShadow={tokenUrl ? "0 1px 3px rgba(0,0,0,0.95)" : undefined}
      >
        {initials}
      </Text>
    </Flex>
  );
};

export const TokenRimPanel = ({
  hero,
  constants,
  tokenUrl,
  initials,
  onToggle,
}: {
  hero: HeroCosmetics;
  constants: CosmeticConstants;
  tokenUrl: string | null;
  initials: string;
  onToggle: (enabled: boolean) => void;
}) => {
  const unlocked = hero.tokenRim.unlockedTier;
  const enabled = hero.tokenRim.enabled;
  const progress = rimProgress(hero.earned, constants.tokenRimThresholds);
  const nextName = rimTierName((progress.tier ?? 0) + 1);
  const wornName = rimTierName(unlocked);
  // The pref is the API's own storage and it accepts writes with telemetry
  // down, so an unknown tier (outage) still leaves the switch usable — the
  // player's rim is whatever it already was, and turning it off must work.
  const canToggle = unlocked === null || unlocked > 0;

  return (
    <Box
      as="section"
      aria-labelledby="collection-token-heading"
      data-testid="collection-token"
      bg="brand.parchment"
      borderRadius="0.75rem"
      p="1.1rem"
      boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
      mb="1rem"
    >
      <Text
        id="collection-token-heading"
        as="h2"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="1.15rem"
        mb="0.6rem"
      >
        Fighter token rim
      </Text>
      <Flex gap="1rem" align="center" flexWrap="wrap">
        <TokenPreview
          tokenUrl={tokenUrl}
          initials={initials}
          tier={enabled ? unlocked : 0}
        />
        <Box flex="1" minW="14rem">
          <Text fontSize="0.9rem" fontWeight={600}>
            {unlocked === null
              ? "Rim unavailable right now"
              : wornName
                ? `${COSMETIC_RIM_PAINTS[wornName].label} rim unlocked`
                : "No rim unlocked yet"}
          </Text>
          <Text fontSize="0.8rem" opacity={0.75} mt="0.15rem">
            {progress.toGo === null || !nextName
              ? unlocked === null
                ? "Your rim is still equipped exactly as you left it."
                : "Top of the ladder — nothing left to unlock."
              : `${progress.toGo} more earned points for the ${COSMETIC_RIM_PAINTS[nextName].label.toLowerCase()} rim.`}
          </Text>
          {progress.nextThreshold !== null && (
            <Box
              mt="0.5rem"
              h="0.4rem"
              w="100%"
              maxW="20rem"
              bg="rgba(72, 40, 79, 0.15)"
              borderRadius="999px"
              overflow="hidden"
              role="presentation"
            >
              <Box
                h="100%"
                w={`${progress.percent}%`}
                bg="brand.accent"
                data-testid="token-rim-progress"
                data-percent={progress.percent}
              />
            </Box>
          )}
          <Flex align="center" gap="0.5rem" mt="0.7rem">
            <Switch
              id="collection-token-rim-switch"
              isChecked={enabled}
              isDisabled={!canToggle}
              onChange={(event) => onToggle(event.target.checked)}
            />
            <Text as="label" htmlFor="collection-token-rim-switch" fontSize="0.85rem">
              Show my rim in games
            </Text>
          </Flex>
          {unlocked !== null && unlocked > 0 && !enabled && (
            <Text fontSize="0.75rem" opacity={0.7} mt="0.3rem">
              Unlocked but hidden — nobody at the table sees it.
            </Text>
          )}
        </Box>
      </Flex>
    </Box>
  );
};
