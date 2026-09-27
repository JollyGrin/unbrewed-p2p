// ---------------------------------------------------------------------------
// Two-space (LARGE) fighter identity — the connecting band's own label.
//
// Real Pro-mode feedback: a LARGE fighter's head and tail tokens are the same
// color, the same size, and (since issue #247) both show the fighter's
// initials — but at phone zoom two identically-colored, identically-lettered
// circles joined by a thin line still read as "two fighters that happen to
// match" rather than "one fighter". Worse, a LARGE attacker's 2-space melee
// reach (largeReach.ts) means an opponent can be a legal target from either
// circle, so "which one do I tap" was a real in-game question, not just a
// cosmetic one.
//
// A label anchored to the BAND ITSELF — the one thing on the board that
// belongs to neither token alone — answers that question independent of
// color or initials matching: it can only be read as "this ties these two
// circles into one fighter". `bandMidpoint` places it; `bandLabelText`
// supplies its text.
// ---------------------------------------------------------------------------

/** A space's normalized 0–1 board position (the subset of ProMapSpace this
 *  module needs, so callers don't have to import the whole map-def type). */
export interface BandPoint {
  x: number;
  y: number;
}

/**
 * The point exactly between a LARGE fighter's head and tail spaces, in the
 * same normalized 0–1 coordinates as ProMapSpace.x/y. Order-independent —
 * "head" and "tail" are a labeling the caller already knows, not a direction
 * this computation needs.
 */
export const bandMidpoint = (head: BandPoint, tail: BandPoint): BandPoint => ({
  x: (head.x + tail.x) / 2,
  y: (head.y + tail.y) / 2,
});

/**
 * Text for the band label: the same leading-"The" strip `tokenInitials`
 * (FighterTokenPortrait.tsx) applies before reducing a name to initials, but
 * kept as the FULL remaining name rather than truncated — the label's whole
 * job is to spell out the identity the two circles alone can't, so
 * abbreviating it again would defeat the point. Deliberately duplicates only
 * the stripping rule (never the 3-letter truncation) so the two stay
 * word-for-word in sync without one importing the other for a single regex.
 */
export const bandLabelText = (name: string): string => {
  const stripped = name.replace(/^the\b\s*/i, "").trim();
  return stripped || name.trim();
};
