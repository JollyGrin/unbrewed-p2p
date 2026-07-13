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
   * Visibility class, mirroring the server's HeroListing.tier. Set to
   * `"reflavored"` for a baseline deck that a spice remix has replaced: it is
   * hidden from the default roster and only appears (with a ` ★` suffix) under
   * `?debug`. The server also omits reflavored heroes from a non-debug
   * listing, so this static tag is what lets the client hide the tile even
   * before/without a live roster. Omitted = a normally-visible deck.
   */
  tier?: HeroTier;
};

/**
 * Most-liked community decks on unmatched.cards.
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
    cardbackUrl: "https://i.imgur.com/Hl5FPM6.png",
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
    cardbackUrl: "https://imgur.com/uiwaAGu.jpeg",
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
    cardbackUrl: "https://imgur.com/E4lqW1b.png",
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
    cardbackUrl: "https://i.imgur.com/9qP1I2P.png",
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
    cardbackUrl: "https://i.imgur.com/5ucSw85.png",
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
    // suppresses the lobby deep-link). Card art renders from the R2 TTS sprite
    // sheet via the snapshot's per-card `cardImage`; cardback is the TTS cover,
    // self-hosted on R2 and mirrored into the evergreen snapshot appearance.
    id: "grievous",
    name: "General Grievous",
    hero: "General Grievous",
    author: "Inforce",
    likes: 0,
    highlightColour: "#8a9199",
    cardbackUrl:
      "https://pub-89a6241d8d86432d87db88c05869507a.r2.dev/9861/42326b0498/tts/cover.png",
    original: true,
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
    cardbackUrl: "https://unbrewed.xyz/evergreen-decks/art/malfurion-stormrage/cardback.webp",
    original: true,
  },
];
