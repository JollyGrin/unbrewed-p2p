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

export type LabsHeroOption = { id: string; name: string };

export type LabsImport = {
  deck: DeckImportType;
  /** Labs features this deck uses that our card template can't draw */
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
  const replacement = card.useReplacement ? https(card.replacement?.source) : undefined;

  return {
    title: card.title?.trim() || card.name?.trim() || "Untitled",
    quantity: Math.max(0, card.quantity ?? 1),
    type,
    value: type === "scheme" ? null : card.symbolValue ?? 0,
    boost: card.boost ?? 0,
    characterName: subject,
    ...sections,
    imageUrl: (https(card.artwork?.source) ?? "") as DeckImportCardType["imageUrl"],
    // A card the author replaced with a finished image IS that image.
    ...(replacement ? { cardImage: { url: replacement } } : {}),
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
  const cardbackUrl = hero.cardback?.useReplacement
    ? https(hero.cardback.replacement?.source) ?? ""
    : "";
  const cards = actionCards.map((card) => {
    const mapped = mapCard(card, hero, set);
    return cardbackUrl ? { ...mapped, cardBackUrl: cardbackUrl } : mapped;
  });
  const specialAbility = (hero.abilities ?? [])
    .map((a) => {
      const body = labsText(a.text, { subject: name, set });
      const title = a.name?.trim();
      return title ? `${title}: ${body}` : body;
    })
    .filter(Boolean)
    .join("\n\n");
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
      ruleCards: ruleCardsOf(set, characterId).map((card) => ({
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
    },
  };

  return {
    deck,
    unsupported: detectLabsUnsupported(set, characterId),
    setName: row.name,
    author,
  };
};
