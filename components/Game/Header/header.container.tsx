import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { StatTag } from "../game.styles";
import { useRouter } from "next/router";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { PoolType } from "@/components/DeckPool/PoolFns";
import styled from "@emotion/styled";

import {
  TbSword as IconMeele,
  TbBow as IconRanged,
  TbCards as IconDeck,
  TbGrave2 as IconDiscard,
} from "react-icons/tb";
import { GiFootprint as IconMove, GiHearts as IconHeart } from "react-icons/gi";
import { IoPeople as IconSidekicks } from "react-icons/io5";
import { IoMdHand as IconHand } from "react-icons/io";
import { IconType } from "react-icons";

export const HeaderContainer = () => {
  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName;

  const { gameState, setPlayerState } = useWebGame();
  const playerState = player ? gameState?.content?.players[player] : undefined;
  const setGameState = (poolInput: PoolType): void => {
    setPlayerState()({ pool: poolInput });
  };

  return (
    <Flex
      bg="purple"
      p={3}
      w="100%"
      justifyContent="space-between"
      alignItems="center"
      gap={"10px"}
      minH={"10svh"}
    >
      <StatContainer>
        <Box
          bg="purple.900"
          color="antiquewhite"
          w="100%"
          h="min-content"
          p={"0.2rem 0.75rem"}
          fontWeight={700}
          fontFamily={"SpaceGrotesk"}
          borderRadius={"0.5rem 0.5rem 0 0"}
        >
          dean
        </Box>
        <Grid gridTemplateColumns={"1fr 1fr"} h="80%">
          <Grid
            gridTemplateColumns={"1fr 1fr 1fr"}
            justifyContent={"space-evenly"}
            p={"0.25rem"}
          >
            <Stat Icon={IconMeele} number={28} />
            <Stat Icon={IconMeele} number={28} />
            <Stat Icon={IconMeele} number={28} />
            <Stat Icon={IconMeele} number={28} />
            <Stat Icon={IconMeele} number={28} />
            <Stat Icon={IconMeele} number={28} />
          </Grid>
          <Flex>
            <Box>
              <IconMove />
              <Text>3</Text>
            </Box>
            <Box>
              <Stat Icon={IconHand} number={4} />
              <Stat Icon={IconDeck} number={4} />
              <Stat Icon={IconDiscard} number={4} />
            </Box>
          </Flex>
        </Grid>
      </StatContainer>
    </Flex>
  );
};

const StatContainer = styled(Box)`
  background-color: antiquewhite;
  border-radius: 0.5rem;
  min-width: 20rem;
  height: 100%;
`;

const Stat: React.FC<{ Icon: IconType; number: number }> = ({
  Icon,
  number,
}) => {
  return (
    <Flex>
      <Icon size={"30px"} />
      <Text alignSelf={"center"}> {number ?? ""}</Text>
    </Flex>
  );
};
