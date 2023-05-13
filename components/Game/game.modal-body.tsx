import { Box, Flex, Grid, Text, Skeleton, Button } from "@chakra-ui/react";
import { Carousel } from "./game.carousel";
import { mockDeck } from "@/_mocks_/deck";
import { CardFactory } from "../CardFactory/card.factory";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import Link from "next/link";
import {
  DeckImportCardType,
  DeckImportType,
} from "../DeckPool/deck-import.type";
import { PoolType } from "../DeckPool/PoolFns";

export const DeckModalContent = ({
  cards,
}: {
  cards: DeckImportCardType[];
}) => {
  return (
    <Grid gridTemplateColumns={"repeat(auto-fit, minmax(250px,1fr))"} gap={1}>
      {/* <Carousel /> */}
      {cards?.map((card, index) => (
        <Box w="100%" maxH={"550px"} key={card.title + index}>
          <CardFactory key={card.title + index} card={card} />
        </Box>
      ))}
    </Grid>
  );
};

type CommitType = Pick<PoolType, "commit">;
export type PlayerCommit = { player: string; commit: CommitType["commit"] };
export const CommitModalContent: React.FC<{
  commits: PlayerCommit[];
  onClose: () => void;
  onFlip: () => void;
  onDiscard: () => void;
}> = ({ commits, onClose, onFlip, onDiscard }) => {
  return (
    <Flex flexDir="column" justifyContent="space-evenly" gap={3} minH={"40svh"}>
      <Flex
        justifyContent="space-evenly"
        flexDir={{ base: "column", md: "row" }}
        gap={1}
        m={"0 auto"}
      >
        {commits.map((commit) => (
          <CommitCard key={commit.player} commit={commit} />
        ))}
      </Flex>
      <Flex justifyContent="space-evenly" w="100%" maxW="600px" m="0 auto">
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onFlip}>Flip</Button>
        <Button onClick={onDiscard}>Discard</Button>
      </Flex>
    </Flex>
  );
};

const CommitCard: React.FC<{ commit: PlayerCommit }> = ({ commit }) => {
  if (commit.commit.main === null) return <Box display="none" />;
  return (
    <Box minH="420px">
      {commit?.player && (
        <Flex transform={"translate(0,2.35rem)"} justifyContent="end">
          <Text
            fontFamily="SpaceGrotesk"
            fontWeight="700"
            fontSize="1.25rem"
            bg={commit.commit.reveal ? "antiquewhite" : ""}
            p="0.25rem 1rem"
            borderRadius={"1rem"}
          >
            {commit.player}
          </Text>
        </Flex>
      )}
      {!commit.commit.reveal ? (
        <Skeleton w="300px" h="420px" />
      ) : (
        <CardFactory card={commit.commit.main} />
      )}
    </Box>
  );
};
