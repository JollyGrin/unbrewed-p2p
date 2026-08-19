/**
 * The card-set grid on /collection (ticket #614): one cell per unique card in a
 * hero's deck, showing what that card looks like RIGHT NOW and what the next
 * step up its ladder costs.
 *
 * Three things this file deliberately does not do:
 *
 *  - **No mock CSS.** Each thumbnail is the real `Card` renderer wearing the
 *    real `CardRim` (via `withRimTier`, the same seam /pro paints through), so
 *    what a player sees here is what an opponent will see across the table. A
 *    hand-rolled gradient preview would drift from the ladder the day someone
 *    re-tunes it.
 *  - **No skipping steps.** The button always buys `currentTier + 1`; the
 *    server enforces the same rule inside its transaction, so a stale page
 *    gets an honest 422 rather than a surprise purchase.
 *  - **No `window.confirm`.** Spending points is irreversible, so it takes two
 *    clicks — but the second one is an in-page row, not a browser modal that
 *    blocks the tab and reads as a phishing prompt.
 *
 * A MIXED deck is the normal state (design doc §4d): most cells are base art,
 * a few wear rims, and the grid must read as progress rather than damage.
 */
import { useState } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";

import { Card } from "@/components/CardFactory/Card";
import {
  CosmeticConstants,
  HeroCosmetics,
  cardTier,
  nextTierCost,
  rimTierName,
} from "@/lib/account/cosmetics";
import { CardSet, MAX_CARD_KEY_LENGTH } from "@/lib/collection/useHeroDeck";
import { COSMETIC_RIM_PAINTS } from "@/lib/pro/cosmetics";
import { withRimTier } from "@/lib/pro/cardAppearance";

/** "Base" / "Bronze" / … — the label under a thumbnail. */
export const tierLabel = (tier: number): string => {
  const name = rimTierName(tier);
  return name ? COSMETIC_RIM_PAINTS[name].label : "Base";
};

export interface CardSetGridProps {
  set: CardSet;
  currentTier: number;
  /** Cost of the next step, or null when the card is fully upgraded. */
  cost: number | null;
  /** Points the hero has left, or null while they're unknown (outage). */
  available: number | null;
  /** False during an outage or while another spend is in flight. */
  canSpend: boolean;
  onUpgrade: (set: CardSet, tier: number) => void;
}

const CardSetCell = ({
  set,
  currentTier,
  cost,
  available,
  canSpend,
  onUpgrade,
}: CardSetGridProps) => {
  const [confirming, setConfirming] = useState(false);
  const nextTier = currentTier + 1;
  const maxed = cost === null;
  // A title past the API's key bound can never be bought; saying so beats
  // firing a request that comes back looking like an outage.
  const tooLong = set.key.length > MAX_CARD_KEY_LENGTH;
  const affordable = cost !== null && available !== null && available >= cost;
  const enabled = canSpend && !maxed && !tooLong && affordable;

  return (
    <Box
      data-testid={`card-set-${set.key}`}
      data-tier={currentTier}
      w={{ base: "8.5rem", sm: "9.5rem" }}
      bg="rgba(72, 40, 79, 0.06)"
      borderRadius="0.6rem"
      p="0.5rem"
      // Column + `mt="auto"` on the action below: titles wrap to one or two
      // lines, and a row of buttons at different heights reads as a broken
      // grid rather than as a deck.
      display="flex"
      flexDirection="column"
    >
      <Box w="100%" sx={{ aspectRatio: "63 / 88" }} mb="0.45rem">
        {/* The real renderer, wearing the real rim — see the module note. */}
        <Card card={withRimTier(set.card, rimTierName(currentTier))} />
      </Box>
      <Text fontSize="0.8rem" fontWeight={700} lineHeight="1.15" noOfLines={2}>
        {set.title}
      </Text>
      <Text fontSize="0.72rem" opacity={0.75}>
        {tierLabel(currentTier)}
        {set.quantity > 1 ? ` · ×${set.quantity}` : ""}
      </Text>

      {maxed ? (
        <Text fontSize="0.72rem" opacity={0.7} mt="auto" pt="0.35rem">
          Fully upgraded
        </Text>
      ) : confirming ? (
        <Box mt="auto" pt="0.35rem">
          <Text fontSize="0.72rem" mb="0.3rem">
            Spend {cost} points for {tierLabel(nextTier).toLowerCase()}?
          </Text>
          <Flex gap="0.3rem">
            <Button
              size="xs"
              flex="1"
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              isDisabled={!enabled}
              onClick={() => {
                setConfirming(false);
                onUpgrade(set, nextTier);
              }}
            >
              Confirm
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </Flex>
        </Box>
      ) : (
        <Box mt="auto" pt="0.35rem">
          <Button
            size="xs"
            w="100%"
            variant="outline"
            borderColor="brand.secondary"
            color="brand.secondary"
            _hover={{ bg: "rgba(72, 40, 79, 0.1)" }}
            isDisabled={!enabled}
            onClick={() => setConfirming(true)}
          >
            {`Upgrade · ${cost}`}
          </Button>
          {tooLong ? (
            <Text fontSize="0.68rem" opacity={0.7} mt="0.2rem">
              This card&apos;s title is too long to upgrade.
            </Text>
          ) : canSpend && !affordable ? (
            <Text fontSize="0.68rem" opacity={0.7} mt="0.2rem">
              {available === null
                ? "Points unavailable"
                : `${cost - available} more to go`}
            </Text>
          ) : null}
        </Box>
      )}
    </Box>
  );
};

export const CardSetGrid = ({
  sets,
  hero,
  constants,
  canSpend,
  loading,
  onUpgrade,
}: {
  sets: CardSet[];
  hero: HeroCosmetics;
  constants: CosmeticConstants;
  canSpend: boolean;
  loading: boolean;
  onUpgrade: (set: CardSet, tier: number) => void;
}) => {
  if (loading) {
    return (
      <Text fontSize="0.85rem" opacity={0.7}>
        Loading this deck…
      </Text>
    );
  }
  if (sets.length === 0) {
    return (
      <Text fontSize="0.85rem" opacity={0.7}>
        This deck&apos;s art isn&apos;t bundled with the site, so there is nothing
        to show here yet. Your points are safe.
      </Text>
    );
  }
  return (
    <Flex flexWrap="wrap" gap="0.6rem">
      {sets.map((set) => {
        const currentTier = cardTier(hero, set.key);
        return (
          <CardSetCell
            key={set.key}
            set={set}
            currentTier={currentTier}
            cost={nextTierCost(constants, currentTier)}
            available={hero.available}
            canSpend={canSpend}
            onUpgrade={onUpgrade}
          />
        );
      })}
    </Flex>
  );
};
