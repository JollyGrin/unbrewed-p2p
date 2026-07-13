/**
 * Battlefield-item + secret-passage board badges (protocol v17 / engine #156-#157).
 *
 * Pure presentation, matching the official Teen Spirit visual language:
 *   - combat item → PURPLE rounded square with the versatile glyph (a combat item
 *     attaches to any combat card played from the space).
 *   - scheme item → YELLOW rounded square with the scheme (lightning) glyph.
 *   - secret passage → a keyhole badge.
 *
 * The versatile + scheme glyph paths are copied VERBATIM from the card-factory
 * `IconSvg` (components/CardFactory/IconSvg.tsx) so the board badge and the printed
 * card icon can never drift. Callers size + position the badge; this only draws it.
 */
import { Box } from "@chakra-ui/react";

export type ItemBadgeKind = "combat" | "scheme";

// Purple combat / yellow scheme — the official token colors, tuned to stay legible
// over the parchment/purple board art and distinct from the gold move-highlight ring.
export const ITEM_BADGE_COLOR: Record<ItemBadgeKind, string> = {
  combat: "#7C4DBE",
  scheme: "#E4B106",
};

const VERSATILE_VIEWBOX = "0 0 7900 8020";
const VERSATILE_PATHS = [
  "M4233 7983 c-8 -21 -39 -94 -68 -163 -29 -69 -85 -201 -123 -295 -149 -362 -240 -584 -278 -677 -21 -54 -42 -97 -46 -95 -4 1 -109 79 -234 172 -125 94 -245 183 -268 199 -22 16 -45 34 -51 41 -5 7 -28 24 -50 38 -22 15 -74 52 -117 84 -42 32 -98 74 -125 93 -26 19 -73 54 -103 77 -30 23 -121 91 -201 150 -81 59 -195 144 -254 188 -184 138 -209 154 -220 144 -6 -6 -5 -25 3 -53 14 -53 182 -494 369 -966 47 -118 103 -262 124 -320 22 -58 46 -118 53 -135 7 -16 32 -77 54 -135 23 -58 80 -203 127 -324 47 -120 84 -221 81 -223 -3 -3 -11 -1 -18 3 -7 5 -18 9 -25 10 -11 2 -276 103 -335 128 -35 15 -92 37 -288 111 -69 27 -199 77 -290 112 -310 121 -337 132 -785 304 -203 78 -422 162 -485 186 -271 105 -331 123 -337 106 -8 -20 318 -343 1455 -1443 259 -250 471 -457 471 -460 0 -3 -149 -75 -332 -160 -1127 -524 -1250 -584 -1245 -608 3 -17 65 -33 178 -47 25 -3 56 -8 70 -10 56 -11 606 -97 620 -97 8 0 37 -4 64 -9 27 -5 196 -32 375 -60 179 -27 336 -53 348 -57 19 -6 1 -25 -145 -157 -91 -82 -276 -251 -412 -375 -279 -256 -479 -438 -1150 -1050 -544 -496 -640 -588 -640 -612 0 -29 0 -29 353 76 104 31 196 58 205 60 9 1 24 6 32 9 18 7 120 36 146 41 11 3 33 9 49 16 17 6 32 12 35 12 3 0 10 2 15 4 40 13 395 114 410 117 11 2 27 7 35 10 24 10 253 76 275 79 11 2 25 6 30 10 12 7 185 57 212 61 10 1 23 5 28 9 12 7 94 30 115 32 9 1 20 5 25 8 12 7 264 80 285 83 8 1 22 5 30 9 42 18 445 131 448 126 1 -4 -67 -204 -152 -446 -543 -1544 -656 -1870 -656 -1895 0 -41 38 -21 175 93 11 9 53 44 92 76 40 33 79 66 87 74 8 7 31 27 52 43 21 17 54 44 73 61 48 42 379 318 415 346 16 13 39 32 52 43 12 11 40 34 60 50 21 17 50 42 64 56 48 49 328 278 333 273 3 -3 10 3 16 14 11 22 138 127 152 127 5 0 9 4 9 8 -1 12 91 86 104 84 5 -1 10 3 11 9 0 12 113 110 118 103 2 -2 50 -110 107 -239 137 -313 149 -338 357 -798 31 -67 60 -125 64 -128 4 -2 13 4 19 15 9 18 11 824 10 6679 l0 1012 -21 0 c-14 0 -25 -11 -36 -37z",
  "M4954 7818 c-12 -19 -18 -7438 -7 -7449 7 -7 164 20 469 80 253 50 475 93 494 96 19 2 111 20 203 40 93 19 171 34 175 33 4 -1 14 1 22 5 17 6 893 178 930 182 14 1 32 5 40 8 14 5 357 73 417 82 15 3 66 13 113 22 l85 18 0 1300 c0 1387 -3 1475 -49 1705 -14 69 -27 136 -28 150 -2 14 -7 31 -11 37 -5 7 -6 17 -2 22 3 5 0 13 -6 16 -5 4 -8 13 -5 21 3 7 1 16 -3 19 -8 4 -24 61 -26 90 0 6 -3 15 -6 20 -4 6 -25 73 -49 150 -24 77 -51 158 -61 181 -11 22 -19 45 -19 52 0 6 -6 26 -14 44 -13 30 -81 192 -109 262 -16 39 -221 449 -250 501 -13 22 -36 63 -51 90 -72 126 -307 476 -415 617 -429 561 -979 1068 -1626 1498 -119 80 -186 120 -199 120 -3 0 -8 -5 -12 -12z",
];

