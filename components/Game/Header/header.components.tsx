import {
  Box,
  Flex,
  Text,
  HStack,
  useDisclosure,
  Tooltip,
  Divider,
} from "@chakra-ui/react";
import { IconType } from "react-icons";
import {
  ControlButton,
  HeroName,
  MoveChip,
  PipFooter,
  Pip,
  PlayerName,
  PlayerTitleBar,
  StatContainer,
  StatLine,
  StatsPanel,
} from "./header.styles";

import {
  TbSword as IconMeele,
  TbBow as IconRanged,
  TbCards as IconDeck,
  TbGrave2 as IconDiscard,
} from "react-icons/tb";
import {
  GiFootprint as IconMove,
  GiHearts as IconHeart,
  GiRollingDices as IconDice,
} from "react-icons/gi";
import { IoPeople as IconSidekicks } from "react-icons/io5";
import { IoMdHand as IconHand } from "react-icons/io";
import { FaChessPawn as IconToken } from "react-icons/fa";
import {
  PoolType,
  adjustHp,
  adjustSidekickQuantity,
} from "@/components/DeckPool/PoolFns";
import styled from "@emotion/styled";
import { colors, fonts } from "@/styles/style";
import { useState } from "react";

import { FaMap, FaScroll } from "react-icons/fa";
import { MapModal } from "./map.modal";
import { DiceModal } from "./dice.modal";
import { DiscardModalReadOnly } from "./discard.modal";

export const PlayerBox: React.FC<{
  isLocal: boolean;
  name: string;
  playerState: { pool: PoolType };
  setGameState: (pool: PoolType) => void;
  openPositionModal?: () => void;
  /** Pin/unpin this seat's extended rules panel (issue #474). */
  onOpenRules?: () => void;
  rulesOpen?: boolean;
}> = ({
  isLocal,
  name,
  playerState,
  setGameState,
  openPositionModal,
  onOpenRules,
  rulesOpen,
}) => {
  const { hand, deck, discard, hero, sidekick } = playerState.pool;

  const updateHealth = (
    adjustAmount: number,
    selectedPawn: "hero" | "sidekick",
  ) => {
    setGameState(adjustHp(playerState.pool, selectedPawn, adjustAmount));
  };

  const updateSidekickQuantity = (adjustAmount: number) => {
    setGameState(adjustSidekickQuantity(playerState.pool, adjustAmount));
  };

  const mapDisclosure = useDisclosure();
  const diceDisclosure = useDisclosure();
  const discardDisclosure = useDisclosure();

  const sidekickQty = sidekick?.quantity ?? 0;
  const hasSidekick = sidekickQty > 0;

  return (
    <>
      <MapModal {...mapDisclosure} />
      <DiceModal {...diceDisclosure} />
      <DiscardModalReadOnly {...discardDisclosure} cards={discard} />
      <StatContainer isLocal={isLocal}>
        <PlayerTitleBar>
          <Box minW={0}>
            <Tooltip
              label={<TipBody pool={playerState?.pool} />}
              placement="bottom-start"
              hasArrow
            >
              <PlayerName>{name}</PlayerName>
            </Tooltip>
            {hero?.name && <HeroName>{hero.name}</HeroName>}
          </Box>
          <HStack gap="0.25rem" flexShrink={0}>
            {/* Not gated on isLocal: opponents' extended rules matter just as
                much as your own, and the pool carries them for every seat. */}
            {onOpenRules && (
              <Tooltip
                label={`${rulesOpen ? "Hide" : "Show"} hero rules${
                  isLocal ? "" : ` for ${name}`
                }`}
                hasArrow
              >
                <ControlButton
                  as="button"
                  aria-label={`${rulesOpen ? "Hide" : "Show"} hero rules`}
                  aria-pressed={rulesOpen}
                  onClick={onOpenRules}
                  style={rulesOpen ? { opacity: 1 } : undefined}
                >
                  <FaScroll size="14px" />
                </ControlButton>
              </Tooltip>
            )}
            {isLocal && (
              <>
              <Tooltip label="Change map" hasArrow>
                <ControlButton
                  as="button"
                  aria-label="Change map"
                  onClick={mapDisclosure.onOpen}
                >
                  <FaMap size="15px" />
                </ControlButton>
              </Tooltip>
              <Tooltip label="Add tokens to the board" hasArrow>
                <ControlButton
                  as="button"
                  aria-label="Add tokens to the board"
                  onClick={() =>
                    typeof openPositionModal === "function" &&
                    openPositionModal()
                  }
                >
                  <IconToken size="14px" />
                </ControlButton>
              </Tooltip>
              <Tooltip label="Roll dice" hasArrow>
                <ControlButton
                  as="button"
                  aria-label="Roll dice"
                  onClick={diceDisclosure.onOpen}
                >
                  <IconDice size="15px" />
                </ControlButton>
              </Tooltip>
              </>
            )}
          </HStack>
        </PlayerTitleBar>

        <StatsPanel>
          <Box>
            <StatLine>
              <Stat
                Icon={IconHeart}
                iconColor={colors.brand.danger}
                number={hero.hp ?? 0}
                callback={(adjustNumber: number) =>
                  updateHealth(adjustNumber, "hero")
                }
                isLocal={isLocal}
                emphasize
                size="22px"
              />
              <Tooltip label={hero.isRanged ? "Ranged" : "Melee"} hasArrow>
                <span>
                  <Stat
                    Icon={hero.isRanged ? IconRanged : IconMeele}
                    isLocal={isLocal}
                    size="18px"
                  />
                </span>
              </Tooltip>
            </StatLine>
            {hasSidekick && (
              <StatLine mt="0.3rem">
                <Stat
                  isLocal={isLocal}
                  Icon={sidekickQty <= 1 ? IconHeart : IconSidekicks}
                  iconColor={
                    sidekickQty <= 1
                      ? colors.brand.danger
                      : colors.brand.secondary
                  }
                  callback={(number: number) => {
                    if (sidekickQty <= 1) {
                      updateHealth(number, "sidekick");
                    } else {
                      updateSidekickQuantity(number);
                    }
                  }}
                  number={sidekickQty <= 1 ? (sidekick.hp ?? 0) : sidekickQty}
                  size="18px"
                />
                <Tooltip label={sidekick.isRanged ? "Ranged" : "Melee"} hasArrow>
                  <span>
                    <Stat
                      isLocal={isLocal}
                      Icon={sidekick.isRanged ? IconRanged : IconMeele}
                      size="16px"
                    />
                  </span>
                </Tooltip>
              </StatLine>
            )}
          </Box>

          <MoveChip>
            <IconMove size="16px" />
            <Text
              fontFamily="SpaceGrotesk"
              fontWeight={700}
              fontSize="1.2rem"
              lineHeight="1"
            >
              {hero.move}
            </Text>
            <StatLabel>move</StatLabel>
          </MoveChip>
        </StatsPanel>

        <PipFooter>
          <Tooltip label="Cards in hand" placement="bottom" hasArrow>
            <Pip>
              <IconHand size="14px" />
              {hand.length}
            </Pip>
          </Tooltip>
          <Tooltip label="Cards left in deck" placement="bottom" hasArrow>
            <Pip>
              <IconDeck size="14px" />
              {deck?.length ?? 0}
            </Pip>
          </Tooltip>
          <Tooltip label="Discard pile — click to view" placement="bottom" hasArrow>
            <Pip clickable onClick={discardDisclosure.onOpen}>
              <IconDiscard size="14px" />
              {discard.length}
            </Pip>
          </Tooltip>
        </PipFooter>
      </StatContainer>
    </>
  );
};

