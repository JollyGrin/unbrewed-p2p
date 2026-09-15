/** Board hints are written for a mouse ("click a gold space…"); on a phone they
 *  should say "tap" (mobile step 3). Whole words only, capitalisation kept. */
export function touchCopy(text: string): string {
  return text.replace(/\b([Cc])lick\b/g, (_, c: string) => (c === "C" ? "Tap" : "tap"));
}
