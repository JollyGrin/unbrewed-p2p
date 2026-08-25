/**
 * "Which of the tiers I've reached do I actually WEAR?" (#705) — the control
 * shared by the token-rim section and the cards section of /collection.
 *
 * The ladder is a progression, but progressing is not the same as preferring:
 * a player who liked silver on Grievous and then unlocked gold was, until this
 * existed, simply moved off it. So the tiers a player has ALREADY REACHED stay
 * available as a display choice, while the ladder itself only ever moves up.
 *
 * Three rules the shape of this control encodes:
 *
 *  - **"Latest" is a rule, not a tier.** It is the stored `null`, it is the
 *    default, and it means "whatever I've reached" — so a player who picks it
 *    keeps being promoted by their own play. Picking a NUMBER opts out of that
 *    until they pick Latest again. Making it a chip rather than an absence is
 *    what lets somebody get back to today's behaviour after wandering off it.
 *  - **Only what's reached is offered.** Locked tiers aren't rendered at all
 *    (not rendered-and-disabled): this is a wardrobe, and a wardrobe showing
 *    clothes you don't own is a shop. The unlock/purchase ceiling is the
 *    caller's to supply, and `lib/account/cosmetics` clamps against it a
 *    second time on the way out, so a stale page can't publish a tier the
 *    player never reached.
 *  - **Buttons, not a `<select>`** — same call the hero picker made (#625).
 *    Four chips that each show their own paint answer "what would that look
 *    like?" at rest; a dropdown answers it one option at a time.
 *
 * It renders NOTHING when there is nothing to choose between (one tier reached,
 * or none): a picker whose every option means the same thing is worse than no
 * picker, and its absence is exactly what a fresh account should see.
 *
 * ⛔ THE INVARIANT — a cosmetic changes what something LOOKS like and nothing
 * else. This picks a paint.
 */
import { Box, Flex, Text } from "@chakra-ui/react";

import { rimTierName } from "@/lib/account/cosmetics";
import { COSMETIC_RIM_PAINTS, COSMETIC_RIM_TIERS } from "@/lib/pro/cosmetics";

/** Below this there is one reachable look, so "Latest" is the only answer. */
export const MIN_PICKABLE_TIERS = 2;

export interface RimTierPickerProps {
  /** Prefix for the test ids and the chip keys — "token" / "cards". */
  id: string;
  /** The group's accessible name, and the caption above it. */
  label: string;
  /** Highest tier reached: unlocked for the token, purchased for the cards. */
  maxTier: number;
  /** The stored choice, or null for "Latest". */
  selectedTier: number | null;
  /** One line under the chips saying what the current choice means. */
  hint?: string;
  disabled?: boolean;
  onSelect: (tier: number | null) => void;
}

const Chip = ({
  testId,
  name,
  active,
  disabled,
  onClick,
}: {
  testId: string;
  /** The tier this chip picks, or null for the "Latest" chip. */
  name: ReturnType<typeof rimTierName>;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Flex
    as="button"
    type="button"
    data-testid={testId}
    data-active={active ? "true" : "false"}
    aria-pressed={active}
    disabled={disabled}
    onClick={onClick}
    align="center"
    gap="0.35rem"
    px="0.55rem"
    py="0.28rem"
    borderRadius="999px"
    fontSize="0.78rem"
    fontWeight={active ? 700 : 500}
    border="1px solid"
    borderColor={active ? "brand.secondary" : "rgba(72, 40, 79, 0.28)"}
    bg={active ? "rgba(72, 40, 79, 0.14)" : "transparent"}
    opacity={disabled ? 0.5 : 1}
    cursor={disabled ? "not-allowed" : "pointer"}
    _hover={disabled ? undefined : { bg: "rgba(72, 40, 79, 0.1)" }}
  >
    {name && (
      // The chip wears its own paint, at the smallest size the band still
      // reads at — the same gradient the rim itself is painted from, so a
      // re-tune of the ladder moves these too.
      <Box
        aria-hidden
        w="0.85rem"
        h="0.85rem"
        borderRadius="50%"
        flexShrink={0}
        background={COSMETIC_RIM_PAINTS[name].ring}
        boxShadow="inset 0 0 0 1px rgba(0,0,0,0.35)"
      />
    )}
    <Text as="span">{name ? COSMETIC_RIM_PAINTS[name].label : "Latest"}</Text>
  </Flex>
);

export const RimTierPicker = ({
  id,
  label,
  maxTier,
  selectedTier,
  hint,
  disabled,
  onSelect,
}: RimTierPickerProps) => {
  if (maxTier < MIN_PICKABLE_TIERS) return null;
  // Clamped to the ladder this client knows: an API that grew a fifth tier
  // would otherwise render two chips with the same name and the same paint
  // (`rimTierName` clamps up). "Latest" still wears it — it always does.
  const pickable = Math.min(maxTier, COSMETIC_RIM_TIERS.length);
  const tiers = Array.from({ length: pickable }, (_, index) => index + 1);

  return (
    <Box mt="0.6rem" data-testid={`${id}-tier-picker`}>
      <Text
        fontSize="0.72rem"
        textTransform="uppercase"
        letterSpacing="0.06em"
        opacity={0.7}
        mb="0.3rem"
        id={`${id}-tier-picker-label`}
      >
        {label}
      </Text>
      <Flex gap="0.35rem" flexWrap="wrap" role="group" aria-labelledby={`${id}-tier-picker-label`}>
        <Chip
          testId={`${id}-tier-latest`}
          name={null}
          active={selectedTier === null}
          disabled={disabled}
          onClick={() => onSelect(null)}
        />
        {tiers.map((tier) => (
          <Chip
            key={tier}
            testId={`${id}-tier-${tier}`}
            name={rimTierName(tier)}
            active={selectedTier === tier}
            disabled={disabled}
            onClick={() => onSelect(tier)}
          />
        ))}
      </Flex>
      {hint && (
        <Text fontSize="0.72rem" opacity={0.7} mt="0.3rem" data-testid={`${id}-tier-hint`}>
          {hint}
        </Text>
      )}
    </Box>
  );
};
