/**
 * Finished card faces for the balanced (evergreen) decks (issue #1007).
 *
 * table.place needs one finished image per card face, and an unbrewed card's
 * `imageUrl` is only its art — the sandbox composes the title, value, boost and
 * text in the browser (components/CardFactory). For the balanced decks that
 * composition is done ONCE, at build time, by scripts/tableplace/render-faces.mjs:
 * it writes `out/tableplace-faces/<deckDir>/<key>.webp` plus an `index.json`,
 * and this module is the other half — the lookup the converter (#1006) asks.
 *
 * Pure and dependency-free on purpose: the build script bundles it into the
 * render page to decide keys and fingerprints, and the converter imports it,
 * so the two sides can never disagree on what a face is called.
 */
import type {
  DeckImportCardType,
  DeckImportHeroType,
  DeckImportRuleCardType,
  DeckImportSidekickType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import type { FullFaceResolver } from "./types";

/** Where the Pages deploy serves the faces. CORS-open, like the rest of the site. */
export const FACES_ORIGIN = "https://unbrewed.xyz";
export const FACES_DIR = "tableplace-faces";
export const FACES_INDEX_URL = `${FACES_ORIGIN}/${FACES_DIR}/index.json`;

export type FaceKind = "card" | "hero" | "sidekick" | "rule";

export type FaceIndexEntry = {
  /** Path under FACES_DIR, e.g. "hollow-oak/card-branch-out.webp". */
  path: string;
  /** faceFingerprint of the source the face was rendered from. */
  hash: string;
};

export type FaceIndex = {
  version: 1;
  /** Keyed by deck id. A snapshot whose file name differs from its `id` is
   * listed under both, pointing at the same entries. */
  decks: Record<string, Record<string, FaceIndexEntry>>;
};

/** One face to render, as the build script sees it. */
export type FaceJob =
  | { key: string; kind: "card"; hash: string; card: DeckImportCardType }
  | {
      key: string;
      kind: "hero" | "sidekick";
      hash: string;
      character: DeckImportHeroType | DeckImportSidekickType;
    }
  | { key: string; kind: "rule"; hash: string; rule: DeckImportRuleCardType };

export const slug = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";

/**
 * Stable 32-bit FNV-1a over exactly the fields a face draws. The resolver
 * recomputes it on the caller's card, so a bag deck that merely SHARES a
 * balanced deck's id but was edited never gets a stale face — it gets null.
 */
const FACE_FIELDS: Record<FaceKind, string[]> = {
  card: [
    "title",
    "type",
    "value",
    "boost",
    "characterName",
    "basicText",
    "immediateText",
    "duringText",
    "afterText",
    "imageUrl",
    "quantity",
    "cardImage",
  ],
  hero: ["name", "hp", "move", "isRanged", "specialAbility", "tokenImageUrl"],
  sidekick: ["name", "hp", "quantity", "isRanged", "quote", "tokenImageUrl"],
  rule: ["title", "content"],
};

export const faceFingerprint = (kind: FaceKind, source: object): string => {
  const src = source as Record<string, unknown>;
  const picked = FACE_FIELDS[kind].map((f) => src[f] ?? null);
  const text = `${kind}|${JSON.stringify(picked)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

const sidekickFielded = (s?: DeckImportSidekickType | null) =>
  !!s && (s.quantity ?? 0) > 0 && (!!s.name?.trim() || s.hp != null);

const heroFielded = (h?: DeckImportHeroType | null) =>
  !!h && (!!h.name?.trim() || !!h.specialAbility?.trim());

/** Unique key per title within a deck: `card-<slug>`, then `-2`, `-3`, … */
const cardKeys = (cards: DeckImportCardType[]): string[] => {
  const seen = new Map<string, number>();
  return cards.map((card) => {
    const base = `card-${slug(card.title)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
};

const ruleKey = (i: number) => `rule-${i + 1}`;
const extraKey = (i: number, part: "hero" | "sidekick") =>
  `extra-${i + 1}-${part}`;

/**
 * Every face one deck needs, in the order the build script renders them:
 * action cards, hero, sidekick, rule cards, then extra characters (#500).
 */
export const faceJobs = (deck: DeckImportType): FaceJob[] => {
  const data = deck.deck_data;
  const jobs: FaceJob[] = [];
  const cards = data.cards ?? [];
  cardKeys(cards).forEach((key, i) =>
    jobs.push({
      key,
      kind: "card",
      hash: faceFingerprint("card", cards[i]),
      card: cards[i],
    }),
  );
  const character = (
    key: string,
    kind: "hero" | "sidekick",
    c: DeckImportHeroType | DeckImportSidekickType,
  ) => jobs.push({ key, kind, hash: faceFingerprint(kind, c), character: c });
  if (heroFielded(data.hero)) character("hero", "hero", data.hero);
  if (sidekickFielded(data.sidekick))
    character("sidekick", "sidekick", data.sidekick);
  (data.ruleCards ?? []).forEach((rule, i) => {
    if (!rule?.content?.trim()) return;
    jobs.push({
      key: ruleKey(i),
      kind: "rule",
      hash: faceFingerprint("rule", rule),
      rule,
    });
  });
  (data.extraCharacters ?? []).forEach((extra, i) => {
    if (heroFielded(extra?.hero))
      character(extraKey(i, "hero"), "hero", extra.hero);
    if (sidekickFielded(extra?.sidekick))
      character(extraKey(i, "sidekick"), "sidekick", extra.sidekick);
  });
  return jobs;
};

export const balancedFaces = (
  index: FaceIndex | null | undefined,
  deck: DeckImportType,
): FullFaceResolver => {
  const entries = index?.decks?.[deck.id];
  const data = deck.deck_data;
  const url = (key: string, kind: FaceKind, source: object | undefined) => {
    const hit = entries?.[key];
    if (!hit || !source) return null;
    if (hit.hash !== faceFingerprint(kind, source)) return null;
    return `${FACES_ORIGIN}/${FACES_DIR}/${hit.path}`;
  };
  const keys = cardKeys(data?.cards ?? []);
  const resolve = ((card: DeckImportCardType) => {
    const i = (data?.cards ?? []).indexOf(card);
    // By identity first; a copy (e.g. a pooled card) falls back to its title,
    // and the fingerprint still has to match.
    const key =
      i >= 0
        ? keys[i]
        : keys[(data?.cards ?? []).findIndex((c) => c.title === card.title)];
    return key ? url(key, "card", card) : null;
  }) as unknown as FullFaceResolver;
  resolve.hero = () => url("hero", "hero", data?.hero);
  resolve.sidekick = () => url("sidekick", "sidekick", data?.sidekick);
  resolve.rule = (i) => url(ruleKey(i), "rule", data?.ruleCards?.[i]);
  resolve.extraCharacter = (i, part) =>
    url(extraKey(i, part), part, data?.extraCharacters?.[i]?.[part]);
  return resolve;
};

/** Fetch the deployed index once; null when it isn't there (e.g. local dev). */
export const loadFaceIndex = async (
  fetchImpl: typeof fetch = fetch,
): Promise<FaceIndex | null> => {
  try {
    const res = await fetchImpl(FACES_INDEX_URL);
    if (!res.ok) return null;
    const json = (await res.json()) as FaceIndex;
    return json?.version === 1 ? json : null;
  } catch {
    return null;
  }
};
