import { Box, Flex, Grid, Text, Skeleton, Button, Tag } from "@chakra-ui/react";
import { CardFactory } from "../CardFactory/card.factory";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import { PoolType } from "../DeckPool/PoolFns";
import { useState } from "react";

import { GiUpgrade as IconBoost } from "react-icons/gi";

export const DeckModalContent = ({
  cards,
  add,
}: {
  cards: DeckImportCardType[];
  add: (index: number) => () => void;
}) => {
  const [isHover, setIsHover] = useState<number>();
  const onEnter = (num: number) => setIsHover(num);
  const onLeave = () => setIsHover(undefined);

  return (
    <Grid gridTemplateColumns={"repeat(auto-fit, minmax(250px,1fr))"} gap={1}>
      {cards
        ?.map((card, index) => (
          <Box
            w="100%"
            maxH={"550px"}
            key={card.title + index}
            onMouseEnter={() => onEnter(index)}
            onMouseLeave={onLeave}
          >
            {isHover === index && (
              <Flex position="absolute">
                <Tag
                  fontSize="1.25rem"
                  userSelect="none"
                  cursor="pointer"
                  onClick={() => add(index)()}
                >
                  +
                </Tag>
              </Flex>
            )}
            <CardFactory key={card.title + index} card={card} />
          </Box>
        ))
        ?.reverse()}
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
  const [_, setIsHover] = useState<boolean>();
  if (commit.commit.main === null) return <Box display="none" />;
  const onEnter = () => setIsHover(true);
  const onLeave = () => setIsHover(false);
  const hasBoost = commit.commit.boost !== null;
  return (
    <Box minH="420px">
      {commit?.player && (
        <Flex
          transform={"translate(0,2.35rem)"}
          alignItems="center"
          justifyContent="space-between"
          p="0.25rem 1rem"
        >
          {hasBoost ? <IconBoost size="1.2rem" /> : <div />}
          <Text
            fontFamily="SpaceGrotesk"
            fontWeight="700"
            fontSize="1.25rem"
            bg={commit.commit.reveal ? "antiquewhite" : ""}
            borderRadius={"1rem"}
          >
            {commit.player}
          </Text>
        </Flex>
      )}
      <Box onMouseOver={onEnter} onMouseOut={onLeave}>
        {!commit.commit.reveal ? (
          <Skeleton w="300px" h="420px" />
        ) : (
          <Box position="relative">
            <CardFactory card={commit.commit.main} />
            <Box
              position="absolute"
              w="3rem"
              top="0.5rem"
              right="0.5rem"
              transition="all 0.25s ease-in-out"
              _hover={{
                transform: "scale(4) translateX(-1rem)",
              }}
            >
              {commit.commit.boost && (
                <>
                  <Text
                    bg="brand.secondary"
                    color="brand.primary"
                    textAlign="center"
                    borderTopRadius="100%"
                    fontWeight={700}
                  >
                    {commit.commit.boost.boost}
                  </Text>
                  <CardFactory card={commit.commit.boost} />
                </>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
