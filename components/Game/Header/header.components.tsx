import {
  Grid,
  Flex,
  Box,
  Text,
  HStack,
  useDisclosure,
  Tooltip,
  Divider,
} from "@chakra-ui/react";
import { IconType } from "react-icons";
import {
  MoveStatContainer,
  PlayerTitleBar,
  StatContainer,
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

import { FaMap } from "react-icons/fa";
import { MapModal } from "./map.modal";
import { DiceModal } from "./dice.modal";
import { DiscardModalReadOnly } from "./discard.modal";

export const PlayerBox: React.FC<{
  isLocal: boolean;
  name: string;
  playerState: { pool: PoolType };
  setGameState: (pool: PoolType) => void;
  openPositionModal?: () => void;
}> = ({ isLocal, name, playerState, setGameState, openPositionModal }) => {
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

  return (
    <>
      <MapModal {...mapDisclosure} />
      <DiceModal {...diceDisclosure} />
      <DiscardModalReadOnly {...discardDisclosure} cards={discard} />
      <StatContainer isLocal={isLocal}>
        <PlayerTitleBar>
          <Tooltip label={<TipBody pool={playerState?.pool} />}>
            <Text>{name}</Text>
          </Tooltip>
          {isLocal && (
            <HStack gap="0.9rem">
              <Tooltip label="Change map">
                <Box
                  as="button"
                  aria-label="Change map"
                  cursor="pointer"
                  onClick={mapDisclosure.onOpen}
                >
                  <FaMap />
                </Box>
              </Tooltip>
              <Tooltip label="Edit your board tokens">
                <Box
                  as="button"
                  aria-label="Edit your board tokens"
                  cursor="pointer"
                  onClick={() =>
                    typeof openPositionModal === "function" &&
                    openPositionModal()
                  }
                >
                  <IconToken />
                </Box>
              </Tooltip>
              <Tooltip label="Roll dice">
                <Box
                  as="button"
                  aria-label="Roll dice"
                  cursor="pointer"
                  onClick={diceDisclosure.onOpen}
                >
                  <IconDice />
                </Box>
              </Tooltip>
            </HStack>
          )}
        </PlayerTitleBar>
        <Grid
          gridTemplateColumns={"1fr auto auto"}
          alignItems="center"
          gap="0.75rem"
          p="0.25rem 0.75rem 0.35rem"
        >
          <Flex flexDir="column" gap="0.25rem">
            <StatRow label="Hero">
              <Stat
                Icon={IconHeart}
                number={hero.hp ?? 0}
                callback={(adjustNumber: number) =>
                  updateHealth(adjustNumber, "hero")
                }
                isLocal={isLocal}
              />
              <Tooltip label={hero.isRanged ? "Ranged" : "Melee"}>
                <span>
                  <Stat
                    Icon={hero.isRanged ? IconRanged : IconMeele}
                    isLocal={isLocal}
                  />
                </span>
              </Tooltip>
            </StatRow>
            {sidekick?.quantity && sidekick.quantity > 0 ? (
              <StatRow label="Sidekick">
                <Stat
                  isLocal={isLocal}
                  Icon={sidekick.quantity <= 1 ? IconHeart : IconSidekicks}
                  callback={(number: number) => {
                    if (sidekick?.quantity && sidekick?.quantity <= 1) {
                      updateHealth(number, "sidekick");
                    } else {
                      updateSidekickQuantity(number);
                    }
                  }}
                  number={
                    sidekick.quantity <= 1
                      ? (sidekick.hp ?? 0)
                      : (sidekick.quantity ?? 0)
                  }
                />
                <Tooltip label={sidekick.isRanged ? "Ranged" : "Melee"}>
                  <span>
                    <Stat
                      isLocal={isLocal}
                      Icon={sidekick.isRanged ? IconRanged : IconMeele}
                    />
                  </span>
                </Tooltip>
              </StatRow>
            ) : (
              <Box h="20px" />
            )}
          </Flex>
          <MoveStatContainer>
            <Text
              fontSize={"2.25rem"}
              my={-1}
              fontFamily="SpaceGrotesk"
              lineHeight="normal"
            >
              {hero.move}
            </Text>
            <StatLabel>
              <IconMove style={{ display: "inline" }} /> move
            </StatLabel>
          </MoveStatContainer>
          <Flex justifyContent="center" flexDir="column" gap="0.1rem">
            <Tooltip label="Cards in hand" placement="right">
              <span>
                <Stat
                  isLocal={isLocal}
                  Icon={IconHand}
                  number={hand.length}
                  size="18px"
                />
              </span>
            </Tooltip>
            <Tooltip label="Cards left in deck" placement="right">
              <span>
                <Stat
                  isLocal={isLocal}
                  Icon={IconDeck}
                  number={deck?.length ?? 0}
                  size="18px"
                />
              </span>
            </Tooltip>
            <Tooltip label="Discard pile — click to view" placement="right">
              <Box
                cursor="pointer"
                borderRadius="0.25rem"
                _hover={{ bg: "rgba(72, 40, 79, 0.15)" }}
                onClick={discardDisclosure.onOpen}
              >
                <Stat
                  isLocal={isLocal}
                  Icon={IconDiscard}
                  number={discard.length}
                  size="18px"
                />
              </Box>
            </Tooltip>
          </Flex>
        </Grid>
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
}> = ({ Icon, number, size, callback, isLocal, onClick }) => {
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const enter = () => setIsHovering(true);
  const leave = () => setIsHovering(false);
  return (
    <Flex
      alignItems="center"
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
        <Icon size={size ?? "25px"} />
      )}

      <Text alignSelf={"center"}> {number ?? ""}</Text>
    </Flex>
  );
};

const TipBody = (props: { pool: PoolType }) => {
  const { deckName, hero, sidekick } = props.pool;
  return (
    <Box minW="300px">
      <Text fontWeight="bold">{deckName}</Text>
      <Divider />
      <Text>
        {hero.name}: {hero.isRanged ? "Ranged" : "Meele"}
      </Text>
      <Text>{hero.specialAbility}</Text>
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

const StatRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <Grid gridTemplateColumns="3.6rem auto auto" alignItems="center" gap="0.5rem">
    <StatLabel>{label}</StatLabel>
    {children}
  </Grid>
);

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
