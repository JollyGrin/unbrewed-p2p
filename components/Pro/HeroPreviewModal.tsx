/**
 * Hero-preview modal — an info affordance on hero-select tiles (both /pro
 * and /pro/game) opens this instead of committing to a pick. Shows the
 * stats line, flavor blurb, sidekick, special ability, and the full card list from the
 * same deck JSON the picker already fetches (snapshot-first, live-API
 * fallback — see useDeckPreview). Works even for not-yet-converted decks:
 * the community JSON exists on unmatched.cards long before Pro rules do.
 */
import { ReactNode } from "react";
import { Box, Flex, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Tag, Text } from "@chakra-ui/react";
import { GiFootprint, GiHearts } from "react-icons/gi";
import { TbBow, TbSword } from "react-icons/tb";
import { MdSupervisorAccount as IconSidekick } from "react-icons/md";
import { CardFace } from "./ProHand";
import { useDeckPreview } from "@/lib/pro/useDeckPreview";
import { useDeckStats } from "@/lib/pro/useDeckStats";

/**
 * Client-side registry of two-space (LARGE) fighters — no pre-match field
 * exposes this (ViewFighter.tailSpace only appears once a match starts, see
 * protocol.ts v6). Update by hand as more LARGE heroes get converted.
 */
const LARGE_HERO_IDS = new Set(["triceratops"]);

export interface HeroPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** unmatched.cards / snapshot deck id — fetches the full deck JSON */
  deckId: string | null;
  /** display title fallback while the deck loads (or if the fetch fails) */
  heroName: string;
  /** server hero id, when known — used for the LARGE badge and balance profile lookup */
  heroId?: string;
  /** stats already on hand (e.g. from the live roster) shown while the deck loads / on fetch failure */
  quickStats?: { hp: number; move: number; reach: "MELEE" | "RANGED" };
}

const SectionHeading = ({ children }: { children: ReactNode }) => (
  <Text
    fontFamily="BebasNeueRegular"
    fontSize="0.95rem"
    letterSpacing="0.06em"
    color="brand.accent"
    mt="1.25rem"
    mb="0.4rem"
  >
    {children}
  </Text>
);

