import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeDigest, normalizeType } from "../../scripts/lib/deckManifest";
import { EVERGREEN_MANIFEST } from "./evergreenManifest";
import { HERO_DECK_IDS, norm } from "./useProCardArt";
import { BOUNTY_PILES, HERO_STATE_COUNTERS, HERO_STATE_FLAGS } from "./heroStateFlags";

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

// ---------------------------------------------------------------------------
// Boba Fett (issue #671 ↔ engine #477) is the opposite art contract from Skull
// Kid and Cecil: NO card art at all. The author's deck hotlinks scraped
// third-party images across eight hosts, so every face renders from the
// GENERATED TEMPLATE until the deck-art pipeline ticket lands, and the only
// mirrored images are the author's cardback and a crop of it for the hero token.
// These pin the deck DATA, which is what the engine and the rules lock read.
// ---------------------------------------------------------------------------

describe("Boba Fett (boba-fett) deck data", () => {
  const deck = readDeck("boba-fett");
  type Card = {
    title: string;
    type: string;
    value: number | null;
    boost: number;
    quantity: number;
    basicText: string;
    imageUrl: string;
    cardImage?: { url: string };
  };
  const cards = deck.deck_data.cards as Card[];
  const extraCards = (deck.deck_data.extraCards ?? []) as Card[];

  it("is 14 unique / 30 total, the author's own count", () => {
    expect(cards).toHaveLength(14);
    expect(cards.reduce((n, c) => n + c.quantity, 0)).toBe(30);
    expect(new Set(cards.map((c) => norm(c.title))).size).toBe(14);
  });

  it("carries the four BOUNTY cards as singletons with no boost pip", () => {
    // Each bounty is quantity 1 and prints no boost — which is why each engine
    // pile holds 0 or 1 card, and why the nameplate pills read presence not count.
    const bounties = cards.filter((c) => /^bounty:/i.test(c.title));
    expect(bounties.map((c) => c.title)).toEqual([
      "Bounty: It's Just business",
      "Bounty: Supposed to pay me",
      "Bounty: No Good to me dead",
      "BOUNTY: Never unarmed",
    ]);
    for (const b of bounties) {
      expect(b.quantity).toBe(1);
      expect(b.boost).toBe(0);
    }
  });

  it("keeps the author's typos and casing — the art index is keyed on them", () => {
    // norm() lowercases + trims and nothing else. "Fixing" FiresPray, the lowercase
    // "business"/"dead", or the one shouted "BOUNTY:" would unhook that card's art
    // the day it lands, and diverge from the engine's verbatim titles.
    expect(cards.map((c) => c.title)).toEqual(
      expect.arrayContaining([
        "Slave I: FiresPray Strife", // Firespray, printed with a capital P
        "Bounty: It's Just business",
        "Bounty: No Good to me dead",
        "BOUNTY: Never unarmed", // the one uppercase prefix of the four
        "Daimyo of Mos Espa",
      ])
    );
  });

  it("prints each bounty band on its card, and drops the stray 'HA LOL'", () => {
    const bandOf = (title: string) =>
      cards.find((c) => norm(c.title) === norm(title))!.basicText;
    expect(bandOf("Bounty: It's Just business")).toBe("PAYMENT: Reveal the top card of your deck.");
    expect(bandOf("Bounty: Supposed to pay me")).toBe("INHIBITOR: You can't draw cards this turn.");
    expect(bandOf("Bounty: No Good to me dead")).toContain(
      "CARBONITE: Your hero cannot leave their space this turn."
    );
    expect(bandOf("BOUNTY: Never unarmed")).toBe("FLAMETHROWER: Deal 1 damage to 1 of your fighters.");
    // The club's structured JSON carries "HA LOL" in It's Just business' default
    // block; the author's own rendered image drops it, and so do we.
    expect(JSON.stringify(deck)).not.toContain("HA LOL");
    // PAYMENT follows the IMAGE ("Reveal"), which the author confirmed is canon —
    // not the stale JSON's "Discard the top card of your deck".
    expect(JSON.stringify(deck)).not.toContain("Discard the top card of your deck");
  });

  it("ships SEISMIC CHARGE as a linked card, OUTSIDE the deck", () => {
    // A printed attack 6 that *Slave I* names and the engine opens a real combat
    // with (engine #463). It is never drawn, so it must not be in `cards` — that
    // array is the deck, the pool, the stats and the rules-lock digest.
    expect(extraCards.map((c) => c.title)).toEqual(["Seismic Charge"]);
    expect(extraCards[0]).toMatchObject({ type: "attack", value: 6, quantity: 0 });
    expect(cards.some((c) => /seismic/i.test(c.title))).toBe(false);
    // The digest projects `cards` only, so a linked card can never move the lock.
    const withoutExtras = JSON.parse(JSON.stringify(deck));
    delete withoutExtras.deck_data.extraCards;
    expect(computeDigest(withoutExtras)).toBe(computeDigest(deck));
  });

  // LAB-ONLY ART. The faces are the author's own club renders, mirrored so the deck
  // can be seen and playtested locally; the illustrations inside them are scraped
  // third-party comic art and the deck-art pipeline must replace every one before
  // this hero leaves tier `lab`. What is pinned here is only that the wiring is
  // sound and entirely LOCAL — nothing about it is a precedent to copy.
  it("ships every card face as a file that actually exists in the repo", () => {
    for (const card of [...cards, ...extraCards]) {
      expect(card.imageUrl).toMatch(/^\/evergreen-decks\/art\/boba-fett\/[a-z0-9-]+\.webp$/);
      expect(existsSync(join(DECKS_DIR, "..", card.imageUrl.replace(/^\//, "")))).toBe(true);
    }
  });

  it("draws thirteen faces FULL-BLEED and the Slave I pair through the template", () => {
    // *Slave I* is the one card with no usable club render — its preview hash 400s
    // after a late edit — so it falls back to the generated template with the
    // author's illustration in the art panel, and SEISMIC CHARGE (printed ON it,
    // never rendered separately) borrows the same illustration.
    const templated = ["Slave I: FiresPray Strife"];
    for (const card of cards) {
      if (templated.includes(card.title)) expect(card.cardImage).toBeUndefined();
      else expect(card.cardImage?.url).toBe(card.imageUrl);
    }
    expect(cards.filter((c) => c.cardImage)).toHaveLength(13);
    expect(extraCards[0].cardImage).toBeUndefined();
    expect(extraCards[0].imageUrl).toBe(
      cards.find((c) => c.title === "Slave I: FiresPray Strife")!.imageUrl
    );
  });

  it("gives every card its OWN face — no two share a render, bar the Slave I pair", () => {
    expect(new Set(cards.map((c) => c.imageUrl)).size).toBe(cards.length);
  });

  it("mirrors the hero card and the BOUNTIES rule card alongside the faces", () => {
    for (const file of ["hero-card.webp", "bounties-rule-card.webp"]) {
      expect(existsSync(join(DECKS_DIR, "art", "boba-fett", file))).toBe(true);
    }
  });

  it("says in the deck note that the art is lab-only and must be replaced", () => {
    // The provenance has to travel WITH the data, not only in a code comment: this
    // deck must not graduate carrying scraped third-party illustrations.
    expect(deck.note).toContain("LAB-ONLY AND TEMPORARY");
    expect(deck.note).toContain("deck-art pipeline");
  });

  it("ships the cardback and the hero token locally, and no other remote URL", () => {
    for (const url of [
      deck.deck_data.appearance.cardbackUrl as string,
      deck.deck_data.hero.tokenImageUrl as string,
    ]) {
      expect(url).toMatch(/^\/evergreen-decks\/art\/boba-fett\//);
      expect(existsSync(join(DECKS_DIR, "..", url.replace(/^\//, "")))).toBe(true);
    }
    // Fennec Shand has NO token art — her board token falls back to initials until
    // the deck-art ticket. Asserted so the omission reads as deliberate.
    expect(deck.deck_data.sidekick.tokenImageUrl).toBeUndefined();
    // The only remote URLs left are the attribution link and the same link quoted
    // in the provenance note — never fetched. Not one image host survives; the
    // author's imgur cardback is mirrored, and his eight card-art hosts are simply
    // absent (Pinterest thumbnails, a Bing image-search CDN, a Lucasfilm CDN).
    const urls = (JSON.stringify(deck).match(/https?:\\?\/\\?\/[^"\\ )]+/g) ?? []).map((u) =>
      u.replace(/\\/g, "")
    );
    expect([...new Set(urls)]).toEqual(["https://www.the-unmatched.club/c/heroes/boba-fett.7289"]);
  });

  it("matches the hero and sidekick the engine will serve", () => {
    expect(deck.deck_data.hero).toMatchObject({ hp: 14, move: 2, isRanged: true, name: "Boba Fett" });
    expect(deck.deck_data.sidekick).toMatchObject({
      hp: 8,
      quantity: 1,
      isRanged: true,
      name: "Fennec Shand",
    });
  });
});

/**
 * The snapshot vs the ENGINE (issue #671 ↔ engine #477, `boba-fett.rules.ts`
 * @c3fa75a). The rules-lock digest only ever compares the snapshot to ITSELF, so
 * nothing else in this repo would notice if the two drifted — and the engine repo
 * is private, so the file cannot be imported. The table below is therefore
 * transcribed from it, and this is the check that the two agree on every field the
 * engine actually enforces.
 *
 * Order is the engine's `BOBA_FETT_CARDS` order, which the snapshot follows.
 * `usableBy` maps to the snapshot's `characterName` (the club's banner name), and
 * the engine's `boost: null` — "this card prints no boost pip" — is `0` here,
 * because DeckImportCardType's `boost` is a number and the renderer draws the pip
 * on a truthy value, so 0 and null produce the same face.
 */
describe("Boba Fett snapshot agrees with boba-fett.rules.ts @c3fa75a", () => {
  const deck = readDeck("boba-fett");
  // [title, type, value, boost, quantity, characterName]
  const ENGINE: [string, string, number, number, number, string][] = [
    ["Slave I: FiresPray Strife", "scheme", 0, 4, 1, "Boba Fett"],
    ["Rule with Respect", "versatile", 3, 2, 3, "Fennec Shand"],
    ["Claiming the Bounty", "attack", 2, 2, 3, "Any"],
    ["Second Shot", "attack", 2, 3, 3, "Any"],
    ["Daimyo of Mos Espa", "versatile", 3, 3, 2, "Any"],
    ["Counter Strike", "versatile", 3, 2, 3, "Any"],
    ["Durasteel Armor", "defense", 0, 2, 3, "Boba Fett"],
    ["Master of the Hunt", "scheme", 0, 3, 2, "Boba Fett"],
    ["Bounty: It's Just business", "defense", 0, 0, 1, "Boba Fett"],
    ["Disintegration", "attack", 4, 4, 3, "Boba Fett"],
    ["Leap Away", "versatile", 4, 2, 3, "Any"],
    ["Bounty: Supposed to pay me", "versatile", 2, 0, 1, "Boba Fett"],
    ["Bounty: No Good to me dead", "scheme", 0, 0, 1, "Boba Fett"],
    ["BOUNTY: Never unarmed", "attack", 4, 0, 1, "Boba Fett"],
  ];

  it("matches every card's title, type, value, boost, quantity and character", () => {
    const cards = deck.deck_data.cards as {
      title: string;
      type: string;
      value: number;
      boost: number;
      quantity: number;
      characterName: string;
    }[];
    expect(cards).toHaveLength(ENGINE.length);
    cards.forEach((c, i) => {
      const [title, type, value, boost, quantity, characterName] = ENGINE[i];
      // normalizeType, because the snapshot spells it "defence" (the community-deck
      // convention the card-type ICON is keyed on) and the engine spells it "defense".
      expect([c.title, normalizeType(c.type), c.value, c.boost, c.quantity, c.characterName]).toEqual([
        title,
        type,
        value,
        boost,
        quantity,
        characterName,
      ]);
    });
  });

  it("matches SEISMIC CHARGE, the linked card outside the deck", () => {
    // Engine: id boba-fett/seismic-charge, attack 6, boost null, quantity 0,
    // usableBy HERO, blocks [] — "no rules text at all" is what the print has.
    const extra = deck.deck_data.extraCards as {
      title: string;
      type: string;
      value: number;
      boost: number;
      quantity: number;
      characterName: string;
    }[];
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({
      title: "Seismic Charge",
      type: "attack",
      value: 6,
      boost: 0,
      quantity: 0,
      characterName: "Boba Fett",
    });
    // The instance the engine mints is `<defId>#linked`, and art resolution keys on
    // norm(title) after splitting the id — so this title is the join, and a period
    // or a rename on either side would silently blank the combat face.
    expect(norm(extra[0].title)).toBe(norm("Seismic Charge"));
  });

  it("matches the hero and sidekick stat lines", () => {
    expect(deck.deck_data.hero).toMatchObject({ hp: 14, move: 2, isRanged: true });
    expect(deck.deck_data.sidekick).toMatchObject({
      name: "Fennec Shand",
      hp: 8,
      quantity: 1,
      isRanged: true,
    });
  });

  it("keeps the four bounty pile keys the engine names as the client contract", () => {
    // BOBA_BOUNTY_PILES in the rules file, in its order. The registry generates its
    // entries from this list, so a rename here is the whole of the client fix.
    expect(BOUNTY_PILES.map((b) => b.pile)).toEqual([
      "BOUNTY_PAYMENT",
      "BOUNTY_INHIBITOR",
      "BOUNTY_CARBONITE",
      "BOUNTY_FLAMETHROWER",
    ]);
    // The "Bounty:" prefix the engine filters on (the COLON is load-bearing —
    // "Claiming the Bounty" contains the word and is NOT a bounty card).
    const cards = deck.deck_data.cards as { title: string }[];
    expect(cards.filter((c) => norm(c.title).includes("bounty:"))).toHaveLength(4);
    expect(cards.filter((c) => norm(c.title).includes("bounty"))).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Ellen Ripley — Aliens (issue #681 ↔ engine #494/#493). CLUB-ONLY: there is no
// unmatched.cards page for this deck at all, so the committed snapshot is the
// only source and nothing can be re-fetched to check it against. Two things
// therefore have to be pinned here — that the snapshot agrees with the engine
// field for field, and that not one image URL points off this repo.
// ---------------------------------------------------------------------------

describe("Ellen Ripley (ellen-ripley) deck data", () => {
  const deck = readDeck("ellen-ripley");
  type Card = {
    title: string;
    type: string;
    value: number | null;
    boost: number;
    quantity: number;
    characterName: string;
    imageUrl: string;
    cardImage?: { url: string };
  };
  const cards = deck.deck_data.cards as Card[];

  it("is 12 unique / 30 total — with FEINT at the author's corrected x2", () => {
    // The club record as published sums to 31 (FEINT x3) and the engine refuses
    // anything but 30. MrBrownieDL answered x2 in the Discord thread on
    // 2026-08-23; that correction is the ONLY divergence from the record, and it
    // is what makes this deck legal at all.
    expect(cards).toHaveLength(12);
    expect(cards.reduce((n, c) => n + c.quantity, 0)).toBe(30);
    expect(new Set(cards.map((c) => norm(c.title))).size).toBe(12);
    expect(cards.find((c) => c.title === "FEINT")!.quantity).toBe(2);
  });

  it("keeps the author's casing and punctuation — the art index is keyed on them", () => {
    // norm() lowercases + trims and nothing else. "Fixing" the mixed-case Pulse,
    // the asterisks or either exclamation mark would unhook that card's face and
    // diverge from the engine's verbatim titles at the same time.
    expect(cards.map((c) => c.title)).toEqual(
      expect.arrayContaining([
        "M41A Pulse RIFLE", // the one card that is not all-caps
        "MOMMY!",
        "GET AWAY FROM HER, YOU *****!", // five asterisks, as printed
        "AYE-FIRMATIVE",
      ])
    );
  });

  it("ships every card face as a LOCAL file that exists, drawn full-bleed", () => {
    // The author made real card renders, so every face is his own frame via
    // cardImage — this deck must never fall through to the generated template.
    for (const card of cards) {
      expect(card.imageUrl).toMatch(/^\/evergreen-decks\/art\/ellen-ripley\/[a-z0-9-]+\.webp$/);
      expect(card.cardImage?.url).toBe(card.imageUrl);
      expect(existsSync(join(DECKS_DIR, "..", card.imageUrl.replace(/^\//, "")))).toBe(true);
    }
    expect(new Set(cards.map((c) => c.imageUrl)).size).toBe(cards.length);
  });

  it("mirrors the hero card, the cardback and BOTH board tokens locally", () => {
    for (const file of ["hero-card.webp", "cardback.webp", "token-ellen-ripley.webp", "token-newt.webp"]) {
      expect(existsSync(join(DECKS_DIR, "art", "ellen-ripley", file))).toBe(true);
    }
    for (const url of [
      deck.deck_data.appearance.cardbackUrl as string,
      deck.deck_data.hero.tokenImageUrl as string,
      deck.deck_data.sidekick.tokenImageUrl as string,
    ]) {
      expect(url).toMatch(/^\/evergreen-decks\/art\/ellen-ripley\//);
      expect(existsSync(join(DECKS_DIR, "..", url.replace(/^\//, "")))).toBe(true);
    }
  });

  it("leaves NO remote URL in the shipped data but the attribution link", () => {
    // The deck's images were published across i.imgur.com and the club's own
    // /drive/ store; every one is mirrored, so neither host may survive here.
    const urls = (JSON.stringify(deck).match(/https?:\\?\/\\?\/[^"\\ )]+/g) ?? []).map((u) =>
      u.replace(/\\/g, "")
    );
    expect([...new Set(urls)]).toEqual([
      "https://www.the-unmatched.club/c/heroes/ellen-ripley.2304",
    ]);
    expect(JSON.stringify(deck)).not.toContain("i.imgur.com");
    expect(deck.sourceUrl).toBe("https://www.the-unmatched.club/c/heroes/ellen-ripley.2304");
    expect(deck.user).toBe("MrBrownieDL");
  });

  it("carries no rule cards and no extra characters", () => {
    // Stated rather than assumed: the hero ability is the whole of the deck's
    // special text, and the engine registers no counters, flags or piles either.
    expect(deck.deck_data.ruleCards ?? []).toEqual([]);
    expect(deck.deck_data.extraCards).toBeUndefined();
    expect(deck.deck_data.extraCharacters).toBeUndefined();
  });
});

/**
 * The snapshot vs the ENGINE (issue #681 ↔ engine #494, `ellen-ripley.rules.ts`
 * @ee9c276). The rules-lock digest only ever compares the snapshot to ITSELF and
 * the engine repo is private, so the table below is transcribed from that file and
 * this is the check that the two agree on every field the engine enforces.
 *
 * Order is the engine's `ELLEN_RIPLEY_CARDS` order, which the snapshot follows.
 * `usableBy` maps to `characterName` (the club's banner name): HERO → "Ellen
 * Ripley", SIDEKICK → "Newt", ANY → "Any". ONE row is newer than the @ee9c276 pin:
 * "M41A Pulse RIFLE" was `usableBy: ANY` there, which let Newt attack with Ripley's
 * rifle — a data-entry error in the club export (the author's own card art prints
 * RIPLEY, confirmed on Discord 2026-08-26). Engine #515 fixes it to HERO and this
 * client's issue #714 fixes the banner. The engine spells the two defence cards
 * "defense"; the snapshot uses the community-deck "defence" the card-type icon is
 * keyed on, and the digest normalizes the difference (see `normalizeType`).
 */
describe("Ellen Ripley snapshot agrees with ellen-ripley.rules.ts @ee9c276", () => {
  const deck = readDeck("ellen-ripley");
  // [title, type, value, boost, quantity, characterName]
  const ENGINE: [string, string, number, number, number, string][] = [
    ["P-5000 POWER LOADER", "attack", 3, 3, 2, "Ellen Ripley"],
    ["MOTION TRACKER", "defense", 2, 2, 3, "Any"],
    ["MOMMY!", "scheme", 0, 2, 2, "Newt"],
    ["SKIRMISH", "versatile", 4, 1, 3, "Any"],
    ["REGROUP", "versatile", 1, 2, 3, "Any"],
    ["AYE-FIRMATIVE", "versatile", 3, 2, 3, "Any"],
    ["FEINT", "versatile", 2, 3, 2, "Any"],
    ["M41A GRENADE LAUNCHER", "scheme", 0, 3, 2, "Ellen Ripley"],
    ["GET BEHIND ME", "defense", 2, 3, 3, "Any"],
    ["RESOURCEFUL", "attack", 2, 1, 2, "Newt"],
    ["M41A Pulse RIFLE", "attack", 2, 2, 3, "Ellen Ripley"], // engine #515: usableBy ANY -> HERO
    ["GET AWAY FROM HER, YOU *****!", "attack", 4, 3, 2, "Ellen Ripley"],
  ];

  it("matches the engine card for card, in the engine's own order", () => {
    const cards = deck.deck_data.cards as {
      title: string;
      type: string;
      value: number | null;
      boost: number;
      quantity: number;
      characterName: string;
    }[];
    expect(cards).toHaveLength(ENGINE.length);
    cards.forEach((card, i) => {
      const [title, type, value, boost, quantity, characterName] = ENGINE[i];
      expect(card.title).toBe(title);
      expect(normalizeType(card.type)).toBe(normalizeType(type));
      expect(card.value ?? 0).toBe(value);
      expect(card.boost).toBe(boost);
      expect(card.quantity).toBe(quantity);
      expect(card.characterName).toBe(characterName);
    });
  });

  it("matches the hero and sidekick stat lines", () => {
    expect(deck.deck_data.hero).toMatchObject({
      hp: 14,
      move: 2,
      isRanged: true, // reach: 'RANGED'
      name: "Ellen Ripley",
    });
    expect(deck.deck_data.sidekick).toMatchObject({
      name: "Newt",
      hp: 7,
      quantity: 1,
      isRanged: false, // reach: 'MELEE'
    });
  });

  it("prints both clauses of SURROGATE MOTHER, in the printed order", () => {
    // The order is rules-relevant on the second clause: discard FIRST, then the 2
    // damage — which can defeat Ripley herself.
    const ability = deck.deck_data.hero.specialAbility as string;
    expect(ability).toContain("SURROGATE MOTHER");
    expect(ability).toContain("if Newt is adjacent to an opposing fighter, gain 1 action");
    expect(ability.indexOf("discard 2 cards")).toBeLessThan(ability.indexOf("2 damage to Ripley"));
  });

  it("prints the two clauses the client has to render prompts for", () => {
    const textOf = (title: string) => {
      const c = (deck.deck_data.cards as { title: string; immediateText: string; basicText: string }[]).find(
        (x) => x.title === title
      )!;
      return `${c.immediateText} ${c.basicText}`;
    };
    // *GET BEHIND ME* — the v34 substitution, offered as an `optional` prompt.
    expect(textOf("GET BEHIND ME")).toContain("the other fighter is now the defender");
    // *MOMMY!* — the chooseOne the engine opens with the two printed options.
    expect(textOf("MOMMY!")).toContain("Newt and Ripley each recover 1 health");
    expect(textOf("MOMMY!")).toContain("Ripley recovers 2 health");
  });
});

// ---------------------------------------------------------------------------
// Appa + Momo (issue #737 ↔ engine #522/#525). unmatched.cards deck jw9q by
// JBentz — a deck that DOES have a public page, so the payload is fetchable and
// the snapshot could in principle be re-derived from it. It deliberately is not,
// in three places: the author's own printed card renders (the 14-PNG set he
// posted to Discord on 2026-08-23) overrule the payload wherever the two
// disagree (Dean's ruling, 2026-09-02), and the payload's own imageUrl fields
// are uncredited third-party hotlinks that must never ship.
// ---------------------------------------------------------------------------

describe("Appa + Momo (jw9q) deck data", () => {
  const deck = readDeck("jw9q");
  type Card = {
    title: string;
    type: string;
    value: number | null;
    boost: number;
    quantity: number;
    characterName: string;
    imageUrl: string;
    cardImage?: { url: string };
    basicText: string;
    duringText: string | null;
  };
  const cards = deck.deck_data.cards as Card[];
  const byTitle = (t: string) => cards.find((c) => c.title === t)!;

  it("is 12 unique / 30 total", () => {
    expect(cards).toHaveLength(12);
    expect(cards.reduce((n, c) => n + c.quantity, 0)).toBe(30);
    expect(new Set(cards.map((c) => norm(c.title))).size).toBe(12);
  });

  it("keeps the printed titles verbatim — the art index is keyed on them", () => {
    // norm() lowercases + trims and nothing else. "PLay Fighting" keeps the
    // payload's capital L (the card is set in all caps, so it neither confirms
    // nor denies it) and "Yip Yip!" keeps its exclamation mark. Fixing either
    // unhooks that card's face AND diverges from the engine's verbatim CardDef.
    expect(cards.map((c) => c.title)).toEqual(
      expect.arrayContaining(["PLay Fighting", "Yip Yip!", "The Last Sky Bison"]),
    );
  });

  it("takes the CARD over the payload wherever the two disagree", () => {
    // The three rule-level differences the 14-PNG audit found. All three are
    // being matched on the engine side in PR #524; if any is reverted here the
    // snapshot and the rules.ts stop describing the same deck.
    expect(byTitle("The Last Sky Bison")).toBeDefined(); // payload said "Sky Bison"
    expect(cards.find((c) => c.title === "Sky Bison")).toBeUndefined();
    // payload: "...with a friendly fighter" — the card counts ANY fighter.
    expect(byTitle("Team Avatar").basicText).toContain("shares a space with another fighter");
    // payload: "...with your fighterS" — the card is singular: ONE of your
    // fighters must cover every zone the opposing fighter is in.
    expect(byTitle("Air Nomads").duringText).toContain("shares all their zones with your fighter,");
    expect(deck.deck_data.hero.specialAbility).toContain("THE FIRST AIRBENDER");
  });

  it("ships every card face as a LOCAL file that exists, drawn full-bleed", () => {
    // The author made real card renders, so every face is his own frame via
    // cardImage — this deck must never fall through to the generated template,
    // and must never be routed to the art-generation pipeline.
    for (const card of cards) {
      expect(card.imageUrl).toMatch(/^\/evergreen-decks\/art\/appa\/[a-z0-9-]+\.webp$/);
      expect(card.cardImage?.url).toBe(card.imageUrl);
      expect(existsSync(join(DECKS_DIR, "..", card.imageUrl.replace(/^\//, "")))).toBe(true);
    }
    expect(new Set(cards.map((c) => c.imageUrl)).size).toBe(cards.length);
  });

  it("mirrors the cardback and the hero card locally", () => {
    for (const file of ["cardback.webp", "hero-card.webp"]) {
      expect(existsSync(join(DECKS_DIR, "art", "appa", file))).toBe(true);
    }
    const cardback = deck.deck_data.appearance.cardbackUrl as string;
    expect(cardback).toBe("/evergreen-decks/art/appa/cardback.webp");
    expect(existsSync(join(DECKS_DIR, "..", cardback.replace(/^\//, "")))).toBe(true);
  });

  it("ships BOTH board token portraits locally", () => {
    // Without these the board falls back to the "APP"/"MOM" initials and the
    // promo's cold open flips the cardback onto a blank card (#739). Both are
    // crops of the author's own PNGs — never generated, never hotlinked.
    expect(deck.deck_data.hero.tokenImageUrl).toBe("/evergreen-decks/art/appa/token-appa.webp");
    expect(deck.deck_data.sidekick.tokenImageUrl).toBe("/evergreen-decks/art/appa/token-momo.webp");
    for (const url of [
      deck.deck_data.hero.tokenImageUrl as string,
      deck.deck_data.sidekick.tokenImageUrl as string,
    ]) {
      expect(existsSync(join(DECKS_DIR, "..", url.replace(/^\//, "")))).toBe(true);
    }
  });

  it("leaves NO remote URL in the shipped data but the attribution link", () => {
    // Every payload imageUrl pointed at a hotlinked third-party image (gstatic,
    // pinimg, fbcdn, a school newspaper). Not one may survive here.
    const urls = (JSON.stringify(deck).match(/https?:\\?\/\\?\/[^"\\ )]+/g) ?? []).map((u) =>
      u.replace(/\\/g, ""),
    );
    expect([...new Set(urls)]).toEqual(["https://unmatched.cards/decks/jw9q"]);
    expect(deck.user).toBe("JBentz");
  });

  it("carries the hero and sidekick stats the character card prints", () => {
    expect(deck.deck_data.hero).toMatchObject({ hp: 14, move: 2, isRanged: false, name: "Appa" });
    expect(deck.deck_data.sidekick).toMatchObject({ hp: 6, quantity: 1, name: "Momo" });
    // Appa's LARGE size, his reach and Momo's move 4 are HeroDef/sidekick fields
    // on the SERVER — the snapshot carries them only as ability prose.
    expect(deck.deck_data.hero.specialAbility).toContain("large fighter");
    expect(deck.deck_data.hero.specialAbility).toContain("move value is 4");
  });

  it("carries no rule cards and no extra characters", () => {
    expect(deck.deck_data.ruleCards ?? []).toEqual([]);
    expect(deck.deck_data.extraCharacters ?? []).toEqual([]);
    expect(deck.deck_data.extraCards).toBeUndefined();
  });

  it("declares NO public hero state — the engine registers none", () => {
    // Stated rather than assumed (the Cairne RAGE lesson: a counter with no
    // registry row ships invisible). appa.rules.ts @b7ab6ca uses only
    // if / optional / dealDamage / bindFighter / move / modifyValue / chooseOne —
    // no setCounter, no flags, no piles. If that ever changes, this test is the
    // reminder that heroStateFlags.ts needs a row on BOTH surfaces.
    expect(HERO_STATE_FLAGS.filter((e) => e.heroes.includes("appa"))).toEqual([]);
    expect(HERO_STATE_COUNTERS.filter((e) => e.heroes.includes("appa"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Jason Voorhees (issue #762). unmatched.cards deck DOPE by Hubaris — a deck
// with a public page, like jw9q above, and likewise NOT re-derived from it:
// all 13 faces, the cardback and the hero-card are the author's own finished
// renders, published via Calton White's the-unmatched.club deck 13452 and
// mirrored into public/evergreen-decks/art/DOPE (upstream they are i.ibb.co
// hotlinks that must never ship). The two scheme faces (FURIOUS ZEAL, GRIM
// OMEN) landed in a later club update at 464×640 and are committed upscaled
// to the same 1116-wide webp as the other eleven. Attribution stays the
// unmatched.cards DOPE page — no `sourceUrl`, the club is the art source only.
// ---------------------------------------------------------------------------

describe("Jason Voorhees (DOPE) deck data", () => {
  const deck = readDeck("DOPE");
  type Card = {
    title: string;
    imageUrl: string;
    cardImage?: { url: string };
  };
  const cards = deck.deck_data.cards as Card[];

  it("is 13 unique faces — all 13 now have the author's finished renders", () => {
    // The two schemes (FURIOUS ZEAL, GRIM OMEN) were template-only until
    // Calton published their renders; if a face ever regresses to template
    // art its imageUrl/cardImage assertions below fail first.
    expect(cards).toHaveLength(13);
    expect(new Set(cards.map((c) => c.title))).toEqual(
      new Set([
        "UNSTOPPABLE", "JASON LIVES", "KILLER", "SAVAGERY", "BRUTALITY",
        "AMBUSH", "TERRORIZE", "CORNERED", "HUNT", "FEROCITY", "TROPHY",
        "FURIOUS ZEAL", "GRIM OMEN",
      ]),
    );
  });

  it("ships every card face as a LOCAL file that exists, drawn full-bleed", () => {
    for (const card of cards) {
      expect(card.imageUrl).toMatch(/^\/evergreen-decks\/art\/DOPE\/[a-z0-9-]+\.webp$/);
      expect(card.cardImage?.url).toBe(card.imageUrl);
      expect(existsSync(join(DECKS_DIR, "..", card.imageUrl.replace(/^\//, "")))).toBe(true);
    }
    expect(new Set(cards.map((c) => c.imageUrl)).size).toBe(cards.length);
  });

  it("mirrors the cardback and the hero card locally", () => {
    for (const file of ["cardback.webp", "hero-card.webp"]) {
      expect(existsSync(join(DECKS_DIR, "art", "DOPE", file))).toBe(true);
    }
    // appearance.cardbackUrl feeds the SNAPSHOT consumers (PoolFns backfills
    // each card's cardBackUrl from it; Bag and Connect read it too) — without
    // it the board renders the house back face-down. The tile's separate
    // cardbackUrl lives in lib/constants/top-decks.ts.
    const cardback = deck.deck_data.appearance.cardbackUrl as string;
    expect(cardback).toBe("/evergreen-decks/art/DOPE/cardback.webp");
    expect(existsSync(join(DECKS_DIR, "..", cardback.replace(/^\//, "")))).toBe(true);
  });

  it("ships the board token portrait locally", () => {
    const token = deck.deck_data.hero.tokenImageUrl as string;
    expect(token).toBe("/evergreen-decks/art/DOPE/token-jason-voorhees.webp");
    expect(existsSync(join(DECKS_DIR, "..", token.replace(/^\//, "")))).toBe(true);
  });

  it("leaves NO remote image URL and only the note's provenance links remote", () => {
    // Every shipped image field is asserted local above; this set-equality is
    // the tripwire for any future edit: the ONLY https URLs allowed anywhere
    // in the payload are the snapshot note's provenance/attribution links
    // (the original deck page and its siblings, the author's drive folder,
    // and the-unmatched.club art source — i.ibb.co is mentioned as bare text
    // only and must never appear as a URL).
    const urls = (JSON.stringify(deck).match(/https?:\\?\/\\?\/[^"\\ )]+/g) ?? []).map((u) =>
      u.replace(/\\/g, ""),
    );
    expect([...new Set(urls)].sort()).toEqual(
      [
        "https://drive.google.com/drive/folders/1hMfd1o1Eab6ZK195024Cldi3LdyKeEjN",
        "https://unmatched.cards/decks/6G31/versions/d_d1hG1B",
        "https://unmatched.cards/decks/Den8/versions/N_dmI_n6",
        "https://unmatched.cards/decks/DOPE",
        "https://unmatched.cards/decks/DOPE/versions/_yGrHv7J",
        "https://unmatched.cards/decks/RnYZ/versions/e-GhOj2",
        "https://unmatched.cards/decks/kdJK/versions/WX5xaOK4",
        "https://www.the-unmatched.club/c/heroes/jason-voorhees.13452",
      ].sort(),
    );
    expect(deck.user).toBe("Hubaris");
    expect(deck.sourceUrl).toBeUndefined();
  });
});
