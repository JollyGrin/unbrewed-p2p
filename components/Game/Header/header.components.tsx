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
  PawnStatsContainer,
  PlayerTitleBar,
  StatContainer,
} from "./header.styles";

import {
  TbSword as IconMeele,
  TbBow as IconRanged,
  TbCards as IconDeck,
  TbGrave2 as IconDiscard,
} from "react-icons/tb";
import { GiFootprint as IconMove, GiHearts as IconHeart } from "react-icons/gi";
import { IoPeople as IconSidekicks } from "react-icons/io5";
import { IoMdHand as IconHand } from "react-icons/io";
import {
  PoolType,
  adjustHp,
  adjustSidekickQuantity,
} from "@/components/DeckPool/PoolFns";
import styled from "@emotion/styled";
import { fonts } from "@/styles/style";
import { useState } from "react";

import { FaMap } from "react-icons/fa";
import { MapModal } from "./map.modal";
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
  const discardDisclosure = useDisclosure();

  return (
    <>
      <MapModal {...mapDisclosure} />
      <DiscardModalReadOnly {...discardDisclosure} cards={discard} />
      <StatContainer>
        <PlayerTitleBar>
          <Tooltip label={<TipBody pool={playerState?.pool} />}>
            <Text>{name}</Text>
          </Tooltip>
          <HStack gap="1rem">
            <FaMap
              style={{
                display: isLocal ? "block" : "none",
                cursor: "pointer",
              }}
              onClick={mapDisclosure.onOpen}
            />
            <Flex
              display={isLocal ? "flex" : "none"}
              flexDir="row-reverse"
              alignItems="center"
              gap="0.25rem"
              cursor="pointer"
              onClick={() =>
                isLocal &&
                typeof openPositionModal === "function" &&
                openPositionModal()
              }
            >
              <Dot background="tomato" size="1rem" />
              <Dot background="tomato" size="0.75rem" />
              <Dot background="tomato" size="0.75rem" />
              <Dot background="tomato" size="0.75rem" />
            </Flex>
          </HStack>
        </PlayerTitleBar>
        <Grid gridTemplateColumns={"1fr 1fr"} alignItems="center">
          <PawnStatsContainer>
            <Box bg="green" borderRadius={"1000px"} h="20px" w="20px" />
            <Stat
              Icon={IconHeart}
              number={hero.hp ?? 0}
              callback={(adjustNumber: number) =>
                updateHealth(adjustNumber, "hero")
              }
              isLocal={isLocal}
            />
            <Stat
              Icon={hero.isRanged ? IconRanged : IconMeele}
              isLocal={isLocal}
            />

            {sidekick?.quantity && sidekick.quantity > 0 ? (
              <>
                <Box bg="green" h="15px" w="15px" />
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

                <Stat
                  isLocal={isLocal}
                  Icon={sidekick.isRanged ? IconRanged : IconMeele}
                />
              </>
            ) : (
              <Box h="20px" />
            )}
          </PawnStatsContainer>
          <Grid gridTemplateColumns="1fr 1fr">
            <MoveStatContainer>
              <IconMove />
              <Text
                fontSize={"3rem"}
                my={-2}
                fontFamily="SpaceGrotesk"
                lineHeight="normal"
              >
                {hero.move}
              </Text>
            </MoveStatContainer>
            <Flex justifyContent="center" alignItems="center" flexDir="column">
              <Stat
                isLocal={isLocal}
                Icon={IconHand}
                number={hand.length}
                size="20px"
              />
              <Stat
                isLocal={isLocal}
                Icon={IconDeck}
                number={deck?.length ?? 0}
                size="20px"
              />
              <Stat
                isLocal={isLocal}
                Icon={IconDiscard}
                number={discard.length}
                size="20px"
                onClick={discardDisclosure.onOpen}
              />
            </Flex>
          </Grid>
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
          <AdjustButton bg="green" onClick={() => callback(1)}>
            +
          </AdjustButton>
          <AdjustButton bg="tomato" onClick={() => callback(-1)}>
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

const Dot = styled(Box)<{ size: string }>`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  border-radius: 100%;
`;
