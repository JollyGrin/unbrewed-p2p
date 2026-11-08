import { ReactNode, useEffect, useState } from "react";
import { Box } from "@chakra-ui/react";
import { useDebounce } from "use-debounce";
import { AddImageDeck } from "@/components/Bag/ImageDeck";
import { AddJson } from "@/components/Bag/Deck/AddJson";
import { BulkBundle, normalizeBundle } from "@/lib/bag/bundle";
import { parseTtsDeck } from "@/lib/tts/parse-tts";
import { FoundLine } from "./FoundLine";

type Fetched =
  | { kind: "bundle"; bundle: BulkBundle }
  | { kind: "tts"; text: string; cardCount: number; name?: string }
  | { kind: "not-a-deck" }
  | { kind: "failed"; status?: number };

/**
 * An http(s) link on no site we know (#1538 review): the old "From URL"
 * import. The link is fetched in case it serves deck JSON — a single deck, a
 * backup bundle or a Tabletop Simulator export — and the matching panel
 * opens on the body. Only when that fails, or the body isn't deck JSON, is
 * the link "not a deck we recognise".
 */
export const UrlPanel = ({
  url,
  onAdded,
  notRecognised,
}: {
  url: string;
  onAdded?: (deckId: string) => void;
  notRecognised: ReactNode;
}) => {
  const [settled] = useDebounce(url, 400);
  const [state, setState] = useState<{ url: string; result?: Fetched }>();

  useEffect(() => {
    let cancelled = false;
    setState({ url: settled });
    void (async () => {
      let result: Fetched;
      try {
        const res = await fetch(settled);
        if (!res.ok) {
          result = { kind: "failed", status: res.status };
        } else {
          const text = await res.text();
          result = classify(text);
        }
      } catch {
        result = { kind: "failed" };
      }
      if (!cancelled) setState({ url: settled, result });
    })();
    return () => {
      cancelled = true;
    };
  }, [settled]);

  if (!state || state.url !== url || !state.result) {
    return <FoundLine tone="working">Fetching that link, in case it serves a deck…</FoundLine>;
  }
  const { result } = state;
  switch (result.kind) {
    case "bundle":
      return <AddJson key={state.url} bundle={result.bundle} onAdded={onAdded} />;
    case "tts":
      return (
        <>
          <FoundLine>
            Tabletop Simulator export · {result.cardCount} unique cards
            {result.name ? ` · ${result.name}` : ""}
          </FoundLine>
          <Box mt="0.75rem">
            <AddImageDeck key={state.url} initialTts={result.text} onAdded={onAdded} />
          </Box>
        </>
      );
    case "failed":
      return (
        <FoundLine tone="problem">
          Couldn&apos;t fetch that link{result.status ? ` (${result.status})` : ""}, so it
          isn&apos;t a deck we can read. If it serves deck JSON, the site has to allow other
          sites to read it; otherwise download the file and drop it here.
        </FoundLine>
      );
    case "not-a-deck":
      return <>{notRecognised}</>;
  }
};

const classify = (text: string): Fetched => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "not-a-deck" };
  }
  const bundle = normalizeBundle(parsed);
  if (bundle) return { kind: "bundle", bundle };
  const tts = parseTtsDeck(parsed);
  if (tts.cards.length > 0) return { kind: "tts", text, cardCount: tts.cards.length, name: tts.name };
  return { kind: "not-a-deck" };
};
