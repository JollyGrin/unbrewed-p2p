/**
 * Copy + data for the "Four tables" landing page (unbrewed-p2p-1353).
 *
 * Rule for this file: no hand-typed counts. Every number a visitor reads comes
 * from a catalog in the repo (the bot tier ladder, the tournament size lists
 * here; MAP_CATALOG and the sandbox map list via ./catalog.ts at build time) or
 * from an API at run time (the Pro roster, the Discord widget). If a fact has
 * no source it is said in words.
 */
import { PRO_FORMATS } from "@/lib/pro/multiplayerPlaytest";
import { TIER_ORDER, botTierMeta } from "@/lib/pro/botTiers";
import { TIER_UNLOCK } from "@/lib/pro/tierUnlock";
import { RR_SIZES, SIZES } from "@/lib/tournaments/createForm";
import { vsParamFor } from "@/lib/pro/vsParam";
import { DISCORD_FALLBACK_INVITE } from "@/lib/hooks/useDiscordWidget";

export const GITHUB_URL = "https://github.com/JollyGrin/unbrewed-p2p";
export const DISCORD_URL = DISCORD_FALLBACK_INVITE;

/* ------------------------------------------------------------------ counts */

/** Player-facing tier names, weakest → strongest: "Easy" … "Prodigy". */
export const BOT_LADDER = TIER_ORDER.map((tier) =>
  botTierMeta(tier).label.replace(/ bot$/, ""),
);
const STRONGEST_TIER = BOT_LADDER[BOT_LADDER.length - 1];
const UNLOCK_TIER = botTierMeta(TIER_UNLOCK.requires).label.replace(/ bot$/, "");

/** "Duel · 3P FFA · 2v2" */
export const FORMAT_LABELS = PRO_FORMATS.map((format) => format.label);

