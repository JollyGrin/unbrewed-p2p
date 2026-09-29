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
  FaceResolver,
  PackCard,
  PackDeck,
  PackPiece,
  PieceState,
  Skipped,
  TbppPack,
} from "./types";

/** Where site-relative art paths resolve for table.place. */
const SITE_ORIGIN = "https://unbrewed.xyz";

export type DeckToPackOptions = {
  faces: FaceResolver;
  seat?: 0 | 1;
};

/** What a pack piece is for, so the layout knows where it goes. */
export type PieceRole =
  | { role: "hp" }
  | { role: "fighter"; fighter: "hero" | "sidekick" | "extra" }
  | { role: "token"; token: number }
  | { role: "token-counter"; token: number };

/** One pack piece before it has a position, plus a counter's start value. */
export type PlayerPiece = PieceRole & {
  piece: Omit<PackPiece, "position">;
  value?: number;
};

export type DeckToPackResult = {
  /**
   * Decks only; null when any card has no finished face: decks are never
   * partial. The pieces ride alongside, unplaced, for `composeTable`.
   */
  pack: TbppPack | null;
  pieces: PlayerPiece[];
  /** Human-readable reasons, shown before anyone creates a table. */
  skipped: Skipped[];
  /** Informational only: synthesised reference cards left out for lack of a face. */
  notes: string[];
};

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

/**
 * Deck art paths are often site-relative (`/evergreen-decks/art/...`), which
 * table.place would resolve against its own origin and 404. Every face, back
 * and image goes through this; `sheet:` refs and absolute URLs pass as-is.
 */
export const absoluteUrl = (url: string): string =>
  url.startsWith("//")
    ? `https:${url}`
    : url.startsWith("/")
      ? `${SITE_ORIGIN}${url}`
      : url;

const sheetRef = (url: string, crop: SheetCrop, name?: string): string =>
  `sheet:${JSON.stringify({ url: absoluteUrl(url), ...crop, ...(name ? { name } : {}) })}`;

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

/** Identity of an image plus its sheet crop, to compare a token with a card face. */
const tokenKey = (
  url: string,
  crop?: { cols?: number; rows?: number; index?: number },
): string =>
  `${absoluteUrl(url)}|${crop?.cols ?? ""}|${crop?.rows ?? ""}|${crop?.index ?? ""}`;

const tokenFace = (token: SavedToken): string | null => {
  if (!token.imageUrl) return null;
  return token.sheet
    ? sheetRef(token.imageUrl, token.sheet)
    : absoluteUrl(token.imageUrl);
};

