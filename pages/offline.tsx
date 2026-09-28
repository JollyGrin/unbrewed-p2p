import { Grid, Spinner, Text, VStack } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { PageSeo } from "@/components/Helmet/Head";
import { GameShell } from "@/components/Game/GameShell";
import { OfflineGameProvider } from "@/lib/contexts/OfflineGameProvider";
import { useBagDecks } from "@/lib/bag/useBag";
import { useDeckLink } from "@/lib/hooks/useDeckLink";
import { deckMatchesLink } from "@/lib/deckLink";
import { DeckLinkHold } from "@/components/DeckLink/DeckLinkHold";
import { DeckRefreshOnTable } from "@/components/DeckLink/DeckRefreshOnTable";

/**
 * Solo offline table. Loads a deck entirely client-side and drops the player
 * straight onto the full game board (map + draggable card/token table) with
 * NO websocket — {@link OfflineGameProvider} satisfies the same game context
 * from local state. Reached directly, or via the /offline/<deckId> referral
 * link (404.tsx repoints it here).
 *
 * A `?deckId=` fetches and stars that specific deck — an unmatched.cards id,
 * or `labs:char_<uuid>` for an Unmatched Labs character (lib/deckLink.ts); with
 * none, we fall back to the starred deck. The pool is built by HandContainer
 * from the starred deck, the same path a fresh /game session uses. A Labs
 * deck already in the bag plays at once and is refreshed behind it (#996).
 */
const Offline = () => {
  const { query, isReady, replace } = useRouter();
  const deckId = query.deckId as string | undefined;

  const { starredDeck } = useBagDecks();
  const link = useDeckLink(deckId, { ready: isReady });
  const { failed } = link;
  const held = !!link.held && !link.held.refresh;

  // BoardContainer/HandContainer/ActionLog read `self` from query.name.
  useEffect(() => {
    if (!isReady || query.name) return;
    replace({ query: { ...query, name: "offline" } }, undefined, {
      shallow: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, query.name]);

  // When a deckId was requested, wait until the starred deck actually matches
  // it (so we don't flash a previously-starred deck's board first).
  const deckReady = deckId
    ? deckMatchesLink(starredDeck, deckId)
    : !!starredDeck;

  const nameReady = !!query.name;

  return (
    <>
      <PageSeo path="/offline" title="Offline — Unbrewed" noindex />
      {deckReady && nameReady ? (
        <OfflineGameProvider>
          <GameShell />
          <DeckRefreshOnTable refresh={link.refresh} />
          {link.held?.refresh && <DeckLinkHold link={link} />}
        </OfflineGameProvider>
      ) : (
        <Grid
          bg="brand.primary"
          color="brand.secondary"
          h="100vh"
          px="16px"
          placeItems="center"
        >
          {held ? (
            <DeckLinkHold link={link} />
          ) : (
            <VStack>
              <Spinner size="xl" />
              <Text fontFamily="heading" fontSize="1.5rem" fontWeight={700}>
                {failed ? "Couldn't load that deck" : "Loading your deck…"}
              </Text>
              {failed && (
                <Text fontSize="0.9rem" opacity={0.8}>
                  Check the link or grab a deck from your bag.
                </Text>
              )}
            </VStack>
          )}
        </Grid>
      )}
    </>
  );
};

export default Offline;
