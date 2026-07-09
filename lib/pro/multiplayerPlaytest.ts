/**
 * Minimal Pro multiplayer playtest affordances.
 *
 * These are product/UI helpers only: format ids are server-authored and the map
 * is a plain custom board sent to the authoritative server for validation. The
 * client still never derives legal moves or relationships.
 */
import type { ProMapDef } from "./protocol";

export type ProFormatId = "duel" | "ffa-3" | "team-2v2";

export interface ProFormatChoice {
  id: ProFormatId;
  label: string;
  detail: string;
  requiredPlayers: number;
}

export const PRO_FORMATS: ProFormatChoice[] = [
  { id: "duel", label: "Duel", detail: "standard 1v1", requiredPlayers: 2 },
  { id: "ffa-3", label: "3P FFA", detail: "playtest free-for-all", requiredPlayers: 3 },
  { id: "team-2v2", label: "2v2", detail: "playtest teams", requiredPlayers: 4 },
];

export const formatChoice = (id: string | null | undefined): ProFormatChoice =>
  PRO_FORMATS.find((f) => f.id === id) ?? PRO_FORMATS[0]!;

interface MapFormatSupportDef {
  id: string;
  formatId: ProFormatId;
  label: string;
  description?: string;
  seats: Record<string, { startSlot: number; label?: string }>;
}

type PlaytestMapDef = ProMapDef & { supportedFormats: MapFormatSupportDef[] };

const boardSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1560" viewBox="0 0 1200 780">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="75%">
      <stop offset="0" stop-color="#5b3467"/>
      <stop offset="0.58" stop-color="#392244"/>
      <stop offset="1" stop-color="#1f1328"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>
  <rect width="1200" height="780" rx="36" fill="url(#bg)"/>
  <g opacity="0.48" filter="url(#soft)">
    <path d="M600 45 L330 150 L505 330 L695 330 L870 150 Z" fill="#3b8beb"/>
    <path d="M70 300 L330 150 L505 330 L505 505 L220 655 Z" fill="#2f9e68"/>
    <path d="M1130 300 L870 150 L695 330 L695 505 L980 655 Z" fill="#c0449e"/>
    <path d="M220 655 L505 505 L695 505 L980 655 L600 740 Z" fill="#e0a82e"/>
    <path d="M505 330 L695 330 L695 505 L505 505 Z" fill="#7b61ff"/>
  </g>
  <g fill="none" stroke="#e7cc98" stroke-width="8" stroke-linecap="round" opacity="0.45">
    <path d="M600 70 L420 140 L330 270 L160 300 L220 655 L430 680 L600 705 L770 680 L980 655 L1040 300 L870 270 L780 140 Z"/>
    <path d="M330 270 L505 330 L695 330 L870 270"/>
    <path d="M220 655 L505 505 L695 505 L980 655"/>
    <path d="M505 330 L505 505 M695 330 L695 505 M505 420 L695 420"/>
  </g>
  <g fill="#140817" opacity="0.42">
    <circle cx="600" cy="420" r="74"/>
    <circle cx="330" cy="270" r="40"/>
    <circle cx="870" cy="270" r="40"/>
    <circle cx="220" cy="655" r="40"/>
    <circle cx="980" cy="655" r="40"/>
  </g>
  <text x="600" y="52" text-anchor="middle" fill="#e7cc98" font-family="Arial" font-size="28" letter-spacing="5" opacity="0.9">MULTIPLAYER PLAYTEST ARENA</text>
