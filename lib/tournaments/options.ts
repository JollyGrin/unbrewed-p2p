/**
 * What the create/matchup pickers may offer (#1216): Pro maps only, and
 * Pro-playable balanced + community decks with lab-tier decks hidden. Spice
 * and reflavored variants are not balanced evergreen decks either.
 */
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import type { HeroListing } from "@/lib/pro/protocol";

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

export interface DeckOption {
  heroId: string;
  name: string;
  section: "balanced" | "community";
}

export const proDeckOptions = (heroes: readonly HeroListing[]): DeckOption[] =>
  heroes
    .filter(
      (h) =>
        h.tier !== "lab" && h.tier !== "spice" && h.tier !== "reflavored",
    )
    .map((h) => ({
      heroId: h.heroId,
      name: h.name.trim(),
      section: h.deckSection === "recommended" ? "balanced" : "community",
    }));
