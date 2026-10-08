/**
 * The bracket the ad follows: invented handles on dev-login accounts of a
 * local stack (no real player appears), and the results that run actually
 * produced. The capture script (research/tournaments-promo/capture.mjs) seeds
 * and plays exactly this bracket; the hook redraws it.
 */

/** Same colours, same order, as the capture's monogram avatars. */
const AV_COLORS = ["#7A4C9C", "#2F7D5B", "#C4572E", "#3F55C9", "#B8892A", "#A23B6B", "#3C7F8C", "#6B5B3E", "#8E3B3B", "#4E6E2E", "#5C4A8A", "#9A5B2A"];
const HANDLES = ["hollowmoon", "bramble", "quill", "mossback", "tinder", "saltmarsh", "kestrel", "juniper", "cobble"];
export const avatarColor = (handle: string) =>
  AV_COLORS[Math.max(0, HANDLES.indexOf(handle)) % AV_COLORS.length];

export const TOURNAMENT_NAME = "Autumn Skirmish";
export const CHAMPION = "bramble";

/** Round 1 top to bottom, slot A then B; every later round is the winners. */
export const ROUNDS: readonly (readonly [string, string])[][] = [
  [
    ["mossback", "cobble"],
    ["kestrel", "juniper"],
    ["tinder", "quill"],
    ["saltmarsh", "bramble"],
  ],
  [
    ["cobble", "juniper"],
    ["quill", "bramble"],
  ],
  [["juniper", "bramble"]],
];

export const winnerOf = (round: number, index: number): string =>
  round + 1 < ROUNDS.length
    ? ROUNDS[round + 1][Math.floor(index / 2)][index % 2]
    : CHAMPION;
