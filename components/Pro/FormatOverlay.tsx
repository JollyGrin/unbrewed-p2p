import type { ComponentType } from "react";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";
import { AdventureBoard } from "@/components/Pro/AdventureBoard";

export interface FormatOverlayProps {
  view: PlayerView;
  events?: readonly GameEvent[];
  /** Engine-fault diagnostic (ERROR{ENGINE_FAULT}); non-null = the table is stopped. */
  engineFault?: string | null;
}

/** Format-specific board overlays, mounted by format id. Formats not listed render nothing. */
const OVERLAYS: Record<string, ComponentType<FormatOverlayProps>> = {
  adventure: AdventureBoard,
};

export const FormatOverlay = ({ formatId, ...props }: FormatOverlayProps & { formatId?: string }) => {
  const Overlay = formatId ? OVERLAYS[formatId] : undefined;
  return Overlay ? <Overlay {...props} /> : null;
};
