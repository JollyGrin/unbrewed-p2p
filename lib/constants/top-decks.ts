import { HexColorString } from "@/lib/generic.type";
import { HeroTier } from "@/lib/pro/protocol";

export type PopularDeckMeta = {
  id: string;
  name: string;
  hero: string;
  author: string;
  likes: number;
  highlightColour: HexColorString;
  cardbackUrl?: string;
  /**
   * Unbrewed evergreen original: the deck id is ours, no unmatched.cards page
   * exists (don't link there), and the committed snapshot is the only source.
   */
  original?: boolean;
  /**
   * External attribution page for this deck, when it lives somewhere other than
   * unmatched.cards (e.g. the-unmatched.club). Takes precedence over the derived
   * unmatched.cards link, so an evergreen `original` deck that DOES have a source
   * page can still credit + link to it instead of rendering as plain text.
   */
  sourceUrl?: string;
  /**
   * Public caution badge for playable-but-unsettled decks. Lab decks may still
   * be served by the Pro engine, but their balance/mechanics are not final.
   */
  lab?: boolean;
  /**
   * Visibility/support class, mirroring the server's HeroListing.tier. Set to
   * `"reflavored"` for a baseline deck that a spice remix has replaced or
   * `"lab"` for a playable-but-unsettled deck. Reflavored decks are hidden from
   * the default roster and only appear under `?debug`; lab decks stay public but
   * carry a caution badge. Omitted = a normally-visible deck.
   */
  tier?: HeroTier;
};

/**
 * Curated Pro landing roster, seeded from most-liked community decks on unmatched.cards
 * plus rules-ready decks we want surfaced for demos.
 * Snapshot taken 2026-07-02 — refresh occasionally via
 * https://unmatched.cards/api/decks?sortBy=likes&sortDesc=true&perPage=40
 */
