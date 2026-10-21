import { useEffect, useState } from "react";
import { useProLiveRosterState } from "@/lib/pro/useProLiveRoster";
import { PRO_WS_URL } from "@/lib/pro/wsUrl";
import type { HeroListing } from "@/lib/pro/protocol";

export interface LandingFighter {
  heroId: string;
  name: string;
  lab: boolean;
}

/**
 * Engine display names are raw deck titles ("TRICERATOPS", "gingerbread man ").
 * Re-case whole-word upper/lower runs; leave anything with digits or mixed case
 * ("R2-D2", "Leon S. Kennedy") exactly as the server sent it.
 */
export const displayName = (raw: string): string => {
  const name = raw.trim().replace(/\s+/g, " ");
  if (/\d/.test(name) || (name !== name.toUpperCase() && name !== name.toLowerCase())) {
    return name;
  }
  return name
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
};

export const toFighters = (heroes: HeroListing[]): LandingFighter[] => {
  const fighters = heroes.map((listing) => ({
    heroId: listing.heroId,
    name: displayName(listing.name),
    lab: listing.tier === "lab",
  }));
  // Battle-ready first, then the lab — the order the /pro roster grid uses.
  return [...fighters.filter((f) => !f.lab), ...fighters.filter((f) => f.lab)];
};

/**
 * The live Pro roster for the landing page — the same LIST_HEROES reply /pro
 * renders, so the hero count is never hand-typed. The socket opens from an idle
 * callback after hydration: the landing's first paint never waits on it, and
 * until it answers (or if it never does) the numbers that depend on it are
 * simply not shown.
 */
export const useLandingRoster = (): LandingFighter[] | null => {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const start = () => setUrl(PRO_WS_URL);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 1000);
    return () => window.clearTimeout(id);
  }, []);

  const { heroes } = useProLiveRosterState(url);
  return heroes ? toFighters(heroes) : null;
};
