/**
 * Persisted per-seat layout for the Pro HUD plates: each plate remembers where
 * the player dragged it (x/y offset from its origin slot) and whether it is
 * collapsed. Hydration-safe like `useStoredToggle` in useGameFx.ts — the stored
 * value is read after mount so SSR and the first client render agree (plates
 * start at origin, expanded) and only then snap to the saved layout.
 */
import { useCallback, useEffect, useState } from "react";

export type PlateSeat = string;

export interface PlateLayout {
  /** drag offset from the plate's origin slot, in px */
  x: number;
  y: number;
  collapsed: boolean;
}

export type PlatesState = Record<PlateSeat, PlateLayout>;

const STORAGE_KEY = "pro-hud-plates";
export const DEFAULT_PLATE_LAYOUT: PlateLayout = { x: 0, y: 0, collapsed: false };
const DEFAULT_STATE: PlatesState = {};

/** Coerce an untrusted stored blob into a valid PlateLayout, dropping garbage. */
const sanitize = (raw: unknown): PlateLayout => {
  if (!raw || typeof raw !== "object") return DEFAULT_PLATE_LAYOUT;
  const r = raw as Record<string, unknown>;
  return {
    x: typeof r.x === "number" && Number.isFinite(r.x) ? r.x : 0,
    y: typeof r.y === "number" && Number.isFinite(r.y) ? r.y : 0,
    collapsed: r.collapsed === true,
  };
};

export interface UseHudPlates {
  plates: PlatesState;
  /** false until the stored layout has been read (after mount) */
  hydrated: boolean;
  /** merge a partial layout for one seat and persist the whole state */
  update: (seat: PlateSeat, partial: Partial<PlateLayout>) => void;
}

export function useHudPlates(): UseHudPlates {
  const [plates, setPlates] = useState<PlatesState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        setPlates(Object.fromEntries(Object.entries(parsed).map(([seat, layout]) => [seat, sanitize(layout)])));
      }
    } catch {
      /* storage blocked or malformed — keep defaults */
    }
    setHydrated(true);
  }, []);

  const update = useCallback((seat: PlateSeat, partial: Partial<PlateLayout>) => {
    setPlates((cur) => {
      const next: PlatesState = { ...cur, [seat]: { ...(cur[seat] ?? DEFAULT_PLATE_LAYOUT), ...partial } };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { plates, hydrated, update };
}
