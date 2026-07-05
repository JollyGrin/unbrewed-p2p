/**
 * Evergreen decks: ids with rule enforcement in Unbrewed Pro. For these, the
 * committed snapshot in /public/top-decks is the source of truth EVERYWHERE —
 * sandbox included. Pro's engine froze the deck's rules at conversion time,
 * so upstream edits on unmatched.cards must not change what the sandbox
 * deals either; sandbox and pro stay in parity by construction.
 *
 * Everything else keeps the old behavior: live API first (latest deck
 * version), snapshot as an availability fallback.
 *
 * Expand EVERGREEN_DECK_IDS as more decks convert (and snapshot them via
 * `npm run pro:decks:snapshot` + a copy in /public/top-decks).
 */
import axios from "axios";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";

export const EVERGREEN_DECK_IDS = new Set<string>([
  "pk1x", // Thrall
  "1Y5J", // Triceratops
  // Evergreen originals — no unmatched.cards page exists, so the snapshot is
  // not just preferred but the ONLY source (the API fetch 404s by design).
  "taranis", // King Taranis
  "thetis", // Thetis
  "piper", // The Piper of the Underroads
  "hollow-oak", // The Hollow Oak
]);

export const DEFAULT_DECK_API = "https://unbrewed-api.vercel.app/api/unmatched-deck/";

const fromSnapshot = (id: string) =>
  axios.get<DeckImportType>(`/top-decks/${id}.json`).then((r) => r.data);
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
