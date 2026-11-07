import { useRouter } from "next/router";
import { TableDestination, trackBagTableOpened } from "@/lib/deckAnalytics";

export type TableFrom = "preview" | "upnext";

/**
 * Where each /bag table button goes (#1538). /offline and /irl take the deck
 * by id; /connect plays the starred deck, which the caller has just starred.
 * A map picked on this page rides along to the sandbox tables as `mapUrl`
 * (GameShell renders the board from the query); /irl has no board.
 */
export const tableHref = (
  destination: TableDestination,
  deckId: string,
  mapUrl?: string,
): { pathname: string; query: Record<string, string> } => ({
  pathname: `/${destination}`,
  query: {
    ...(destination === "connect" ? {} : { deckId }),
    ...(mapUrl && destination !== "irl" ? { mapUrl } : {}),
  },
});

/** The Solo table / Invite a friend / In person actions, with their event. */
export const useTableActions = (from: TableFrom) => {
  const router = useRouter();
  const mapUrl = typeof router.query.mapUrl === "string" ? router.query.mapUrl : undefined;
  return {
    mapUrl,
    href: (destination: TableDestination, deckId: string) =>
      tableHref(destination, deckId, mapUrl),
    open: (destination: TableDestination, deckId: string) => {
      trackBagTableOpened(destination, from);
      return router.push(tableHref(destination, deckId, mapUrl));
    },
    /** For a link that already navigates: report only. */
    track: (destination: TableDestination) => trackBagTableOpened(destination, from),
  };
};
