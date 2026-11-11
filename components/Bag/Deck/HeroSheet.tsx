import { Fragment, useLayoutEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { FaHeart } from "react-icons/fa";
import { GiFootprint } from "@/components/Icons/gi";
import { LuSwords } from "react-icons/lu";
import { TbArcheryArrow } from "react-icons/tb";
import { MdSupervisorAccount as IconSidekick } from "react-icons/md";
import {
  DeckImportCardType,
  DeckImportType,
  UnmatchedCardType,
} from "@/components/DeckPool/deck-import.type";
import {
  hasFieldedSidekick,
  toPoolExtraCharacters,
} from "@/components/DeckPool/PoolFns";
import { normalizeCardType } from "@/components/DeckPool/cardType";
import { httpsUpgrade } from "@/lib/tts/parse-tts";
import { EditCardbackModal } from "./EditCardback";
import { EditHeroModal } from "./EditHeroInfo";
import { EditSavedTokensModal } from "./EditSavedTokens";

/**
 * The hero sheet (#1576): the deck's summary above the card grid — cardback
 * portrait, name, stat chips, labelled special ability, clamped notes and a
 * card-type composition bar. Replaces the old parchment `HeroCard`.
 *
 * `onSave` is what the Hero info / Cardback / Tokens editors persist through;
 * without it (a read-only host) those controls are not offered.
 */

const TYPE_ORDER: UnmatchedCardType[] = [
  "attack",
  "versatile",
  "defence",
  "scheme",
];
// card.factory draws type art, not a type colour, so there is nothing to reuse.
const TYPE_COLOR: Record<UnmatchedCardType, string> = {
  attack: "#C8333A",
  versatile: "#6B3FA0",
  defence: "#3C6BA8",
  scheme: "#D9A133",
};

/** Counts per card type, weighted by `quantity`; hero/rule cards are not in the draw deck. */
export const deckComposition = (cards: DeckImportCardType[] = []) => {
  const counts: Record<UnmatchedCardType, number> = {
    attack: 0,
    versatile: 0,
    defence: 0,
    scheme: 0,
  };
  let total = 0;
  let unique = 0;
  for (const card of cards) {
    if (card.isCharacterCard) continue;
    const quantity = card.quantity ?? 1;
    unique += 1;
    total += quantity;
    counts[normalizeCardType(card.type)] += quantity;
  }
  return { counts, total, unique };
};

export const IsRanged = ({ isRanged }: { isRanged?: boolean }) => (
  <Tooltip label={isRanged ? "Is Ranged" : "Is Meele"}>
    <span>{isRanged ? <TbArcheryArrow /> : <LuSwords />}</span>
  </Tooltip>
);

const Chip = ({ children }: { children: React.ReactNode }) => (
  <Flex
    as="span"
    align="center"
    gap="0.4rem"
    fontSize="0.8rem"
    fontWeight={700}
    bg="rgba(0,0,0,0.35)"
    border="1px solid rgba(255,255,255,0.12)"
    borderRadius="full"
    px="0.65rem"
    py="0.15rem"
    whiteSpace="nowrap"
  >
    {children}
  </Flex>
);

const Num = ({ children }: { children: React.ReactNode }) => (
  <Box as="b" color="brand.accent">
    {children}
  </Box>
);

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Plain text with bare URLs turned into links (notes are free text). */
const Linkified = ({ text }: { text: string }) => (
  <>
    {text.split(URL_RE).map((raw, i) => {
      if (i % 2 === 0) return <Fragment key={i}>{raw}</Fragment>;
      // "see https://x.com/a." — the sentence's full stop is not part of the link
      const part = raw.replace(/[.,;:!?)\]}]+$/, "");
      const tail = raw.slice(part.length);
      return (
        <Fragment key={i}>
          <Box
            as="a"
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            color="brand.accent"
            textDecoration="underline"
            wordBreak="break-all"
          >
            {part}
          </Box>
          {tail}
        </Fragment>
      );
    })}
  </>
);

