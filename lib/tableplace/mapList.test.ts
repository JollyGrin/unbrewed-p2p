import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import { buildMapList, groupMapList, isSpacesMap, MAP_GROUPS } from "./mapList";
import { mapSpacesEntry } from "./mapSpaces";

const bag = (title: string) => ({
  imgUrl: `https://example.invalid/${title}.png`,
  meta: { title, author: "", url: "" },
});
const path = (url: string) => new URL(url, "https://x.invalid").pathname;
const cmp = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });

const PRO_PATHS = MAP_CATALOG.filter((e) => !e.hidden).map((e) =>
  path(e.map.meta.imageUrl as string),
);
// A bag copy of a board Pro plays on, under the player's own title.
const bagPyramids = {
  imgUrl: "/maps/community-pyramids-289.webp",
  meta: { title: "Aaa My Pyramids", author: "", url: "" },
};
const bagWithSpaces = {
  ...bag("Mmm Labs Yard"),
  labsSlug: "yard",
  layout: { meta: {}, spaces: [{ id: "a", x: 0.5, y: 0.5 }] },
};

describe("buildMapList groups", () => {
  const list = buildMapList([
    bag("Zzz Bag"),
    bagPyramids,
    bag("Aaa Bag"),
    bagWithSpaces,
  ]);
  const groups = groupMapList(list);

  it("lists Pro boards, then bag maps, then snapping built-ins, then image-only maps", () => {
    const runs = list
      .map((m) => m.group)
      .filter((g, i, all) => g !== all[i - 1]);
    expect(runs).toEqual([...MAP_GROUPS]);
    expect(MAP_GROUPS).toEqual(["pro", "bag", "spaces", "image"]);
    expect(
      [...groups.pro, ...groups.bag, ...groups.spaces, ...groups.image].map(
        (m) => m.imgUrl,
      ),
    ).toEqual(list.map((m) => m.imgUrl));
  });

  it("keeps the Pro boards in catalog order, every visible one and no hidden one", () => {
    expect(groups.pro.map((m) => path(m.imgUrl))).toEqual(PRO_PATHS);
    expect(PRO_PATHS).toHaveLength(14);
    expect(groups.pro.every(isSpacesMap)).toBe(true);
  });

  it("puts a bag map that is also a Pro board in Pro, once", () => {
    const mine = list.filter((m) => m.imgUrl === bagPyramids.imgUrl);
    expect(mine).toHaveLength(1);
    expect(mine[0].group).toBe("pro");
    expect(mine[0].label).toBe("Aaa My Pyramids");
    expect(groups.bag.map((m) => m.label)).toEqual([
      "Aaa Bag",
      "Mmm Labs Yard",
      "Zzz Bag",
    ]);
  });

  it("sorts every group after Pro by title", () => {
    for (const g of [groups.bag, groups.spaces, groups.image]) {
      const titles = g.map((m) => m.label);
      expect([...titles].sort(cmp)).toEqual(titles);
    }
  });

  it("splits the remaining built-ins on whether their spaces are mapped", () => {
    expect(groups.spaces.length).toBeGreaterThan(0);
    expect(groups.image.length).toBeGreaterThan(0);
    expect(groups.spaces.every((m) => !!mapSpacesEntry(m.imgUrl))).toBe(true);
    expect(groups.image.some((m) => !!mapSpacesEntry(m.imgUrl))).toBe(false);
    expect(groups.spaces.every(isSpacesMap)).toBe(true);
    expect(groups.image.some(isSpacesMap)).toBe(false);
  });

  it("knows a bag map snaps when it carries its own spaces", () => {
    const byTitle = (t: string) => groups.bag.find((m) => m.label === t)!;
    expect(isSpacesMap(byTitle("Mmm Labs Yard"))).toBe(true);
    expect(isSpacesMap(byTitle("Aaa Bag"))).toBe(false);
  });

  it("lists no board twice and adds one entry per new bag map", () => {
    const urls = list.map((m) => m.imgUrl);
    expect(new Set(urls).size).toBe(urls.length);
    expect(buildMapList([bag("Aaa Bag")]).length).toBe(
      buildMapList().length + 1,
    );
    // a bag copy of a built-in replaces it, it doesn't add one
    expect(buildMapList([bagPyramids]).length).toBe(buildMapList().length);
  });

  it("still leaves out the junk, the duplicate title and the second Altar", () => {
    const all = buildMapList();
    expect(
      all.some((m) => /forrestofrandomtrash|gigs-and-shittles/.test(m.imgUrl)),
    ).toBe(false);
    const titles = all.map((m) => m.label);
    expect(titles.filter((t) => /^Untitled Battlefield/.test(t))).toHaveLength(
      1,
    );
    expect(titles.filter((t) => /^(The )?Altar/.test(t))).toEqual([
      "The Altar",
    ]);
    expect(titles.some((t) => t.includes("· spaces"))).toBe(false);
  });
});
