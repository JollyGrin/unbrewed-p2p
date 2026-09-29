/**
 * One job per finished card face a deck needs, each with a content hash.
 *
 * table.place needs one finished image per card face, and an unbrewed card's
 * `imageUrl` is only its art (components/CardFactory composes the rest). The
 * runtime face solution keys its cache on `faceFingerprint`; the converter's
 * FaceResolver seam (./types) is where the finished images plug in.
 */
import type {
  DeckImportCardType,
  DeckImportHeroType,
  DeckImportRuleCardType,
  DeckImportSidekickType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { hasSidekick } from "@/components/DeckPool/PoolFns";

export type FaceKind = "card" | "hero" | "sidekick" | "rule";

/** One face to render. */
export type FaceJob =
  | { key: string; kind: "card"; hash: string; card: DeckImportCardType }
  | {
      key: string;
      kind: "hero" | "sidekick";
      hash: string;
      character: DeckImportHeroType | DeckImportSidekickType;
    }
  | { key: string; kind: "rule"; hash: string; rule: DeckImportRuleCardType };

export const slug = (
  s: string | null | undefined,
  fallback = "untitled",
): string =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallback;

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
 * Every face one deck needs, in this order:
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
  if (hasSidekick(data.sidekick))
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
    if (hasSidekick(extra?.sidekick))
      character(extraKey(i, "sidekick"), "sidekick", extra.sidekick);
  });
  return jobs;
};
