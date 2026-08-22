import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeDigest } from "../../scripts/lib/deckManifest";
import { EVERGREEN_MANIFEST } from "./evergreenManifest";
import { HERO_DECK_IDS, norm } from "./useProCardArt";

const DECKS_DIR = join(__dirname, "..", "..", "public", "evergreen-decks");

const readDeck = (deckId: string) =>
  JSON.parse(readFileSync(join(DECKS_DIR, `${deckId}.json`), "utf8"));

describe("evergreen deck rules lock", () => {
  it("matches the committed manifest digest for every evergreen deck", () => {
    for (const entry of EVERGREEN_MANIFEST) {
      const deck = readDeck(entry.deckId);
      expect(computeDigest(deck)).toBe(entry.digest);
    }
  });

  it("has a manifest entry for every hero <-> deck id present in HERO_DECK_IDS", () => {
    const manifestDeckIds = new Set(EVERGREEN_MANIFEST.map((e) => e.deckId));
    for (const deckId of Object.values(HERO_DECK_IDS)) {
      expect(manifestDeckIds.has(deckId)).toBe(true);
    }
  });

  it("does not change digest on a presentation-only edit (image/appearance/note)", () => {
    const entry = EVERGREEN_MANIFEST[0];
    const deck = readDeck(entry.deckId);
    const edited = JSON.parse(JSON.stringify(deck));
    edited.deck_data.appearance.cardbackUrl = "https://example.com/new-cardback.png";
    edited.deck_data.cards[0].imageUrl = "https://example.com/new-card-art.png";
    edited.note = "Completely different flavor text.";
    expect(computeDigest(edited)).toBe(computeDigest(deck));
  });

  it("changes digest on a rules-relevant edit (card value)", () => {
    const entry = EVERGREEN_MANIFEST[0];
    const deck = readDeck(entry.deckId);
    const edited = JSON.parse(JSON.stringify(deck));
    edited.deck_data.cards[0].value = (edited.deck_data.cards[0].value ?? 0) + 1;
    expect(computeDigest(edited)).not.toBe(computeDigest(deck));
  });

  // Baba Yaga's " Iron Teeth" begins with a NON-BREAKING SPACE (U+00A0) in
  // both the API snapshot and the engine's rules.ts (verbatim-title rule) —
  // art matching must still connect the two. JS trim() strips U+00A0, so
  // norm() lands both sides on the same key.
  it("norm() matches the NBSP-prefixed Iron Teeth snapshot title to the server title", () => {
    const deck = readDeck(HERO_DECK_IDS["baba-yaga"]);
    const snapshotTitle: string = deck.deck_data.cards
      .map((c: { title: string }) => c.title)
      .find((t: string) => t.includes("Iron Teeth"));
    expect(snapshotTitle.startsWith("\u00A0")).toBe(true); // the quirk is real, don't "fix" it
    expect(norm(snapshotTitle)).toBe(norm("\u00A0Iron Teeth")); // engine rules.ts title, verbatim
    expect(norm(snapshotTitle)).toBe("iron teeth");
  });
});

// ---------------------------------------------------------------------------
// Skull Kid's art is SELF-HOSTED and FULL-BLEED (issue #663). The faces are the
// club's finished card renders, mirrored off supabase — a broken path here means
// blank cards in play, and the deck must never fall back to the generated
// template, which cannot reproduce the author's frame.
// ---------------------------------------------------------------------------

