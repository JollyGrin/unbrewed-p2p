/**
 * Card ART for Pro games. The server's catalog is the mechanical truth
 * (title/type/value/boost); display art comes from the rules-locked deck
 * snapshot in public/evergreen-decks/ (see public/evergreen-decks/manifest.json
 * and lib/pro/evergreenManifest.ts) — the ONLY source, no live-API fallback.
 * Every /pro hero has rules frozen server-side, so its deck art must be
 * equally frozen; a `npm run pro:decks:bump-rules` is required to move the
 * lock forward deliberately. If a snapshot fetch fails or a title doesn't
 * match, callers fall back to text chips — art is a nicety, never a
 * dependency.
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  DeckImportCardType,
  DeckImportHeroType,
  DeckImportRuleCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import {
  CardAppearance,
  cardAppearance,
  norm,
  withRimTier,
} from "./cardAppearance";
import { SeatCosmetics, cardRimForSeats } from "./seatCosmetics";
import { CardDefId, CardInstanceId, CardMeta } from "./protocol";

/**
 * server hero id -> unmatched.cards deck id, for every hero with rules in
 * unbrewed-pro-server (data/heroes/*.rules.ts). This is the ONE hero<->deck
 * mapping for Pro — lib/evergreenDecks.ts derives its sandbox-parity set from
 * this same map instead of hand-keeping a second list. Only add an entry here
 * once the hero has a rules.ts on the server; a deck id with no rules has no
 * business being in the Pro roster.
 */
