import { Box, Flex, Text } from "@chakra-ui/react";
import { ReactNode } from "react";
import {
  hasFieldedSidekick,
  hasSidekick,
  toPoolExtraCharacters,
} from "@/components/DeckPool/PoolFns";
import { parseQuote } from "@/lib/irl/irlCharacters";
import { useIrlGame } from "./irlGame";
import {
  BEBAS,
  CARD_RIM,
  CloseButton,
  EmptyNote,
  IconBow,
  IconHeart,
  IconSword,
  IrlSheet,
  NARROW,
  PARCHMENT_CHIP,
  SAFE_BOTTOM,
  TYPE_ATTACK,
  TYPE_SCHEME,
  TopBar,
} from "./irl.ui";

/**
 * Characters sheet (issue #798 §4): the same content as the sandbox's
 * HeroRulesPanel — hero ability, sidekick, extra characters (#500), rule
 * cards (#372), gated by the same helpers — restyled as the printed hero card
 * the Characters mockup draws. Stats come off the printed deck, not the pool:
 * the pool's hp is the live counter, and this sheet shows START health.
 */
export const IrlCharacters = ({ onClose }: { onClose: () => void }) => {
  const { deck } = useIrlGame();
  const printed = deck.deck_data;
  const hero = printed.hero;
  const sidekick = printed.sidekick;
  const extras = toPoolExtraCharacters(printed.extraCharacters);
  const rules = (printed.ruleCards ?? []).filter((rule) => rule.content?.trim());
  const quote = parseQuote(hero.quote || sidekick?.quote);

  return (
    <IrlSheet label="Characters">
      <TopBar
        title="Characters"
        sub="hero · sidekick · deck rules"
        onBack={onClose}
        right={<CloseButton onClick={onClose} />}
      />
      <Flex
        direction="column"
        align="center"
        gap="12px"
        flex="1"
        minH={0}
        overflowY="auto"
        px="12px"
        pt="8px"
        pb={SAFE_BOTTOM}
      >
        <PrintedCharacter
          label="Hero"
          name={hero.name || deck.name}
          isRanged={hero.isRanged}
          hp={hero.hp}
          move={hero.move}
          ability={hero.specialAbility}
          quote={quote}
        />
        {hasSidekick(sidekick) && (
          <SidekickTile
            name={sidekick.name}
            hp={sidekick.hp}
            quantity={sidekick.quantity}
            isRanged={sidekick.isRanged}
          />
        )}
        {extras.map((character, index) => (
          <Flex key={`${character.hero.name}-${index}`} direction="column" gap="12px" w="100%" align="center">
            <PrintedCharacter
              label="Character"
              name={character.hero.name}
              isRanged={character.hero.isRanged}
              hp={character.hero.hp}
              move={character.hero.move}
              ability={character.hero.specialAbility}
            />
            {hasFieldedSidekick(character.sidekick) && (
              <SidekickTile
                name={character.sidekick.name}
                hp={character.sidekick.hp}
                quantity={character.sidekick.quantity}
                isRanged={character.sidekick.isRanged}
              />
            )}
          </Flex>
        ))}
        {rules.length ? (
          rules.map((rule, index) => (
            <Box
              key={`${rule.title}-${index}`}
              w="100%"
              maxW="340px"
              p="12px 14px"
              borderRadius="12px"
              bg={PARCHMENT_CHIP}
              color="brand.surfaceDim"
            >
              <Text fontSize="9px" fontWeight={700} letterSpacing="0.15em" opacity={0.6}>
                DECK RULE
              </Text>
              <Text fontFamily={BEBAS} fontSize="22px" lineHeight={1} textTransform="uppercase">
                {rule.title || "Extra rules"}
              </Text>
              <Text fontFamily={NARROW} fontSize="15px" lineHeight={1.3} mt="6px" whiteSpace="pre-wrap">
                {rule.content.trim()}
              </Text>
            </Box>
          ))
        ) : (
          <Box w="100%" maxW="340px">
            <EmptyNote>No extra rule cards in this deck</EmptyNote>
          </Box>
        )}
      </Flex>
    </IrlSheet>
  );
};

const VerticalLabel = ({
  children,
  fontSize,
  letterSpacing,
  borderRight,
}: {
  children: ReactNode;
  fontSize: string;
  letterSpacing: string;
  borderRight?: string;
}) => (
  <Flex
    align="center"
    justify="center"
    w="34px"
    flexShrink={0}
    fontFamily={BEBAS}
    fontSize={fontSize}
    letterSpacing={letterSpacing}
    textTransform="uppercase"
    borderRight={borderRight}
    sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
  >
    {children}
  </Flex>
);

