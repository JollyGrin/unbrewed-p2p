import { buildMapList, isSpacesMap } from "./mapList";

const bag = (title: string) => ({
  imgUrl: `https://example.invalid/${title}.png`,
  meta: { title, author: "", url: "" },
});

describe("buildMapList grouping", () => {
  const list = buildMapList([bag("Zzz Bag"), bag("Aaa Bag")]);
  const firstOther = list.findIndex((m) => !isSpacesMap(m));
  const cmp = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: "base" });
  const title = (m: (typeof list)[number]) =>
    (m.meta?.title ?? m.imgUrl).trim();

  it("puts spaces boards before the rest", () => {
    expect(firstOther).toBeGreaterThan(0);
    expect(list.slice(0, firstOther).every(isSpacesMap)).toBe(true);
    expect(list.slice(firstOther).some(isSpacesMap)).toBe(false);
  });

  it("sorts each group by title", () => {
    for (const g of [list.slice(0, firstOther), list.slice(firstOther)]) {
      const t = g.map(title);
      expect([...t].sort(cmp)).toEqual(t);
    }
  });

  it("keeps bag maps inside their group and lists no board twice", () => {
    const urls = list.map((m) => m.imgUrl);
    expect(new Set(urls).size).toBe(urls.length);
    expect(buildMapList([bag("Aaa Bag")]).length).toBe(
      buildMapList().length + 1,
    );
    expect(
      list.findIndex((m) => title(m) === "Aaa Bag"),
    ).toBeGreaterThanOrEqual(firstOther);
  });
});