export const HERO_DECK_IDS: Record<string, string> = {
  "king-kong": "kdKM",
  "the-mandalorian": "lDOM",
  thrall: "pk1x",
  "r2-d2": "3jgd",
  "gingerbread-man": "LWNZ",
  triceratops: "1Y5J",
  "baba-yaga": "yAJ-",
  "buster-keaton": "QkB1",
  batman: "x2_V",
  // Specter Knight (issue #419 ↔ engine #226): community deck with a prompted
  // additional-defense combat primitive; art comes from the frozen xBvn snapshot.
  "specter-knight": "xBvn",
  // Nancy Drew (issue #420 ↔ engine #225): community deck, CLUE token economy
  // (FIGURE_MOVED zone-entry) riding the existing `counters` view; no protocol change.
  "nancy-drew": "nPnv",
  // Evergreen originals: no unmatched.cards page exists — the ids are ours, and
  // the snapshot in public/evergreen-decks/ is the ONLY source (the live-API
  // fetch 404s by design; snapshot-only means it is never consulted).
  "king-taranis": "taranis",
  thetis: "thetis",
  // General Grievous (issue #288 ↔ engine #160): original, no unmatched.cards page.
  // Card art renders from the self-hosted R2 TTS sprite sheet (cardImage on each
  // snapshot card), not the unmatched.cards renderer.
  "general-grievous": "grievous",
  "malfurion-stormrage": "malfurion-stormrage",
  "clone-troopers": "DJQB",
  // Spice remixes (engine hero id `<hero>-spice`, display name shared with the
  // baseline). Each snapshot reuses the baseline's art per-card until dedicated
  // spice art lands.
  "thetis-spice": "thetis-spice",
  "king-taranis-spice": "taranis-spice",
  "piper-of-the-underroads": "piper",
  "piper-of-the-underroads-spice": "piper-spice",
  "hollow-oak": "hollow-oak",
  "hollow-oak-spice": "hollow-oak-spice",
  // Cairne Bloodhoof (issue #457 ↔ engine #240/#241): community deck, RAGE
  // counter economy (spendCounterForValue v0.25.0 + FIGHTER_DEFEATED trigger).
  // No protocol change — reuses existing CHOOSE_OPTION prompt + counters view.
  "cairne-bloodhoof": "p82X",
  // Darth Vader (issue #533 ↔ engine #288): the-unmatched.club deck 4173 by
  // Inforce (https://www.the-unmatched.club/c/heroes/darth-vader.4173). TUC decks
  // have no unmatched.cards page, so the deck id is ours (General Grievous
  // precedent) and the committed snapshot is the only source. Card faces are
  // self-hosted full-bleed via cardImage, mirrored from TUC's own per-card
  // preview webps.
  "darth-vader": "darth-vader",
  // Darth Maul (engine PR #290): TUC community deck by Rogue RaiderOne (source
  // ID 9090). Sith Assassin action-economy hero, no sidekick, no protocol change.
  "darth-maul": "darth-maul",
  // Luke Skywalker (issue #541 ↔ engine #296): TUC community deck 12306 by Rogue
  // RaiderOne — the set-aside TRAINING pile hero. No unmatched.cards page, so the
  // deck id is ours. Card faces are the AUTHOR's finished renders (his TUC
  // replacementImage set), self-hosted and drawn full-bleed via cardImage; this
  // deck must never fall back to the generated template, which cannot reproduce
  // his banner/layout design.
  "luke-skywalker": "luke-skywalker",
  // The Doppelgänger (issue #545 ↔ engine #303/#304): an unbrewed ORIGINAL, so the
  // deck id is ours and the hand-authored snapshot is the only source — there is no
  // unmatched.cards or TUC page to fetch. Card art is generated ILLUSTRATION, so it
  // rides per-card `imageUrl` through the generated card template (Cairne/Malfurion
  // precedent), NOT the full-bleed `cardImage` path the two Sith decks and Luke use
  // for their authors' finished renders.
  doppelganger: "doppelganger",
  // Gerry the Isopod (issue #553 ↔ engine #316/#317/#318): community deck 5jGPM by
  // Emperourrrrr, the CORPSE deck — defeated Larrys stay on the board as v26
  // board objects for three of the owner's turns. Card faces are the author's
  // own picture picks, self-hosted per #446 and drawn through the generated card
  // template via per-card `imageUrl` (Cairne precedent), NOT the full-bleed
  // `cardImage` path. Four of the ten faces are low-res web thumbnails the author
  // hotlinked; they ship as-is per the 2026-08-01 ruling.
  "gerry-the-isopod": "5jGPM",
  // Kenshiro (issue #596 ↔ engine #362, on the #359/#360 lab train): community deck
  // 6rDz by Calton_White — the HOKUTO chain hero (Hundred-Fist Rush drains up to
  // three sequential sub-attacks off engine #359's followup queue). The deck id is
  // the real unmatched.cards one, which is also the source kenshiro.rules.ts was
  // converted from, so the snapshot's rules fields are engine-exact.
  //
  // The ART, unusually, comes from a DIFFERENT publication of the same deck — the
  // author's the-unmatched.club 12653, the only place he uploaded finished card
  // renders (6rDz hotlinks scattered stock images). Those faces are self-hosted per
  // #446 and drawn full-bleed via cardImage; this deck must never fall back to the
  // generated template, which cannot reproduce his banner/layout design, and must
  // never be routed to the art-generation pipeline. The two publications disagree on
  // three boosts — the snapshot follows 6rDz/the engine; see the deck note.
  kenshiro: "6rDz",
  // Skull Kid — Majora's Mask (issue #663 ↔ engine #449/#448): community deck zmGV
  // by AndSushi with DreamCarver, the COUNTDOWN deck. The deck id is the real
  // unmatched.cards one, which is also the source skull-kid.rules.ts was converted
  // from, so the snapshot's rules fields are engine-exact.
  //
  // EVERGREEN IN THE STRICT SENSE (Dean, 2026-08-22): the author hotlinked every
  // image on i.imgur.com, and all of it — 12 card faces, the hero card, the "The
  // Clock Tower" rule card and the cardback — is mirrored under
  // public/evergreen-decks/art/zmGV/, with the snapshot's URLs rewritten to those
  // local paths. Nothing about this deck touches a remote host at runtime.
  //
  // The faces are loose ILLUSTRATIONS, not finished full-card renders, so they ride
  // per-card `imageUrl` through the generated card template (Cairne precedent), NOT
  // the full-bleed `cardImage` path Kenshiro/Luke/the Sith decks use.
  //
  // Public state contract: ONE counter, `TIME` (5 -> 0, max 5) — the Clock Tower
  // dial, registered on BOTH nameplate and token in HERO_STATE_COUNTERS. The deck's
  // second declared counter, `MITIGATION`, is engine bookkeeping and is deliberately
  // NOT registered (the registry is opt-in, so an unregistered counter renders
  // nowhere). No flags, no markers.
  "skull-kid": "zmGV",
};

