import {
  Box,
  Button,
  Collapse,
  Divider,
  FormLabel,
  Select,
  VStack,
} from "@chakra-ui/react";
import { RefObject, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { buildInviteUrl } from "@/lib/invite";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";

/**
 * "Invite a friend with a link" — copies a /join URL for the lobby the host is
 * about to open, optionally bundling one of their decks for the friend.
 *
 * The deck <option> value is the deck's `id`, never its `version_id`: version
 * ids are NOT unique in the bag (newly minted evergreen decks all ship
 * "evergreen-1", every TTS import gets "1"), so a controlled <select> keyed on
 * them snaps back to whichever same-version deck comes first — and the invite
 * link would carry an id the joiner can't resolve to the deck we meant.
 */
export const InviteLink = ({
  lobby,
  decks,
  activeServer,
  gidRef,
}: {
  lobby: string;
  decks?: DeckImportType[];
  activeServer?: string;
  gidRef: RefObject<HTMLInputElement>;
}) => {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteDeckId, setInviteDeckId] = useState("");
  const [_, copy] = useCopyToClipboard();

  // the lobby name is half the link, so clearing it collapses the panel back
  // to the disabled button (the host has nothing to invite anyone to yet)
  useEffect(() => {
    if (lobby === "") setShowInvite(false);
  }, [lobby]);

  return (
    <Box w="100%" maxW="380px">
      <Divider borderColor="brand.secondary" opacity={0.25} />
      {!showInvite ? (
        <Button
          mt="0.75rem"
          variant="ghost"
          size="sm"
          w="100%"
          color="brand.secondary"
          _hover={{ bg: "blackAlpha.50" }}
          isDisabled={lobby === ""}
          onClick={() => setShowInvite(true)}
        >
          {lobby === ""
            ? "Name a lobby above to invite a friend"
            : "＋ Invite a friend with a link"}
        </Button>
      ) : (
        <Collapse in={showInvite} animateOpacity>
          <VStack mt="0.75rem" spacing={2} align="stretch">
            <FormLabel
              m={0}
              htmlFor="invite-deck"
              color="brand.secondary"
              fontSize="0.85rem"
            >
              Bundle a deck for them (optional):
            </FormLabel>
            <Select
              id="invite-deck"
              bg="white"
              focusBorderColor="brand.secondary"
              value={inviteDeckId}
              onChange={(e) => setInviteDeckId(e.target.value)}
            >
              <option value="">Let them choose — or get a popular deck</option>
              {decks?.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </Select>
            <Button
              w="100%"
              bg="brand.secondary"
              color="brand.primary"
              _hover={{ bg: "brand.surfaceDim" }}
              onClick={() => {
                const gid = gidRef?.current?.value;
                if (!gid) return;
                copy(
                  buildInviteUrl({
                    gid,
                    server: activeServer,
                    deckId: inviteDeckId || undefined,
                  }),
                );
                toast.success(
                  "Invite link copied — anyone who clicks it jumps straight in!",
                );
              }}
            >
              Copy Invite Link
            </Button>
          </VStack>
        </Collapse>
      )}
    </Box>
  );
};
