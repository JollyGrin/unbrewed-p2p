import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";

export interface FormatEndScreenProps {
  view: PlayerView;
  events?: readonly GameEvent[];
  /** Local deep-link into this browser's saved replay; null until the bundle is held. */
  replayHref: string | null;
  /** Upload this match and copy its public share link; absent when there is nothing to upload. */
  onCopyShareLink?: () => void;
  shareLinkBusy?: boolean;
}

/**
 * Format-specific end screens, mounted by format id — the same shape as `FormatOverlay`.
 * A listed format OWNS the end of its game: the dock shows no VICTORY / DEFEAT panel
 * (`hasFormatEndScreen`). Mounted for the whole game, not only at GAME_OVER, so a screen can
 * gather what it reports as the game is played; each renders nothing until `view.winner`.
 * Each is its own chunk (next/dynamic). Formats not listed keep the dock's end panel.
 */
const END_SCREENS: Record<string, ComponentType<FormatEndScreenProps>> = {
  adventure: dynamic(() => import("@/components/Pro/AdventureEndScreen").then((m) => m.AdventureEndScreen), { ssr: false }),
};

export const hasFormatEndScreen = (formatId?: string | null): boolean => !!formatId && formatId in END_SCREENS;

export const FormatEndScreen = ({ formatId, ...props }: FormatEndScreenProps & { formatId?: string }) => {
  const Screen = formatId ? END_SCREENS[formatId] : undefined;
  return Screen ? <Screen {...props} /> : null;
};
