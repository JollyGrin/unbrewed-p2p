import { Button, Grid, Spinner, Text, VStack } from "@chakra-ui/react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { PageSeo } from "@/components/Helmet/Head";
import { IrlShell } from "@/components/Irl/IrlShell";
import { IRL_SEAT } from "@/components/Irl/irlGame";
import { isOfflineError, useIrlServiceWorker } from "@/components/Irl/irlOffline";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { OfflineGameProvider } from "@/lib/contexts/OfflineGameProvider";
import { useBagDecks } from "@/lib/bag/useBag";
import { useUnmatchedDeck } from "@/lib/hooks/useUnmatchedDeck";

/**
 * IRL Mode (issue #798): playtest your deck in person before you print it.
 * The phone is the deck tray — hand, deck, discard, health counters, the hero
 * card — and the table is real, so there is no map, board, dice or opponent.
 *
 * Bootstrapped exactly like /offline: a `?deckId=` stars that deck (from the
 * bag, else fetched); with none, the starred deck. Mounted under the unchanged
 * OfflineGameProvider — no websocket.
 */
const Irl = () => {
  const { query, isReady, replace } = useRouter();
  const deckId = query.deckId as string | undefined;

  const { decks, starredDeck, isLoading, pushDeck, setStar } = useBagDecks();
  const { data, error, setDeckId } = useUnmatchedDeck();
  const failed = !!error;
  // No signal and a deck this phone has never opened (#801).
  const uncached = failed && isOfflineError(error);

  // Works offline at the table (#801): the worker keeps the assets, #798's
  // localStorage pool keeps the game.
  useIrlServiceWorker();

  // The shared game components read "self" from ?name=, and the offline
  // provider's one seat is keyed "offline" — so that is the name to set.
  useEffect(() => {
    if (!isReady || query.name) return;
    replace({ query: { ...query, name: IRL_SEAT } }, undefined, {
      shallow: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, query.name]);

  // Resolve the requested deck: star it if it's already in the bag, otherwise
  // fetch it. A deck found on the device is starred straight away, but "not in
  // the bag" waits for the WHOLE bag (#825): a signed-in user's account half
  // lands a beat after the device half, and a fetch fired before then can fail
  // on its own and toast "Error fetching deck" over a deck that then loads.
  useEffect(() => {
    if (!isReady || !deckId || !decks) return;
    const local = decks.find(
      (d) => d.id === deckId || d.version_id === deckId,
    );
    if (local) {
      setStar(local.id);
      return;
    }
    if (isLoading) return;
    setDeckId(deckId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, deckId, decks, isLoading]);

  // Fetched deck lands: add it to the bag and star it — then drop the query,
  // which otherwise refetches (and re-toasts "Deck fetched!" over the header)
  // every time the phone is unlocked and the window regains focus.
  useEffect(() => {
    if (!data) return;
    void pushDeck(data).then((added) => {
      if (added) setStar(data.id);
      setDeckId(undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Wait until the starred deck matches the requested one, then hold on to
  // it: after an in-game "Change deck" the URL moves on and this hook
  // instance's starred deck can lag, which must not unmount the tray. Only
  // once the router is ready — before that `query` is empty on a static
  // page, and a PREVIOUSLY starred deck would be latched in place of the
  // requested one.
  const matches = deckId
    ? !!starredDeck &&
      (starredDeck.id === deckId || starredDeck.version_id === deckId)
    : !!starredDeck;
  const [deck, setDeck] = useState<DeckImportType>();
  useEffect(() => {
    if (!deck && isReady && matches && starredDeck) setDeck(starredDeck);
  }, [deck, isReady, matches, starredDeck]);

  const noDeck = isReady && !deckId && !isLoading && !!decks && !starredDeck;

  return (
    <>
      <PageSeo path="/irl" title="IRL Mode — Unbrewed" noindex />
      {/* Installable to the home screen (#800). Only this page links the
          manifest, so only /irl can be installed; its scope is "/irl".
          theme-color and viewport-fit=cover already come from PageSeo. */}
      <Head>
        <link rel="manifest" href="/irl.webmanifest" />
        <link rel="apple-touch-icon" href="/irl-icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="IRL Mode" />
      </Head>
      {deck && query.name ? (
        <OfflineGameProvider>
          <IrlShell deck={deck} />
        </OfflineGameProvider>
      ) : (
        <Grid
          bg="brand.secondary"
          color="brand.primary"
          h="100svh"
          px="16px"
          placeItems="center"
        >
          <VStack spacing="0.75rem" textAlign="center">
            {!noDeck && !failed && <Spinner size="xl" />}
            <Text fontFamily="heading" fontSize="1.5rem" fontWeight={700}>
              {noDeck
                ? "Star a deck to playtest it"
                : uncached
                  ? "This deck isn't cached"
                  : failed
                    ? "Couldn't load that deck"
                    : "Loading your deck…"}
            </Text>
            {(failed || noDeck) && (
              <>
                <Text fontSize="0.9rem" opacity={0.8}>
                  {noDeck
                    ? "Star a deck in your bag to play it at a real table."
                    : uncached
                      ? "Connect once to load it — after that it plays with no signal."
                      : "Check the link or grab a deck from your bag."}
                </Text>
                <Button as={Link} href="/bag" bg="brand.accent" color="brand.surfaceDim">
                  Open your bag
                </Button>
              </>
            )}
          </VStack>
        </Grid>
      )}
    </>
  );
};

export default Irl;