/**
 * Public-flag HUD chips + fighter-token badges are unified in one registry — see
 * HERO_STATE_FLAGS in lib/pro/heroStateFlags.ts (issue #329). A single entry
 * there drives BOTH the nameplate pill and the board-token badge, so a new
 * flag-driven hero state needs ZERO component changes.
 */

/**
 * Inverse of HERO_DECK_IDS: unmatched.cards deck id -> server hero id. The ONE
 * place the landing (which speaks deck ids) crosses over to the game page (which
 * speaks server hero ids). Derived here so the mapping is never duplicated.
 */
export const DECK_HERO_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(HERO_DECK_IDS).map(([heroId, deckId]) => [deckId, heroId])
);

/** Art-matching title normalization. Exported for the evergreen-manifest test
 * proving a title with exotic whitespace (Baba Yaga's " Iron Teeth" begins
 * with a NON-BREAKING SPACE in both the API snapshot and the engine rules.ts)
 * still matches: JS trim() strips U+00A0 on both sides.
 *
 * Defined in the (dependency-free) seam module and re-exported here, because
 * the cosmetics registry keys on it too: the snapshot index and the treatment
 * lookup must normalize titles identically or a rim silently misses its card. */
export { norm };

export type ResolveCard = (instance: CardInstanceId) => DeckImportCardType | null;
/**
 * The card-cosmetics seam (design doc §7) — how ONE card looks, keyed per card
 * by `(heroId, title)` rather than per deck, because cosmetics are earned per
 * card. It answers the frozen snapshot's `cardImage` (matched on `norm(title)`)
 * PLUS the treatment equipped on that exact card, and every render path
 * inherits both, since all four render combinations already ask this seam
 * instead of reading `card.cardImage` themselves. See lib/pro/cardAppearance.ts.
 */
export type ResolveCardAppearance = (
  heroId: string,
  title: string
) => CardAppearance;
export type ResolveHero = (heroId: string) => DeckImportHeroType | null;
/**
 * Deck-level "extra rules" cards for a hero (issue #372) — e.g. Clone Troopers'
 * board cap. Distinct from hero.specialAbility; returns [] when the deck has
 * none or hasn't loaded, so callers render nothing extra.
 */
export type ResolveRuleCards = (heroId: string) => DeckImportRuleCardType[];
/**
 * Board-token portrait art for one fighter, resolved by hero id + kind (HERO vs
 * SIDEKICK). Returns the deck JSON's `tokenImageUrl` for that fighter, or null
 * when the deck has none (converted decks, or a snapshot that failed to load) —
 * the board then draws its initials-only token exactly as before.
 */
export type ResolveFighterToken = (
  heroId: string,
  kind: "HERO" | "SIDEKICK"
) => string | null;

interface HeroArt {
  cards: Record<string, DeckImportCardType>;
  hero: DeckImportHeroType;
  ruleCards: DeckImportRuleCardType[];
  heroTokenUrl: string | null;
  sidekickTokenUrl: string | null;
}

/**
 * Hero ids whose deck art the game should prefetch, derived from a STATE view.
 * Prefer the multiplayer `players[]` seats; if a (downgraded/rolling-deploy/
 * malformed) STATE arrives with an EMPTY players[], fall back to the legacy
 * duel `self`/`opponent` heroIds so art still loads on the seat-fallback board
 * (unbrewed-p2p #210). Dedupes; drops falsy ids; both empty -> []. Callers feed
 * this straight into useProCardArt, which keys its query on the sorted list, so
 * a later STATE that populates players[] changes the list and re-fires the fetch
 * on its own — no fire-once effect to reset.
 */
export function heroIdsForArt(view: {
  players: { heroId?: string | null }[];
  self?: { heroId?: string | null } | null;
  opponent?: { heroId?: string | null } | null;
}): string[] {
  const fromPlayers = view.players.map((p) => p.heroId).filter((h): h is string => !!h);
  if (fromPlayers.length > 0) return [...new Set(fromPlayers)];
  const legacy = [view.self?.heroId, view.opponent?.heroId].filter(
    (h): h is string => !!h
  );
  return [...new Set(legacy)];
}