export const HeroPreviewModal = ({
  isOpen,
  onClose,
  deckId,
  heroName,
  heroId,
  quickStats,
}: HeroPreviewModalProps) => {
  const { data: deck, isLoading } = useDeckPreview(deckId, isOpen);
  const { data: statsFile } = useDeckStats();
  const stats = heroId ? statsFile?.[heroId] : undefined;

  const hp = deck?.hero.hp ?? quickStats?.hp;
  const move = deck?.hero.move ?? quickStats?.move;
  const reach = deck ? (deck.hero.isRanged ? "RANGED" : "MELEE") : quickStats?.reach;
  const isLarge = !!heroId && LARGE_HERO_IDS.has(heroId);

  const sidekick = deck?.sidekick;
  const hasSidekick =
    !!sidekick && (sidekick.name !== "Sidekick" || (!!sidekick.hp && !!sidekick.quantity));

  const cards = (deck?.cards ?? []).filter((c) => !c.isCharacterCard);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered scrollBehavior="inside">
      <ModalOverlay bg="rgba(20, 8, 24, 0.7)" />
      <ModalContent bg="brand.surface" color="brand.parchment">
        <ModalHeader fontFamily="BebasNeueRegular" letterSpacing="0.04em">
          {deck?.hero.name ?? heroName}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb="1.5rem">
          {!deck && isLoading && (
            <Text opacity={0.6} fontSize="0.85rem">
              loading deck…
            </Text>
          )}
          {!deck && !isLoading && !quickStats && (
            <Text opacity={0.6} fontSize="0.85rem">
              preview unavailable — this deck hasn&apos;t been converted yet.
            </Text>
          )}

          {(hp !== undefined || move !== undefined || reach) && (
            <Flex gap="1rem" flexWrap="wrap" alignItems="center">
              {hp !== undefined && (
                <Flex align="center" gap="0.3rem" fontSize="0.9rem" fontWeight="bold">
                  <GiHearts color="#C0392B" size="16px" />
                  <Text>{hp}</Text>
                </Flex>
              )}
              {move !== undefined && (
                <Flex align="center" gap="0.3rem" fontSize="0.9rem" fontWeight="bold">
                  <GiFootprint size="15px" />
                  <Text>{move}</Text>
                </Flex>
              )}
              {reach && (
                <Flex align="center" gap="0.3rem" fontSize="0.9rem" fontWeight="bold">
                  {reach === "RANGED" ? <TbBow size="16px" /> : <TbSword size="16px" />}
                  <Text>{reach === "RANGED" ? "ranged" : "melee"}</Text>
                </Flex>
              )}
              {isLarge && (
                <Tag size="sm" bg="brand.accent" color="brand.surfaceDim" fontWeight={700}>
                  LARGE — 2 spaces
                </Tag>
              )}
            </Flex>
          )}

          {deck?.hero.quote?.trim() && (
            <Text mt="0.9rem" fontSize="0.85rem" fontStyle="italic" opacity={0.75} whiteSpace="pre-wrap">
              {deck.hero.quote.trim()}
            </Text>
          )}

          {hasSidekick && (
            <>
              <SectionHeading>Sidekick</SectionHeading>
              <Flex align="center" gap="0.5rem" fontSize="0.85rem">
                <IconSidekick />
                <Text fontWeight="bold">{sidekick!.name}</Text>
                {sidekick!.hp !== null && (
                  <Flex align="center" gap="0.25rem">
                    <GiHearts color="#C0392B" size="13px" />
                    <Text>{sidekick!.hp}</Text>
                  </Flex>
                )}
                {sidekick!.quantity !== null && sidekick!.quantity > 1 && (
                  <Text opacity={0.75}>×{sidekick!.quantity}</Text>
                )}
                {sidekick!.isRanged ? <TbBow size="13px" /> : <TbSword size="13px" />}
              </Flex>
              {sidekick!.quote?.trim() && (
                <Text mt="0.3rem" fontSize="0.8rem" fontStyle="italic" opacity={0.7} whiteSpace="pre-wrap">
                  {sidekick!.quote.trim()}
                </Text>
              )}
            </>
          )}

          {deck?.hero.specialAbility?.trim() && (
            <>
              <SectionHeading>Special ability</SectionHeading>
              <Text fontSize="0.85rem" whiteSpace="pre-wrap" opacity={0.9}>
                {deck.hero.specialAbility.trim()}
              </Text>
            </>
          )}

          {cards.length > 0 && (
            <>
              <SectionHeading>Cards ({cards.length})</SectionHeading>
              <Flex gap="0.5rem" flexWrap="wrap">
                {cards.map((card, i) => (
                  <Box key={`${card.title}-${i}`} w="6rem" sx={{ aspectRatio: "63 / 88" }}>
                    <CardFace card={card} fallback={card.title} />
                  </Box>
                ))}
              </Flex>
            </>
          )}

          {stats && (
            <>
              <SectionHeading>Balance profile</SectionHeading>
              <Flex direction="column" gap="0.2rem" fontSize="0.85rem">
                {stats.archetype && <Text>Archetype: {stats.archetype}</Text>}
                {stats.powerTier && <Text>Power tier: {stats.powerTier}</Text>}
                {stats.avgGameLengthTurns !== undefined && (
                  <Text>Avg game length: {stats.avgGameLengthTurns} turns</Text>
                )}
                {stats.bestMatchup && <Text>Best matchup: {stats.bestMatchup}</Text>}
                {stats.worstMatchup && <Text>Worst matchup: {stats.worstMatchup}</Text>}
              </Flex>
              <Text mt="0.4rem" fontSize="0.7rem" opacity={0.55}>
                Bot-simulated digest — directional, not a guarantee.
              </Text>
            </>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