/** Two lines, then "Read the deck notes ▾" opens it inline — never an inner scroll box. */
const DeckNotes = ({ note }: { note: string }) => {
  const [open, setOpen] = useState(false);
  const [canExpand, setCanExpand] = useState(true);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    // Only hide the toggle when we can see the note already fits in two lines
    // (jsdom reports 0 for both, which keeps it). Re-measured on resize, since
    // a narrower column can push a short note past two lines.
    const measure = () => {
      if (el.clientHeight > 0)
        setCanExpand(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [note, open]);

  return (
    <Box mt="0.6rem">
      <Text
        ref={ref}
        fontSize="0.85rem"
        opacity={0.8}
        whiteSpace="pre-wrap"
        wordBreak="break-word"
        noOfLines={open ? undefined : 2}
      >
        <Linkified text={note} />
      </Text>
      {(canExpand || open) && (
        <Button
          variant="link"
          size="xs"
          mt="0.15rem"
          color="brand.accent"
          fontWeight={600}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide the deck notes ▴" : "Read the deck notes ▾"}
        </Button>
      )}
    </Box>
  );
};

const HouseBack = () => (
  <Flex
    w="100%"
    h="100%"
    align="center"
    justify="center"
    bgGradient="linear(to-b, #48284F, #2C1831)"
    color="rgba(231,204,152,0.75)"
    fontSize="0.7rem"
  >
    House back
  </Flex>
);

const Portrait = ({ src, onClick }: { src: string; onClick?: () => void }) => {
  const [failed, setFailed] = useState(false);
  const art = (
    <Box
      w="100%"
      sx={{ aspectRatio: "63 / 88" }}
      borderRadius="0.6rem"
      overflow="hidden"
      bg="black"
      boxShadow="0 10px 24px rgba(0,0,0,0.5), 0 0 0 2px var(--chakra-colors-brand-primary)"
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Deck cardback"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <HouseBack />
      )}
    </Box>
  );
  return (
    <Box w={{ base: "9rem", md: "150px" }} flexShrink={0}>
      {onClick ? (
        <Box
          as="button"
          type="button"
          display="block"
          w="100%"
          textAlign="center"
          aria-label="Change cardback"
          onClick={onClick}
          _hover={{ opacity: 0.9 }}
        >
          {art}
          <Text
            as="small"
            display="block"
            mt="0.4rem"
            fontSize="0.7rem"
            opacity={0.65}
          >
            cardback · tap to change
          </Text>
        </Box>
      ) : (
        art
      )}
    </Box>
  );
};

type EditKind = "hero" | "cardback" | "tokens";

