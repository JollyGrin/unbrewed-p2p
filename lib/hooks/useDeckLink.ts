import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useBagDecks } from "@/lib/bag/useBag";
import {
  LinkedDeck,
  deckMatchesLink,
  fetchLinkedDeck,
  isLabsLink,
  refreshedDeck,
} from "@/lib/deckLink";
import { DeckRefresh } from "@/lib/deckRefresh";
import { LabsSkippedContent } from "@/lib/labs";

export type HeldDeck = LinkedDeck & {
  /** true when the bag's saved copy is already on the table */
  refresh: boolean;
};

export type DeckLinkState = {
  /** A fetched Labs deck our template can't draw, waiting on the player (#979). */
  held: HeldDeck | undefined;
  playAnyway: () => void;
  /** Refresh only: keep playing the saved copy. */
  keepSaved: () => void;
  /** The link couldn't be loaded and there is no saved copy to play. */
  failed: boolean;
  error: unknown;
  /** The last refresh written to the bag, for a table already playing `from`. */
  refresh: DeckRefresh | undefined;
  /** What a loaded Labs set holds that wasn't imported (#1000). Never holds the table. */
  notice:
    | { skipped: LabsSkippedContent; sourceUrl?: string; mapInBag?: boolean }
    | undefined;
  dismissNotice: () => void;
};

type Request = { raw: string; saved?: DeckImportType };

/**
 * A `?deckId=` deep link on /offline and /irl, resolved against the bag.
 *
 * - In the bag → star it now, so the table loads with no wait. An
 *   unmatched.cards deck stops there. A Labs deck is also fetched behind it
 *   (#996), and when Labs has a newer version the bag entry is replaced
 *   ({@link refreshedDeck}) and `refresh` says so, for the table to pick up.
 *   If Labs can't be reached, the saved copy just keeps playing.
 * - Not in the bag → fetch it, add it and star it.
 *
 * `waitForWholeBag` (/irl, #825): "not in the bag" waits for a signed-in
 * user's account half, so a fetch doesn't race a deck that's on its way.
 *
 * One fetch per page, for the link the page opened with: a deck switched to
 * in-game (which rewrites `?deckId=` on /irl) is starred, never refreshed.
 */
export const useDeckLink = (
  deckId: string | undefined,
  { ready, waitForWholeBag = false }: { ready: boolean; waitForWholeBag?: boolean },
): DeckLinkState => {
  const { decks, isLoading: bagLoading, pushDeck, updateDeck, setStar } = useBagDecks();
  const [request, setRequest] = useState<Request>();
  const [playAnyway, setPlayAnyway] = useState(false);
  const [keptSaved, setKeptSaved] = useState(false);
  const [refresh, setRefresh] = useState<DeckRefresh>();
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const requestedFor = useRef<string>();

  useEffect(() => {
    if (!ready || !deckId || !decks) return;
    const local = decks.find((d) => deckMatchesLink(d, deckId));
    if (local) {
      setStar(local.id);
      if (!requestedFor.current && isLabsLink(deckId)) {
        setRequest({ raw: deckId, saved: local });
      }
      requestedFor.current ??= deckId;
      return;
    }
    if (waitForWholeBag && bagLoading) return;
    if (requestedFor.current === deckId) return;
    requestedFor.current = deckId;
    setRequest({ raw: deckId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, deckId, decks, bagLoading]);

  const isRefresh = !!request?.saved;
  const { data: linked, error } = useQuery(
    ["deck-link", request?.raw, isRefresh],
    () => fetchLinkedDeck(request!.raw),
    {
      enabled: !!request,
      retry: false,
      // one fetch per click: not again on refocus (a phone unlocked at the table)
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      onSuccess: () => {
        if (!isRefresh) toast.success("Deck fetched!");
      },
      onError: (err) => {
        console.error(err);
        if (isRefresh) toast("Couldn't reach Unmatched Labs, so this is your saved copy");
        else toast.error("Error fetching deck");
      },
    },
  );

  const held =
    !!linked && linked.unsupported.length > 0 && !playAnyway && !keptSaved;

  useEffect(() => {
    if (!linked || !request || held || keptSaved) return;
    const { deck } = linked;
    if (!request.saved) {
      // Only star what actually landed — a refused deck (blocked author,
      // device full) was already toasted and isn't in the bag to resolve.
      void pushDeck(deck).then((added) => {
        if (added) setStar(deck.id);
      });
      return;
    }
    const saved = decks?.find((d) => d.id === request.saved!.id) ?? request.saved;
    const next = refreshedDeck(saved, deck);
    if (!next) return;
    void updateDeck(next).then(() => {
      setRefresh({ from: saved, to: next });
      toast.success("Updated to the latest version from Unmatched Labs");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, held, keptSaved]);

  return {
    held: held ? { ...linked, refresh: isRefresh } : undefined,
    playAnyway: () => setPlayAnyway(true),
    keepSaved: () => setKeptSaved(true),
    failed: !!error && !isRefresh,
    error: isRefresh ? undefined : error,
    refresh,
    notice:
      linked && linked.skipped.length > 0 && !held && !keptSaved && !noticeDismissed
        ? {
            skipped: linked.skipped,
            sourceUrl: linked.deck.sourceUrl,
            ...(linked.mapInBag ? { mapInBag: true } : {}),
          }
        : undefined,
    dismissNotice: () => setNoticeDismissed(true),
  };
};
