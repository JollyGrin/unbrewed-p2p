import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { knownAddSource } from "@/lib/deckAnalytics";
import { isLabsDeckId } from "@/lib/labs/parse";

/** Where a bagged deck came from, for its tile chip and its Up next line. */
export const deckSourceLabel = (
  deck: DeckImportType,
): { chip: string; label: string } | undefined => {
  const source = knownAddSource(deck);
  if (source === "unmatched-labs" || isLabsDeckId(deck.id)) {
    return { chip: "labs", label: "Unmatched Labs" };
  }
  switch (source) {
    case "tts":
    case "the-unmatched.club":
      return { chip: "club", label: "Tabletop Simulator export" };
    case "image":
      return { chip: "images", label: "Card images" };
    case "starter":
      return { chip: "starter", label: "Starter deck" };
    case "bulk":
      return { chip: "backup", label: "Backup" };
    case "json":
      return { chip: "json", label: "Deck JSON" };
    case "pro-hero":
      return { chip: "pro", label: "Pro" };
    case "popular":
    case "code":
    case "deeplink":
    case "unmatched.cards":
      return { chip: "cards", label: "unmatched.cards" };
  }
  if (deck.tags?.includes("image-deck")) return { chip: "images", label: "Card images" };
  if (/^[A-Za-z0-9_-]{4,8}$/.test(deck.id)) return { chip: "cards", label: "unmatched.cards" };
  return undefined;
};
