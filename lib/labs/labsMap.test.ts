import { describe, expect, it, jest } from "@jest/globals";
import lucy from "./fixtures/set-by-slug.lucy-piper.json";
import pink from "./fixtures/set-by-slug.pink-panther.json";
import lucySave from "./fixtures/tts-save.lucy-piper.json";
import ozSave from "./fixtures/tts-save.oz-adventure.json";
import pinkSave from "./fixtures/tts-save.pink-panther.json";
import {
  LABS_TTS_ASSETS,
  LabsSetRow,
  addLabsMap,
  buildLabsImport,
  fetchLabsImport,
  fetchLabsSet,
  labsMapOffer,
  parseLabsTtsMap,
  supersededLabsMaps,
} from ".";
import { fetchLinkedDeck } from "@/lib/deckLink";
import type { MapData } from "@/lib/hooks/useLocalStorage";

// Real `rpc/set_by_slug` rows and hosted saves, fetched 2026-09-28 (#1002).
const LUCY = (lucy as unknown as LabsSetRow[])[0];
const PINK = (pink as unknown as LabsSetRow[])[0];
const LUCY_ID = "char_2dd4ea0c-a02c-4297-aeb1-5b761489e1c3";
const PINK_ID = "char_dc1ed800-ebe2-4eeb-9487-97e15a7ac956";
const BACKYARD =
  "https://kyqcvbnxfmpnbwtikzxp.supabase.co/storage/v1/object/public/tts-assets/3acb4605-5d8f-4492-ac70-18e348fa8e19/set_d9326fea-f3d8-4d20-9976-7b1b657c384d/map/lucy-piper-the-backyard-f6293ce6.jpg";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const json = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: async () => body } as Response);

const labsFetch = (
  row: LabsSetRow,
  save: unknown,
  mode: "ok" | "none" | "down" = "ok",
) =>
  jest.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("gallery_characters")) return json([{ slug: row.slug }]);
    if (u.includes("rpc/set_by_slug")) return json([row]);
    if (u.includes("profiles")) return json([{ display_name: "Tombadil Bombadil" }]);
    if (u.includes("rpc/published_tts_save")) {
      if (mode === "down") throw new TypeError("Failed to fetch");
      return mode === "none" ? json([]) : json([{ save_path: "a/b/save.json" }]);
    }
    if (u.startsWith(LABS_TTS_ASSETS)) return json(clone(save));
    throw new Error(`unexpected ${u}`);
  }) as unknown as typeof fetch;

describe("parseLabsTtsMap", () => {
  it("reads the rendered backyard out of Lucy & Piper's save", () => {
    expect(parseLabsTtsMap(lucySave)).toEqual({
      name: "the backyard",
      imageUrl: BACKYARD,
      spaces: 34,
      paths: 70,
    });
  });

  it("offers nothing for Oz Adventure's 0-space map, or a save with no map", () => {
    expect(parseLabsTtsMap(ozSave)).toBeUndefined();
    expect(parseLabsTtsMap(pinkSave)).toBeUndefined();
    expect(parseLabsTtsMap(null)).toBeUndefined();
    expect(parseLabsTtsMap({ ObjectStates: "nope" })).toBeUndefined();
  });
});

describe("the map offer on a Labs import", () => {
  it("offers Lucy & Piper's backyard, with the set's author and slug", async () => {
    const { map, deck } = await fetchLabsImport(
      { kind: "character", characterId: LUCY_ID },
      labsFetch(LUCY, lucySave),
    );
    expect(map).toEqual({
      name: "the backyard",
      map: {
        imgUrl: BACKYARD,
        meta: { title: "the backyard", author: "Tombadil Bombadil" },
        labsSlug: LUCY.slug,
      },
    });
    expect(deck.user).toBe("Tombadil Bombadil");
  });

  it("names the map after the set when the map has no name", async () => {
    const row = clone(LUCY);
    row.document.set.map!.name = "  ";
    const loaded = await fetchLabsSet({ kind: "set", slug: row.slug }, labsFetch(row, lucySave));
    const offer = labsMapOffer({ ...loaded, ttsMap: { ...loaded.ttsMap!, name: "" } }, { user: "x" });
    expect(offer?.map.meta?.title).toBe(row.name);
  });

  it("offers nothing when the author switched the map off", async () => {
    const row = clone(LUCY);
    row.document.set.map!.enabled = false;
    const { map } = await fetchLabsImport(
      { kind: "character", characterId: LUCY_ID },
      labsFetch(row, lucySave),
    );
    expect(map).toBeUndefined();
  });

  it("offers nothing for Pink Panther (no map with spaces)", async () => {
    const impl = labsFetch(PINK, pinkSave);
    const { map } = await fetchLabsImport({ kind: "character", characterId: PINK_ID }, impl);
    expect(map).toBeUndefined();
  });

  it("offers nothing when the save holds a 0-space map (Oz's save)", async () => {
    const { map } = await fetchLabsImport(
      { kind: "character", characterId: LUCY_ID },
      labsFetch(LUCY, ozSave),
    );
    expect(map).toBeUndefined();
  });

  it.each(["none", "down"] as const)(
    "no offer, deck still imports, when the save lookup is %s",
    async (mode) => {
      const { map, deck } = await fetchLabsImport(
        { kind: "character", characterId: LUCY_ID },
        labsFetch(LUCY, lucySave, mode),
      );
      expect(map).toBeUndefined();
      expect(deck.name).toBe("Lucy");
      expect(deck.deck_data.cards.length).toBeGreaterThan(0);
    },
  );

  it("a deep link imports the deck and never adds the map, but says it can be added", async () => {
    const linked = await fetchLinkedDeck(`labs:${LUCY_ID}`, labsFetch(LUCY, lucySave));
    expect(linked.mapInBag).toBe(true);
    expect(linked.skipped.some((s) => s.kind === "map")).toBe(true);
  });

  it("buildLabsImport without a fetched save has no map", () => {
    expect(buildLabsImport({ row: LUCY }, LUCY_ID).map).toBeUndefined();
  });
});

describe("a republished set's map (#1029)", () => {
  const OLD = { imgUrl: "https://x.test/map-old.jpg", isStarred: true, meta: { title: "yard" }, labsSlug: "lucy" };
  const NEW = { imgUrl: "https://x.test/map-new.jpg", meta: { title: "yard" }, labsSlug: "lucy" };
  const OTHER = { imgUrl: "https://x.test/other.jpg", meta: { title: "other" }, labsSlug: "oz" };
  const PLAIN = { imgUrl: "https://x.test/plain.jpg", meta: { title: "plain" } };

  it("supersedes only the same set's maps under another url", () => {
    expect(supersededLabsMaps([OLD, NEW, OTHER, PLAIN], NEW)).toEqual([OLD]);
    expect(supersededLabsMaps([OLD], PLAIN)).toEqual([]);
  });

  it("adds the new map starred, then drops the old one", async () => {
    const calls: string[] = [];
    const bag = {
      data: [OLD, OTHER],
      add: async (m: MapData) => (calls.push(`add ${m.imgUrl} ${!!m.isStarred}`), true),
      remove: async (url: string) => void calls.push(`remove ${url}`),
    };
    expect(await addLabsMap(NEW, bag)).toBe(true);
    expect(calls).toEqual([`add ${NEW.imgUrl} true`, `remove ${OLD.imgUrl}`]);
  });

  it("keeps the old map when the new one could not be stored", async () => {
    const remove = jest.fn(async (_url: string) => {});
    const bag = { data: [OLD], add: async () => false, remove };
    expect(await addLabsMap(NEW, bag)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