const joinOr = (items: readonly (string | number)[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

/** "single elimination for 4, 8 or 16, or round robin for 4–6" */
export const TOURNAMENT_SIZES_TEXT = `single elimination for ${joinOr(SIZES)}, or round robin for ${RR_SIZES[0]}–${RR_SIZES[RR_SIZES.length - 1]}`;

export const BOT_LADDER_TEXT = `${BOT_LADDER.slice(0, -1).join(", ")}, plus ${STRONGEST_TIER} once you've beaten ${UNLOCK_TIER} ${TIER_UNLOCK.wins} times`;

/** The solo option's deep link: the create screen with a Medium bot seated. */
export const VS_BOT_HREF = `/pro/game?vs=${vsParamFor("medium")}`;

/* ------------------------------------------------------------ four tables */

export type TableId = "sandbox" | "pro" | "table" | "irl";

export interface TableCard {
  id: TableId;
  name: string;
  tag: string;
  /** gold tag = rules enforced; the rest read as soft */
  tagStrong?: boolean;
  best: string;
  text: string;
  chips: string[];
  cta: string;
  href: string;
  /** Still in public/landing; 16:10, 1280×800. The IRL card draws a phone instead. */
  image?: { src: string; alt: string };
}

export const TABLES: TableCard[] = [
  {
    id: "sandbox",
    name: "Sandbox",
    tag: "Rules: you",
    best: "Best for playtesting your own deck",
    text: "A shared 2D table with hand, dice and tokens. Nothing is enforced, so any deck or map works on day one.",
    chips: ["Head-to-head", "Any deck", "Any image as map"],
    cta: "Open a table",
    href: "/connect",
    image: {
      src: "/landing/sandbox-2d.webp",
      alt: "A sandbox match on the City Docks map: two fighters' health, a fanned hand of cards, two dice and tokens on the board",
    },
  },
  {
    id: "pro",
    name: "Pro",
    tag: "Rules: enforced",
    tagStrong: true,
    best: "Best for a real match, right now",
    text: "A referee server allows only legal moves, does the combat math and keeps hands hidden. Fight a bot or a person.",
    chips: [
      `${BOT_LADDER.length} bot tiers`,
      FORMAT_LABELS.join(" · "),
      "Replays",
      "Quick Match",
    ],
    cta: "Play vs a bot",
    href: "/pro",
    image: {
      src: "/landing/pro-tabletop.webp",
      alt: "Pro's tabletop view: a skeleton-dinosaur miniature standing on the island board",
    },
  },
  {
    id: "table",
    name: "3D table",
    tag: "Beta",
    best: "Best for the feel of the real thing",
    text: "A lobby that spawns a 3D table at table.place — deal, drag, flip, stack; minis for the heroes that have them.",
    chips: ["A table is a link", "Minis", "Same decks"],
    cta: "Set up a 3D table",
    href: "/table",
    image: {
      src: "/landing/table-3d.webp",
      alt: "A 3D table seen from a three-quarter angle: the island board on green felt with decks and discard piles beside it",
    },
  },
  {
    id: "irl",
    name: "IRL mode",
    tag: "Offline",
    best: "Best for a printed board and a friend across the table",
    text: "Your phone is the deck tray: hand, deck, discard and health. The board and the opponent are real.",
    chips: ["Installable", "Works offline", "No print needed"],
    cta: "Open IRL mode",
    href: "/irl",
  },
];

/* --------------------------------------------------------- Play now chooser */

export interface ChooserOption {
  title: string;
  detail: string;
  href: string;
}

/** Solo first: it is the only option that needs no second person. */
export const CHOOSER_OPTIONS: ChooserOption[] = [
  {
    title: "Play a bot, right now",
    detail: "Pro · rules enforced · no one else needed",
    href: VS_BOT_HREF,
  },
  {
    title: "Play a friend online, any deck",
    detail: "Sandbox · name a lobby, send the link",
    href: "/connect",
  },
  {
    title: "Set up a 3D table",
    detail: "Pick decks and a map, share one table link",
    href: "/table",
  },
  {
    title: "Use my phone at a real board",
    detail: "IRL mode · hand, deck and health, offline",
    href: "/irl",
  },
];

/* ---------------------------------------------------------- "I want to…" */

export interface Intent {
  key: string;
  label: string;
  title: string;
  text: string;
  cta: string;
  href: string;
}

export const INTENTS: Intent[] = [
  {
    key: "test",
    label: "playtest my deck",
    title: "Sandbox, 2D",
    text: "Paste your unmatched.cards or Unmatched Labs link into your bag, name a lobby, send the invite. No conversion needed, and the rules are whatever you say they are.",
    cta: "Open your bag",
    href: "/bag",
  },
  {
    key: "bot",
    label: "play right now, alone",
    title: "Pro, vs a bot",
    text: `Pick a fighter and start. Bots run ${BOT_LADDER_TEXT}. Easy and Medium are practice and never touch your record.`,
    cta: "Play vs a bot",
    href: VS_BOT_HREF,
  },
  {
    key: "friend",
    label: "play a friend",
    title: "Pro or Sandbox",
    text: "In Pro, create a room and send the join link — or hit Quick Match to find a stranger. If your deck isn't in Pro's roster yet, the sandbox takes any deck.",
    cta: "Challenge a friend",
    href: "/pro",
  },
  {
    key: "feel",
    label: "feel the real thing",
    title: "3D table",
    text: "Pick both decks and a map, and the lobby spawns a 3D table at table.place. Walk around the board, flip cards, stack tokens. One link per seat.",
    cta: "Set up a 3D table",
    href: "/table",
  },
  {
    key: "irl",
    label: "use my phone at a real board",
    title: "IRL mode",
    text: "Your phone becomes hand, deck, discard and health tracker. The board and your opponent are real. Add it to your home screen and it works offline.",
    cta: "Open IRL mode",
    href: "/irl",
  },
  {
    key: "tourney",
    label: "run a tournament",
    title: "Tournaments",
    text: `Sign in with Discord, pick ${TOURNAMENT_SIZES_TEXT}, and share the bracket link. Players ready up on their own time; results and replays land on the bracket.`,
    cta: "See tournaments",
    href: "/tournaments",
  },
];

/* ---------------------------------------------------------------- Pro band */

/** `proBoards`: board titles from the build-time catalog (./catalog.ts). */
export const proFeatures = (proBoards: string[]): { title: string; text: string }[] => [
  {
    title: `Bots at ${BOT_LADDER.length} levels`,
    text: `${BOT_LADDER_TEXT}. Search-based, no cloud model, never peeks at your hand.`,
  },
  {
    title: "Duel, free-for-all or teams",
    text: `${FORMAT_LABELS.join(", ")}. An optional move timer keeps games brisk. Mulligans and items on or off.`,
  },
  {
    title: "Flat board or tabletop",
    text: "Switch any match to a 3D tabletop view with sculpted minis, sprites or flat tokens. Touch controls on phones.",
  },
  {
    title: "Every match, a replay",
    text: "Finished games save automatically. Scrub them in god-view with every hand face-up, or share a replay link.",
  },
  {
    title: `${proBoards.length} boards, or yours`,
    text: `${proBoards.slice(0, 4).join(", ")} and more, each tagged with the formats it supports. Import a map JSON for your own.`,
  },
  {
    title: "Quick Match",
    text: "One click into the public lobby browser. A chime when a match is found; play a bot while you wait.",
  },
];

/* ---------------------------------------------------------- bring any deck */

export const IMPORT_SOURCES: { key: string; name: string; text: string; href?: string }[] = [
  { key: "Cards", name: "unmatched.cards", text: "Paste the deck code or URL", href: "https://unmatched.cards/decks" },
  { key: "Labs", name: "Unmatched Labs", text: "Paste a share link from unmatchedlabs.com", href: "https://unmatchedlabs.com" },
  { key: "Club", name: "the-unmatched.club", text: "Finished art decks, straight in", href: "https://the-unmatched.club" },
  { key: "TTS", name: "Tabletop Simulator export", text: "Or raw JSON" },
  { key: "Images", name: "Card image URLs", text: "A list of image links becomes a deck" },
];

/* --------------------------------------------------------------------- FAQ */

export const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Unbrewed free?",
    a: "Yes. Completely free and open-source. No subscriptions, no paywalls, no account required. Signing in with Discord is optional: it syncs your bag across devices and tracks your Pro record.",
  },
  {
    q: "What's the difference between Sandbox and Pro?",
    a: "Sandbox is a shared table: you move cards and tokens and apply the rules yourselves, so any deck works immediately. Pro is rules-enforced: a referee server checks every move and does the combat math, which is why its roster is hand-converted and grows a few heroes at a time.",
  },
  {
    q: "Can I play solo?",
    a: `Yes, in Pro. Bots run ${BOT_LADDER_TEXT}. Easy and Medium are practice and never touch your record.`,
  },
  {
    q: "How do I import a deck from unmatched.cards or Unmatched Labs?",
    a: "Open your bag and paste the deck code, URL or Labs share link. It loads instantly into the sandbox, the 3D table and IRL mode. Pro decks come from the converted roster.",
  },
  {
    q: "Can I import decks from the-unmatched.club or Tabletop Simulator?",
    a: "Yes. Decks published on the-unmatched.club, Tabletop Simulator exports, raw JSON and lists of card image URLs all load into your bag.",
  },
  {
    q: "Can I play official Unmatched decks?",
    a: "Unbrewed is for fan-made decks. It is an unofficial hobby project and is not affiliated with or endorsed by Restoration Games, the publisher of Unmatched.",
  },
  {
    q: "Can I use my own map?",
    a: "Yes. Any image URL can become a sandbox map, and you can swap it mid-game. Pro takes a map JSON for a custom board.",
  },
  {
    q: "What is the 3D table?",
    a: "Our lobby at /table spawns a 3D table at table.place, which we also build. Pick both decks and a map, send your friend their seat link, and deal, drag, flip and stack on a real-looking table, with minis for the heroes that have them. Pro matches can also switch to a tabletop view.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. Pro has touch controls and a phone-sized combat panel, and IRL mode installs to your home screen and works offline.",
  },
  {
    q: "How do I run a tournament?",
    a: `Sign in with Discord, pick ${TOURNAMENT_SIZES_TEXT}, and share the bracket link. Players ready up when they're free and results post themselves.`,
  },
  {
    q: "Do my decks sync between my phone and my computer?",
    a: "Sign in with Discord (optional) and the decks in your bag are shared across every device you sign in on. Without signing in, your bag stays local to that browser.",
  },
];

/* ------------------------------------------------------------------ footer */

export interface FooterLink {
  label: string;
  href: string;
}

export const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Play",
    links: [
      { label: "Sandbox", href: "/connect" },
      { label: "Pro", href: "/pro" },
      { label: "3D table", href: "/table" },
      { label: "IRL mode", href: "/irl" },
      { label: "Join a game", href: "/join" },
    ],
  },
  {
    title: "Compete",
    links: [
      { label: "Tournaments", href: "/tournaments" },
      { label: "Leaderboard", href: "/leaderboard" },
      { label: "Heroes", href: "/heroes" },
      { label: "Stats", href: "/stats" },
      { label: "Collection", href: "/collection" },
    ],
  },
  {
    title: "Decks & maps",
    links: [
      { label: "Your bag", href: "/bag" },
      { label: "unmatched.cards", href: "https://unmatched.cards/decks" },
      { label: "Unmatched Labs", href: "https://unmatchedlabs.com" },
      { label: "the-unmatched.club", href: "https://the-unmatched.club" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Changelog", href: "/changelog" },
      { label: "Discord", href: DISCORD_URL },
      { label: "GitHub", href: GITHUB_URL },
      { label: "Report a bug", href: `${GITHUB_URL}/issues/new` },
    ],
  },
];
