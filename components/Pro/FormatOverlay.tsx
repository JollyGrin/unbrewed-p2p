import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { FighterId, GameEvent, PlayerView, SpaceId, ViewFighter } from "@/lib/pro/protocol";
import { teamDecisionModel } from "@/lib/pro/adventureBoard";
import { adventureCardArt } from "@/lib/pro/adventureCardArt";
import { ADVENTURE_OVERLAY_INSET } from "@/lib/pro/mobileLayout";

/** An attacker → target pair for the board's attack arrow. */
export type BoardArrow = { attacker: FighterId; target: FighterId };

export interface FormatOverlayProps {
  view: PlayerView;
  events?: readonly GameEvent[];
  /** Engine-fault diagnostic (ERROR{ENGINE_FAULT}); non-null = the table is stopped. */
  engineFault?: string | null;
  /** board-token portrait for a fighter (deck `tokenImageUrl`), used by the Adventure round strip */
  fighterTokenArt?: (f: ViewFighter) => string | null;
  /** The overlay's own attack arrow for the board (the enemy turn's mover → target), or null.
   *  The board draws a live combat's arrow over it. Pass a stable callback. */
  onBoardArrow?: (arrow: BoardArrow | null) => void;
}

/**
 * Format-specific board overlays, mounted by format id. Formats not listed render nothing.
 * Each is its own chunk (next/dynamic), so a format's UI is only downloaded by its players.
 */
const OVERLAYS: Record<string, ComponentType<FormatOverlayProps>> = {
  adventure: dynamic(() => import("@/components/Pro/AdventureBoard").then((m) => m.AdventureBoard), { ssr: false }),
};

/** Desktop px an overlay's column takes left of the dock, for the board's initial fit. */
const OVERLAY_INSETS: Record<string, number> = {
  adventure: ADVENTURE_OVERLAY_INSET,
};
export const formatOverlayInset = (formatId?: string | null): number => (formatId && OVERLAY_INSETS[formatId]) || 0;

/** Whether the board pans/zooms (full-screen layout). A format overlay is laid out for the
 *  full-screen board, so it forces this on over a stored "Full-screen board" opt-out (#1347). */
export const boardZoomable = (zoomMapFlag: boolean, formatId?: string | null): boolean =>
  zoomMapFlag || formatOverlayInset(formatId) > 0;

/** Spaces a format lights gold, unclickable, for a seat watching a decision it doesn't make
 *  (Adventure: a TEAM prompt's candidates for the read-only teammates, #1169). */
const WATCH_SPACES: Record<string, (view: PlayerView) => SpaceId[]> = {
  adventure: (view) => teamDecisionModel(view)?.spaces ?? [],
};
export const formatWatchSpaces = (formatId: string | null | undefined, view: PlayerView): SpaceId[] =>
  (formatId && WATCH_SPACES[formatId]?.(view)) || [];

/** CDN face URL for a card id the hero catalog doesn't know (a format's own cards), or null. */
export type CardFaceUrl = (cardId: string) => string | null;

/** Per-format card-face sources; `resolveCard` consults these for ids outside the hero catalog. */
const CARD_FACES: Record<string, CardFaceUrl> = {
  adventure: adventureCardArt,
};
export const formatCardFace = (formatId?: string | null): CardFaceUrl | undefined =>
  (formatId && CARD_FACES[formatId]) || undefined;

export const FormatOverlay = ({ formatId, ...props }: FormatOverlayProps & { formatId?: string }) => {
  const Overlay = formatId ? OVERLAYS[formatId] : undefined;
  return Overlay ? <Overlay {...props} /> : null;
};
