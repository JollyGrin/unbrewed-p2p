import type {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import hollowOak from "../../../public/evergreen-decks/hollow-oak.json";
import larry from "../../../public/evergreen-decks/5jGPM.json";
import setBySlug from "../../labs/fixtures/set-by-slug.dumbass-brigade.json";
import { buildLabsImport, type LabsSetRow } from "../../labs";
import type { FaceResolver } from "../types";

const MAROUINE = "char_ce316d14-8bc8-413d-9086-ad37b502d0fe";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Stand-in for #1007's renderer: every template card gets a fake finished face. */
export const fakeFaces: FaceResolver = (card) =>
  `https://faces.example/${encodeURIComponent(card.title)}.webp`;

export const labsDeck = (): DeckImportType =>
  buildLabsImport(
    {
      row: (setBySlug as unknown as LabsSetRow[])[0],
      author: "TheNullProfessor",
      characterId: MAROUINE,
    },
    MAROUINE,
  ).deck;

/** A TTS-style image deck with a sheet-cropped hero card and image tokens. */
export const tokenDeck = (): DeckImportType => {
  const deck = clone(hollowOak) as unknown as DeckImportType;
  deck.id = "tokens-fixture";
  const sheet = "https://the-unmatched.club/sheets/tokens.png";
  deck.savedTokens = [
    { imageUrl: "https://unbrewed.xyz/tokens/flame.png", size: 72 },
    { imageUrl: sheet, sheet: { cols: 4, rows: 2, index: 5 }, size: 72 },
    { icon: "GiFireShield", counter: { value: 3 }, size: 72 },
    { icon: "GiSkullCrack", counter: { link: "hero" }, size: 72 },
  ];
  deck.savedTokenColor = "#48284F";
  return deck;
};

export const FIXTURES: Record<
  string,
  { deck: DeckImportType; faces: FaceResolver }
> = {
  "hollow-oak": {
    deck: clone(hollowOak) as unknown as DeckImportType,
    faces: fakeFaces,
  },
  "labs-marouine": { deck: labsDeck(), faces: () => null },
  "larry-extra-characters": {
    deck: clone(larry) as unknown as DeckImportType,
    faces: fakeFaces,
  },
  "tokens-sheet": { deck: tokenDeck(), faces: fakeFaces },
};

export type { DeckImportCardType };
