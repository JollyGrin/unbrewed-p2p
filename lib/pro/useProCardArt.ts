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
  // EVERGREEN IN THE STRICT SENSE (Dean, 2026-08-22): every image — 12 card faces,
  // the hero card, the "The Clocktower" rule card and the cardback — is mirrored
  // under public/evergreen-decks/art/zmGV/, with the snapshot's URLs rewritten to
  // those local paths. Nothing about this deck touches a remote host at runtime.
  //
  // The ART, as with Kenshiro, comes from a DIFFERENT publication of the same deck:
  // the authors' the-unmatched.club 2748, the only place the FINISHED full-card
  // renders live (zmGV carries loose illustration crops instead). They are pulled
  // from that page's /export/__data.json — the per-card `replacementImage` set, at
  // the club's own 1488x2079 — self-hosted per #446 and drawn FULL-BLEED via
  // cardImage. This deck must never fall back to the generated card template, which
  // cannot reproduce the authors' frame, and must never be routed to the
  // art-generation pipeline.
  //
  // The club export carries no card text and its quantities diverge from zmGV, so
  // each render was mapped to its title by the title PRINTED ON THE FACE, not by its
  // (type, value, boost, count) tuple — Final Hour and Your true Face are separable
  // only by count, and the club's count is the one that disagrees. See the deck note
  // for both divergences; the snapshot follows zmGV/the engine on each.
  //
  // Public state contract: ONE counter, `TIME` (5 -> 0, max 5) — the Clock Tower
  // dial, registered on BOTH nameplate and token in HERO_STATE_COUNTERS. The deck's
  // second declared counter, `MITIGATION`, is engine bookkeeping and is deliberately
  // NOT registered (the registry is opt-in, so an unregistered counter renders
  // nowhere). No flags, no markers.
  "skull-kid": "zmGV",
  // Cecil Palmer — Welcome To Night Vale (issue #668 ↔ engine #456/#455): community
  // deck 37z5 by AndSushi, the BROADCAST TOKEN deck. The deck id is the real
  // unmatched.cards one (version OGgotQEeJ "Rework"), which is also the source
  // cecil-palmer.rules.ts was converted from, so the snapshot's rules fields are
  // engine-exact.
  //
  // EVERGREEN IN THE STRICT SENSE (Dean, 2026-08-22): every image — 13 card faces,
  // the hero card, the BROADCAST TOKENS rule card, the cover and the cardback — is
  // mirrored under public/evergreen-decks/art/37z5/, with the snapshot's URLs
  // rewritten to those local paths. Nothing about this deck touches a remote host at
  // runtime.
  //
  // The ART, as with Kenshiro and Skull Kid, comes from a DIFFERENT publication of
  // the same deck: the author's the-unmatched.club 13514, the only place the FINISHED
  // full-card renders live. They are pulled from that page's /export/__data.json —
  // the club's own rendered `cardPreviewUrls` at 1488x2079, NOT the author's
  // lower-resolution imgur `replacementImage` set — self-hosted per #446 and drawn
  // FULL-BLEED via cardImage. This deck must never fall back to the generated card
  // template, which cannot reproduce the author's frame, and must never be routed to
  // the art-generation pipeline.
  //
  // Two pairs of faces are separable only by reading them, so each render was mapped
  // to its title by the title PRINTED ON THE FACE (and cross-checked against the club
  // export's own card headings): Eternal Scout Badge and Interloper! are both DEFENCE
  // 2/1 x2, and Kill your double / Here's something odd are both VERSATILE 3/2,
  // separable only by count. A (type, value, boost, count) match would have silently
  // swapped the first pair.
  //
  // Public state contract: ONE counter, `BROADCAST` (0 -> 6, max 6) — the dial the
  // rule card prints, registered on BOTH nameplate and token in HERO_STATE_COUNTERS.
  // No flags, no markers, no piles. The counter is ALSO the price of the deck's
  // bought attack range (lib/pro/rangePurchase.ts) — the engine auto-deducts the
  // shortfall on DECLARE_ATTACK, so the client explains the spend before and after.
  "cecil-palmer": "37z5",
  // Boba Fett (issue #671 ↔ engine #477, epic engine#464): the-unmatched.club deck
  // 7289 by Inforce — the BOUNTY deck. TUC decks have no unmatched.cards page, so
  // the deck id is ours (Darth Vader / Luke precedent) and the committed snapshot is
  // the only source. Rules fields (titles, types, values, boosts, quantities) are
  // read off the club's `/print/__data.json` — the bare page route serves
  // `cards: []`, only /print/ carries them.
  //
  // ⚠️ ART IS LAB-ONLY AND MUST NOT GRADUATE. The card faces are the AUTHOR'S OWN
  // club renders (this deck's /export/__data.json `cardPreviewUrls`), mirrored under
  // public/evergreen-decks/art/boba-fett/ so the deck can actually be SEEN and
  // playtested on a local engine. The illustrations inside those renders are scraped
  // third-party comic art across EIGHT hosts — Pinterest, a Bing image-search CDN, a
  // Lucasfilm CDN, Reddit, two comic shops — none of it the author's to license and
  // none of it ours. They are here to make the lab build legible, nothing else, and
  // the deck-art pipeline ticket MUST replace every one of them before this hero
  // leaves tier `lab`. Do NOT read this deck as an art precedent: Kenshiro, Skull Kid
  // and Cecil mirror renders their authors actually made.
  //
  // One exception inside the exception: *Slave I: FiresPray Strife* has no usable
  // club render (its preview hash 400s after a late edit), so it — and the SEISMIC
  // CHARGE printed on it, which never had a face of its own — render through the
  // GENERATED TEMPLATE with the author's illustration in the art panel, rather than
  // full-bleed like the other thirteen.
  //
  // The cardback and the hero-token crop are the author's own and are the only two
  // images here NOT on the replace-before-graduation list. Fennec Shand has no token
  // art at all — her board token falls back to initials.
  //
  // Public state contract, verified against boba-fett.rules.ts @c3fa75a. NO
  // counters. FOUR one-card set-aside piles, one per BOUNTY card (BOUNTY_PAYMENT /
  // BOUNTY_INHIBITOR / BOUNTY_CARBONITE / BOUNTY_FLAMETHROWER — the engine's own
  // BOBA_BOUNTY_PILES, which its header names as the client contract), registered
  // in HERO_STATE_COUNTERS — and unlike every other pile in the registry these are
  // HOSTED ON THE VICTIM'S SEAT, not Boba's (protocol v0.49.0 cross-player tuck),
  // so they render under the OPPONENT's nameplate. ONE flag, `SLAVE_I` — Boba is
  // off the board and lands next turn swinging SEISMIC CHARGE — registered
  // nameplate-only, because while it is set he has no token to badge. Plus the
  // DENY:* action-denial flags (INHIBITOR's `denyFlag DRAW`) and the generic PINNED
  // fighter status (CARBONITE's `pin`), neither of which is Boba-specific.
  //
  // SEISMIC CHARGE is a printed attack that is NOT one of the 30 deck cards: it
  // lives in the snapshot's `extraCards` so a face resolves for it without polluting
  // the deck list, its stats or the rules-lock digest.
  "boba-fett": "boba-fett",
  // Ellen Ripley — Aliens (issue #681 ↔ engine #494/#493): the-unmatched.club deck
  // 2304 by MrBrownieDL. A CLUB-ONLY deck — there is no unmatched.cards mirror at
  // all — so the deck id is ours (Boba Fett / Darth Vader precedent) and the
  // committed snapshot is the only source. Rules fields (titles, types, values,
  // boosts, quantities) are read off the club's `/export/__data.json`, which is the
  // one route that still serves the `cards` array to anonymous clients.
  //
  // ONE divergence from the published club record, and it is the AUTHOR'S OWN
  // correction: FEINT is x2, not the x3 the record shows. The record sums to 31 and
  // the engine refuses anything but 30; asked in the Discord thread MrBrownieDL
  // answered x2 (2026-08-23). Everything else is field-for-field the club's.
  //
  // EVERGREEN IN THE STRICT SENSE: every image — 12 card faces, the hero card, the
  // cardback and both board tokens — is the author's own artwork, mirrored under
  // public/evergreen-decks/art/ellen-ripley/ off his own imgur uploads and the
  // club's own file store, with every URL rewritten local. Nothing here touches a remote
  // host at runtime. The faces are FULL-CARD renders drawn full-bleed via
  // cardImage (Kenshiro / Skull Kid / Cecil precedent): this deck must never fall
  // back to the generated template, which cannot reproduce the author's frame, and
  // must never be routed to the art-generation pipeline. Ripley's board token is a
  // crop of the author's cardback; Newt's is the author's own round portrait.
  //
  // Public state contract, verified against ellen-ripley.rules.ts @ee9c276: NOTHING.
  // No counters, no flags, no piles, no markers, no rule cards — so there is no
  // HERO_STATE_FLAGS / HERO_STATE_COUNTERS entry for this hero, deliberately.
  // What IS new is a protocol event: v34's `COMBAT_DEFENDER_CHANGED`, which *GET
  // BEHIND ME* emits when Ripley and Newt swap and the OTHER fighter becomes the
  // defender (see lib/pro/combatDefender.ts).
  "ellen-ripley": "ellen-ripley",
  // Appa + Momo (issue #737 ↔ engine #522/#525): community deck jw9q by JBentz,
  // served at tier `lab` pending the author's playtest. Appa is LARGE with
  // attacker-side reach (Kong precedent) and Momo is a SMALL sidekick at move 4;
  // both are HeroDef/sidekick stats, not ops.
  //
  // ART: the author's OWN finished renders — the complete 14-file PNG set JBentz
  // posted in the Discord #pro-deck-request thread on 2026-08-23 — converted to
  // webp and self-hosted under public/evergreen-decks/art/appa/, drawn full-bleed
  // via cardImage. The jw9q payload's own imageUrl fields are uncredited
  // third-party hotlinks and are deliberately NOT carried over; this deck must
  // never be routed to the art-generation pipeline.
  //
  // The printed cards are the source of truth where they disagree with the
  // payload (Dean's ruling, 2026-09-02) — three rule-level differences, all three
  // being fixed on the engine side in PR #524 so the two stay in step:
  //   • "Sky Bison" is titled THE LAST SKY BISON on the card. That is the snapshot
  //     title AND the string the art index is keyed on, so this one MUST land with
  //     the engine rename or that card resolves no face.
  //   • Air Nomads: "shares all their zones with your fighter" (singular), not the
  //     payload's plural "your fighters".
  //   • Team Avatar: "shares a space with another fighter", not "a friendly fighter".
  //
  // Public state contract, verified against appa.rules.ts @b7ab6ca: NOTHING. The
  // deck's whole op vocabulary is if / optional / dealDamage / bindFighter / move /
  // modifyValue / chooseOne — no counters, no flags, no piles, no markers, no rule
  // cards — so there is deliberately no HERO_STATE_FLAGS / HERO_STATE_COUNTERS
  // entry. What it DOES exercise is v34's `COMBAT_DEFENDER_CHANGED`, and from the
  // other side of the table: *Hallucinations* substitutes among the OPPONENT's
  // fighters (see lib/pro/combatDefender.ts).
  appa: "jw9q",
  // Jason Voorhees (issue #749 ↔ engine #541/#543): community deck DOPE, Hubaris's
  // HSR remaster (vZY7DT_B7v), served at tier `lab`. SOLO hero — no sidekick, no
  // LARGE, no ranged. Template art for now: the payload's i.ibb.co imageUrls and
  // cardback are uncredited third-party hotlinks and are deliberately NOT carried
  // over (jw9q precedent); all-caps verbatim titles are the deck's print, not a bug.
  "jason-voorhees": "DOPE",
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
          // The 30-card deck, plus (issue #671) any printed card the engine can
          // put into a combat that is NOT in the deck — Boba's SEISMIC CHARGE,
          // named by *Slave I*. `extraCards` is art-resolution ONLY: it never
          // reaches the pool, the stats or the digest, but without it a real
          // combat card would fall through to the raw-instance-id text fallback.
          for (const card of deck.deck_data.cards) byTitle[norm(card.title)] = card;
          for (const card of deck.deck_data.extraCards ?? []) byTitle[norm(card.title)] = card;
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
