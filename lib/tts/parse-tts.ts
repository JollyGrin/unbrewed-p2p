import {
  CardImageRef,
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";

/**
 * Parser for Tabletop Simulator deck exports — the machine-readable
 * format produced by both unmatched.cards and the-unmatched.club.
 *
 * A TTS "Saved Object" wraps everything in ObjectStates[]; each deck
 * object carries a CustomDeck map of sprite sheets
 * ({ FaceURL, BackURL, NumWidth, NumHeight }) plus card ids where
 * `Math.floor(id / 100)` picks the sheet and `id % 100` the cell.
 */

export type ParsedTtsCard = {
  title: string;
  quantity: number;
  image: CardImageRef;
};

export type TtsParseResult = {
  name?: string;
  cards: ParsedTtsCard[];
  cardbackUrl?: string;
  warnings: string[];
};

type TtsSheet = {
  FaceURL?: string;
  BackURL?: string;
  NumWidth?: number;
  NumHeight?: number;
};

type TtsObject = {
  Name?: string;
  Nickname?: string;
  CardID?: number;
  DeckIDs?: number[];
  CustomDeck?: Record<string, TtsSheet>;
  ContainedObjects?: TtsObject[];
  ObjectStates?: TtsObject[];
};

/** steam cloud hosts images over https; old exports reference http */
const httpsUpgrade = (url: string): string =>
  url.replace(
    /^http:\/\/(cloud-\d+\.steamusercontent\.com|steamusercontent-a\.akamaihd\.net)/,
    "https://$1",
  );

const collectDeckObjects = (node: TtsObject, found: TtsObject[]) => {
  if (!node || typeof node !== "object") return;
  if (node.CustomDeck && (node.DeckIDs || node.ContainedObjects || node.CardID))
    found.push(node);
  for (const child of node.ObjectStates ?? []) collectDeckObjects(child, found);
  for (const child of node.ContainedObjects ?? []) {
    // nested bags/decks
    if (child?.ObjectStates || child?.ContainedObjects?.length) {
      collectDeckObjects(child, found);
    }
  }
};

export const parseTtsDeck = (input: unknown): TtsParseResult => {
  const warnings: string[] = [];
  const result: TtsParseResult = { cards: [], warnings };

  if (!input || typeof input !== "object") {
    warnings.push("Not a JSON object");
    return result;
  }

  const root = input as TtsObject;
  const deckObjects: TtsObject[] = [];
  collectDeckObjects(root, deckObjects);
  if (Array.isArray(input)) {
    for (const node of input as TtsObject[]) collectDeckObjects(node, deckObjects);
  }

  if (deckObjects.length === 0) {
    warnings.push(
      "No Tabletop Simulator deck found (expected CustomDeck sprite sheets)",
    );
    return result;
  }

  // aggregate cards by CardID so duplicates become quantity
  const byCardId = new Map<number, ParsedTtsCard>();
  let fallbackTitleCount = 0;

  for (const deck of deckObjects) {
    const sheets = deck.CustomDeck ?? {};

    if (!result.name && deck.Nickname) result.name = deck.Nickname;
    if (!result.cardbackUrl) {
      const firstSheet = Object.values(sheets)[0];
      if (firstSheet?.BackURL) {
        result.cardbackUrl = httpsUpgrade(firstSheet.BackURL);
      }
    }

    const entries: { id: number; title?: string }[] = [];
    if (deck.ContainedObjects?.length) {
      for (const card of deck.ContainedObjects) {
        if (typeof card?.CardID === "number")
          entries.push({ id: card.CardID, title: card.Nickname || undefined });
      }
    } else if (deck.DeckIDs?.length) {
      for (const id of deck.DeckIDs) entries.push({ id });
    } else if (typeof deck.CardID === "number") {
      entries.push({ id: deck.CardID, title: deck.Nickname || undefined });
    }

    for (const entry of entries) {
      const existing = byCardId.get(entry.id);
      if (existing) {
        existing.quantity += 1;
        if (entry.title && existing.title.startsWith("Card ")) {
          existing.title = entry.title;
        }
        continue;
      }

      const sheetKey = String(Math.floor(entry.id / 100));
      const sheet = sheets[sheetKey];
      if (!sheet?.FaceURL) {
        warnings.push(`Card ${entry.id}: no sprite sheet "${sheetKey}" found`);
        continue;
      }
      const url = httpsUpgrade(sheet.FaceURL);
      if (/^file:\/\//i.test(url) || /localhost|127\.0\.0\.1/.test(url)) {
        warnings.push(
          `Sheet for card ${entry.id} points at a local file — re-export with cloud hosting so other players can see it`,
        );
      }

      fallbackTitleCount += 1;
      byCardId.set(entry.id, {
        title: entry.title ?? `Card ${fallbackTitleCount}`,
        quantity: 1,
        image: {
          url,
          cols: sheet.NumWidth ?? 10,
          rows: sheet.NumHeight ?? 7,
          index: entry.id % 100,
        },
      });
    }
  }

  result.cards = [...byCardId.values()];
  if (result.cards.length === 0) {
    warnings.push("Deck contained no cards");
  }
  return result;
};

export type ImageDeckInput = {
  name: string;
  heroName?: string;
  hp?: number;
  move?: number;
  isRanged?: boolean;
  cardbackUrl?: string;
  cards: ParsedTtsCard[];
};

/**
 * Wrap parsed image cards in a standard DeckImportType so storage,
 * starring, backup and the websocket all treat it like any other deck.
 * Template-only fields get neutral defaults — the printed card art is
 * the source of truth for image decks.
 */
export const buildImageDeck = (input: ImageDeckInput): DeckImportType => {
  const id = `img-${Math.random().toString(36).slice(2, 8)}`;
  const heroName = input.heroName?.trim() || input.name;
  const now = new Date().toUTCString();

  const cards: DeckImportCardType[] = input.cards.map((card) => ({
    title: card.title,
    quantity: card.quantity,
    cardImage: card.image,
    // template fields, unused while cardImage renders
    afterText: "",
    basicText: "",
    boost: 0,
    characterName: heroName,
    duringText: "",
    imageUrl: card.image.url as DeckImportCardType["imageUrl"],
    immediateText: "",
    type: "versatile",
    value: null,
  }));

  return {
    id,
    family_id: id,
    version_id: "1",
    name: input.name,
    note: "Image deck (imported into Unbrewed)",
    user: "you",
    bgg_link: null,
    created_on: now as DeckImportType["created_on"],
    deck_first_published_on: now as DeckImportType["deck_first_published_on"],
    published_on: now as DeckImportType["published_on"],
    updated_on: now as DeckImportType["updated_on"],
    deck_published: false,
    published: false,
    liked: false,
    likes: 0,
    tags: ["image-deck"],
    version_name: "1",
    versions: [],
    deck_data: {
      name: input.name,
      appearance: {
        borderColour: "#48284F",
        highlightColour: "#E7CC98",
        cardbackUrl: input.cardbackUrl ?? "",
        isPNP: false,
        patternName: "",
      },
      cards,
      hero: {
        name: heroName,
        hp: input.hp ?? 15,
        move: input.move ?? 2,
        isRanged: input.isRanged ?? false,
        specialAbility: "See hero card",
      },
      sidekick: {
        name: "Sidekick",
        hp: null,
        quantity: null,
        isRanged: false,
        quote: "",
      },
    },
  };
};
