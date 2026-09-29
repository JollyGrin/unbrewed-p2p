/**
 * Seen-state branches for `useChangelogSeen` (unbrewed-p2p-982). The real
 * seed content is deliberately NOT used here — its dates would drift in and
 * out of the 30-day window as wall-clock time passes, so `./entries` is
 * mocked with a small fixed fixture instead.
 */
import { act, renderHook } from "@testing-library/react";
import type { ChangelogEntry } from "./types";

const entry = (id: string, date: string): ChangelogEntry => ({
  id,
  date,
  title: id,
  summary: "Summary.",
  tags: ["feature"],
  highlight: false,
});

const NEWEST = entry("2026-03-01-newest", "2026-03-01");
const MID = entry("2026-02-01-mid", "2026-02-01");
const OLD = entry("2026-01-01-old", "2026-01-01");
const FIXTURE = [NEWEST, MID, OLD]; // newest first, as the real loader returns

jest.mock("./entries", () => ({
  getChangelogEntries: () => FIXTURE,
}));

import {
  CHANGELOG_SEEN_KEY,
  __resetChangelogSeenForTest,
  useChangelogSeen,
} from "./useChangelogSeen";

// "Now" = 2026-03-10: NEWEST (9 days old) is inside the 30-day window,
// MID (37 days old) and OLD (68 days old) are outside it.
const NOW = new Date("2026-03-10T00:00:00Z").getTime();

beforeEach(() => {
  window.localStorage.clear();
  __resetChangelogSeenForTest();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useChangelogSeen", () => {
  it("brand-new visitor (no key, no other storage activity): unseen is empty and the newest id is written silently", () => {
    const { result } = renderHook(() => useChangelogSeen());

    expect(result.current.unseen).toEqual([]);
    expect(window.localStorage.getItem(CHANGELOG_SEEN_KEY)).toBe(NEWEST.id);
  });

  it("returning keyless player (no key, some other key present): unseen is entries from the last 30 days", () => {
    window.localStorage.setItem("some-other-unbrewed-key", "1");

    const { result } = renderHook(() => useChangelogSeen());

    expect(result.current.unseen).toEqual([NEWEST]);
    // Meeting the feature for the first time doesn't silently ack anything.
    expect(window.localStorage.getItem(CHANGELOG_SEEN_KEY)).toBeNull();
  });

  it("stored id older than newest: unseen is only the entries newer than it", () => {
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, MID.id);

    const { result } = renderHook(() => useChangelogSeen());

    expect(result.current.unseen).toEqual([NEWEST]);
  });

  it("stored id equal to newest: unseen is empty", () => {
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, NEWEST.id);

    const { result } = renderHook(() => useChangelogSeen());

    expect(result.current.unseen).toEqual([]);
  });

  it("localStorage throwing: unseen is empty and nothing crashes", () => {
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => renderHook(() => useChangelogSeen())).not.toThrow();
    const { result } = renderHook(() => useChangelogSeen());
    expect(result.current.unseen).toEqual([]);

    getItem.mockRestore();
  });

  it("markAllSeen writes the newest id and clears unseen everywhere it's used on the page", () => {
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, MID.id);

    const a = renderHook(() => useChangelogSeen());
    const b = renderHook(() => useChangelogSeen());
    expect(a.result.current.unseen).toEqual([NEWEST]);
    expect(b.result.current.unseen).toEqual([NEWEST]);

    act(() => a.result.current.markAllSeen());

    expect(window.localStorage.getItem(CHANGELOG_SEEN_KEY)).toBe(NEWEST.id);
    expect(a.result.current.unseen).toEqual([]);
    expect(b.result.current.unseen).toEqual([]);
  });
});
