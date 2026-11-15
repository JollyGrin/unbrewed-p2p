import type { ChangelogEntry } from "@/lib/changelog/types";
import {
  PRO_FEED_SEEN_KEY,
  entryKindLabel,
  featuredEntries,
  feedDate,
  launcherCtaHref,
  proFeedEntries,
  takeUnseenProEntries,
} from "./launcherFeed";

const entry = (id: string, over: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  id,
  date: id.slice(0, 10),
  title: id,
  summary: "s",
  tags: ["feature"],
  highlight: false,
  pro: true,
  ...over,
});

// newest first, as getChangelogEntries() returns them
const FEED = [
  entry("2026-11-09-afton", { tags: ["deck"], video: { slug: "afton" }, cta: { label: "Play Afton in Pro", href: "/pro" } }),
  entry("2026-11-08-quick-play", { video: { slug: "qp" }, cta: { label: "Try it", href: "/pro/game" } }),
  entry("2026-11-01-site-thing", { pro: undefined }),
  entry("2026-10-31-xeno", { tags: ["deck"] }),
  entry("2026-10-20-fix", { tags: ["fix"] }),
];

beforeEach(() => localStorage.clear());

describe("launcherFeed", () => {
  it("keeps only Pro entries, newest first", () => {
    expect(proFeedEntries(FEED).map((e) => e.id)).toEqual([
      "2026-11-09-afton",
      "2026-11-08-quick-play",
      "2026-10-31-xeno",
      "2026-10-20-fix",
    ]);
  });

  it("features entries with a promo video, falling back to the newest", () => {
    const feed = proFeedEntries(FEED);
    expect(featuredEntries(feed).map((e) => e.id)).toEqual(["2026-11-09-afton", "2026-11-08-quick-play"]);
    expect(featuredEntries(feed.slice(2), 1).map((e) => e.id)).toEqual(["2026-10-31-xeno"]);
  });

  it("points a '/pro' CTA at the lobby instead of looping back to /pro", () => {
    expect(launcherCtaHref(FEED[0])).toBe("/pro/game");
    expect(launcherCtaHref(FEED[1])).toBe("/pro/game");
    // a deck entry with no CTA still gets a way in; a feature without one gets none
    expect(launcherCtaHref(FEED[3])).toBe("/pro/game");
    expect(launcherCtaHref(FEED[4])).toBeNull();
  });

  it("labels the kind and the date", () => {
    expect(entryKindLabel(FEED[0])).toBe("NEW FIGHTER");
    expect(entryKindLabel(FEED[1])).toBe("FEATURE");
    expect(entryKindLabel(FEED[4])).toBe("RULES FIX");
    expect(feedDate("2026-11-09")).toBe("9 Nov");
  });

  describe("unseen entries", () => {
    const feed = proFeedEntries(FEED);

    it("flags nothing on the first visit, and remembers the newest entry", () => {
      expect(takeUnseenProEntries(feed).size).toBe(0);
      expect(localStorage.getItem(PRO_FEED_SEEN_KEY)).toBe("2026-11-09-afton");
    });

    it("flags what is newer than the last visit, then advances", () => {
      localStorage.setItem(PRO_FEED_SEEN_KEY, "2026-10-31-xeno");
      expect([...takeUnseenProEntries(feed)]).toEqual(["2026-11-09-afton", "2026-11-08-quick-play"]);
      expect(takeUnseenProEntries(feed).size).toBe(0);
    });

    it("never writes the site-wide changelog marker", () => {
      takeUnseenProEntries(feed);
      expect(localStorage.getItem("unbrewed:changelog-last-seen")).toBeNull();
    });
  });
});