describe("Skull Kid (zmGV) art is committed, local and full-bleed", () => {
  const deck = readDeck("zmGV");
  const cards = deck.deck_data.cards as {
    title: string;
    imageUrl: string;
    cardImage?: { url: string };
  }[];

  it("ships every card face as a file that actually exists in the repo", () => {
    expect(cards).toHaveLength(12);
    for (const card of cards) {
      expect(card.cardImage?.url).toBe(card.imageUrl); // full-bleed AND template path agree
      expect(card.imageUrl).toMatch(/^\/evergreen-decks\/art\/zmGV\/[a-z0-9-]+\.webp$/);
      expect(existsSync(join(DECKS_DIR, "..", card.imageUrl.replace(/^\//, "")))).toBe(true);
    }
  });

  it("ships the cardback and the hero token portrait locally too", () => {
    for (const url of [
      deck.deck_data.appearance.cardbackUrl as string,
      deck.deck_data.hero.tokenImageUrl as string,
    ]) {
      expect(url).toMatch(/^\/evergreen-decks\/art\/zmGV\//);
      expect(existsSync(join(DECKS_DIR, "..", url.replace(/^\//, "")))).toBe(true);
    }
  });

  it("leaves no remote asset URL anywhere in the shipped deck data", () => {
    // The evergreen promise: zero remote calls at runtime. The ONLY URL that may
    // survive is the attribution link, which is never fetched — and since #665
    // that link is the AUTHORS' the-unmatched.club page, not the unmatched.cards
    // mirror the rules text was converted from.
    const urls = (JSON.stringify(deck).match(/https?:\\?\/\\?\/[^"\\]+/g) ?? []).map((u) =>
      u.replace(/\\/g, "")
    );
    expect(urls).toEqual([
      "https://www.the-unmatched.club/c/heroes/skull-kid-the-legend-of-zelda.2748",
    ]);
  });

  it("keeps every verbatim title the art index is keyed on", () => {
    // norm() lowercases + trims and nothing else, so a "corrected" title here
    // silently unhooks that card's art. Casing and the missing "?" are load-bearing.
    const titles = cards.map((c) => c.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        "Your true Face",
        "Malevolence And Mischief",
        "You've met with a terrible fate, haven't you",
        "You're running out of time",
      ])
    );
    // one file per card, no two titles sharing a render
    expect(new Set(cards.map((c) => c.imageUrl)).size).toBe(cards.length);
    expect(new Set(titles.map(norm)).size).toBe(cards.length);
  });
});

// ---------------------------------------------------------------------------
// Cecil Palmer's art is SELF-HOSTED and FULL-BLEED (issue #668), the same
// contract Skull Kid ships under. Two of his thirteen faces are separable only
// by reading them (Eternal Scout Badge / Interloper! are both DEFENCE 2/1 x2),
// so a title that drifts here silently swaps two cards rather than blanking one.
// ---------------------------------------------------------------------------

describe("Cecil Palmer (37z5) art is committed, local and full-bleed", () => {
  const deck = readDeck("37z5");
  const cards = deck.deck_data.cards as {
    title: string;
    type: string;
    value: number | null;
    boost: number;
    quantity: number;
    imageUrl: string;
    cardImage?: { url: string };
  }[];

  it("ships every card face as a file that actually exists in the repo", () => {
    expect(cards).toHaveLength(13);
    for (const card of cards) {
      expect(card.cardImage?.url).toBe(card.imageUrl); // full-bleed AND template path agree
      expect(card.imageUrl).toMatch(/^\/evergreen-decks\/art\/37z5\/[a-z0-9-]+\.webp$/);
      expect(existsSync(join(DECKS_DIR, "..", card.imageUrl.replace(/^\//, "")))).toBe(true);
    }
  });

  it("ships the cardback and BOTH token portraits locally", () => {
    // The sidekick's portrait matters as much as the hero's here: Khoshekh is a
    // real fighter on the board, and Plastic bags is his card.
    for (const url of [
      deck.deck_data.appearance.cardbackUrl as string,
      deck.deck_data.hero.tokenImageUrl as string,
      deck.deck_data.sidekick.tokenImageUrl as string,
    ]) {
      expect(url).toMatch(/^\/evergreen-decks\/art\/37z5\//);
      expect(existsSync(join(DECKS_DIR, "..", url.replace(/^\//, "")))).toBe(true);
    }
  });

  it("mirrors the hero card, the rule card and the cover alongside the faces", () => {
    // Not referenced by the snapshot, but part of "every image mirrored": the
    // deck must remain reproducible with the club offline.
    for (const file of ["hero-card.webp", "broadcast-tokens.webp", "cover.webp"]) {
      expect(existsSync(join(DECKS_DIR, "art", "37z5", file))).toBe(true);
    }
  });

  it("leaves no remote asset URL anywhere in the shipped deck data", () => {
    const urls = (JSON.stringify(deck).match(/https?:\\?\/\\?\/[^"\\]+/g) ?? []).map((u) =>
      u.replace(/\\/g, "")
    );
    expect(urls).toEqual(["https://www.the-unmatched.club/c/heroes/cecil-palmer.13514"]);
  });

  it("keeps every verbatim title the art index is keyed on", () => {
    const titles = cards.map((c) => c.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        "Good Night, Night Vale. Good Night.", // sentence-case "Night Vale.", the period included
        "No Dogs in the dog park", // capital D on Dogs, lowercase dog park
        "Here's something odd",
        "Glow Cloud (ALL HAIL)",
        "They do not exist and you should not know about them", // no comma; the club render prints one
      ])
    );
    expect(new Set(cards.map((c) => c.imageUrl)).size).toBe(cards.length);
    expect(new Set(titles.map(norm)).size).toBe(cards.length);
  });

  it("keeps the ENGINE's trailing space on 'drink to forget ', and norm() forgives it", () => {
    // The engine rules.ts title ends in an ordinary space (U+0020); the 37z5 API
    // payload ends the same title in a NON-BREAKING space (U+00A0). This snapshot
    // follows the ENGINE, verbatim — and norm() trims both, so art resolution can
    // never depend on which of the two a future re-pull happens to bring back.
    const title = cards.map((c) => c.title).find((t) => t.startsWith("If you see something"))!;
    expect(title).toBe("If you see something, say nothing and drink to forget ");
    expect(title.endsWith("\u00A0")).toBe(false); // the payload's NBSP is NOT what shipped
    expect(norm(title)).toBe(norm("If you see something, say nothing and drink to forget\u00A0"));
  });

  it("pairs each of the two look-alike faces with the right render", () => {
    // Both are DEFENCE 2/1 x2; only the printed title separates them, and a
    // (type, value, boost, count) match would have swapped them silently.
    const bySlug = (slug: string) => cards.find((c) => c.imageUrl.endsWith(`/${slug}.webp`))!.title;
    expect(bySlug("eternal-scout-badge")).toBe("Eternal Scout Badge");
    expect(bySlug("interloper")).toBe("Interloper!");
    // The other trap: both VERSATILE 3/2, separable only by COUNT.
    const byTitle = (t: string) => cards.find((c) => c.title === t)!;
    expect(byTitle("Kill your double").quantity).toBe(3);
    expect(byTitle("Here's something odd").quantity).toBe(2);
  });

  it("totals 30 cards, the deck the engine converted", () => {
    expect(cards.reduce((n, c) => n + c.quantity, 0)).toBe(30);
  });
});
