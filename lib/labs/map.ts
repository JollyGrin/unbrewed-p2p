import {
  DeckImportCardType,
  DeckImportType,
  UnmatchedCardType,
} from "@/components/DeckPool/deck-import.type";
import {
  LabsAbility,
  LabsCard,
  LabsCharacter,
  LabsLoadedSet,
  LabsSet,
} from "./labs.type";
import { fail } from "./errors";
import { labsDeckId, labsShareUrl } from "./parse";
import { LabsUnsupportedFeature, detectLabsUnsupported } from "./unsupported";
import { labsPreviewUrl } from "./previews";
import { seedHeroCardTokens } from "@/components/Positions/heroCardTokens";

export type LabsHeroOption = { id: string; name: string };

export type LabsImport = {
  deck: DeckImportType;
  /**
   * Labs features our card template can't draw, on the cards that have to
   * fall back to it (no finished render). Empty when every card has one.
   */
  unsupported: LabsUnsupportedFeature[];
  setName: string;
  author?: string;
};

const CARD_TYPES: Record<string, UnmatchedCardType> = {
  attack: "attack",
  defense: "defence",
  defence: "defence",
  versatile: "versatile",
  scheme: "scheme",
};

const heroName = (c: LabsCharacter) => c.printedName?.trim() || c.name.trim();

/** Heroes in a set that have an action deck, in the set's order. */
export const listLabsHeroes = (set: LabsSet): LabsHeroOption[] =>
  (set.characters ?? [])
    .filter((c) => c.role === "hero" || c.role === undefined)
    .filter((c) => actionCardsOf(set, c.id).length > 0)
    .map((c) => ({ id: c.id, name: heroName(c) }));

export const actionCardsOf = (set: LabsSet, characterId: string): LabsCard[] => {
  const deckIds = new Set(
    (set.decks ?? [])
      .filter((d) => d.kind === "action" && d.ownerId === characterId)
      .map((d) => d.id),
  );
  return (set.cards ?? []).filter(
    (card) => deckIds.has(card.deckId) && card.type === "action",
  );
};

/** This character's rule cards plus the set-wide ones (deck with no owner). */
const ruleCardsOf = (set: LabsSet, characterId: string): LabsCard[] => {
  const deckIds = new Set(
    (set.decks ?? [])
      .filter(
        (d) => d.kind === "rules" && (d.ownerId === characterId || d.ownerId === null),
      )
      .map((d) => d.id),
  );
  return (set.cards ?? []).filter(
    (card) => deckIds.has(card.deckId) && card.type === "rules",
  );
};

const https = (url: string | null | undefined): string | undefined =>
  typeof url === "string" && /^https:\/\//i.test(url) ? url : undefined;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const SYMBOL_WORDS: Record<string, string> = {
  bonus_attack: "BONUS ATTACK",
};

/**
 * Labs ability text → the plain text our template renders.
 *
 * Labs stores rich text: `<div>`/`<b>` markup from its editor, `{{token}}`
 * inline icons (`{{attack}}`, `{{name}}`, `{{custom:<id>}}`), and hard line
 * breaks the author typed to fit THEIR layout (`"on \nyour"`). Markup goes,
 * icons become words, and a break with a space before it is a manual wrap —
 * our renderer wraps on its own, so those collapse to a space.
 */
