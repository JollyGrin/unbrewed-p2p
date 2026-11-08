import { useEffect, useState } from "react";
import { Box, Flex, Link } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { DeckCards } from "@/components/Bag/Deck/DeckCards";
import { useReplaceConfirm } from "@/components/Bag/ReplaceDeckConfirm";
import { BagDeckView } from "@/lib/bag/useBag";
import { ClubDeck, ClubImportError, fetchClubDeck } from "@/lib/club/decode";
import { trackDeckAddFailed } from "@/lib/deckAnalytics";
import { DeckPreview } from "./DeckPreview";
import { FoundLine } from "./FoundLine";

const SOURCE = "the-unmatched.club";

/** What to do when the club can't be read right now (proxy down, offline, not deployed). */
export const CLUB_FALLBACK =
  "Couldn't reach the club right now: export the deck for Tabletop Simulator on the club page and drop that file here.";

/**
 * A the-unmatched.club hero link from the paste bar (#1538): the deck is
 * fetched through the API proxy as the id changes, decoded into an image
 * deck, and the preview ends in a table. A 404 is "no such deck"; anything
 * else (502, network, the proxy not deployed yet) falls back to the
 * Tabletop Simulator export route, never a crash.
 */
export const ClubPanel = ({
  id,
  pushDeck,
  setStar,
  onAdded,
}: {
  /** the club hero id; undefined for a club link that names no deck */
  id?: string;
  pushDeck: BagDeckView["pushDeck"];
  setStar: (id: string) => void;
  onAdded?: (deckId: string) => void;
}) => {
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading"; id: string }
    | { phase: "ready"; id: string; result: ClubDeck }
    | { phase: "error"; id: string; status: ClubImportError["status"] }
  >({ phase: "idle" });
  const { confirmReplace, asking, prompt } = useReplaceConfirm();

  useEffect(() => {
    if (!id) {
      setState({ phase: "idle" });
      return;
    }
    let cancelled = false;
    setState({ phase: "loading", id });
    void (async () => {
      try {
        const result = await fetchClubDeck(id);
        if (!cancelled) setState({ phase: "ready", id, result });
      } catch (err) {
        if (cancelled) return;
        const status = err instanceof ClubImportError ? err.status : "network";
        setState({ phase: "error", id, status });
        trackDeckAddFailed(SOURCE, status);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async (): Promise<string | undefined> => {
    if (state.phase !== "ready") return undefined;
    const { deck } = state.result;
    // storage full, or the player kept their edited copy — already toasted
    if (!(await pushDeck(deck, { confirmReplace, source: SOURCE }))) return undefined;
    setStar(deck.id);
    toast.success(`${deck.name} saved & ready to play`);
    onAdded?.(deck.id);
    return deck.id;
  };

  if (!id) {
    return (
      <FoundLine tone="problem">
        That&apos;s a the-unmatched.club link, but not a deck page. Paste the hero&apos;s
        page link (it ends in a number, like <code>/c/heroes/ellen-ripley.2304</code>), or
        export the deck for Tabletop Simulator and drop that file here.
      </FoundLine>
    );
  }

  return (
    <Flex direction="column" color="brand.secondary">
      {state.phase === "loading" && (
        <FoundLine tone="working">the-unmatched.club deck {id} · fetching…</FoundLine>
      )}
      {state.phase === "error" && (
        <FoundLine tone="problem">
          {state.status === 404 || state.status === 400 || state.status === "parse_error"
            ? `No deck ${id} on the-unmatched.club. Check the link: the number at the end is the deck.`
            : CLUB_FALLBACK}
        </FoundLine>
      )}
      {state.phase === "ready" && (
        <>
          <FoundLine>
            the-unmatched.club deck
            {state.result.author ? ` · by ${state.result.author}` : ""}
            {" · "}
            <Link href={state.result.deck.sourceUrl} isExternal textDecoration="underline">
              open on the club
            </Link>
          </FoundLine>
          <Box mt="0.75rem">
            <DeckPreview
              deck={state.result.deck}
              source="the-unmatched.club"
              onSave={save}
              isDisabled={asking}
              prompt={prompt}
              note={
                state.result.warnings.length > 0 ? (
                  <>
                    Heads up: {state.result.warnings.length}{" "}
                    {state.result.warnings.length === 1 ? "card has" : "cards have"} no image on the
                    club. They&apos;ll show as text, and you can still play.
                  </>
                ) : undefined
              }
            />
          </Box>
          <Box mt="0.75rem">
            <DeckCards decks={[state.result.deck]} selectedDeckId={state.result.deck.id} />
          </Box>
        </>
      )}
    </Flex>
  );
};
