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
 *
 * Cosmetics (issue #623, epic #610): a signed-in player who owns an upgrade on
 * THIS hero gets a "Show my upgrades" switch, default on, that paints their
 * owned rims on the very cards and token they will take into a game. It renders
 * through the REAL treatment components (`withRimTier` -> `CardRim`,
 * `FighterTokenRim`) rather than a preview look-alike, so /collection, this
 * modal and the table can never drift apart on what a tier looks like.
 *
 * Attribution (issue #665): the header carries the same shared `DeckAttribution`
 * credit the /pro roster tile and the /pro/game hero splash render, resolved from
 * the POPULAR_DECKS entry whose id IS this modal's `deckId` (both call sites pass
 * a tile id). One resolver, `deckAttributionHref`, decides where it points, so a
 * deck credited somewhere other than its unmatched.cards mirror — Skull Kid, whose
 * authors published on the-unmatched.club — cannot link to the club on the tile and
 * to unmatched.cards here. A served hero with no tile entry simply gets no credit
 * line, exactly as before.
 *
 * The loadout is strictly ADDITIVE and strictly late: `useHeroPreviewLoadout`
 * is gated on `isOpen`, never blocks a render, and answers null for a guest,
 * for a hero with nothing bought, and for an unreachable API — in all three the
 * modal is byte-identical to the pre-#623 one, which is what keeps the preview
 * working for not-yet-converted community decks that have no account story at
 * all.
 */
import { ReactNode, useEffect, useState } from "react";
import {
  Box,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  Switch,
  Tag,
  Text,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { GiFootprint, GiHearts } from "react-icons/gi";
import { TbBow, TbSword } from "react-icons/tb";
import { CardFace } from "./ProHand";
import type { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { DeckAttribution } from "./DeckAttribution";
import { CardPreviewProvider } from "./CardPreview";
import { FighterTokenPortrait } from "./FighterTokenPortrait";
import {
  useHeroPreviewLoadout,
  type HeroPreviewLoadout,
} from "@/lib/account/useHeroPreviewLoadout";
import { norm, withRimTier } from "@/lib/pro/cardAppearance";
import { useDeckPreview } from "@/lib/pro/useDeckPreview";
import { useDeckStats } from "@/lib/pro/useDeckStats";
import { LARGE_FIGHTER_BLURB } from "@/lib/pro/largeReach";
import { POPULAR_DECKS } from "@/lib/constants/top-decks";

/**
 * Client-side registry of two-space (LARGE) HEROES — no pre-match field exposes
 * size (ViewFighter.tailSpace only appears once a match starts, see protocol.ts
 * v6), so unlike every in-game surface this one cannot be data-driven and must
 * be extended by hand as more LARGE heroes are converted. Kong shipped missing
 * from it (issue #549): his preview showed no badge and no rule line, so a
 * player picking him first met the 2-space reach mid-match.
 *
 * KNOWN LIMITATION — this is keyed on the HERO id, so a deck whose large fighter
 * is a SIDEKICK gets no pre-match signal at all. Batman's Batmobile is LARGE
 * (engine data/heroes/batman.rules.ts) and "batman" does not belong in this set:
 * adding it would badge the hero himself, who is a normal fighter, and print a
 * rule line about the wrong body. Fixing that needs a per-fighter size in the
 * preview data, not another entry here.
 *
 * HeroPreviewModal.test.tsx pins both branches; keep entries in sync with the
 * engine's `size: 'LARGE'` heroes.
 */
const LARGE_HERO_IDS = new Set(["triceratops", "king-kong"]);

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

/**
 * The deck's card faces as a responsive grid of hand-card-sized tiles. Shared by
 * the deck list and the LINKED-cards list (issue #671) so both read identically —
 * same tile size, same hover lift, same cosmetic-rim seam.
 */
const CardGrid = ({
  cards,
  worn,
}: {
  cards: DeckImportCardType[];
  worn: HeroPreviewLoadout | null;
}) => (
  <Box
    display="grid"
    gridTemplateColumns="repeat(auto-fill, minmax(8.5rem, 1fr))"
    gap="0.7rem"
  >
    {cards.map((card, i) => (
      <Box
        key={`${card.title}-${i}`}
        // The card SET key — `norm(title)`, the same key the art
        // snapshot, the rim registry and the API's `cardKey` all
        // agree on. Rendered so a test (and a human with devtools)
        // can tell which cell is which without reading art.
        data-card-key={norm(card.title)}
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
        {/* The REAL treatment, through the same seam /pro and
            /collection paint through: `withRimTier` stamps the
            tier and `Card` -> `CardRim` draws it. An un-upgraded
            card (and every card with the toggle off) is handed
            back untouched, by reference. */}
        <CardFace
          card={withRimTier(card, worn?.cardRims[norm(card.title)] ?? null)}
          fallback={card.title}
        />
      </Box>
    ))}
  </Box>
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
  // Null for a guest, for a hero with nothing bought, and for an API that
  // didn't answer — the three cases where this modal must look exactly as it
  // did before cosmetics existed.
  const loadout = useHeroPreviewLoadout(heroId, isOpen);
  const [showUpgrades, setShowUpgrades] = useState(true);
  // Default ON per open: seeing the rims is what a player opened this for, and
  // toggling off is a deliberate "show me the base art" comparison rather than
  // a preference to carry into the next hero they inspect.
  useEffect(() => {
    if (isOpen) setShowUpgrades(true);
  }, [isOpen, heroId]);
  const worn = showUpgrades ? loadout : null;
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
  // The tile entry behind this deck id, purely for the author credit. A hero the
  // server serves without a POPULAR_DECKS row has nobody to credit — undefined,
  // and the credit line is skipped.
  const tile = deckId ? POPULAR_DECKS.find((d) => d.id === deckId) : undefined;

  const sidekick = deck?.sidekick;
  // Two "no sidekick" shapes ride the wire: the unmatched.cards API emits a BLANK
  // stub ({ name: "", hp: null, quantity: 0 } — Jason Voorhees, DOPE) while the
  // Maker emits a NAMED one ({ name: "Sidekick", quantity: 0 } — King Kong, kdKM).
  // The old test (name !== "Sidekick" || (hp && quantity)) showed a phantom section
  // for the blank stub: a "?" portrait and the hero quote with no fighter behind it.
  // A real sidekick has fighters on the board (clone tokens: nameless, quantity 6)
  // or is a named, non-"Sidekick" character (Momo: name + hp).
  const hasSidekick =
    !!sidekick &&
    ((sidekick.quantity ?? 0) > 0 || (!!sidekick.name?.trim() && sidekick.name !== "Sidekick"));

  const cards = (deck?.cards ?? []).filter((c) => !c.isCharacterCard);
  const ruleCards = (deck?.ruleCards ?? []).filter((r) => r.content?.trim());
  // Printed cards that are NOT in the deck (issue #671) — Boba Fett's SEISMIC
  // CHARGE, which *Slave I* names. Never drawn, so they are listed apart rather
  // than inflating the deck's own card count.
  const extraCards = deck?.extraCards ?? [];

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
                  // HERO only. The board paints the token rim on the hero's head
                  // segment and nothing else (ProBoard, design doc §10b defers
                  // sidekick cosmetics), so rimming the sidekick portrait here
                  // would preview a reward that never appears at the table.
                  rimTier={worn?.tokenRim ?? null}
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
                  {tile && (
                    <DeckAttribution
                      deck={tile}
                      fontSize="0.75rem"
                      fontStyle="normal"
                      opacity={0.7}
                      mt="0.5rem"
                      fontFamily="SpaceGrotesk"
                    />
                  )}
                </Box>
              </Flex>

              {/* "Show my upgrades" (issue #623) — present ONLY when this
                  player owns something on this hero, so it never advertises a
                  store to somebody with nothing in it. Default on; off is the
                  before/after comparison against base art. */}
              {loadout && (
                <Flex
                  data-testid="hero-preview-upgrades"
                  data-showing={showUpgrades ? "on" : "off"}
                  align="center"
                  gap="0.55rem"
                  mt="0.9rem"
                  px="0.7rem"
                  py="0.35rem"
                  w="fit-content"
                  borderRadius="full"
                  bg="whiteAlpha.100"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                >
                  <Switch
                    id="hero-preview-upgrades-switch"
                    size="sm"
                    isChecked={showUpgrades}
                    onChange={(event) => setShowUpgrades(event.target.checked)}
                  />
                  <Text
                    as="label"
                    htmlFor="hero-preview-upgrades-switch"
                    fontSize="0.8rem"
                    cursor="pointer"
                    userSelect="none"
                  >
                    Show my upgrades
                  </Text>
                </Flex>
              )}

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

            {/* Deck-level "extra rules" cards (issue #372) — e.g. Clone Troopers'
                6-token board cap. Distinct from hero.specialAbility above; content
                preserves its \n line breaks. Decks without ruleCards render nothing. */}
            {ruleCards.length > 0 && (
              <Reveal index={3}>
                {ruleCards.map((rule, i) => (
                  <Box key={`${rule.title}-${i}`}>
                    <SectionHeading>{rule.title || "Extra rules"}</SectionHeading>
                    <Text fontSize="0.85rem" whiteSpace="pre-wrap" opacity={0.9}>
                      {rule.content.trim()}
                    </Text>
                  </Box>
                ))}
              </Reveal>
            )}

            {cards.length > 0 && (
              <Reveal index={4}>
                <SectionHeading>Cards ({cards.length})</SectionHeading>
                {/* Legible at rest (Part 2, Ask A): ~8.5rem tiles (hand-card size)
                    in an auto-fill grid so a dense 12-card deck reads without
                    hovering. Hover (Ask B) lifts + tilts + shimmers the tile — the
                    "pick it up" feel — while CardFace's own hover fires the full-res
                    floating preview from the provider above for a comfortable read. */}
                <CardGrid cards={cards} worn={worn} />
              </Reveal>
            )}

            {/* Printed cards that are NOT in the deck (issue #671): Boba Fett's
                SEISMIC CHARGE, which *Slave I* names and the engine opens a real
                combat with. Listed apart from the deck so the "Cards (14)" count
                stays the deck's own, but readable before the pick — a card that can
                hit for 6 out of nowhere should not be a surprise. */}
            {extraCards.length > 0 && (
              <Reveal index={5}>
                <SectionHeading>Linked cards ({extraCards.length})</SectionHeading>
                <Text mb="0.5rem" fontSize="0.72rem" opacity={0.65}>
                  Printed on another card, never shuffled into the deck.
                </Text>
                <CardGrid cards={extraCards} worn={worn} />
              </Reveal>
            )}

            {stats && (
              <Reveal index={6}>
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
