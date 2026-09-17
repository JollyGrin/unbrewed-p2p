/**
 * "What has already been played" in one tap (player feedback).
 *
 * Both discard piles are public information, and the desktop HUD has always
 * been able to open them from a seat's pile pill. On a phone that pill lives
 * two taps deep inside the seat sheet, so during a game nobody found it — the
 * question "which cards are gone?" is asked constantly in Unmatched, and it
 * decides whether an attack is safe.
 *
 * So this is the same public data, surfaced as its own sheet: one section per
 * seat, cards NEWEST FIRST (the last card played is the one being asked about),
 * with the same CardFace the table uses, so a hold reads it large.
 *
 * Hand-rolled rather than a Chakra Drawer, like the page's other sheets: they
 * stack over each other and over the board, and Chakra's focus lock fights that.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { CardInstanceId } from "@/lib/pro/protocol";
import { CardFace } from "@/components/Pro/ProHand";
import { ResolveCard } from "@/lib/pro/useProCardArt";
import { TAP_TARGET } from "@/lib/pro/mobileLayout";

export interface DiscardSeat {
  id: string;
  name: string;
  /** Play order, as the server keeps it — rendered reversed. */
  discard: CardInstanceId[];
  you: boolean;
}

export const ProDiscardsSheet = ({
  isOpen,
  onClose,
  seats,
  resolveCard,
  labelFor,
}: {
  isOpen: boolean;
  onClose: () => void;
  seats: DiscardSeat[];
  resolveCard: ResolveCard;
  labelFor: (instance: CardInstanceId) => string;
}) => {
  if (!isOpen) return null;
  return (
    <>
      <Box
        position="fixed"
        inset={0}
        zIndex={5}
        bg="rgba(12, 4, 16, 0.6)"
        pointerEvents="auto"
        onClick={onClose}
        aria-hidden
      />
      <Flex
        data-testid="pro-discards"
        position="fixed"
        left={0}
        right={0}
        bottom={0}
        zIndex={6}
        direction="column"
        maxH="82svh"
        borderTopRadius="1.1rem"
        borderTop="2px solid"
        borderColor="brand.accent"
        bg="linear-gradient(180deg, rgba(58, 33, 64, 0.98), rgba(38, 20, 43, 0.99))"
        color="brand.parchment"
        boxShadow="0 -8px 24px rgba(12, 4, 16, 0.55)"
        pointerEvents="auto"
        sx={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Flex
          as="button"
          type="button"
          aria-label="Close discard piles"
          onClick={onClose}
          alignItems="center"
          justifyContent="space-between"
          minH={TAP_TARGET}
          px="0.9rem"
          borderBottom="1px solid rgba(231, 204, 152, 0.14)"
        >
          <Text fontFamily="BebasNeueRegular" letterSpacing="0.04em" fontSize="1rem">
            Discard piles
          </Text>
          <Text fontSize="0.7rem" fontWeight={700} color="rgba(231, 204, 152, 0.72)">
            Close
          </Text>
        </Flex>
        <Flex direction="column" gap="1rem" overflowY="auto" px="0.9rem" py="0.8rem">
          {seats.map((seat) => (
            <Flex key={seat.id} direction="column" gap="0.4rem">
              <Text
                fontSize="0.72rem"
                fontWeight={700}
                letterSpacing="0.08em"
                textTransform="uppercase"
                color="brand.accent"
              >
                {seat.you ? `${seat.name} (you)` : seat.name} · {seat.discard.length}
              </Text>
              {seat.discard.length === 0 ? (
                <Text fontSize="0.8rem" opacity={0.6}>
                  nothing played yet
                </Text>
              ) : (
                <Flex gap="0.5rem" overflowX="auto" pb="0.3rem" sx={{ "::-webkit-scrollbar": { display: "none" } }}>
                  {[...seat.discard].reverse().map((card, i) => (
                    <Box key={`${card}-${i}`} flex="0 0 auto" w="6.5rem" sx={{ aspectRatio: "63 / 88" }}>
                      <CardFace card={resolveCard(card)} fallback={labelFor(card)} />
                    </Box>
                  ))}
                </Flex>
              )}
            </Flex>
          ))}
        </Flex>
      </Flex>
    </>
  );
};
