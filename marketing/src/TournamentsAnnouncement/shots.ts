import { staticFile } from "remotion";
import capture from "./capture.json";

/**
 * Everything the scenes know about the captures. Plates are full-page
 * screenshots of the running app (1280 CSS px wide, 2x) and `capture.json`
 * holds the rect of every element the ad moves, measured in the same page at
 * the same moment, so a piece cut from a plate lands where the app drew it.
 *
 * All of it comes from a local stack on origin/main with dev-login accounts
 * (research/tournaments-promo/capture.mjs). Two things were changed in the
 * browser before the page drew, nothing in the app: each handle's avatar is a
 * monogram (the dev accounts all carry Discord's default logo), and the share
 * link shows unbrewed.xyz instead of the local host.
 */
export type Rect = { x: number; y: number; w: number; h: number; text: string };
type Plate = { size: { w: number; h: number }; pieces: Record<string, Rect[]> };

export const PAGE_WIDTH = 1280;
export const FRAME = { width: 1920, height: 1080 } as const;

const PLATES = {
  bracketOpen: capture.bracketOpen,
  bracketLive: capture.bracketLive,
  bracketSemis: capture.bracketSemis,
  bracketSf2Live: capture.bracketSf2Live,
  bracketFinalOpen: capture.bracketFinalOpen,
  bracketDone: capture.bracketDone,
  orgMatch: capture.orgMatch,
  sf2Done: capture.sf2Done,
  signupPlayer: capture.signupPlayer,
  ...Object.fromEntries(capture.signup.map((p, i) => [`signup${i + 1}`, p])),
} as Record<string, Plate>;

export type PageName = string;

const FILES: Record<string, string> = {
  bracketOpen: "bracket-open",
  bracketLive: "bracket-live",
  bracketSemis: "bracket-semis",
  bracketSf2Live: "bracket-sf2live",
  bracketFinalOpen: "bracket-finalopen",
  bracketDone: "bracket-done",
  orgMatch: "org-match",
  sf2Done: "sf2-done",
  signupPlayer: "signup-player",
};

export const pageHeight = (page: PageName) => PLATES[page].size.h;
export const plate = (page: PageName, _layer: "full" | "bare" = "full") =>
  staticFile(`tournaments/${FILES[page] ?? page.replace(/^signup(\d)$/, "signup-$1")}.webp`);
export const pieces = (page: PageName, id: string): Rect[] =>
  PLATES[page].pieces[id] ?? [];

/** A match card by its label ("QF4", "SF2", "FINAL") on a bracket plate. */
export const cell = (page: PageName, label: string): Rect => {
  const hit = pieces(page, "match-cell").find((c) => c.text.startsWith(label));
  if (!hit) throw new Error(`no ${label} on ${page}`);
  return hit;
};

/** The recordings: 1920×1080 at 30fps; marks are seconds into the clip. */
const clip = (name: string) => staticFile(`tournaments/clip-${name}.mp4`);
export const CLIP = {
  create: { src: clip("create"), marks: capture.create },
  share: { src: clip("share"), marks: capture.share },
  start: { src: clip("start"), marks: capture.start },
  ready: { src: clip("ready"), marks: capture.ready },
  join: { src: clip("join"), marks: capture.join },
  board: { src: clip("board"), marks: capture.board },
  advance: { src: clip("advance"), marks: capture.advance },
} as const;

export const PHONE = {
  live: staticFile("tournaments/phone-live.webp"),
  done: staticFile("tournaments/phone-done.webp"),
} as const;
