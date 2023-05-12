import { Grid, Flex, Box, Text } from "@chakra-ui/react";
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
import { PoolType } from "@/components/DeckPool/PoolFns";

export const PlayerBox: React.FC<{
  name: string;
  playerState: { pool: PoolType };
}> = ({ name, playerState }) => {
  console.log({ playerState });
  const { hand, deck, discard, hero, sidekick } = playerState.pool;
  return (
    <StatContainer>
      <PlayerTitleBar>{name}</PlayerTitleBar>
      <Grid gridTemplateColumns={"1fr 1fr"} alignItems="center">
        <PawnStatsContainer>
          <Box bg="green" borderRadius={"1000px"} h="20px" w="20px" />
          <Stat Icon={IconHeart} number={hero.hp ?? 0} />
          <Stat Icon={hero.isRanged ? IconRanged : IconMeele} />

          {sidekick?.quantity && sidekick.quantity > 0 ? (
            <>
              <Box bg="green" h="15px" w="15px" />
              <Stat
                Icon={sidekick.quantity <= 1 ? IconHeart : IconSidekicks}
                number={
                  sidekick.quantity <= 1
                    ? sidekick.hp ?? 0
                    : sidekick.quantity ?? 0
                }
              />

              <Stat Icon={sidekick.isRanged ? IconRanged : IconMeele} />
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
            <Stat Icon={IconHand} number={hand.length} size="20px" />
            <Stat Icon={IconDeck} number={deck?.length ?? 0} size="20px" />
            <Stat Icon={IconDiscard} number={discard.length} size="20px" />
          </Flex>
        </Grid>
      </Grid>
    </StatContainer>
  );
};

export const Stat: React.FC<{
  Icon: IconType;
  number?: number;
  size?: `${string}px`;
}> = ({ Icon, number, size }) => {
  return (
    <Flex alignItems="center">
      <Icon size={size ?? "25px"} />
      <Text alignSelf={"center"}> {number ?? ""}</Text>
    </Flex>
  );
};
