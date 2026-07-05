import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
} from "@chakra-ui/react";
import { useRef } from "react";
import { colors, fonts } from "@/styles/style";

export const DeckOpenWarningDialog = (props: {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog
      isOpen={props.isOpen}
      leastDestructiveRef={cancelRef}
      onClose={props.onCancel}
      isCentered
    >
      <AlertDialogOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)">
        <AlertDialogContent
          bg={colors.brand.parchment}
          color={colors.brand.surfaceDim}
          borderRadius="1rem"
          border="1px solid rgba(72, 40, 79, 0.35)"
        >
          <AlertDialogHeader
            fontFamily={fonts.SpaceGrotesk}
            fontSize="1.25rem"
            fontWeight="700"
          >
            Open your deck?
          </AlertDialogHeader>
          <AlertDialogBody>
            Looking through your deck will shuffle it once you close this
            view, so it can&apos;t be used to stack the deck. You won&apos;t
            be asked again this game.
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={props.onCancel}>
              Cancel
            </Button>
            <Button
              ml="0.75rem"
              bg={colors.brand.accent}
              color={colors.brand.surfaceDim}
              fontFamily={fonts.SpaceGrotesk}
              fontWeight="700"
              _hover={{ bg: colors.brand.accentDeep }}
              onClick={props.onConfirm}
            >
              Open deck
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};
