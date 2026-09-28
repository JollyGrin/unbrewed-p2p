import type {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { hasSidekick } from "@/components/DeckPool/PoolFns";
import type {
  SavedToken,
  SheetCrop,
} from "@/components/Positions/position.type";
import type {
  CallerPlacement,
  FaceResolver,
  PackCard,
  PackDeck,
  PackPiece,
  PieceState,
  Skipped,
  TbppPack,
} from "./types";

/**
 * `duel-2p` is what tableplace-api serves today: it knows `deck`/`discard`
 * only, so hero/sidekick/rules are placed by the caller. `unmatched-2p`
 * (tableplace-api#45) owns those slots itself.
 */
export type TableLayout = "duel-2p" | "unmatched-2p";

export type DeckToPackOptions = {
  faces: FaceResolver;
  seat?: 0 | 1;
  layout?: TableLayout;
};

export type DeckToPackResult = {
  /** null when any card has no finished face: decks are never partial. */
  pack: TbppPack | null;
  placements: CallerPlacement[];
  /** Human-readable reasons, shown before anyone creates a table. */
  skipped: Skipped[];
};

// Geometry from GET /v1/layouts (duel-2p): seat 0 sits at +z facing 0°, seat 1
// at -z turned 180°; the deck sits at x = 8.5, the discard at x = 11.
const SEAT_Z = [4.5, -4.7] as const;
const SEAT_ROTATION = [0, 180] as const;
const DECK_Y = 0.4;
const CARD_X = { hero: 13.5, sidekick: 16, rules: 18.5 } as const;
const PIECE_ROW_X0 = 8.5;
const PIECE_STEP = 1.8;
const PIECE_ROW_OFFSET = 3.6;
const PIECE_ROW_MAX_X = 28;

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "card";

/** Unique-within-a-deck card codes: `strike`, `strike-2`, `strike-3`. */
const codeAllocator = () => {
  const taken = new Set<string>();
  return (title: string): string => {
    const base = slugify(title);
    let code = base;
    for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;
    taken.add(code);
    return code;
  };
};

const sheetRef = (url: string, crop: SheetCrop, name?: string): string =>
  `sheet:${JSON.stringify({ url, ...crop, ...(name ? { name } : {}) })}`;

/** The finished face a card already carries, if any (Labs renders, TTS sheets). */
const ownFace = (card: DeckImportCardType): string | null => {
  const image = card.cardImage;
  if (!image?.url) return null;
  if (image.cols && image.rows) {
    return sheetRef(
      image.url,
      { cols: image.cols, rows: image.rows, index: image.index ?? 0 },
      card.title,
    );
  }
  return image.url;
};

const printedCard = (
  title: string,
  text: string,
  characterName: string,
): DeckImportCardType => ({
  title,
  quantity: 1,
  type: "versatile",
  value: null,
  boost: 0,
  characterName,
  basicText: text,
  immediateText: "",
  duringText: "",
  afterText: "",
  imageUrl: "" as DeckImportCardType["imageUrl"],
  isCharacterCard: true,
});

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const iconLabel = (icon: string) =>
  icon.replace(/^Gi/, "").replace(/([a-z])([A-Z])/g, "$1 $2") || "Token";

/**
 * One table.place piece for a token that can show several faces. `states[0]`
 * is the base face and `imageUrl` mirrors it, as the pack spec asks. A single
 * face stays a plain `imageUrl`.
 */
export const tokenPiece = (
  name: string,
  faces: string[],
  color?: string,
): Omit<PackPiece, "position"> => {
  const states: PieceState[] = faces.map((face) => ({ face }));
  return {
    kind: "token",
    name,
    ...(color ? { color } : {}),
    ...(faces.length ? { imageUrl: faces[0] } : {}),
    ...(faces.length > 1 ? { states } : {}),
  };
};

const tokenFace = (token: SavedToken): string | null => {
  if (!token.imageUrl) return null;
  return token.sheet ? sheetRef(token.imageUrl, token.sheet) : token.imageUrl;
};

export const deckToPlayerPack = (
  deck: DeckImportType,
  { faces, seat = 0, layout = "duel-2p" }: DeckToPackOptions,
): DeckToPackResult => {
  const data = deck.deck_data;
  const skipped: Skipped[] = [];
  const allocate = codeAllocator();

  const resolved = (title: string, found: string | null): string | null => {
    if (!found) skipped.push(`${title}: no finished face`);
    return found;
  };
  const face = (card: DeckImportCardType): string | null =>
    resolved(card.title, ownFace(card) ?? faces(card));
  const toCard = (card: DeckImportCardType, code: string): PackCard | null => {
    const f = face(card);
    return f ? { code, name: card.title, face: f } : null;
  };
  /**
   * A face-up single with no card object: the resolver's dedicated member when
   * it has one, else the plain resolver on a synthetic printed card.
   */
  const single = (
    name: string,
    code: string,
    lookup: (() => string | null) | undefined,
    printed: DeckImportCardType,
  ): PackCard | null => {
    const f = resolved(name, lookup ? lookup() : faces(printed));
    return f ? { code, name, face: f } : null;
  };
  const compact = (cards: (PackCard | null)[]): PackCard[] =>
    cards.filter((c): c is PackCard => !!c);

  // action cards, one entry per copy
  const deckCards: (PackCard | null)[] = [];
  for (const card of data.cards.filter((c) => !c.isCharacterCard)) {
    const base = allocate(card.title);
    const f = face(card);
    for (let n = 1; n <= Math.max(1, card.quantity); n++) {
      deckCards.push(
        f
          ? {
              code: n === 1 ? base : allocate(card.title),
              name: card.title,
              face: f,
            }
          : null,
      );
    }
  }

  // hero, sidekick, rules
  const reference = data.cards.filter((c) => c.isCharacterCard);
  const takeReference = (name: string) => {
    const i = reference.findIndex((c) => sameName(c.title, name));
    return i < 0 ? undefined : reference.splice(i, 1)[0];
  };
  const heroRef = takeReference(data.hero.name) ?? reference.shift();
  const sidekickFielded = hasSidekick(data.sidekick);
  const sidekickRef = sidekickFielded
    ? takeReference(data.sidekick.name)
    : undefined;

  const ruleCodes = codeAllocator();
  const rules: (PackCard | null)[] = reference.map((c) =>
    toCard(c, ruleCodes(c.title)),
  );
  // `i` stays the ORIGINAL index into ruleCards: faceJobs keys rules by it
  (data.ruleCards ?? []).forEach((rule, i) => {
    if (!rule?.content?.trim()) return; // faceJobs renders no face for these
    if (
      data.cards.some((c) => c.isCharacterCard && sameName(c.title, rule.title))
    )
      return;
    rules.push(
      single(
        rule.title,
        ruleCodes(rule.title),
        faces.rule && (() => faces.rule!(i)),
        printedCard(rule.title, rule.content, data.hero.name),
      ),
    );
  });
  (data.extraCharacters ?? []).forEach((extra, i) => {
    for (const [part, name, text, printed] of [
      ["hero", extra.hero.name, extra.hero.specialAbility, true],
      ["sidekick", extra.sidekick.name, "", hasSidekick(extra.sidekick)],
    ] as const) {
      if (!printed || !name) continue;
      rules.push(
        single(
          name,
          ruleCodes(name),
          faces.extraCharacter && (() => faces.extraCharacter!(i, part)),
          printedCard(name, text, name),
        ),
      );
    }
  });

  const heroCard = heroRef
    ? toCard(heroRef, "hero")
    : single(
        data.hero.name,
        "hero",
        faces.hero,
        printedCard(data.hero.name, data.hero.specialAbility, data.hero.name),
      );
  const sidekickCard = !sidekickFielded
    ? null
    : sidekickRef
      ? toCard(sidekickRef, "sidekick")
      : single(
          data.sidekick.name,
          "sidekick",
          faces.sidekick,
          printedCard(data.sidekick.name, "", data.sidekick.name),
        );

  if (skipped.length) return { pack: null, placements: [], skipped };

  const back =
    data.appearance.cardbackUrl ||
    data.cards.find((c) => c.cardBackUrl)?.cardBackUrl;
  const withBack = (d: Omit<PackDeck, "back">): PackDeck => ({
    ...d,
    ...(back ? { back } : {}),
  });

  const decks: PackDeck[] = [
    withBack({ slot: "deck", name: "Deck", cards: compact(deckCards) }),
    withBack({ slot: "discard", name: "Discard", cards: [] }),
    withBack({ slot: "hero", name: "Hero", cards: compact([heroCard]) }),
    ...(sidekickCard
      ? [
          withBack({
            slot: "sidekick",
            name: "Sidekick",
            cards: [sidekickCard],
          }),
        ]
      : []),
    ...(rules.length
      ? [withBack({ slot: "rules", name: "Rules", cards: compact(rules) })]
      : []),
  ];

  // pieces: fighter HP counters first, then the saved token loadout
  const packId = `unbrewed-${slugify(deck.id)}-seat${seat}`;
  const pieces: (Omit<PackPiece, "position"> & { value?: number })[] = [];
  const counter = (name: string, hp: number) =>
    pieces.push({
      kind: "counter",
      name: `${name} HP`,
      maxValue: hp,
      value: hp,
    });
  counter(data.hero.name, data.hero.hp);
  if (sidekickFielded) {
    const n = Math.max(1, data.sidekick.quantity ?? 1);
    for (let i = 1; i <= n; i++) {
      counter(
        n > 1 ? `${data.sidekick.name || "Sidekick"} ${i}` : data.sidekick.name,
        data.sidekick.hp ?? 1,
      );
    }
  }
  for (const extra of data.extraCharacters ?? []) {
    if (extra.hero.name) counter(extra.hero.name, extra.hero.hp);
    if (hasSidekick(extra.sidekick) && extra.sidekick.name) {
      counter(extra.sidekick.name, extra.sidekick.hp ?? 1);
    }
  }
  (deck.savedTokens ?? []).forEach((token, i) => {
    const name = token.icon ? iconLabel(token.icon) : `Token ${i + 1}`;
    const f = tokenFace(token);
    // card tokens never ride in savedTokens; an icon-only disc keeps the tint
    pieces.push(
      tokenPiece(name, f ? [f] : [], f ? undefined : deck.savedTokenColor),
    );
    if (token.counter && !token.counter.link) {
      pieces.push({
        kind: "counter",
        name: `${name} counter`,
        maxValue: 99,
        value: token.counter.value ?? 0,
      });
    }
  });

  const z = SEAT_Z[seat];
  const dir = seat === 0 ? 1 : -1;
  const rotation = SEAT_ROTATION[seat];
  let x = PIECE_ROW_X0;
  let row = 0;
  const packPieces: PackPiece[] = [];
  const placements: CallerPlacement[] = [];
  if (layout === "duel-2p") {
    const put = (slot: keyof typeof CARD_X) =>
      placements.push({
        kind: "deck",
        pack: packId,
        slot,
        seat,
        position: [CARD_X[slot], DECK_Y, z],
        rotation,
        faceUp: true,
      });
    put("hero");
    if (sidekickCard) put("sidekick");
    if (rules.length) put("rules");
  }
  pieces.forEach(({ value, ...piece }, index) => {
    if (x > PIECE_ROW_MAX_X) {
      x = PIECE_ROW_X0;
      row += 1;
    }
    const position: [number, number] = [
      x,
      z + dir * (PIECE_ROW_OFFSET + row * PIECE_STEP),
    ];
    x += PIECE_STEP;
    packPieces.push({ ...piece, position });
    placements.push({
      kind: "piece",
      pack: packId,
      piece: index,
      seat,
      position,
      rotation,
      ...(value !== undefined ? { value } : {}),
    });
  });

  return {
    pack: {
      tbpp: 1,
      specVersion: "1.0.0",
      id: packId,
      name: data.name || deck.name,
      scope: "player",
      decks,
      ...(packPieces.length ? { pieces: packPieces } : {}),
    },
    placements,
    skipped,
  };
};
