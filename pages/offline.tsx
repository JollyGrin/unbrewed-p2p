import { Grid, Spinner, Text, VStack } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { PageSeo } from "@/components/Helmet/Head";
import { GameShell } from "@/components/Game/GameShell";
import { OfflineGameProvider } from "@/lib/contexts/OfflineGameProvider";
import { useLocalDeckStorage } from "@/lib/hooks";
import { useUnmatchedDeck } from "@/lib/hooks/useUnmatchedDeck";

/**
 * Solo offline table. Loads a deck entirely client-side and drops the player
 * straight onto the full game board (map + draggable card/token table) with
 * NO websocket — {@link OfflineGameProvider} satisfies the same game context
 * from local state. Reached directly, or via the /offline/<deckId> referral
 * link (404.tsx repoints it here).
 *
 * A `?deckId=` fetches and stars that specific deck; with none, we fall back to
 * the starred deck. The pool is built by HandContainer from the starred deck,
 * the same path a fresh /game session uses.
 */
const Offline = () => {
  const { query, isReady, replace } = useRouter();
  const deckId = query.deckId as string | undefined;

  const { decks, starredDeck, pushDeck, setStar } = useLocalDeckStorage();
  const { data, error, setDeckId } = useUnmatchedDeck();
  const failed = !!error;

  // BoardContainer/HandContainer/ActionLog read `self` from query.name.
  useEffect(() => {
    if (!isReady || query.name) return;
    replace({ query: { ...query, name: "offline" } }, undefined, {
      shallow: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, query.name]);

  // Resolve the requested deck: star it if it's already in the bag, otherwise
  // kick off a fetch. Reactive (no page reload) — once the deck is starred,
  // HandContainer builds the pool from it.
  useEffect(() => {
    if (!isReady || !deckId || !decks) return;
    const local = decks.find(
      (d) => d.id === deckId || d.version_id === deckId,
    );
    if (local) {
      setStar(local.id);
      return;
    }
    setDeckId(deckId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, deckId, decks]);

  // Fetched deck lands: add it to the bag and star it.
  useEffect(() => {
    if (!data) return;
    pushDeck(data);
    setStar(data.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // When a deckId was requested, wait until the starred deck actually matches
  // it (so we don't flash a previously-starred deck's board first).
  const deckReady = deckId
    ? !!starredDeck &&
      (starredDeck.id === deckId || starredDeck.version_id === deckId)
    : !!starredDeck;

  const nameReady = !!query.name;

  return (
    <>
      <PageSeo path="/offline" title="Offline — Unbrewed" noindex />
      {deckReady && nameReady ? (
        <OfflineGameProvider>
          <GameShell />
        </OfflineGameProvider>
      ) : (
        <Grid
          bg="brand.primary"
          color="brand.secondary"
          h="100vh"
          placeItems="center"
        >
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
        </Grid>
      )}
    </>
  );
};

export default Offline;