const StatCell = ({
  label,
  value,
  alignRight,
}: {
  label: string;
  value: ReactNode;
  alignRight?: boolean;
}) => (
  <Flex
    direction="column"
    justify="center"
    gap="2px"
    flex="1 1 0"
    px="12px"
    py="8px"
    bg="#fff"
    color="#000"
    textAlign={alignRight ? "right" : "left"}
    borderLeft={alignRight ? "2px solid #000" : undefined}
  >
    <Text as="span" fontSize="9px" fontWeight={700} letterSpacing="0.15em">
      {label}
    </Text>
    <Text as="span" fontFamily={BEBAS} fontSize="26px" lineHeight={1} color={TYPE_ATTACK}>
      {value}
    </Text>
  </Flex>
);

/** The printed hero card, as the Characters mockup lays it out. */
const PrintedCharacter = ({
  label,
  name,
  isRanged,
  hp,
  move,
  ability,
  quote,
}: {
  label: string;
  name: string;
  isRanged: boolean;
  hp: number | null;
  move: number;
  ability?: string;
  quote?: { text: string; by?: string };
}) => (
  <Box
    w="100%"
    maxW="340px"
    flexShrink={0}
    borderRadius="14px"
    bg={CARD_RIM}
    p="10px"
    boxShadow="0 8px 24px rgba(44, 24, 49, 0.5)"
  >
    <Box borderRadius="8px" overflow="hidden" bg="#000" color="#fff">
      <Flex align="stretch">
        <VerticalLabel fontSize="13px" letterSpacing="0.15em">
          {label}
        </VerticalLabel>
        <Text
          as="h2"
          flex="1"
          minW={0}
          p="12px 12px 8px"
          fontFamily={BEBAS}
          fontSize="34px"
          lineHeight={1}
          textTransform="uppercase"
          overflowWrap="anywhere"
        >
          {name}
        </Text>
      </Flex>
      <Flex align="stretch" borderTop={`2px solid ${CARD_RIM}`}>
        <StatCell label="ATTACK" value={isRanged ? "RANGED" : "MELEE"} />
        <StatCell label="START HEALTH" value={hp ?? "—"} alignRight />
      </Flex>
      <Flex align="stretch" bg={TYPE_SCHEME} color="#000">
        <VerticalLabel fontSize="11px" letterSpacing="0.12em" borderRight="2px solid #000">
          Special ability
        </VerticalLabel>
        <Text
          flex="1"
          minW={0}
          p="12px"
          fontFamily={NARROW}
          fontSize="16px"
          lineHeight={1.3}
          whiteSpace="pre-wrap"
          fontStyle={ability?.trim() ? undefined : "italic"}
        >
          {ability?.trim() || "No special ability recorded for this deck."}
        </Text>
        <Flex direction="column" align="center" justify="center" w="54px" flexShrink={0} borderLeft="2px solid #000">
          <Text as="span" fontFamily={BEBAS} fontSize="30px" lineHeight={1}>
            {move}
          </Text>
          <Text as="span" fontFamily={BEBAS} fontSize="11px" letterSpacing="0.12em">
            MOVE
          </Text>
        </Flex>
      </Flex>
      {quote && (
        <Box p="12px 14px 14px" bg="#fff" color="#000" fontFamily={NARROW} fontSize="15px" lineHeight={1.35} fontStyle="italic">
          “{quote.text}”
          {quote.by && (
            <Text textAlign="right" fontStyle="normal" mt="4px">
              {quote.by}
            </Text>
          )}
        </Box>
      )}
    </Box>
  </Box>
);

const SidekickTile = ({
  name,
  hp,
  quantity,
  isRanged,
}: {
  name: string;
  hp: number | null;
  quantity: number | null;
  isRanged: boolean;
}) => (
  <Flex
    align="center"
    gap="12px"
    w="100%"
    maxW="340px"
    flexShrink={0}
    p="12px 14px"
    borderRadius="12px"
    bg={PARCHMENT_CHIP}
    color="brand.surfaceDim"
  >
    <Flex direction="column" flex="1" minW={0}>
      <Text as="span" fontSize="9px" fontWeight={700} letterSpacing="0.15em" opacity={0.6}>
        {(quantity ?? 0) > 1 ? `SIDEKICKS ×${quantity}` : "SIDEKICK"}
      </Text>
      <Text as="span" fontFamily={BEBAS} fontSize="24px" lineHeight={1} textTransform="uppercase">
        {name || "Sidekick"}
      </Text>
    </Flex>
    {hp !== null && hp !== undefined && (
      <Flex align="center" gap="4px" color="brand.danger">
        <IconHeart />
        <Text as="span" fontFamily={BEBAS} fontSize="26px" lineHeight={1} color="brand.surfaceDim">
          {hp}
        </Text>
      </Flex>
    )}
    <Flex align="center" gap="4px">
      {isRanged ? <IconBow /> : <IconSword />}
      <Text as="span" fontSize="12px" fontWeight={600}>
        {isRanged ? "Ranged" : "Melee"}
      </Text>
    </Flex>
  </Flex>
);