export const POPULAR_DECKS: PopularDeckMeta[] = [
  {
    id: "lDOM",
    name: "The Mandalorian",
    hero: "The Mandalorian",
    author: "msw7c",
    likes: 144,
    highlightColour: "#408080",
    cardbackUrl: "/evergreen-decks/art/lDOM/cardback.png",
  },
  {
    id: "x2_V",
    name: "Batman",
    hero: "Batman",
    author: "Inforce",
    likes: 1,
    highlightColour: "#003761",
    lab: true,
    cardbackUrl: "https://i.imgur.com/xGc33g5.png",
  },
  {
    id: "nPnv",
    name: "Nancy Drew",
    hero: "Nancy Drew",
    author: "TheRealNomiMalonely",
    likes: 23,
    highlightColour: "#fada0b",
    cardbackUrl: "https://i.imgur.com/Wh9hG5d.jpeg",
  },
  {
    // Pro deck (unmatched.cards xBvn / version ojN2f49QE) — server hero
    // specter-knight. Graduated from the lab 2026-08-11 alongside the engine's
    // tier promotion (additional-defense mechanics settled in live play).
    id: "xBvn",
    name: "Specter Knight (Shovel Knight)",
    hero: "Specter Knight",
    author: "XtraReason",
    likes: 3,
    highlightColour: "#b51a00",
    cardbackUrl: "https://sm.ign.com/t/ign_nordic/review/s/shovel-kni/shovel-knight-treasure-trove-review_cb9b.1280.jpg",
  },
  {
    id: "LmYw",
    name: "John Wick",
    hero: "john wick",
    author: "Drakmorten",
    likes: 137,
    highlightColour: "#121311",
    cardbackUrl: "https://i.ibb.co/C9MzW1w/Card-Back-Red-1-1.jpg",
  },
  {
    id: "lB-k",
    name: "The Devil",
    hero: "The Devil",
    author: "BennyBoyBl",
    likes: 126,
    highlightColour: "#831000",
    cardbackUrl: "https://i.postimg.cc/JhQqH9jS/Untitled-Artwork-15.jpg",
  },
  {
    id: "G_nr",
    name: "Schrödinger's Cat",
    hero: "Schrödinger's Cat",
    author: "Darthcauley",
    likes: 112,
    highlightColour: "#65a498",
    cardbackUrl: "https://i.imgur.com/cRqgolk.png",
  },
  {
    id: "lQz7",
    name: "Victor Frankenstein",
    hero: "victor frankenstein",
    author: "this_is_Marko",
    likes: 110,
    highlightColour: "#cac41c",
    cardbackUrl: "https://i.imgur.com/NY00l5g.png",
  },
  {
    id: "zPmA",
    name: "Death (Puss in Boots)",
    hero: "Death",
    author: "Jowee",
    likes: 96,
    highlightColour: "#860001",
    cardbackUrl: "https://i.imgur.com/NhatNHz.png",
  },
  {
    id: "l91K",
    name: "Darth Vader",
    hero: "Darth Vader",
    author: "TAYTERTOTS",
    likes: 93,
    highlightColour: "#828282",
    cardbackUrl: "https://imgur.com/oRLcls0.jpeg",
  },
  {
    id: "ddZY",
    name: "Goldhorn",
    hero: "GOLDHORN",
    author: "Lusk",
    likes: 81,
    highlightColour: "#7bcebb",
    cardbackUrl: "https://i.imgur.com/WKLfZVU.png",
  },
  {
    id: "LWNZ",
    name: "Gingerbread man",
    hero: "gingerbread man",
    author: "TAYTERTOTS",
    likes: 75,
    highlightColour: "#ab224b",
    cardbackUrl: "/evergreen-decks/art/LWNZ/cardback.jpeg",
  },
  {
    id: "p1Ew",
    name: "The Flash",
    hero: "The Flash",
    author: "uplankton",
    likes: 69,
    highlightColour: "#b80000",
    cardbackUrl: "https://i.imgur.com/VXHO1vC.jpg",
  },
  {
    id: "RnYZ",
    name: "Jason Voorhees",
    hero: "Jason Voorhees",
    author: "JackNorth",
    likes: 68,
    highlightColour: "#7a0000",
    cardbackUrl:
      "http://cloud-3.steamusercontent.com/ugc/2000216344332403958/3EEC5D45ABD6E694B5D8B6E095DF485FA3BE08CB/",
  },
  {
    id: "J9En",
    name: "The Batman",
    hero: "The Batman",
    author: "uplankton",
    likes: 64,
    highlightColour: "#bb0707",
    cardbackUrl: "https://i.imgur.com/zTvbjVr.jpg",
  },
  {
    id: "vrKW",
    name: "Deku",
    hero: "Deku",
    author: "DreamCarver",
    likes: 63,
    highlightColour: "#67daa1",
    cardbackUrl: "https://i.imgur.com/oIgIu6J.jpg",
  },
  {
    id: "kdKM",
    name: "King Kong",
    hero: "King Kong",
    author: "Blakpantha",
    likes: 63,
    highlightColour: "#973434",
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/king-kong/cardback.webp",
  },
  {
    id: "XjyQ",
    name: "The Predator",
    hero: "The Predator",
    author: "JackNorth",
    likes: 59,
    highlightColour: "#07220b",
    cardbackUrl: "https://i.imgur.com/Ov0kDih.png",
  },
  {
    id: "L53Q",
    name: "King Solomon",
    hero: "King Solomon",
    author: "Blakpantha",
    likes: 58,
    highlightColour: "#006d8f",
    cardbackUrl: "https://i.imgur.com/pyGVkMb.png",
  },
  {
    id: "yAJ-",
    name: "Baba Yaga",
    hero: "Baba Yaga",
    author: "Idan",
    likes: 56,
    highlightColour: "#6f7a66",
    cardbackUrl: "/evergreen-decks/art/yAJ-/cardback.png",
  },
  {
    id: "QkB1",
    name: "Buster Keaton",
    hero: "Buster Keaton",
    author: "Mr_Shakespeare",
    likes: 0,
    highlightColour: "#3a3a3a",
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/QkB1/cardback.webp",
  },
  {
    id: "L6Z1",
    name: "The Rocketeer",
    hero: "Rocketeer",
    author: "Busy_Mason",
    likes: 55,
    highlightColour: "#753100",
    cardbackUrl: "https://i.ibb.co/C0JwhDz/Card-Backs-1-1.png",
  },
  {
    id: "Jr21",
    name: "Voldemort (The Wizarding World)",
    hero: "Voldemort",
    author: "AndSushi",
    likes: 53,
    highlightColour: "#0f4d1f",
    cardbackUrl: "https://i.imgur.com/66aic7o.png",
  },
  {
    id: "kW1k",
    name: "The Terminator",
    hero: "THE TERMINATOR",
    author: "Hubaris",
    likes: 53,
    highlightColour: "#051a29",
    cardbackUrl: "https://i.ibb.co/tXMx6Hg/image-2021-08-06-004421.png",
  },
  {
    id: "72Dz",
    name: "Pinocchio",
    hero: "Pinocchio",
    author: "Darthcauley",
    likes: 51,
    highlightColour: "#b73e15",
    cardbackUrl: "https://i.imgur.com/0iGmQ3K.png",
  },
  {
    id: "pkW2",
    name: "One Punch Man",
    hero: "One Punch Man",
    author: "uplankton",
    likes: 51,
    highlightColour: "#f9d834",
    cardbackUrl: "https://i.imgur.com/eiwFvLl.png",
  },
  {
    id: "RD78",
    name: "Headless Horseman",
    hero: "Headless Horseman",
    author: "Tsak",
    likes: 48,
    highlightColour: "#e26403",
    cardbackUrl: "https://i.imgur.com/NDIe8vr.png",
  },
  {
    id: "-2n5",
    name: "Sans",
    hero: "Sans",
    author: "DreamCarver",
    likes: 46,
    highlightColour: "#3657ae",
    cardbackUrl: "https://i.imgur.com/DPOixgv.png",
  },
  {
    id: "Rj5Q",
    name: "The Juggernaut",
    hero: "JUGGERNAUT",
    author: "JackNorth",
    likes: 45,
    highlightColour: "#8a0000",
    cardbackUrl: "https://i.imgur.com/wTp8apa.png",
  },
  {
    id: "-n3G",
    name: "Hannibal Lecter",
    hero: "Hannibal",
    author: "Indubitably14",
    likes: 44,
    highlightColour: "#590f09",
    cardbackUrl:
      "https://i.ibb.co/x1wMq0J/f951f04e0be5a4f5dbbc6c335023c142.jpg",
  },
  {
    id: "JwQ_",
    name: "Doctor Who",
    hero: "The Doctor",
    author: "Blakpantha",
    likes: 43,
    highlightColour: "#236aa4",
    cardbackUrl: "https://i.imgur.com/iudfbbC.png",
  },
  {
    id: "7Gq2",
    name: "Beowulf (The Bro Edition)",
    hero: "Beowulf",
    author: "DreamCarver",
    likes: 42,
    highlightColour: "#607874",
    cardbackUrl: "https://i.imgur.com/wsRXA6V.png",
  },
  {
    id: "6G31",
    name: "Ghostface",
    hero: "GHOSTFACE (2x)",
    author: "Hubaris",
    likes: 42,
    highlightColour: "#141414",
    cardbackUrl: "https://i.ibb.co/MpMPP8X/image-2021-11-23-142516.png",
  },
  {
    id: "pWdg",
    name: "Darth Vader",
    hero: "DARTH VADER",
    author: "JackNorth",
    likes: 41,
    highlightColour: "#121212",
    cardbackUrl: "https://i.imgur.com/xEKFZSN.png",
  },
  {
    // Not a top-40 deck — included because it's Pro-playable (unbrewed-p2p #76)
    id: "pk1x",
    name: "Thrall",
    hero: "Thrall",
    author: "JollyGrin",
    likes: 2,
    highlightColour: "#296888",
    // self-hosted (upstream deck has none); also patched into both snapshots
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/pk1x/cardback.webp",
  },
  {
    // Not a top-40 deck — included because it's Pro-playable (server hero r2-d2)
    id: "3jgd",
    name: "R2-D2",
    hero: "R2-D2",
    author: "Inforce",
    likes: 6,
    highlightColour: "#297bff",
    cardbackUrl: "/evergreen-decks/art/3jgd/cardback.png",
  },
  {
    // Not a top-40 deck — included because it's Pro-playable (server hero
    // triceratops, the first LARGE fighter: melee reach 2 both ways).
    id: "1Y5J",
    name: "Triceratops (Jurassic)",
    hero: "Triceratops",
    author: "Nitetrio",
    likes: 9,
    highlightColour: "#ec6a13",
    cardbackUrl: "/evergreen-decks/art/1Y5J/cardback.png",
  },
  {
    // In-the-lab Pro deck (unmatched.cards DJQB / version BJE_cG1PZ) — server
    // hero clone-troopers. Listed in Search Community Decks with a lab caution.
    id: "DJQB",
    name: "Clone Troopers",
    hero: "Clone Troopers",
    author: "Inforce",
    likes: 1,
    highlightColour: "#0000aa",
    cardbackUrl: "https://i.imgur.com/ummrmL0.png",
    lab: true,
    tier: "lab",
  },
  {
    // Evergreen original (no unmatched.cards page): King Taranis, the
    // Stormquenched — server hero king-taranis.
    // Reflavored/baseline deck (tier === 'reflavored'): hidden from the default
    // roster and bot rotation, visible only under ?debug (see ProLanding).
    id: "taranis",
    name: "King Taranis",
    hero: "King Taranis",
    author: "unbrewed",
    likes: 0,
    highlightColour: "#c9962b",
    // self-hosted; also patched into the evergreen snapshot appearance
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/taranis/cardback.webp",
    original: true,
    // Replaced on the default roster by `taranis-spice`; visible only under ?debug.
    tier: "reflavored",
  },
  {
    // Spice remix of King Taranis (display name "King Taranis") — server hero
    // king-taranis-spice. Reuses King Taranis's cardback and per-card art until
    // dedicated spice art lands.
    id: "taranis-spice",
    name: "King Taranis",
    hero: "King Taranis",
    author: "unbrewed",
    likes: 0,
    highlightColour: "#c9962b",
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/taranis/cardback.webp",
    original: true,
  },
  {
    // Evergreen original: Thetis, the Ebb-and-Flow — server hero thetis.
    // Reflavored/baseline deck (tier === 'reflavored'): hidden from the default
    // roster and bot rotation, visible only under ?debug (see ProLanding).
    id: "thetis",
    name: "Thetis",
    hero: "Thetis",
    author: "unbrewed",
    likes: 0,
    highlightColour: "#2ec4b6",
    // self-hosted; also patched into the evergreen snapshot appearance
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/thetis/cardback.webp",
    original: true,
    // Replaced on the default roster by `thetis-spice`; visible only under ?debug.
    tier: "reflavored",
  },
  {
    // Spice remix of Thetis (display name "Thetis") — server hero thetis-spice.
    // This is the deck shown on the default roster; reuses Thetis's cardback and
    // per-card art until dedicated spice art lands.
    id: "thetis-spice",
    name: "Thetis",
    hero: "Thetis",
    author: "unbrewed",
    likes: 0,
    highlightColour: "#2ec4b6",
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/thetis/cardback.webp",
    original: true,
  },
  {
    // Evergreen original: The Piper of the Underroads — server hero
    // piper-of-the-underroads.
    // Reflavored/baseline deck (tier === 'reflavored'): hidden from the default
    // roster and bot rotation, visible only under ?debug (see ProLanding).
    id: "piper",
    name: "The Piper of the Underroads",
    hero: "The Piper of the Underroads",
    author: "unbrewed",
    likes: 0,
    highlightColour: "#b06f2e",
    // self-hosted; also patched into the evergreen snapshot appearance
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/piper/cardback.webp",
    original: true,
    // Replaced on the default roster by `piper-spice`; visible only under ?debug.
    tier: "reflavored",
  },
  {
    // Spice remix of The Piper of the Underroads (display name shared) — server
    // hero piper-of-the-underroads-spice. Reuses Piper's cardback and per-card
    // art until dedicated spice art lands.
    id: "piper-spice",
    name: "The Piper of the Underroads",
    hero: "The Piper of the Underroads",
    author: "unbrewed",
    likes: 0,
    highlightColour: "#b06f2e",
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/piper/cardback.webp",
    original: true,
  },
  {
    // Evergreen original: The Hollow Oak — server hero hollow-oak.
    // Reflavored/baseline deck (tier === 'reflavored'): hidden from the default
    // roster and bot rotation, visible only under ?debug (see ProLanding).
    id: "hollow-oak",
    name: "The Hollow Oak",
    hero: "The Hollow Oak",
    author: "unbrewed",
    likes: 0,
    highlightColour: "#5f7d3b",
    // self-hosted; also patched into the evergreen snapshot appearance
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/hollow-oak/cardback.webp",
    original: true,
    // Replaced on the default roster by `hollow-oak-spice`; visible only under ?debug.
    tier: "reflavored",
  },
  {
    // Spice remix of The Hollow Oak (display name shared) — server hero
    // hollow-oak-spice. Reuses Hollow Oak's cardback and per-card art until
    // dedicated spice art lands.
    id: "hollow-oak-spice",
    name: "The Hollow Oak",
    hero: "The Hollow Oak",
    author: "unbrewed",
    likes: 0,
    highlightColour: "#5f7d3b",
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/hollow-oak/cardback.webp",
    original: true,
  },
  {
    // Evergreen original: General Grievous — a fan creation by Inforce (issue
    // #288 ↔ engine #160; polish #291). No unmatched.cards page (original: true
    // suppresses the lobby deep-link), but it does have a real source page on
    // the-unmatched.club, so `sourceUrl` restores the attribution link (#428).
    // Card art renders from the R2 TTS sprite sheet via the snapshot's per-card
    // `cardImage`; cardback is the TTS cover, self-hosted on R2 and mirrored into
    // the evergreen snapshot appearance.
    id: "grievous",
    name: "General Grievous",
    hero: "General Grievous",
    author: "Inforce",
    likes: 0,
    highlightColour: "#8a9199",
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/grievous/cardback.webp",
    original: true,
    sourceUrl: "https://www.the-unmatched.club/c/heroes/general-grievous.9861",
  },
  {
    // Evergreen original: Malfurion Stormrage — server hero malfurion-stormrage.
    // Self-hosted generated art lives in public/evergreen-decks/art/malfurion-stormrage.
    id: "malfurion-stormrage",
    name: "Malfurion Stormrage",
    hero: "Malfurion Stormrage",
    author: "unbrewed",
    likes: 0,
    highlightColour: "#2fbf71",
    cardbackUrl: "/evergreen-decks/art/malfurion-stormrage/cardback.webp",
    original: true,
  },
  {
    // In-the-lab Pro deck (unmatched.cards p82X / version EZYf44) — server
    // hero cairne-bloodhoof. RAGE counter economy with spendCounterForValue
    // (v0.25.0); Taunt card flagged NEEDS-PRIMITIVE (empty blocks).
    id: "p82X",
    name: "Cairne Bloodhoof",
    hero: "Cairne Bloodhoof",
    author: "JollyGrin",
    sourceUrl: "https://unmatched.cards/decks/p82X/versions/EZYf44",
    likes: 2,
    highlightColour: "#ce9272",
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/p82X/cardback.webp",
    lab: true,
    tier: "lab",
  },
  {
    // In-the-lab Pro deck: Darth Vader — the-unmatched.club deck 4173 by Inforce
    // (issue #533 ↔ engine #288). Like Grievous this is a TUC deck with no
    // unmatched.cards page, so `original: true` suppresses the lobby deep-link
    // and `sourceUrl` carries the real attribution target. Card faces are
    // self-hosted full-bleed via the snapshot's per-card `cardImage`.
    id: "darth-vader",
    name: "Darth Vader",
    hero: "Darth Vader",
    author: "Inforce",
    likes: 0,
    highlightColour: "#420000",
    // Repo-relative (malfurion precedent): the tile art is served out of this
    // app's own public/, so it renders on localhost and preview builds too —
    // an absolute unbrewed.xyz URL only resolves once prod has the asset.
    cardbackUrl: "/evergreen-decks/art/darth-vader/cardback.webp",
    original: true,
    sourceUrl: "https://www.the-unmatched.club/c/heroes/darth-vader.4173",
    lab: true,
    tier: "lab",
  },
  {
    // TUC community deck by Rogue RaiderOne (source ID 9090, engine PR #290).
    // Sith Assassin action-economy hero, no sidekick. No unmatched.cards page
    // (original: true suppresses the lobby deep-link); sourceUrl credits TUC.
    id: "darth-maul",
    name: "Darth Maul",
    hero: "Darth Maul",
    author: "Rogue RaiderOne",
    likes: 0,
    highlightColour: "#a50909",
    cardbackUrl: "/evergreen-decks/art/darth-maul/cardback.webp",
    original: true,
    sourceUrl: "https://www.the-unmatched.club/c/heroes/darth-maul.9090",
    // Engine serves this hero at tier `lab` (server/content.ts), so the landing
    // already badges it from the live listing. These two mirror that locally for
    // the consumers that read the tile instead: `lab` drives the create-screen
    // caution badge (pages/pro/game.tsx), `tier` filters the deck out of the
    // sandbox community picker (components/Bag/PopularDecks) and invite copy
    // (lib/invite.ts) — same shape as the Darth Vader tile above.
    lab: true,
    tier: "lab",
  },
  {
    // TUC community deck 12306 by Rogue RaiderOne (engine #296) — the set-aside
    // TRAINING pile hero, balanced by its author. No unmatched.cards page, so
    // `original: true` suppresses the lobby deep-link and `sourceUrl` credits TUC.
    id: "luke-skywalker",
    name: "Luke Skywalker",
    hero: "Luke Skywalker",
    author: "Rogue RaiderOne",
    likes: 0,
    highlightColour: "#146312",
    // Repo-relative, like the two Sith tiles above: served out of this app's own
    // public/, so tile art renders on localhost and preview builds too.
    cardbackUrl: "/evergreen-decks/art/luke-skywalker/cardback.webp",
    original: true,
    sourceUrl: "https://www.the-unmatched.club/c/heroes/luke-skywalker.12306",
    // Engine serves this hero at tier `lab` (server/content.ts) — mirrored here
    // for the tile-reading consumers, same as the two Sith tiles above.
    lab: true,
    tier: "lab",
  },
  {
    // Evergreen ORIGINAL: The Doppelgänger — server hero doppelganger (engine #303,
    // the tie/UNKNOWN niche deck). Self-hosted POSTER-STYLE art in
    // public/evergreen-decks/art/doppelganger (#544/#547). `original: true` — no
    // unmatched.cards page exists, so no deep-link.
    id: "doppelganger",
    name: "The Doppelgänger",
    hero: "The Doppelgänger",
    author: "unbrewed",
    likes: 0,
    // Cold silver from the run's palette; no sibling deck's highlight is silver.
    highlightColour: "#9fb4c4",
    // The 2:3 cardback, like every sibling deck. The art hand-off (#544) offered
    // swapping the roster tile to the square 1024² `deck-select.webp` as "a one-line
    // POPULAR_DECKS change", but this ONE field is `bgImage`+cover for THREE surfaces,
    // not just the thumbnail: the /pro roster tile (ProLanding), the /bag Popular
    // decks tile, AND the tall ~28rem hero splash in the /pro/game picker (both the
    // hover preview and the locked pick). A 1024² square cover-crops to a narrow
    // centre strip in that splash, losing most of the composition, whereas the 2:3
    // cardback fits it almost exactly. Optimising the thumbnail would cost the larger
    // surface, so `deck-select.webp` + `splash.webp` stay shipped-but-unwired until a
    // surface can address them separately.
    cardbackUrl: "/evergreen-decks/art/doppelganger/cardback.webp",
    original: true,
    // Engine serves this hero at tier `lab` (server/content.ts: candidate deck,
    // in the lab while the no-winner economy gets live playtesting).
    lab: true,
    tier: "lab",
  },
  {
    // In-the-lab Pro deck (unmatched.cards 5jGPM / version qOz5NtMP3P) — server
    // hero gerry-the-isopod (issue #553 ↔ engine #316/#317/#318). The colony deck:
    // four interchangeable Larrys spent as costs, and the first consumer of the
    // v26 board-object CORPSE kind. Real unmatched.cards page, so no `original`
    // and the lobby deep-link is derived from `id`.
    id: "5jGPM",
    name: "Gerry the Isopod",
    hero: "Gerry the Isopod",
    author: "Emperourrrrr",
    sourceUrl: "https://unmatched.cards/decks/5jGPM/versions/qOz5NtMP3P",
    likes: 0,
    // The deck's own borderColour/highlightColour from the author's appearance block.
    highlightColour: "#5050a0",
    // Repo-relative (malfurion/Vader precedent): the tile art is served out of this
    // app's own public/, so it renders on localhost and preview builds too.
    cardbackUrl: "/evergreen-decks/art/5jGPM/cardback.webp",
    // Engine serves this hero at tier `lab` (server/content.ts): out of random bot
    // rotation and the eval corpora while the corpse economy and the small-fighter
    // divergence get live playtesting.
    lab: true,
    tier: "lab",
  },
  {
    // In-the-lab Pro deck — server hero kenshiro (issue #596 ↔ engine #362, riding
    // the #359 followup-queue / #360 per-fighter-marker train). TUC community deck
    // 12653 by Calton White; no unmatched.cards page, so `original: true` suppresses
    // the lobby deep-link and `sourceUrl` credits TUC.
    id: "kenshiro",
    name: "Kenshiro",
    hero: "Kenshiro",
    author: "Calton White",
    likes: 0,
    // Hokuto crimson, from the deck's own card banners. No sibling tile is this red
    // (Cairne's rage-crimson lives on a counter badge, not a tile).
    highlightColour: "#b3232c",
    // Repo-relative (Luke/Vader precedent): served out of this app's own public/, so
    // the tile + picker splash render on localhost and preview builds too. The
    // author's own `cardsBack` render, mirrored off i.imgur.com per #446.
    cardbackUrl: "/evergreen-decks/art/kenshiro/cardback.webp",
    original: true,
    sourceUrl: "https://www.the-unmatched.club/c/heroes/kenshiro.12653",
    // Engine serves this hero at tier `lab` (server/content.ts): the whole Kenshiro
    // train lands in the lab while the HOKUTO chain and MERIDIAN ping get playtested.
    lab: true,
    tier: "lab",
  },
];
