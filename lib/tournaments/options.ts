/**
 * What the create/matchup pickers may offer (#1216): Pro maps only, and
 * Pro-playable balanced + community decks with lab-tier decks hidden. Spice
 * and reflavored variants are not balanced evergreen decks either.
 */
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import { POPULAR_DECKS } from "@/lib/constants/top-decks";
import { HERO_DECK_IDS } from "@/lib/pro/useProCardArt";
import type { HeroListing } from "@/lib/pro/protocol";

import { registerMapTitles } from "./mapTitle";
import type { MapRef } from "./types";

export interface MapOption {
  ref: MapRef;
  title: string;
}

export const proMapOptions = (): MapOption[] =>
  MAP_CATALOG.filter((entry) => !entry.hidden).map((entry) => ({
    ref: { kind: "catalog", id: entry.id },
    title: entry.title,
  }));

export const mapTitle = (ref: MapRef): string =>
  MAP_CATALOG.find((entry) => entry.id === ref.id)?.title ?? ref.id;

registerMapTitles(mapTitle);

export interface DeckOption {
  heroId: string;
  name: string;
  section: "balanced" | "community";
}

/**
 * The hero picker's own lab rule (pages/pro/game.tsx `isLabHero`): the server's
 * tier when it sends `lab`, else the client deck table's `lab` flag.
 */
const isLab = (h: HeroListing): boolean =>
  h.tier === "lab" || !!POPULAR_DECKS.find((d) => d.id === HERO_DECK_IDS[h.heroId])?.lab;

/**
 * Same roster as the player picker's balanced + community sections (E6, #1236):
 * spice decks ARE in it (they are the roster's balanced pick for that hero), lab
 * and the hidden reflavored baselines are not.
 */
export const proDeckOptions = (heroes: readonly HeroListing[]): DeckOption[] =>
  heroes
    .filter((h) => !isLab(h) && h.tier !== "reflavored")
    .map((h): DeckOption => ({
      heroId: h.heroId,
      name: h.name.trim(),
      section: h.deckSection === "recommended" ? "balanced" : "community",
    }))
    .sort((x, y) => x.name.localeCompare(y.name));
