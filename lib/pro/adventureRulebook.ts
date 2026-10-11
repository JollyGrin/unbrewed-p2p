/**
 * Original rulebook booklets for adventure scenarios (#1371), page images on the CDN.
 * A second scenario's booklet is one more entry in `RULEBOOKS`.
 */
const CDN_ROOT = "https://cdn.unbrewed.xyz/p2p/adventures";

export interface Rulebook {
  /** CDN folder URL (no trailing slash): `<base>/cover.webp`, `<base>/page-01.webp` … */
  base: string;
  /** Number of numbered pages after the cover. */
  pages: number;
  credit: string;
}

const JURASSIC: Rulebook = {
  base: `${CDN_ROOT}/jurassic-park/rulebook`,
  pages: 13,
  credit: "Scenario and rulebook by AndSushi and JBGeorgeLouie",
};

/**
 * Scenario id -> booklet. The engine's Jurassic scenario id is not yet visible on production
 * (LIST_SCENARIOS is BAD_MESSAGE there), so both the fixture id and the CDN folder name match.
 */
const RULEBOOKS: Record<string, Rulebook> = {
  "isla-nublar": JURASSIC,
  "jurassic-park": JURASSIC,
};

/** The booklet for a scenario id, or null (no link is shown). */
export const rulebookFor = (scenarioId: string | null | undefined): Rulebook | null =>
  (scenarioId && Object.prototype.hasOwnProperty.call(RULEBOOKS, scenarioId) ? RULEBOOKS[scenarioId] : null) ?? null;

/** Cover, then page-01 … page-NN. */
export const rulebookPageUrls = (book: Rulebook): string[] => [
  `${book.base}/cover.webp`,
  ...Array.from({ length: book.pages }, (_, i) => `${book.base}/page-${String(i + 1).padStart(2, "0")}.webp`),
];

/** Move `delta` pages, stopping at the first / last page. */
export const stepPage = (index: number, delta: number, count: number): number =>
  Math.min(Math.max(index + delta, 0), count - 1);

/** Alt text: the cover is "Rulebook cover", page-01 is "Rulebook page 1". */
export const rulebookPageAlt = (index: number): string => (index === 0 ? "Rulebook cover" : `Rulebook page ${index}`);
