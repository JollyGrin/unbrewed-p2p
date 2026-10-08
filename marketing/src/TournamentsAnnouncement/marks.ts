import type { Rect } from "./shots";

/**
 * Rects measured by hand on two plates (CSS px, 1280-wide page) where the
 * element has no test id, and one clip mark the capture script got wrong
 * (its text check fired late): the frame where bramble's name lands in the
 * final was read off clip-advance.mp4 directly (5.9 s).
 */
export const REPLAY_CHIP: Rect = { x: 641, y: 1025, w: 82, h: 44, text: "Replay" };
export const ORG_TOOLS: Rect = { x: 781, y: 312, w: 338, h: 154, text: "Organizer only" };
export const ADVANCE_LANDS = 5.9;
