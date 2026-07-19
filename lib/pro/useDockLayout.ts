/**
 * Persisted layout for the Pro decision dock: where the player dragged it
 * (x/y offset from its default right-edge slot) and whether it is collapsed.
 *
 * Hydration-safe in the same way as `useHudPlates` — the stored value is read
 * after mount, so SSR and the first client render agree (dock at its origin,
 * expanded) and only then snap to the saved layout.
 */
import { useCallback, useEffect, useState } from "react";

export interface DockLayout {
  /** drag offset from the dock's default slot, in px */
  x: number;
  y: number;
  collapsed: boolean;
}

const STORAGE_KEY = "pro-decision-dock";
export const DEFAULT_DOCK_LAYOUT: DockLayout = { x: 0, y: 0, collapsed: false };

/** Coerce an untrusted stored blob into a valid DockLayout, dropping garbage. */
const sanitize = (raw: unknown): DockLayout => {
  if (!raw || typeof raw !== "object") return DEFAULT_DOCK_LAYOUT;
  const r = raw as Record<string, unknown>;
  return {
    x: typeof r.x === "number" && Number.isFinite(r.x) ? r.x : 0,
    y: typeof r.y === "number" && Number.isFinite(r.y) ? r.y : 0,
    collapsed: r.collapsed === true,
  };
};

export interface UseDockLayout {
  layout: DockLayout;
  /** false until the stored layout has been read (after mount) */
  hydrated: boolean;
  /** merge a partial layout and persist the result */
  update: (partial: Partial<DockLayout>) => void;
}

export function useDockLayout(): UseDockLayout {
  const [layout, setLayout] = useState<DockLayout>(DEFAULT_DOCK_LAYOUT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLayout(sanitize(JSON.parse(raw)));
    } catch {
      /* storage blocked or malformed — keep defaults */
    }
    setHydrated(true);
  }, []);

  const update = useCallback((partial: Partial<DockLayout>) => {
    setLayout((cur) => {
      const next = { ...cur, ...partial };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { layout, hydrated, update };
}
