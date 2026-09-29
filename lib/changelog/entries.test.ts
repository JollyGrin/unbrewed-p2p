import { buildChangelogEntries, getChangelogEntries } from "./entries";
import type { ChangelogEntry } from "./types";

const entry = (overrides: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  id: "2026-01-01-sample",
  date: "2026-01-01",
  title: "Sample",
  summary: "A sample entry.",
  tags: ["feature"],
  highlight: false,
  ...overrides,
});

describe("buildChangelogEntries", () => {
  it("sorts newest first by id", () => {
    const a = entry({ id: "2026-01-01-a", date: "2026-01-01" });
    const b = entry({ id: "2026-03-01-b", date: "2026-03-01" });
    const c = entry({ id: "2026-02-01-c", date: "2026-02-01" });

    expect(buildChangelogEntries([a, b, c]).map((e) => e.id)).toEqual([
      "2026-03-01-b",
      "2026-02-01-c",
      "2026-01-01-a",
    ]);
  });

  it("throws on a duplicate id", () => {
    const a = entry({ id: "2026-01-01-a", date: "2026-01-01" });
    const dupe = entry({ id: "2026-01-01-a", date: "2026-01-01", title: "Other" });

    expect(() => buildChangelogEntries([a, dupe])).toThrow(/duplicate/i);
  });

  it("throws when the id's date prefix differs from the date field", () => {
    const mismatched = entry({ id: "2026-01-01-a", date: "2026-01-02" });

    expect(() => buildChangelogEntries([mismatched])).toThrow(/date/i);
  });

  it.each(["id", "date", "title", "summary", "tags", "highlight"] as const)(
    "throws when %s is missing",
    (field) => {
      const broken = entry();
      delete (broken as Partial<ChangelogEntry>)[field];

      expect(() => buildChangelogEntries([broken])).toThrow(/missing required field/i);
    },
  );

  it("does not throw on a valid, unique set of entries", () => {
    const a = entry({ id: "2026-01-01-a", date: "2026-01-01" });
    const b = entry({ id: "2026-01-02-b", date: "2026-01-02" });

    expect(() => buildChangelogEntries([a, b])).not.toThrow();
  });
});

describe("getChangelogEntries", () => {
  it("loads the real seed content without throwing, newest first", () => {
    const entries = getChangelogEntries();

    expect(entries.length).toBeGreaterThan(0);
    const ids = entries.map((e) => e.id);
    expect(ids).toEqual([...ids].sort().reverse());
  });
});
