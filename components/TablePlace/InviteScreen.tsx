import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import {
  EMPTY_LOBBY_REAP_MINUTES,
  type LobbyCreated,
} from "@/lib/tableplace/api";

const seatUrl = (lobby: LobbyCreated, seat: number) =>
  lobby.seats.find((s) => s.seat === seat)?.url ?? lobby.lobby_url;

/** After the lobby exists: open your seat, hand the other one to a friend. */
export const InviteScreen = ({
  lobby,
  onReset,
}: {
  lobby: LobbyCreated;
  onReset: () => void;
}) => {
  const [, copy] = useCopyToClipboard();
  const mine = seatUrl(lobby, 0);
  const theirs = seatUrl(lobby, 1);
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const expires = new Date(lobby.expires_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const share = async () => {
    try {
      await navigator.share({
        title: "Unmatched on table.place",
        text: "Your seat at my Unmatched table",
        url: theirs,
      });
    } catch {
      // dismissed the sheet
    }
  };

  return (
    <VStack spacing="1.25rem" w="100%" align="stretch" data-testid="invite">
      <Text
        as="h1"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="1.6rem"
      >
        Your table is ready
      </Text>

      <Box>
        <Text as="h2" fontWeight={700}>
          1. Open your seat
        </Text>
        <Text fontSize="0.9rem" opacity={0.8}>
          Open it now: a table nobody has joined closes after about{" "}
          {EMPTY_LOBBY_REAP_MINUTES} minutes.
        </Text>
        <Text fontSize="0.9rem" opacity={0.8} data-testid="camera-hint">
          Scroll out to see the whole table: your cards are along the edge
          nearest you.
        </Text>
        <Button
          as="a"
          href={mine}
          target="_blank"
          rel="noopener"
          mt="0.5rem"
          bg="brand.secondary"
          color="brand.highlight"
          _hover={{ opacity: 0.9 }}
          data-testid="seat-0"
        >
          Open your seat
        </Button>
      </Box>

      <Box>
        <Text as="h2" fontWeight={700}>
          2. Invite your friend
        </Text>
        <Text fontSize="0.9rem" opacity={0.8}>
          Send them this link. It opens the other seat.
        </Text>
        <Flex mt="0.5rem" gap="0.5rem" flexWrap="wrap">
          <Input
            readOnly
            value={theirs}
            bg="white"
            flex="1 1 16rem"
            aria-label="Your friend's invite link"
            onFocus={(e) => e.target.select()}
            data-testid="seat-1"
          />
          <HStack>
            <Button
              onClick={async () => {
                if (await copy(theirs)) toast.success("Invite link copied");
                else toast.error("Couldn't copy. Select the link instead.");
              }}
            >
              Copy
            </Button>
            {canShare && <Button onClick={share}>Share</Button>}
          </HStack>
        </Flex>
      </Box>

      <Text fontSize="0.85rem" opacity={0.8}>
        The table stays open until {expires} while someone is at it, and closes
        after {EMPTY_LOBBY_REAP_MINUTES} minutes once everyone has left.
      </Text>
      <Text fontSize="0.85rem" opacity={0.8}>
        The table runs on table.place, a free 3D tabletop. Your decks travel
        there as card images; nothing is saved to an account.
      </Text>
      <Button variant="ghost" alignSelf="flex-start" onClick={onReset}>
        Make another table
      </Button>
    </VStack>
  );
};
