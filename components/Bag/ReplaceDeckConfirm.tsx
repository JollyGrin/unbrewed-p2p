import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { ReplaceAsk } from "@/lib/bag/useBag";

/**
 * The in-page "Replace / Keep mine" step (#1033) for an import that would
 * overwrite a deck the player has changed. No `window.confirm`: it blocks the
 * page, can't be styled, and stalls headless runs through the import panels.
 *
 * `pushDeck` decides WHETHER to ask (lib/bag/deckEdits.ts); this only asks.
 * Pass `confirmReplace` to `pushDeck` and render `prompt` by the save button:
 * the `pushDeck` call stays pending until the player picks, then resolves
 * true (replaced) or false (kept — the caller must not toast success).
 */
export const useReplaceConfirm = (): {
  confirmReplace: (ask: ReplaceAsk) => Promise<boolean>;
  asking: boolean;
  prompt: ReactNode;
} => {
  const [ask, setAsk] = useState<ReplaceAsk>();
  const resolver = useRef<(replace: boolean) => void>();

  const settle = useCallback((replace: boolean) => {
    resolver.current?.(replace);
    resolver.current = undefined;
    setAsk(undefined);
  }, []);

  const confirmReplace = useCallback((next: ReplaceAsk) => {
    resolver.current?.(false); // a second save while asking drops the first
    setAsk(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // Leaving the panel mid-question keeps the saved copy.
  useEffect(() => () => resolver.current?.(false), []);

  return {
    confirmReplace,
    asking: !!ask,
    prompt: ask ? (
      <ReplaceDeckConfirm
        ask={ask}
        onReplace={() => settle(true)}
        onKeep={() => settle(false)}
      />
    ) : null,
  };
};

export const ReplaceDeckConfirm = ({
  ask,
  onReplace,
  onKeep,
}: {
  ask: ReplaceAsk;
  onReplace: () => void;
  onKeep: () => void;
}) => (
  <Box
    role="alertdialog"
    aria-label={`Replace ${ask.saved.name}?`}
    data-testid="replace-deck-confirm"
    mb="0.5rem"
    p="0.6rem 0.75rem"
    borderRadius="md"
    borderWidth="1px"
    borderColor="brand.danger"
    bg="white"
    maxW="620px"
  >
    <Text fontSize="0.9rem">
      “{ask.saved.name}” is already in your bag with changes you made:{" "}
      {ask.edits.join(", ")}. Replacing it with this copy loses them.
    </Text>
    <HStack mt="0.5rem">
      <Button size="sm" variant="outline" colorScheme="red" onClick={onReplace}>
        Replace
      </Button>
      <Button
        size="sm"
        bg="brand.accent"
        color="brand.surfaceDim"
        _hover={{ bg: "brand.accentDeep" }}
        onClick={onKeep}
      >
        Keep mine
      </Button>
    </HStack>
  </Box>
);
