/**
 * Hero-preview modal — an info affordance on hero-select tiles (both /pro
 * and /pro/game) opens this instead of committing to a pick. Shows a unified
 * header (circular token portrait + name + stat pills), flavor blurb, sidekick,
 * special ability, and the full card list from the same deck JSON the picker
 * already fetches (snapshot-first, live-API fallback — see useDeckPreview).
 * Works even for not-yet-converted decks: the community JSON exists on
 * unmatched.cards long before Pro rules do.
 *
 * Token art (issue #260): the hero/sidekick portraits reuse the deck snapshot's
 * `tokenImageUrl` — the SAME field lib/pro/useProCardArt resolves into
 * heroTokenUrl/sidekickTokenUrl for the live board. useProCardArt itself can't
 * run here: it resolves art by mid-match catalog + instance ids that don't exist
 * before a match starts, whereas useDeckPreview has already fetched the identical
 * snapshot whose hero.tokenImageUrl IS what useProCardArt would return. So we
 * read the resolved field off the preview deck rather than re-plumbing the whole
 * catalog machinery into a pre-match surface. FighterTokenPortrait mirrors the
 * board's art-clip + initials fallback so art-less decks look intentional too.
 */
import { ReactNode } from "react";
import { Box, Flex, Modal, ModalBody, ModalCloseButton, ModalContent, ModalOverlay, Tag, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { GiFootprint, GiHearts } from "react-icons/gi";
import { TbBow, TbSword } from "react-icons/tb";
import { CardFace } from "./ProHand";
import { CardPreviewProvider } from "./CardPreview";
import { FighterTokenPortrait } from "./FighterTokenPortrait";
import { useDeckPreview } from "@/lib/pro/useDeckPreview";
import { useDeckStats } from "@/lib/pro/useDeckStats";
import { LARGE_FIGHTER_BLURB } from "@/lib/pro/largeReach";

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
  quickStats?: { hp: number; move: number; reach: "MELEE" | "RANGED" | "LUNGE" };
}

/** Staggered reveal on open — sections rise in sequence for one orchestrated
 *  moment instead of everything snapping in at once (Part 3). The modal unmounts
 *  its content on close, so a fresh open re-fires the animation. */
const riseIn = keyframes`
  from { opacity: 0; transform: translateY(0.55rem); }
  to   { opacity: 1; transform: translateY(0); }
`;

const Reveal = ({ index, children }: { index: number; children: ReactNode }) => (
  <Box sx={{ animation: `${riseIn} 0.38s ease both`, animationDelay: `${index * 0.07}s` }}>
    {children}
  </Box>
);

/** A gold label trailed by a hairline gradient rule, so the sections read as a
 *  designed sequence rather than a stack of unrelated blocks (Part 3). */
const SectionHeading = ({ children }: { children: ReactNode }) => (
  <Flex align="center" gap="0.65rem" mt="1.35rem" mb="0.55rem">
    <Text
      fontFamily="BebasNeueRegular"
      fontSize="0.95rem"
      letterSpacing="0.06em"
      color="brand.accent"
      whiteSpace="nowrap"
    >
      {children}
    </Text>
    <Box flex="1" h="1px" bg="linear-gradient(to right, rgba(224,168,46,0.55), rgba(224,168,46,0))" />
  </Flex>
);