export function useProCardArt(
  heroIds: string[],
  catalog: Record<CardDefId, CardMeta>,
  /**
   * Equipped cosmetics decoded from the seats' wire blobs (issue #615). Omitted
   * — by the sandbox surfaces and by any caller with no seats yet — means the
   * local debug registry decides, exactly as it did before the wire existed.
   */
  cosmetics?: SeatCosmetics | null
): {
  resolveCard: ResolveCard;
  resolveCardAppearance: ResolveCardAppearance;
  resolveHero: ResolveHero;
  resolveRuleCards: ResolveRuleCards;
  resolveFighterToken: ResolveFighterToken;
  isLoading: boolean;
} {
  const ids = [...new Set(heroIds)].sort();

  const { data, isLoading } = useQuery(
    ["pro-card-art", ids.join(",")],
    async () => {
      const byHero: Record<string, HeroArt> = {};
      await Promise.all(
        ids.map(async (heroId) => {
          const deckId = HERO_DECK_IDS[heroId];
          if (!deckId) return;
          // Snapshot only — no live-API fallback. A rules-locked hero's deck
          // art must be equally locked; a missing file is a build problem to
          // fix, not something to paper over with a live fetch.
          const res = await axios
            .get<DeckImportType>(`/evergreen-decks/${deckId}.json`)
            .catch(() => null);
          if (!res) return;
          const deck = res.data;
          const byTitle: Record<string, DeckImportCardType> = {};
          for (const card of deck.deck_data.cards) byTitle[norm(card.title)] = card;
          byHero[heroId] = {
            cards: byTitle,
            hero: deck.deck_data.hero,
            ruleCards: deck.deck_data.ruleCards ?? [],
            heroTokenUrl: deck.deck_data.hero.tokenImageUrl ?? null,
            sidekickTokenUrl: deck.deck_data.sidekick?.tokenImageUrl ?? null,
          };
        })
      );
      return byHero;
    },
    { enabled: ids.length > 0, staleTime: Infinity, retry: 1 }
  );

  // Equipped cosmetics (epic #610): the seats' wire loadouts first (#615), the
  // local debug registry for any hero that published none. Both are already in
  // memory and inert — a card that resolves no treatment renders base art and
  // NEVER waits on one.
  const resolveCardAppearance: ResolveCardAppearance = (heroId, title) =>
    cardAppearance(
      withRimTier(
        data?.[heroId]?.cards[norm(title)],
        cardRimForSeats(cosmetics, heroId, title)
      )
    );

  const resolveCard: ResolveCard = (instance) => {
    const defId = instance.split("#")[0];
    const heroId = defId.split("/")[0];
    const meta = catalog[defId];
    if (!meta || !data?.[heroId]) return null;
    const card = data[heroId].cards[norm(meta.title)] ?? null;
    if (!card) return null;
    // Face art AND treatment come from the seam, never straight off the
    // snapshot entry. This is the bridge that makes the per-card
    // `(heroId, title)` seam reach the renderers, which hold a resolved card
    // and no longer know its key — whatever the seam decides here is what every
    // Pro surface draws, in all four render combinations.
    //
    // Identity must stay stable, memoized renderers key on it: an un-upgraded
    // card is handed back untouched, and `withRimTier` memoizes its stamped
    // copy per (card, tier) so an upgraded one is the same object on every call
    // too. Only the tier actually CHANGING yields a new reference — which is
    // exactly when a re-render is wanted.
    const { cardImage, rimTier } = resolveCardAppearance(heroId, meta.title);
    const art =
      cardImage === (card.cardImage ?? null)
        ? card
        : { ...card, cardImage: cardImage ?? undefined };
    return withRimTier(art, rimTier);
  };

  const resolveHero: ResolveHero = (heroId) => data?.[heroId]?.hero ?? null;

  const resolveRuleCards: ResolveRuleCards = (heroId) =>
    data?.[heroId]?.ruleCards ?? [];

  const resolveFighterToken: ResolveFighterToken = (heroId, kind) => {
    const art = data?.[heroId];
    if (!art) return null;
    return (kind === "HERO" ? art.heroTokenUrl : art.sidekickTokenUrl) ?? null;
  };

  return {
    resolveCard,
    resolveCardAppearance,
    resolveHero,
    resolveRuleCards,
    resolveFighterToken,
    isLoading,
  };
}
