/**
 * Pro hand — real card faces (sandbox `Card` renderer) with server-driven
 * affordances. A card is playable iff the server offered an action carrying
 * its instance id; one action = click plays it, several = a small menu.
 * Zero rules logic: unplayable cards are simply inert.
 */
import { Box, Flex, Menu, MenuButton, MenuItem, MenuList, Tag, Text } from "@chakra-ui/react";
import { Card } from "@/components/CardFactory/Card";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { Action, CardInstanceId } from "@/lib/pro/protocol";
import { ResolveCard } from "@/lib/pro/useProCardArt";

export interface HandCardAction {
  action: Action;
  label: string;
}

export interface ProHandProps {
  hand: CardInstanceId[];
  resolveCard: ResolveCard;
  /** text fallback while art loads / when a title doesn't match */
  labelFor: (instance: CardInstanceId) => string;
  actionsFor: (instance: CardInstanceId) => HandCardAction[];
  onAction: (action: Action) => void;
}

const CARD_W = "8.5rem";

export const CardFace = ({
  card,
  fallback,
}: {
  card: DeckImportCardType | null;
  fallback: string;
}) =>
  card ? (
    <Card card={card} />
  ) : (
    <Flex
      w="100%"
      h="100%"
      bg="brand.surface"
      border="1px solid"
      borderColor="whiteAlpha.300"
      borderRadius="0.5rem"
      alignItems="center"
      justifyContent="center"
      p="0.5rem"
    >
      <Text fontSize="0.8rem" textAlign="center" color="brand.parchment">
        {fallback}
      </Text>
    </Flex>
  );

export const ProHand = ({ hand, resolveCard, labelFor, actionsFor, onAction }: ProHandProps) => {
  if (hand.length === 0)
    return (
      <Text opacity={0.5} fontSize="0.9rem" textAlign="center">
        hand is empty
      </Text>
    );

  return (
    <Flex justifyContent="center" alignItems="flex-end" gap="0" pb="0.5rem">
      {hand.map((instance, i) => {
        const card = resolveCard(instance);
        const actions = actionsFor(instance);
        const playable = actions.length > 0;
        const frame = (
          <Box
            w={CARD_W}
            sx={{ aspectRatio: "63 / 88" }}
            ml={i === 0 ? 0 : `calc(${CARD_W} * -0.25)`}
            position="relative"
            transition="transform 0.15s ease, filter 0.15s ease"
            cursor={playable ? "pointer" : "default"}
            filter={playable ? "none" : "grayscale(0.4) brightness(0.75)"}
            _hover={{ transform: "translateY(-1.25rem)", zIndex: 10 }}
            zIndex={i}
            borderRadius="0.5rem"
            boxShadow={playable ? "0 0 0 2px #E0A82E, 0 4px 10px rgba(0,0,0,0.5)" : "0 2px 6px rgba(0,0,0,0.4)"}
          >
            <CardFace card={card} fallback={labelFor(instance)} />
            {playable && (
              <Tag
                position="absolute"
                bottom="-0.5rem"
                left="50%"
                transform="translateX(-50%)"
                size="sm"
                bg="brand.accent"
                color="brand.surfaceDim"
                whiteSpace="nowrap"
              >
                {actions.length === 1 ? actions[0].label : "choose…"}
              </Tag>
            )}
          </Box>
        );

        if (!playable) return <Box key={instance}>{frame}</Box>;
        if (actions.length === 1)
          return (
            <Box key={instance} onClick={() => onAction(actions[0].action)}>
              {frame}
            </Box>
          );
        return (
          <Menu key={instance} placement="top">
            <MenuButton as={Box}>{frame}</MenuButton>
            <MenuList bg="brand.surface" borderColor="whiteAlpha.300" minW="10rem">
              {actions.map((a) => (
                <MenuItem
                  key={a.label}
                  bg="brand.surface"
                  color="brand.parchment"
                  _hover={{ bg: "whiteAlpha.300" }}
                  onClick={() => onAction(a.action)}
                >
                  {a.label}
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        );
      })}
    </Flex>
  );
};