const SCHEME_VIEWBOX = "0 0 5190 12910";
const SCHEME_PATH =
  "M73 12883 c7 -35 182 -616 858 -2847 640 -2111 1029 -3406 1029 -3421 0 -22 -140 -25 -1044 -25 -490 0 -897 -4 -904 -9 -14 -9 12 -122 968 -4226 549 -2356 532 -2286 556 -2296 50 -18 3564 -73 3564 -55 0 8 -243 505 -1080 2206 -1046 2127 -1236 2517 -1228 2525 4 5 700 -7 1513 -25 582 -13 885 -13 885 0 0 12 -117 200 -1463 2362 -2940 4720 -3639 5838 -3650 5838 -5 0 -7 -12 -4 -27z";

/** The bare glyph SVG (no square). The paths are copied VERBATIM from the
 *  card-factory `IconSvg`, which renders them with NO transform in a standard
 *  top-left SVG coordinate space — so we do the same (no flip). Reused by the
 *  editor's canvas overlay too. */
export const ItemGlyph = ({ kind, fill = "#fff" }: { kind: ItemBadgeKind; fill?: string }) => {
  const isCombat = kind === "combat";
  return (
    <svg viewBox={isCombat ? VERSATILE_VIEWBOX : SCHEME_VIEWBOX} width="66%" height="66%" fill={fill}>
      {isCombat ? VERSATILE_PATHS.map((d, i) => <path key={i} d={d} />) : <path d={SCHEME_PATH} />}
    </svg>
  );
};

/** A colored square item badge (fills its positioned parent). `title` shows the
 *  item label + effect on hover / long-press. */
export const ItemBadge = ({ kind, title }: { kind: ItemBadgeKind; title?: string }) => (
  <Box
    w="100%"
    h="100%"
    borderRadius="22%"
    bg={ITEM_BADGE_COLOR[kind]}
    border="1.5px solid rgba(255,255,255,0.9)"
    boxShadow="0 1px 4px rgba(0,0,0,0.6)"
    display="flex"
    alignItems="center"
    justifyContent="center"
    title={title}
  >
    <ItemGlyph kind={kind} />
  </Box>
);

/** A keyhole badge for a secret-passage space (engine #156). */
export const PassageBadge = ({ title = "Secret passage" }: { title?: string }) => (
  <Box
    w="100%"
    h="100%"
    borderRadius="50%"
    bg="#1E2A3A"
    border="1.5px solid rgba(255,255,255,0.9)"
    boxShadow="0 1px 4px rgba(0,0,0,0.6)"
    display="flex"
    alignItems="center"
    justifyContent="center"
    title={title}
  >
    <svg viewBox="0 0 24 24" width="60%" height="60%" fill="#E8D9B8">
      {/* keyhole: circular bow over a tapered stem */}
      <circle cx="12" cy="9" r="4.2" />
      <path d="M9.4 12.5 L14.6 12.5 L16 20 L8 20 Z" />
    </svg>
  </Box>
);
