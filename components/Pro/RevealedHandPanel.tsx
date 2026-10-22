/**
 * "Revealed: <hero>'s hand" — the last Keen Hearing reveal, kept readable after
 * the reveal moment has passed. Renders the SNAPSHOT from `lib/pro/revealedHand`
 * (the cards the reveal event carried, labelled with its turn), never live hand
 * state. Collapsible so it can sit out of the way while planning.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { useState } from "react";
import { colors, fonts } from "@/styles/style";
import { ResolveCard } from "@/lib/pro/useProCardArt";
import { RevealedHand } from "@/lib/pro/revealedHand";
import { CardFace } from "./ProHand";

export const RevealedHandPanel = ({
  revealed,
  heroName,
  resolveCard,
  labelFor,
}: {
  revealed: RevealedHand;
  heroName: string;
  resolveCard: ResolveCard;
  labelFor: (card: string) => string;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <Box
      data-testid="revealed-hand-panel"
      position="fixed"
      top={{ base: "5.75rem", md: "9.5rem" }}
      left="0.75rem"
      zIndex={20}
      maxW="min(22rem, calc(100vw - 1.5rem))"
      bg="brand.surfaceDim"
      border={`1px solid ${colors.brand.primary}`}
      borderRadius="0.5rem"
      p="0.4rem 0.55rem"
    >
      <Flex
        as="button"
        type="button"
        align="center"
        gap="0.3rem"
        w="100%"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        textAlign="left"
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <Text fontFamily={fonts.SpaceGrotesk} fontSize="0.75rem" fontWeight={700}>
          Revealed: {heroName}&apos;s hand
        </Text>
        <Text fontFamily={fonts.SpaceGrotesk} fontSize="0.65rem" opacity={0.7} ml="auto">
          as of turn {revealed.turn}
        </Text>
      </Flex>
      {open && (
        <Flex gap="0.35rem" wrap="wrap" mt="0.4rem">
          {revealed.cards.map((c, i) => (
            <Box key={`${c}-${i}`} w="4.5rem" sx={{ aspectRatio: "63 / 88" }}>
              <CardFace card={resolveCard(c)} fallback={labelFor(c)} />
            </Box>
          ))}
        </Flex>
      )}
    </Box>
  );
};