export const HeroSheet = ({
  deck,
  onSave,
}: {
  deck: DeckImportType;
  onSave?: (updated: DeckImportType) => Promise<void> | void;
}) => {
  const [editing, setEditing] = useState<EditKind | null>(null);
  const closeEdit = () => setEditing(null);

  const hero = deck.deck_data?.hero;
  const sidekick = deck.deck_data?.sidekick;
  // Read straight off deck_data — the sheet never sees a pool. Routed through
  // the same narrowing helper the pool uses so /bag and the table agree on
  // which characters a deck actually fields (issue #500).
  const extraCharacters = toPoolExtraCharacters(
    deck.deck_data?.extraCharacters,
  );
  // Shared section gate (issue #749 pair test): the blank API stub a solo hero
  // carries (Jason Voorhees / DOPE — name "", hp null, quantity 0) must not
  // render an empty sidekick here, same as in HeroPreviewModal.
  const isSidekick = hasFieldedSidekick(sidekick);

  const cards = deck.deck_data?.cards;
  const { counts, total, unique } = deckComposition(cards);
  const isImageDeck = !!deck.tags?.includes("image-deck");
  const tokenCount = deck.savedTokens?.length ?? 0;
  const backUrl =
    deck.deck_data?.appearance?.cardbackUrl ||
    cards?.find((c) => c.cardBackUrl)?.cardBackUrl ||
    "";
  const ability = hero?.specialAbility?.trim();
  const note = deck.note?.trim();

  return (
    <Grid
      as="section"
      aria-label="Hero sheet"
      templateColumns={{ base: "1fr", md: "150px minmax(0, 1fr)" }}
      justifyItems={{ base: "center", md: "stretch" }}
      gap={{ base: "0.9rem", md: "1.1rem" }}
      mx="0.5rem"
      mb="0.75rem"
      p={{ base: "0.9rem", md: "1rem" }}
      borderRadius="0.75rem"
      color="brand.primary"
      bgGradient="linear(135deg, #5a3360 0%, var(--chakra-colors-brand-surface) 60%, var(--chakra-colors-brand-surfaceDim) 100%)"
      boxShadow="0 8px 28px rgba(0,0,0,0.35)"
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: "absolute",
        inset: "-40%",
        bg: "radial-gradient(circle at 15% 40%, rgba(123,206,187,0.2), transparent 45%)",
        pointerEvents: "none",
      }}
    >
      <Box position="relative">
        <Portrait
          key={backUrl}
          src={backUrl ? httpsUpgrade(backUrl) : ""}
          onClick={onSave ? () => setEditing("cardback") : undefined}
        />
      </Box>

      <Box position="relative" minW={0} w="100%">
        <Text
          as="h3"
          fontFamily="BebasNeueRegular"
          fontSize="2.5rem"
          letterSpacing="0.03em"
          lineHeight={0.95}
          overflowWrap="anywhere"
          color="brand.primary"
        >
          {hero?.name || deck.name}
        </Text>

        <Flex gap="0.4rem" flexWrap="wrap" mt="0.5rem" mb="0.65rem">
          <Chip>
            <FaHeart aria-label="health" />
            <Num>{hero?.hp}</Num> health
          </Chip>
          <Chip>
            <GiFootprint aria-label="move" />
            <Num>{hero?.move}</Num> move
          </Chip>
          <Chip>
            <IsRanged isRanged={hero?.isRanged} />
            {hero?.isRanged ? "ranged" : "melee"}
          </Chip>
          {isSidekick ? (
            <Chip>
              <IconSidekick aria-label="sidekick" />
              {sidekick?.name}
              {!!sidekick?.hp && (
                <>
                  <FaHeart aria-label="sidekick health" />
                  <Num>{sidekick.hp}</Num>
                </>
              )}
              {!!sidekick?.quantity && <Num>×{sidekick.quantity}</Num>}
              <IsRanged isRanged={sidekick?.isRanged} />
            </Chip>
          ) : (
            // a deck with extra characters (Skeleton King) fields more than the
            // hero alone, even though its primary sidekick slot is blank
            extraCharacters.length === 0 && <Chip>solo fighter</Chip>
          )}
        </Flex>

        {ability && (
          <Text
            fontSize="0.95rem"
            lineHeight={1.4}
            color="#F6EAD3"
            whiteSpace="pre-wrap"
          >
            <Box
              as="span"
              mr="0.3rem"
              fontSize="0.75rem"
              fontWeight={700}
              letterSpacing="0.04em"
              color="brand.accent"
            >
              SPECIAL ABILITY
            </Box>
            {ability}
          </Text>
        )}

        {/* character cards past the hero/sidekick (issue #500) — Skeleton
            King's skeletons, Frankenstein's Monster. Blank slots (the Maker's
            empty "Sidekick" stubs) are dropped by the shared guard, so decks
            without the field render exactly as before. */}
        {extraCharacters.map(({ hero: character }, index) => (
          <Box key={`${character.name}-${index}`} mt="0.6rem">
            <Flex gap="0.4rem" align="center" flexWrap="wrap">
              <Text fontWeight={700} mr="0.2rem">
                {character.name}
              </Text>
              {character.hp !== null && (
                <Chip>
                  <FaHeart aria-label="health" />
                  <Num>{character.hp}</Num>
                </Chip>
              )}
              <Chip>
                <GiFootprint aria-label="move" />
                <Num>{character.move}</Num>
              </Chip>
              <Chip>
                <IsRanged isRanged={character.isRanged} />
                {character.isRanged ? "ranged" : "melee"}
              </Chip>
            </Flex>
            {!!character.specialAbility?.trim() && (
              <Text
                mt="0.25rem"
                fontSize="0.8rem"
                opacity={0.8}
                whiteSpace="pre-wrap"
              >
                {character.specialAbility.trim()}
              </Text>
            )}
          </Box>
        ))}

        {note && <DeckNotes note={note} />}

        {total > 0 && (
          <Box mt="0.75rem">
            <Flex
              h="8px"
              borderRadius="4px"
              overflow="hidden"
              bg="rgba(0,0,0,0.3)"
              role="img"
              aria-label="Card type composition"
            >
              {TYPE_ORDER.filter((t) => counts[t] > 0).map((t) => (
                <Box
                  key={t}
                  h="100%"
                  style={{ width: `${(counts[t] / total) * 100}%` }}
                  bg={TYPE_COLOR[t]}
                />
              ))}
            </Flex>
            <Flex
              gap="0.2rem 0.8rem"
              flexWrap="wrap"
              mt="0.4rem"
              fontSize="0.75rem"
            >
              {TYPE_ORDER.filter((t) => counts[t] > 0).map((t) => (
                <HStack key={t} spacing="0.3rem">
                  <Box w="9px" h="9px" borderRadius="2px" bg={TYPE_COLOR[t]} />
                  <span>
                    {counts[t]} {t}
                  </span>
                </HStack>
              ))}
            </Flex>
          </Box>
        )}

        <Flex
          mt="0.75rem"
          align="center"
          gap="0.4rem 0.9rem"
          flexWrap="wrap"
          fontSize="0.8rem"
        >
          {deck.user && (
            <span>
              Made by <b>{deck.user}</b>
            </span>
          )}
          <span>
            {total} cards · {unique} unique
          </span>
          {onSave && (
            <HStack ml={{ md: "auto" }} spacing="0.4rem">
              {isImageDeck && (
                <SheetButton onClick={() => setEditing("hero")}>
                  Hero info
                </SheetButton>
              )}
              <SheetButton onClick={() => setEditing("tokens")}>
                Tokens{tokenCount > 0 ? ` (${tokenCount})` : ""}
              </SheetButton>
            </HStack>
          )}
        </Flex>
      </Box>

      {onSave && editing === "hero" && (
        <EditHeroModal deck={deck} onSave={onSave} isOpen onClose={closeEdit} />
      )}
      {onSave && editing === "cardback" && (
        <EditCardbackModal
          deck={deck}
          onSave={onSave}
          isOpen
          onClose={closeEdit}
        />
      )}
      {onSave && editing === "tokens" && (
        <EditSavedTokensModal
          deck={deck}
          onSave={onSave}
          isOpen
          onClose={closeEdit}
        />
      )}
    </Grid>
  );
};

const SheetButton = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Button
    size="xs"
    variant="outline"
    color="brand.primary"
    borderColor="rgba(255,255,255,0.25)"
    bg="rgba(0,0,0,0.25)"
    _hover={{ bg: "rgba(255,255,255,0.08)" }}
    onClick={onClick}
  >
    {children}
  </Button>
);
