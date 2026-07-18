import { Box, Flex, Grid, Text, Button, Tag } from "@chakra-ui/react";
import { Card } from "../CardFactory/Card";
import { CardBack } from "../CardFactory/card.back";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import { PoolType } from "../DeckPool/PoolFns";

import { GiUpgrade as IconBoost } from "react-icons/gi";
import { PopoverCardActions } from "./card-actions.popover";

const TableButton = (props: React.ComponentProps<typeof Button>) => (
  <Button
    bg="brand.secondary"
    color="brand.primary"
    fontFamily="SpaceGrotesk"
    boxShadow="0 2px 6px rgba(20, 8, 24, 0.35)"
    _hover={{ bg: "#5A3263", transform: "translateY(-1px)" }}
    _active={{ transform: "translateY(0)" }}
    {...props}
  />
);

export const DeckModalContent = ({
  cards,
  add,
}: {
  cards: DeckImportCardType[];
  add: (index: number) => () => void;
}) => {
  return (
    <Grid gridTemplateColumns={"repeat(auto-fit, minmax(250px,1fr))"} gap={1}>
      {cards
        ?.map((card, index) => (
          <Box
            w="100%"
            maxH={"550px"}
            key={card.title + index}
            // anchor the draw tag to this card, not the modal body
            position="relative"
          >
            <Flex position="absolute" top={0} left={0} zIndex={1}>
              <Tag
                fontSize="1.25rem"
                userSelect="none"
                cursor="pointer"
                onClick={() => add(index)()}
              >
                +
              </Tag>
            </Flex>
            <Card card={card} />
          </Box>
        ))
        ?.reverse()}
    </Grid>
  );
};

type CommitType = Pick<PoolType, "commit">;
export type PlayerCommit = { player: string; commit: CommitType["commit"] };
/**
 * @deprecated The commit modal — superseded by playing cards to the table
 * (face-down card tokens + flip + opponent pickup). No current UI initiates
 * a commit (the fan's "+" is hidden); this only renders if a commit lands in
 * a pool some other way. Delete alongside the PoolFns commit family once
 * table cards fully replace it.
 */
export const CommitModalContent: React.FC<{
  commits: PlayerCommit[];
  onClose: () => void;
  onFlip: () => void;
  onDiscard: () => void;
  onBoostTopDeck: () => void;
}> = ({ commits, onClose, onFlip, onDiscard, onBoostTopDeck }) => {
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
        <TableButton onClick={onClose}>Cancel</TableButton>
        <TableButton onClick={onFlip}>Flip</TableButton>
        <TableButton onClick={onDiscard}>Discard</TableButton>

        <div style={{ fontSize: "2rem" }}>
          <PopoverCardActions
            actions={[
              {
                text: "Boost from top of deck",
                fn: onBoostTopDeck,
              },
            ]}
          />
        </div>
      </Flex>
    </Flex>
  );
};

const CommitCard: React.FC<{ commit: PlayerCommit }> = ({ commit }) => {
  if (commit.commit.main === null) return <Box display="none" />;
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
            bg={commit.commit.reveal ? "brand.parchment" : ""}
            borderRadius={"1rem"}
          >
            {commit.player}
          </Text>
        </Flex>
      )}
      <Box>
        {!commit.commit.reveal ? (
          <CardBack imageUrl={commit.commit.main?.cardBackUrl} />
        ) : (
          <Box position="relative">
            <Card card={commit.commit.main} />
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
                  <Card card={commit.commit.boost} />
                </>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