export const labsText = (
  raw: string | undefined | null,
  ctx: { subject: string; set: LabsSet },
): string => {
  if (!raw) return "";
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) =>
      e.startsWith("#")
        ? String.fromCharCode(Number(e.slice(1)))
        : ENTITIES[e.toLowerCase()] ?? m,
    )
    .replace(/\{\{([a-zA-Z][a-zA-Z0-9:_-]*)\}\}/g, (_, token: string) => {
      const t = token.toLowerCase();
      if (t === "name") return ctx.subject;
      if (t.startsWith("custom:")) {
        const symbol = ctx.set.customSymbols?.find((s) => s.id === token.slice(7));
        return `[${symbol?.name?.trim() || "symbol"}]`;
      }
      return SYMBOL_WORDS[t] ?? t.toUpperCase();
    })
    .replace(/ +\n/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const subjectOf = (card: LabsCard, hero: LabsCharacter): string => {
  if (card.owner === "sidekick") return hero.sidekick?.name?.trim() || "Sidekick";
  if (card.owner === "any") return "ANY";
  return heroName(hero);
};

const mapCard = (
  card: LabsCard,
  hero: LabsCharacter,
  set: LabsSet,
  /** Labs' finished render of this card, if it published one */
  render: string | undefined,
): DeckImportCardType => {
  const subject = subjectOf(card, hero);
  const text = (raw?: string) => labsText(raw, { subject, set });
  const ability: LabsAbility = card.ability ?? {};

  const sections = {
    basicText: text(ability.plain),
    immediateText: text(ability.immediately),
    duringText: text(ability.duringCombat),
    afterText: text(ability.afterCombat),
  };

  // Extra lines Labs prints under the main text (e.g. "CHORUS: …") and the
  // bonus-attack panel have no slot in our template: fold them into the last
  // section that has text, so the rule is still on the card. The detector
  // flags the bonus-attack panel, since its framing is lost.
  const extras = (ability.bonusAbilities ?? [])
    .map((b) => text(b.text))
    .filter(Boolean);
  if (card.showBonusAttack) {
    const title = text(card.bonusAttackTitle);
    const body = text(card.bonusAttackAbility);
    extras.push(
      `BONUS ATTACK${title ? ` — ${title}` : ""} (${card.bonusAttackValue ?? 0})${body ? `: ${body}` : ""}`,
    );
  }
  if (extras.length) {
    const order = ["afterText", "duringText", "immediateText", "basicText"] as const;
    const last = order.find((key) => sections[key]) ?? "basicText";
    sections[last] = [sections[last], ...extras].filter(Boolean).join("\n");
  }

  const type = CARD_TYPES[card.symbol ?? ""] ?? "versatile";
  // The face to draw as a whole image. Labs' finished render wins over the
  // author's replacement: Labs renders the replacement too (so it is the same
  // picture), but the render has the author's crop/zoom applied and a fixed
  // 700x978 size, while `replacement.source` is the raw upload.
  const face =
    render ?? (card.useReplacement ? https(card.replacement?.source) : undefined);

  return {
    title: card.title?.trim() || card.name?.trim() || "Untitled",
    quantity: Math.max(0, card.quantity ?? 1),
    type,
    value: type === "scheme" ? null : card.symbolValue ?? 0,
    boost: card.boost ?? 0,
    characterName: subject,
    ...sections,
    // Template art, drawn only when there is no face (or it fails to load).
    imageUrl: (https(card.artwork?.source) ?? "") as DeckImportCardType["imageUrl"],
    // A card with a finished image IS that image; the fields above stay for
    // deck stats, search and the fallback template.
    ...(face ? { cardImage: { url: face } } : {}),
  };
};

const toDateString = (iso: string | undefined) =>
  new Date(iso ?? Date.now()).toUTCString() as DeckImportType["created_on"];

/**
 * Map one hero of a fetched Labs set into a bag deck. Pure: no network, no
 * React. Throws `LabsImportError("no-deck")` for a character without cards.
 */
export const buildLabsImport = (
  loaded: LabsLoadedSet,
  characterId: string,
): LabsImport => {
  const { row, author } = loaded;
  const set = row.document.set;
  const hero =
    set.characters?.find((c) => c.id === characterId) ?? fail("character-not-found");
  const actionCards = actionCardsOf(set, characterId);
  if (actionCards.length === 0) fail("no-deck");

  const name = heroName(hero);
  const sidekick = hero.sidekick?.enabled ? hero.sidekick : undefined;
  const id = labsDeckId(characterId);
  const cardbackUrl =
    labsPreviewUrl(row, "deck-back", characterId) ??
    (hero.cardback?.useReplacement ? https(hero.cardback.replacement?.source) : undefined) ??
    "";
  const rules = ruleCardsOf(set, characterId);
  const extras = hero.additionalCards ?? [];
  const reference: DeckImportCardType[] = [
    // Hero card, extra character cards and rule cards ride along as full-art reference cards: never
    // shuffled (makeDeck skips `isCharacterCard`), seeded onto the table as
    // tokens like a Club/TTS import. Only where Labs rendered them — the
    // template can't draw either.
    ...[{ title: name, url: labsPreviewUrl(row, "character-card", characterId) }],
    ...extras.map((extra) => ({
      title: extra.name?.trim() || "Character",
      url: labsPreviewUrl(row, "character-card", extra.id),
    })),
    ...rules.map((card) => ({
      title: labsText(card.heading, { subject: name, set }) || "Rules",
      url: labsPreviewUrl(row, "card", card.id),
    })),
  ]
    .filter((c): c is { title: string; url: string } => !!c.url)
    .map(({ title, url }) => ({
      title,
      quantity: 1,
      type: "versatile",
      value: null,
      boost: 0,
      characterName: name,
      basicText: "",
      immediateText: "",
      duringText: "",
      afterText: "",
      imageUrl: url as DeckImportCardType["imageUrl"],
      cardImage: { url },
      isCharacterCard: true,
    }));
  const cards = [
    ...actionCards.map((card) => mapCard(card, hero, set, labsPreviewUrl(row, "card", card.id))),
    ...reference,
  ].map((card) => (cardbackUrl ? { ...card, cardBackUrl: cardbackUrl } : card));
  const abilitiesText = (
    abilities: LabsCharacter["abilities"],
    subject: string,
  ) =>
    (abilities ?? [])
      .map((a) => {
        const body = labsText(a.text, { subject, set });
        const title = a.name?.trim();
        return title ? `${title}: ${body}` : body;
      })
      .filter(Boolean)
      .join("\n\n");
  const specialAbility = abilitiesText(hero.abilities, name);
  // Their stats, for the hero panel and IRL health trackers; the card itself
  // is the reference card above.
  const extraCharacters = extras.map((extra) => {
    const extraName = extra.name?.trim() || "Character";
    return {
      hero: {
        name: extraName,
        hp: extra.health ?? 1,
        move: extra.move ?? 2,
        isRanged: extra.attackType === "ranged",
        specialAbility: abilitiesText(extra.abilities, extraName),
        quote: extra.quote?.text?.trim() || undefined,
      },
      sidekick: { name: "Sidekick", hp: null, quantity: null, isRanged: false, quote: "" },
    };
  });
  const revision = String(row.revision ?? 1);

  const deck: DeckImportType = {
    id,
    family_id: id,
    version_id: revision,
    version_name: revision,
    versions: [],
    name,
    note: `Imported from Unmatched Labs — "${row.name}"${author ? ` by ${author}` : ""}`,
    user: author ?? "Unmatched Labs",
    sourceUrl: labsShareUrl(row.slug, characterId),
    bgg_link: null,
    created_on: toDateString(row.created_at),
    deck_first_published_on: toDateString(row.created_at),
    published_on: toDateString(row.updated_at),
    updated_on: toDateString(row.updated_at),
    deck_published: false,
    published: false,
    liked: false,
    likes: 0,
    tags: ["unmatched-labs"],
    ...(reference.length ? { savedTokens: seedHeroCardTokens(reference) } : {}),
    deck_data: {
      name,
      appearance: {
        borderColour: (hero.style?.body?.color ?? "#48284F") as `#${string}`,
        highlightColour: (hero.characterCard?.border?.color ?? "#E7CC98") as `#${string}`,
        cardbackUrl,
        isPNP: false,
        patternName: "",
      },
      cards,
      ruleCards: rules.map((card) => ({
        title: labsText(card.heading, { subject: name, set }) || "Rules",
        content: labsText(card.body, { subject: name, set }),
      })),
      hero: {
        name,
        hp: hero.health ?? 15,
        move: hero.move ?? 2,
        isRanged: hero.attackType === "ranged",
        specialAbility: specialAbility || "See hero card",
        quote: hero.quote?.text?.trim() || undefined,
        ...(https(hero.artwork?.source)
          ? { tokenImageUrl: https(hero.artwork?.source) }
          : {}),
      },
      sidekick: sidekick
        ? {
            name: sidekick.name?.trim() || "Sidekick",
            quantity: sidekick.count ?? 1,
            hp: sidekick.health ?? 1,
            isRanged: sidekick.attackType === "ranged",
            quote: "",
          }
        : { name: "Sidekick", hp: null, quantity: null, isRanged: false, quote: "" },
      ...(extraCharacters.length ? { extraCharacters } : {}),
    },
  };

  return {
    deck,
    unsupported: detectLabsUnsupported(set, characterId, row),
    setName: row.name,
    author,
  };
};
