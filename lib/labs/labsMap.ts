/**
 * The set's map as a sandbox map (#1002).
 *
 * The raw map artwork in the set row is a bare background. Labs' hosted
 * Tabletop Simulator save holds the finished render (spaces, paths, zones,
 * start slots drawn on), so the offer follows the save: a `CardCustom` whose
 * description reads "N spaces, M paths." with N > 0. Oz Adventure's save has
 * one reading "0 spaces, 0 paths." and its threat track reads "6 spaces, 19
 * threat in total." — neither is offered.
 *
 * The image is shown by link from Labs' storage; nothing is copied.
 */
import type { MapData } from "@/lib/hooks/useLocalStorage";
import type { BagMapView } from "@/lib/bag/useBag";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { LabsLoadedSet, LabsMap, LabsSet, LabsTtsMap } from "./labs.type";

const setMaps = (set: LabsSet): LabsMap[] =>
  [set.map, ...(set.maps ?? [])].filter((m): m is LabsMap => !!m);

/** Whether the set's own data holds a map with spaces (worth a save lookup). */
export const hasLabsMap = (set: LabsSet) =>
  setMaps(set).some((m) => (m.spaces ?? []).length > 0);

/** The first map object of a hosted save that has at least one space. */
export const parseLabsTtsMap = (save: unknown): LabsTtsMap | undefined => {
  const walk = (objects: unknown): LabsTtsMap | undefined => {
    if (!Array.isArray(objects)) return undefined;
    for (const o of objects) {
      if (!o || typeof o !== "object") continue;
      const obj = o as Record<string, any>;
      const counts = /^(\d+) spaces?, (\d+) paths?\.$/.exec(
        typeof obj.Description === "string" ? obj.Description.trim() : "",
      );
      if (obj.Name === "CardCustom" && counts && Number(counts[1]) > 0) {
        const deck = Object.values(obj.CustomDeck ?? {})[0] as { FaceURL?: unknown } | undefined;
        const url = deck?.FaceURL;
        if (typeof url === "string" && /^https:\/\//i.test(url)) {
          const nick = typeof obj.Nickname === "string" ? obj.Nickname : "";
          return {
            name: nick.includes(" — ") ? nick.slice(nick.indexOf(" — ") + 3).trim() : "",
            imageUrl: url,
            spaces: Number(counts[1]),
            paths: Number(counts[2]),
          };
        }
      }
      const inner = walk(obj.ContainedObjects);
      if (inner) return inner;
    }
    return undefined;
  };
  return walk((save as { ObjectStates?: unknown } | null)?.ObjectStates);
};

/** What the Labs panel offers under the preview. */
export type LabsMapOffer = {
  /** the map's name, for the checkbox ("the backyard") */
  name: string;
  /** the bag map to add when ticked */
  map: MapData;
};

/**
 * The map to offer for a loaded set, or `undefined`: the set must hold an
 * enabled map with spaces AND the save must hold a render of one.
 */
export const labsMapOffer = (
  loaded: LabsLoadedSet,
  deck: Pick<DeckImportType, "user">,
): LabsMapOffer | undefined => {
  const { row, ttsMap } = loaded;
  const set = row.document.set;
  if (!ttsMap) return undefined;
  const own = setMaps(set).find((m) => (m.spaces ?? []).length > 0 && m.enabled !== false);
  if (!own) return undefined;
  const name = own.name?.trim() || ttsMap.name || "";
  const title = name || row.name;
  return {
    name: name || row.name,
    map: {
      imgUrl: ttsMap.imageUrl,
      meta: { title, author: deck.user },
      labsSlug: row.slug,
    },
  };
};

/**
 * The player's maps an import of `map` supersedes: earlier imports of the
 * same Labs set under another image url (#1029). A republished set gets a new
 * hosted save, the old save's map image expires about a week later, and the
 * maps store keys on `imgUrl` — so without this a re-import would leave the
 * old copy behind as a dead picture next to the new one.
 */
export const supersededLabsMaps = (maps: MapData[], map: MapData): MapData[] =>
  map.labsSlug
    ? maps.filter((m) => m.labsSlug === map.labsSlug && m.imgUrl !== map.imgUrl)
    : [];

/**
 * Add a Labs map to the player's maps, dropping the copies it supersedes once
 * it is stored and keeping their star. False when nothing was stored.
 */
export const addLabsMap = async (
  map: MapData,
  bag: Pick<BagMapView, "data" | "add" | "remove">,
): Promise<boolean> => {
  const superseded = supersededLabsMaps(bag.data, map);
  const starred = superseded.some((m) => m.isStarred);
  if (!(await bag.add(starred ? { ...map, isStarred: true } : map))) return false;
  for (const old of superseded) await bag.remove(old.imgUrl);
  return true;
};