export const deckToPlayerPack = (
  deck: DeckImportType,
  { faces, seat = 0 }: DeckToPackOptions,
): DeckToPackResult => {
  const data = deck.deck_data;
  const skipped: Skipped[] = [];
  const notes: string[] = [];
  const allocate = codeAllocator();

  const resolved = (title: string, found: string | null): string | null => {
    if (!found) skipped.push(`${title}: no finished face`);
    return found && absoluteUrl(found);
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
    optional?: string,
  ): PackCard | null => {
    const found = lookup ? lookup() : faces(printed);
    if (!found && optional) {
      notes.push(optional);
      return null;
    }
    const f = resolved(name, found);
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

  // an extra character's finished card rides in `cards` as a reference card
  const extraRefs = new Map<string, DeckImportCardType>();
  for (const extra of data.extraCharacters ?? []) {
    for (const name of [extra.hero.name, extra.sidekick?.name]) {
      const ref = name ? takeReference(name) : undefined;
      if (ref && name) extraRefs.set(name, ref);
    }
  }

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
        `${rule.title} has no card face; omitted`,
      ),
    );
  });
  // extra characters get their own face-up pile beside the sidekick
  const extras: (PackCard | null)[] = [];
  (data.extraCharacters ?? []).forEach((extra, i) => {
    for (const [part, name, text, printed] of [
      ["hero", extra.hero.name, extra.hero.specialAbility, true],
      ["sidekick", extra.sidekick.name, "", hasSidekick(extra.sidekick)],
    ] as const) {
      if (!printed || !name) continue;
      const ref = extraRefs.get(name);
      if (ref) {
        extras.push(toCard(ref, ruleCodes(name)));
        continue;
      }
      extras.push(
        single(
          name,
          ruleCodes(name),
          faces.extraCharacter && (() => faces.extraCharacter!(i, part)),
          printedCard(name, text, name),
          `${name} has no card face; omitted`,
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
          `${data.sidekick.name} has no separate card; its rules are on the hero card`,
        );

  if (skipped.length) return { pack: null, pieces: [], skipped, notes: [] };

  const rawBack =
    data.appearance.cardbackUrl ||
    data.cards.find((c) => c.cardBackUrl)?.cardBackUrl;
  const back = rawBack && absoluteUrl(rawBack);
  const withBack = (d: Omit<PackDeck, "back">): PackDeck => ({
    ...d,
    ...(back ? { back } : {}),
  });

  // a pile that holds no cards is not placed, except the discard
  const decks: PackDeck[] = [
    withBack({ slot: "deck", name: "Deck", cards: compact(deckCards) }),
    withBack({ slot: "discard", name: "Discard", cards: [] }),
    withBack({ slot: "hero", name: "Hero", cards: compact([heroCard]) }),
    withBack({
      slot: "sidekick",
      name: "Sidekick",
      cards: compact([sidekickCard]),
    }),
    withBack({ slot: "rules", name: "Rules", cards: compact(rules) }),
    withBack({ slot: "extras", name: "Extras", cards: compact(extras) }),
  ].filter((d) => d.cards.length || d.slot === "discard");

  // card faces already in a pile: a loose token of the same art is a duplicate
  const pileFaces = new Set(
    data.cards
      .filter((c) => c.isCharacterCard && c.cardImage?.url)
      .map((c) => tokenKey(c.cardImage!.url, c.cardImage)),
  );

  // Labs components (#1001) say what a saved token is for: a fighter's dial
  // becomes that fighter's HP counter, a fighter's standee art its figure.
  const labsRecord = new Map(
    (deck.labsComponents ?? []).map((c) => [c.url, c] as const),
  );
  const recordOf = (token: SavedToken) =>
    token.imageUrl ? labsRecord.get(token.imageUrl) : undefined;
  const fighterKeys = new Set([
    "hero",
    ...(sidekickFielded ? ["sidekick"] : []),
    ...(data.extraCharacters ?? []).flatMap((e, i) =>
      e.hero.name ? [`extra:${i}`] : [],
    ),
  ]);
  const hpDials = new Map<string, { face: string; label?: string }>();
  const figureArt = new Map<string, string>();
  const claimed = new Set<number>();
  (deck.savedTokens ?? []).forEach((token, i) => {
    const record = recordOf(token);
    const f = tokenFace(token);
    if (!record || !f) return;
    const link = token.counter?.link;
    const key =
      record.kind === "dial" && link
        ? link === "extra"
          ? `extra:${token.counter?.extra ?? 0}`
          : link
        : record.kind !== "dial" && record.fighter !== undefined
          ? typeof record.fighter === "number"
            ? `extra:${record.fighter}`
            : record.fighter
          : undefined;
    // a fighter not on the table leaves its dial or art a loose token
    if (!key || !fighterKeys.has(key)) return;
    const into = record.kind === "dial" ? hpDials : figureArt;
    if (into.has(key)) return;
    if (record.kind === "dial")
      hpDials.set(key, { face: f, label: token.label });
    else figureArt.set(key, f);
    claimed.add(i);
  });

  // pieces: an HP counter and a figure per fighter, then the token loadout
  const packId = `unbrewed-${slugify(deck.id)}-seat${seat}`;
  const pieces: PlayerPiece[] = [];
  const tint = data.appearance?.highlightColour || deck.savedTokenColor;
  const fighter = (
    fighter: "hero" | "sidekick" | "extra",
    key: string,
    name: string,
    hp: number,
    image?: string,
  ) => {
    const dial = hpDials.get(key);
    const art = image ? absoluteUrl(image) : figureArt.get(key);
    pieces.push({
      role: "hp",
      piece: dial
        ? {
            kind: "counter",
            name: dial.label || name,
            imageUrl: dial.face,
            maxValue: hp,
          }
        : { kind: "counter", name: `${name} HP`, maxValue: hp },
      value: hp,
    });
    pieces.push({
      role: "fighter",
      fighter,
      piece: tokenPiece(name, art ? [art] : [], art ? undefined : tint),
    });
  };
  fighter(
    "hero",
    "hero",
    data.hero.name,
    data.hero.hp,
    data.hero.tokenImageUrl,
  );
  if (sidekickFielded) {
    const n = Math.max(1, data.sidekick.quantity ?? 1);
    for (let i = 1; i <= n; i++) {
      fighter(
        "sidekick",
        "sidekick",
        n > 1 ? `${data.sidekick.name || "Sidekick"} ${i}` : data.sidekick.name,
        data.sidekick.hp ?? 1,
        data.sidekick.tokenImageUrl,
      );
    }
  }
  (data.extraCharacters ?? []).forEach((extra, i) => {
    if (extra.hero.name) {
      fighter(
        "extra",
        `extra:${i}`,
        extra.hero.name,
        extra.hero.hp,
        extra.hero.tokenImageUrl,
      );
    }
    if (hasSidekick(extra.sidekick) && extra.sidekick.name) {
      fighter(
        "extra",
        `extra-sidekick:${i}`,
        extra.sidekick.name,
        extra.sidekick.hp ?? 1,
        extra.sidekick.tokenImageUrl,
      );
    }
  });
  (deck.savedTokens ?? []).forEach((token, i) => {
    if (claimed.has(i)) return;
    if (token.imageUrl && pileFaces.has(tokenKey(token.imageUrl, token.sheet)))
      return;
    const name =
      token.label?.trim() ||
      (token.icon ? iconLabel(token.icon) : `Token ${i + 1}`);
    const f = tokenFace(token);
    const counter = token.counter;
    // a free Labs dial is one counter showing the dial, not a token plus a badge
    if (f && counter && !counter.link && recordOf(token)?.kind === "dial") {
      if (counter.min !== undefined && counter.min !== 0) {
        notes.push(
          `${name}: table.place counters start at 0, not at the dial's ${counter.min}`,
        );
      }
      pieces.push({
        role: "token",
        token: i,
        piece: {
          kind: "counter",
          name,
          imageUrl: f,
          maxValue: counter.max ?? 99,
        },
        value: counter.value ?? counter.max ?? 0,
      });
      return;
    }
    // two-sided (`altIndex`): table.place cycles `states` with X
    const back =
      f && token.sheet && typeof token.altIndex === "number"
        ? sheetRef(token.imageUrl!, { ...token.sheet, index: token.altIndex })
        : null;
    // card tokens never ride in savedTokens; an icon-only disc keeps the tint
    pieces.push({
      role: "token",
      token: i,
      piece: tokenPiece(
        name,
        f ? (back ? [f, back] : [f]) : [],
        f ? undefined : deck.savedTokenColor,
      ),
    });
    if (counter && !counter.link) {
      pieces.push({
        role: "token-counter",
        token: i,
        piece: { kind: "counter", name: `${name} counter`, maxValue: 99 },
        value: counter.value ?? 0,
      });
    }
  });

  return {
    pack: {
      tbpp: 1,
      specVersion: "1.0.0",
      id: packId,
      name: data.name || deck.name,
      scope: "player",
      decks,
    },
    pieces,
    skipped,
    notes,
  };
};
