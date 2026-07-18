/**
 * Evergreen decks: ids with rule enforcement in Unbrewed Pro. For these, the
 * rules-locked snapshot in /public/evergreen-decks is the source of truth
 * EVERYWHERE — sandbox included. Pro's engine froze the deck's rules at
 * conversion time, so upstream edits on unmatched.cards must not change what
 * the sandbox deals either; sandbox and pro stay in parity by construction.
 *
 * Everything else keeps the old behavior: live API first (latest deck
 * version), snapshot as an availability fallback.
 *
 * Derived from HERO_DECK_IDS (lib/pro/useProCardArt.ts) — the one hero<->deck
 * mapping for every hero with rules in unbrewed-pro-server — so this set
 * never drifts out of sync with the Pro roster. Add a hero there (plus its
 * snapshot + manifest entry in /public/evergreen-decks) and it shows up here
 * automatically.
 */
import axios from "axios";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { HERO_DECK_IDS } from "@/lib/pro/useProCardArt";

export const EVERGREEN_DECK_IDS = new Set<string>(Object.values(HERO_DECK_IDS));

// The deck-fetch CORS proxy now lives in the engine server (folded in from the
// standalone unbrewed-api Vercel app): same path, same body, CORS-open for GET.
// NEXT_PUBLIC_DECK_API_URL can override for local-engine testing, but note it's
// build-time-inlined (same caveat as NEXT_PUBLIC_PRO_WS_URL), so the fallback
// must stay the prod engine URL.
export const DEFAULT_DECK_API =
  process.env.NEXT_PUBLIC_DECK_API_URL ??
  "https://unbrewed-engine-production.up.railway.app/api/unmatched-deck/";

const fromSnapshot = (id: string) =>
  axios.get<DeckImportType>(`/evergreen-decks/${id}.json`).then((r) => r.data);
const fromApi = (id: string) =>
  axios.get<DeckImportType>(DEFAULT_DECK_API + id).then((r) => r.data);

export const fetchDeckById = async (id: string): Promise<DeckImportType> => {
  if (EVERGREEN_DECK_IDS.has(id)) {
    try {
      return await fromSnapshot(id);
    } catch (err) {
      console.warn("evergreen snapshot missing, falling back to deck api", err);
      return fromApi(id);
    }
  }
  try {
    return await fromApi(id);
  } catch (err) {
    console.warn("deck api failed, trying bundled snapshot", err);
    return fromSnapshot(id);
  }
};