</svg>
`);

export const MULTIPLAYER_PLAYTEST_MAP: PlaytestMapDef = {
  schemaVersion: "1.0",
  id: "multiplayer-arena-playtest",
  meta: {
    title: "Multiplayer Arena Playtest",
    minPlayers: 2,
    maxPlayers: 4,
    specialRules: false,
    imageUrl: `data:image/svg+xml,${boardSvg}`,
    imageWidth: 2400,
    imageHeight: 1560,
    spaceDiameter: 0.052,
  },
  supportedFormats: [
    {
      id: "duel-arena-playtest",
      formatId: "duel",
      label: "Duel",
      description: "Use start slots 1 and 2 for a standard duel.",
      seats: { A1: { startSlot: 1 }, B1: { startSlot: 2 } },
    },
    {
      id: "ffa-3-arena-playtest",
      formatId: "ffa-3",
      label: "3 Player Free For All",
      description: "Three independent players use start slots 1, 2, and 3.",
      seats: { A1: { startSlot: 1 }, B1: { startSlot: 2 }, C1: { startSlot: 3 } },
    },
    {
      id: "team-2v2-arena-playtest",
      formatId: "team-2v2",
      label: "2v2 Teams",
      description: "Four players use start slots 1 through 4.",
      seats: {
        A1: { startSlot: 1 },
        B1: { startSlot: 2 },
        A2: { startSlot: 3 },
        B2: { startSlot: 4 },
      },
    },
  ],
  zones: [
    { id: "top", color: "#3B8BEB", label: "North" },
    { id: "left", color: "#2F9E68", label: "West" },
    { id: "right", color: "#C0449E", label: "East" },
    { id: "bottom", color: "#E0A82E", label: "South" },
    { id: "center", color: "#7B61FF", label: "Center" },
  ],
  spaces: [
    { id: "n1", x: 0.5, y: 0.08, zones: ["top"], adjacentTo: ["n2", "n3", "n4"], start: { slot: 3 } },
    { id: "n2", x: 0.38, y: 0.16, zones: ["top"], adjacentTo: ["n1", "n4", "nw"] },
    { id: "n3", x: 0.62, y: 0.16, zones: ["top"], adjacentTo: ["n1", "n4", "ne"] },
    { id: "n4", x: 0.5, y: 0.22, zones: ["top", "center"], adjacentTo: ["n1", "n2", "n3", "n5", "c2"] },
    { id: "n5", x: 0.5, y: 0.3, zones: ["top", "center"], adjacentTo: ["n4", "c1", "c2", "c3"] },

    { id: "nw", x: 0.24, y: 0.25, zones: ["top", "left"], adjacentTo: ["n2", "w2", "w5"] },
    { id: "ne", x: 0.76, y: 0.25, zones: ["top", "right"], adjacentTo: ["n3", "e2", "e5"] },

    { id: "w1", x: 0.1, y: 0.5, zones: ["left"], adjacentTo: ["w2", "w3", "w4"], start: { slot: 1 } },
    { id: "w2", x: 0.2, y: 0.42, zones: ["left"], adjacentTo: ["nw", "w1", "w4", "w5"] },
    { id: "w3", x: 0.2, y: 0.58, zones: ["left"], adjacentTo: ["sw", "w1", "w4", "w6"] },
    { id: "w4", x: 0.3, y: 0.5, zones: ["left", "center"], adjacentTo: ["w1", "w2", "w3", "c4"] },
    { id: "w5", x: 0.32, y: 0.35, zones: ["left", "center"], adjacentTo: ["nw", "w2", "c1", "c4"] },
    { id: "w6", x: 0.32, y: 0.65, zones: ["left", "bottom", "center"], adjacentTo: ["sw", "w3", "c4", "c7"] },

    { id: "e1", x: 0.9, y: 0.5, zones: ["right"], adjacentTo: ["e2", "e3", "e4"], start: { slot: 2 } },
    { id: "e2", x: 0.8, y: 0.42, zones: ["right"], adjacentTo: ["ne", "e1", "e4", "e5"] },
    { id: "e3", x: 0.8, y: 0.58, zones: ["right"], adjacentTo: ["se", "e1", "e4", "e6"] },
    { id: "e4", x: 0.7, y: 0.5, zones: ["right", "center"], adjacentTo: ["e1", "e2", "e3", "c6"] },
    { id: "e5", x: 0.68, y: 0.35, zones: ["right", "center"], adjacentTo: ["ne", "e2", "c3", "c6"] },
    { id: "e6", x: 0.68, y: 0.65, zones: ["right", "bottom", "center"], adjacentTo: ["se", "e3", "c6", "c9"] },

    { id: "c1", x: 0.4, y: 0.36, zones: ["top", "left", "center"], adjacentTo: ["n5", "w5", "c2", "c4"] },
    { id: "c2", x: 0.5, y: 0.36, zones: ["top", "center"], adjacentTo: ["n4", "n5", "c1", "c3", "c5"] },
    { id: "c3", x: 0.6, y: 0.36, zones: ["top", "right", "center"], adjacentTo: ["n5", "e5", "c2", "c6"] },
    { id: "c4", x: 0.4, y: 0.5, zones: ["left", "center"], adjacentTo: ["w4", "w5", "w6", "c1", "c5", "c7"] },
    { id: "c5", x: 0.5, y: 0.5, zones: ["center"], adjacentTo: ["c2", "c4", "c6", "c8"] },
    { id: "c6", x: 0.6, y: 0.5, zones: ["right", "center"], adjacentTo: ["e4", "e5", "e6", "c3", "c5", "c9"] },
    { id: "c7", x: 0.4, y: 0.64, zones: ["bottom", "left", "center"], adjacentTo: ["sw", "w6", "c4", "c8", "s5"] },
    { id: "c8", x: 0.5, y: 0.64, zones: ["bottom", "center"], adjacentTo: ["c5", "c7", "c9", "s4", "s5"] },
    { id: "c9", x: 0.6, y: 0.64, zones: ["bottom", "right", "center"], adjacentTo: ["se", "e6", "c6", "c8", "s5"] },

    { id: "sw", x: 0.24, y: 0.75, zones: ["left", "bottom"], adjacentTo: ["w3", "w6", "c7", "s2"] },
    { id: "se", x: 0.76, y: 0.75, zones: ["right", "bottom"], adjacentTo: ["e3", "e6", "c9", "s3"] },

    { id: "s1", x: 0.5, y: 0.92, zones: ["bottom"], adjacentTo: ["s2", "s3", "s4"], start: { slot: 4 } },
    { id: "s2", x: 0.38, y: 0.84, zones: ["bottom"], adjacentTo: ["sw", "s1", "s4"] },
    { id: "s3", x: 0.62, y: 0.84, zones: ["bottom"], adjacentTo: ["se", "s1", "s4"] },
    { id: "s4", x: 0.5, y: 0.78, zones: ["bottom", "center"], adjacentTo: ["s1", "s2", "s3", "s5", "c8"] },
    { id: "s5", x: 0.5, y: 0.7, zones: ["bottom", "center"], adjacentTo: ["s4", "c7", "c8", "c9"] },
  ],
};