export const Stat: React.FC<{
  Icon: IconType;
  number?: number;
  size?: `${string}px`;
  callback?: (adjustNumber: number) => void;
  isLocal: boolean;
  onClick?: () => void;
  iconColor?: string;
  emphasize?: boolean;
}> = ({
  Icon,
  number,
  size,
  callback,
  isLocal,
  onClick,
  iconColor,
  emphasize,
}) => {
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const enter = () => setIsHovering(true);
  const leave = () => setIsHovering(false);
  return (
    <Flex
      alignItems="center"
      gap="0.15rem"
      position="relative"
      onMouseOver={enter}
      onMouseOut={leave}
      onClick={onClick}
    >
      {isLocal && !!callback && isHovering ? (
        <Flex flexDir="column">
          <AdjustButton bg={colors.brand.positive} onClick={() => callback(1)}>
            +
          </AdjustButton>
          <AdjustButton bg={colors.brand.danger} onClick={() => callback(-1)}>
            -
          </AdjustButton>
        </Flex>
      ) : (
        <Box as="span" color={iconColor} display="grid" placeItems="center">
          <Icon size={size ?? "25px"} />
        </Box>
      )}

      <Text
        alignSelf="center"
        fontFamily={emphasize ? fonts.SpaceGrotesk : undefined}
        fontWeight={emphasize ? 700 : undefined}
        fontSize={emphasize ? "1.2rem" : undefined}
        lineHeight="1"
      >
        {number ?? ""}
      </Text>
    </Flex>
  );
};

const TipBody = (props: { pool: PoolType }) => {
  const { deckName, hero, sidekick, ruleCards } = props.pool;
  // deck-level "extra rules" cards (issue #372) — e.g. Clone Troopers' board
  // cap. Distinct from hero.specialAbility; content preserves its \n breaks.
  const rules = (ruleCards ?? []).filter((r) => r.content?.trim());
  return (
    <Box minW="300px">
      <Text fontWeight="bold">{deckName}</Text>
      <Divider />
      <Text>
        {hero.name}: {hero.isRanged ? "Ranged" : "Meele"}
      </Text>
      <Text>{hero.specialAbility}</Text>
      {rules.map((rule, i) => (
        <Text key={`${rule.title}-${i}`} mt="0.35rem" whiteSpace="pre-wrap">
          <Text as="span" fontWeight="bold">
            {rule.title || "Extra rules"}:
          </Text>{" "}
          {rule.content.trim()}
        </Text>
      ))}
      <Divider />
      <Text>
        {sidekick.name}: {sidekick.isRanged ? "Ranged" : "Meele"}
      </Text>
      <Text>{sidekick.quote}</Text>
    </Box>
  );
};

/** small uppercase caption used to label stat clusters */
const StatLabel = styled(Text)`
  font-family: ${fonts.SpaceGrotesk};
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.65;
  user-select: none;
`;

const AdjustButton = styled(Flex)`
  background-color: ${(props) => props.bg};
  padding: 0.18rem 0.35rem;
  border-radius: 4px;
  line-height: 0.4rem;
  justify-content: center;
  color: ghostwhite;
  font-weight: 700;
  font-size: 1.25rem;
  font-family: ${fonts.SpaceGrotesk};
  user-select: none;
  cursor: pointer;
`;
