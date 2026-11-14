/**
 * The /pro launcher's news feed (unbrewed-p2p-1626) — the pure half.
 *
 * `/pro` stopped being a second copy of the `/pro/game` picker: regulars
 * bookmark the lobby, so this page is the front door for new players and the
 * "what changed" board for returning ones. Its feed is the changelog itself —
 * every `content/changelog/*.json` entry flagged `pro: true` — so a new
 * fighter or feature shows up here with no edit to the page.
 *
 * "New since your last visit" uses its OWN key rather than the site-wide
 * changelog marker (`lib/changelog/useChangelogSeen.ts`): opening /pro must not
 * acknowledge non-Pro entries the main landing's update dialog still owes the
 * visitor, and that marker isn't advanced by visiting /pro either.
 */
import type { ChangelogEntry } from "@/lib/changelog/types";

export const PRO_FEED_SEEN_KEY = "unbrewed:pro-feed-last-seen";

/** How many entries the feed lists before "All updates". */
export const FEED_LIMIT = 5;

/** How many entries the returning-player banner cycles through. */
export const FEATURED_LIMIT = 3;

/** Pro entries, newest first (the input is already newest first). */
export const proFeedEntries = (entries: readonly ChangelogEntry[]): ChangelogEntry[] =>
  entries.filter((e) => e.pro === true);

/**
 * The banner's slides: the newest Pro entries that carry a promo video (their
 * poster is the slide art). Falls back to the newest Pro entries when fewer
 * have one, so the banner never comes up empty while there is news.
 */
export const featuredEntries = (
  feed: readonly ChangelogEntry[],
  limit = FEATURED_LIMIT,
): ChangelogEntry[] => {
  const withVideo = feed.filter((e) => !!e.video?.slug);
  return (withVideo.length > 0 ? withVideo : [...feed]).slice(0, limit);
};

/**
 * Where an entry's call to action should go FROM /pro. Deck entries point their
 * CTA at "/pro" — sensible from the main site, a dead loop from here — so a
 * "/pro" target becomes the lobby. Anything else is kept as written.
 */
export const launcherCtaHref = (entry: ChangelogEntry): string | null => {
  const href = entry.cta?.href;
  if (!href) return entry.tags.includes("deck") ? "/pro/game" : null;
  return href === "/pro" ? "/pro/game" : href;
};

/** Short label for the entry's kind, as the feed chip prints it. */
export const entryKindLabel = (entry: ChangelogEntry): string =>
  entry.tags.includes("deck") ? "NEW FIGHTER" : entry.tags.includes("fix") ? "RULES FIX" : "FEATURE";

/** "9 Nov" — UTC, so the day never shifts with the visitor's timezone. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const feedDate = (isoDate: string): string => {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
};

/**
 * Which feed entries are new to this browser, and advance the marker to the
 * newest Pro entry. A browser with no marker yet (first visit, or a returning
 * player meeting the launcher for the first time) gets nothing flagged: every
 * entry would be "new", which says nothing. Storage that throws flags nothing.
 */
export const takeUnseenProEntries = (feed: readonly ChangelogEntry[]): Set<string> => {
  if (feed.length === 0) return new Set();
  let lastSeen: string | null;
  try {
    lastSeen = window.localStorage.getItem(PRO_FEED_SEEN_KEY);
    window.localStorage.setItem(PRO_FEED_SEEN_KEY, feed[0].id);
  } catch {
    return new Set();
  }
  if (lastSeen === null) return new Set();
  return new Set(feed.filter((e) => e.id > lastSeen!).map((e) => e.id));
};