/** Rounded stat chip grouping the icon + value into a pill next to the name. */
const StatPill = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <Flex
    align="center"
    gap="0.3rem"
    px="0.55rem"
    py="0.2rem"
    borderRadius="full"
    bg="whiteAlpha.100"
    border="1px solid"
    borderColor="whiteAlpha.200"
    fontSize="0.85rem"
    fontWeight="bold"
  >
    {icon}
    {children}
  </Flex>
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
  // The deck snapshot only carries `isRanged` (boolean) and so can't express
  // LUNGE (General Grievous); when the live roster's quickStats reports LUNGE,
  // prefer it over the isRanged-derived melee/ranged (issue #288).
  const reach =
    quickStats?.reach === "LUNGE"
      ? "LUNGE"
      : deck
        ? deck.hero.isRanged
          ? "RANGED"
          : "MELEE"
        : quickStats?.reach;
  const isLarge = !!heroId && LARGE_HERO_IDS.has(heroId);

  const sidekick = deck?.sidekick;
  const hasSidekick =
    !!sidekick && (sidekick.name !== "Sidekick" || (!!sidekick.hp && !!sidekick.quantity));

  const cards = (deck?.cards ?? []).filter((c) => !c.isCharacterCard);

  return (
    // Provider hosts the full-res hover/press card preview (issue #167) that
    // CardFace already wires up — inert without a provider, so the modal supplies
    // its own. It wraps the WHOLE Modal (not the ModalBody) because Chakra's
    // ModalContent carries a motion transform, which would become the containing
    // block for the preview's position:fixed overlay and clip it; out here the
    // overlay is fixed to the viewport and floats above the modal, so an enlarged
    // card is never clipped by a neighbor or the modal edge.
    <CardPreviewProvider>
      <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered scrollBehavior="inside">
        <ModalOverlay bg="rgba(20, 8, 24, 0.7)" />
        <ModalContent bg="brand.surface" color="brand.parchment">
          <ModalCloseButton zIndex={2} />
          <ModalBody py="1.5rem">
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

            {/* Unified header: portrait anchored left, name + stat pills beside it. */}
            <Reveal index={0}>
              <Flex align="center" gap="1rem" pr="2rem">
                <FighterTokenPortrait
                  name={deck?.hero.name ?? heroName}
                  artUrl={deck?.hero.tokenImageUrl}
                  size="5rem"
                />
                <Box minW={0}>
                  <Text
                    fontFamily="BebasNeueRegular"
                    fontSize="1.7rem"
                    letterSpacing="0.03em"
                    lineHeight={1.1}
                    color="brand.parchment"
                  >
                    {deck?.hero.name ?? heroName}
                  </Text>
                  {(hp !== undefined || move !== undefined || reach) && (
                    <Flex gap="0.5rem" flexWrap="wrap" alignItems="center" mt="0.5rem">
                      {hp !== undefined && (
                        <StatPill icon={<GiHearts color="#C0392B" size="15px" />}>{hp}</StatPill>
                      )}
                      {move !== undefined && (
                        <StatPill icon={<GiFootprint size="14px" />}>{move}</StatPill>
                      )}
                      {reach && (
                        <StatPill icon={reach === "RANGED" ? <TbBow size="15px" /> : <TbSword size="15px" />}>
                          {reach === "RANGED" ? "ranged" : reach === "LUNGE" ? "lunge" : "melee"}
                        </StatPill>
                      )}
                      {isLarge && (
                        <Tag size="sm" bg="brand.accent" color="brand.surfaceDim" fontWeight={700}>
                          LARGE — 2 spaces
                        </Tag>
                      )}
                    </Flex>
                  )}
                </Box>
              </Flex>

              {/* Standing large-fighter rule (issue #235) — the full sentence that
                  the in-game HUD and attack-reach chip also show, so the 2-space
                  melee reach is explained before the match even starts. Shared copy. */}
              {isLarge && (
                <Text mt="0.6rem" fontSize="0.8rem" color="brand.accent" fontWeight={600}>
                  {LARGE_FIGHTER_BLURB}
                </Text>
              )}

              {deck?.hero.quote?.trim() && (
                <Text mt="0.9rem" fontSize="0.85rem" fontStyle="italic" opacity={0.75} whiteSpace="pre-wrap">
                  {deck.hero.quote.trim()}
                </Text>
              )}
            </Reveal>

            {hasSidekick && (
              <Reveal index={1}>
                <SectionHeading>Sidekick</SectionHeading>
                <Flex align="center" gap="0.75rem">
                  <FighterTokenPortrait
                    name={sidekick!.name}
                    artUrl={sidekick!.tokenImageUrl}
                    size="3.25rem"
                  />
                  <Box minW={0}>
                    <Flex align="center" gap="0.5rem" fontSize="0.9rem" flexWrap="wrap">
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
                  </Box>
                </Flex>
              </Reveal>
            )}

            {deck?.hero.specialAbility?.trim() && (
              <Reveal index={2}>
                <SectionHeading>Special ability</SectionHeading>
                <Text fontSize="0.85rem" whiteSpace="pre-wrap" opacity={0.9}>
                  {deck.hero.specialAbility.trim()}
                </Text>
              </Reveal>
            )}

            {cards.length > 0 && (
              <Reveal index={3}>
                <SectionHeading>Cards ({cards.length})</SectionHeading>
                {/* Legible at rest (Part 2, Ask A): ~8.5rem tiles (hand-card size)
                    in an auto-fill grid so a dense 12-card deck reads without
                    hovering. Hover (Ask B) lifts + tilts + shimmers the tile — the
                    "pick it up" feel — while CardFace's own hover fires the full-res
                    floating preview from the provider above for a comfortable read. */}
                <Box
                  display="grid"
                  gridTemplateColumns="repeat(auto-fill, minmax(8.5rem, 1fr))"
                  gap="0.7rem"
                >
                  {cards.map((card, i) => (
                    <Box
                      key={`${card.title}-${i}`}
                      position="relative"
                      overflow="hidden"
                      borderRadius="0.55rem"
                      cursor="pointer"
                      transition="transform 0.18s ease, box-shadow 0.18s ease"
                      _hover={{
                        transform: "translateY(-0.4rem) scale(1.05) rotate(-1deg)",
                        zIndex: 5,
                        boxShadow: "0 12px 24px rgba(0,0,0,0.55)",
                      }}
                      sx={{
                        aspectRatio: "63 / 88",
                        "&::after": {
                          content: '""',
                          position: "absolute",
                          inset: 0,
                          background:
                            "linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.28) 50%, transparent 62%)",
                          transform: "translateX(-130%)",
                          transition: "transform 0.55s ease",
                          pointerEvents: "none",
                          zIndex: 2,
                        },
                        "&:hover::after": { transform: "translateX(130%)" },
                      }}
                    >
                      <CardFace card={card} fallback={card.title} />
                    </Box>
                  ))}
                </Box>
              </Reveal>
            )}

            {stats && (
              <Reveal index={4}>
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
              </Reveal>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </CardPreviewProvider>
  );
};
