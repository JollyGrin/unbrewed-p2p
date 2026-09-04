import { PASTE_TOKEN, mapSubmissionIssue, mapSubmissionIssueUrl } from "./mapIssue";
import type { ProMapDef, ProMapSpace } from "./protocol";

const space = (i: number): ProMapSpace => ({
  id: `s${i}`,
  x: 0.1 + i / 1000,
  y: 0.2 + i / 1000,
  adjacentTo: [`s${i === 0 ? 1 : i - 1}`],
  zones: ["z1"],
});

const map = (over: Partial<ProMapDef["meta"]> = {}, spaces = 3): ProMapDef => ({
  schemaVersion: "1",
  id: "test-map",
  meta: {
    title: "Fairground",
    minPlayers: 2,
    maxPlayers: 2,
    specialRules: false,
    imageUrl: "https://example.com/board.webp",
    source: "https://example.com/credit",
    license: "CC-BY",
    ...over,
  },
  zones: [{ id: "z1", label: "Z1", color: "#fff" }],
  spaces: Array.from({ length: spaces }, (_, i) => space(i)),
});

/** The `body=` query param, decoded back into the markdown GitHub will render. */
const bodyOf = (url: string): string =>
  decodeURIComponent(new URL(url).searchParams.get("body") ?? "");
const titleOf = (url: string): string =>
  decodeURIComponent(new URL(url).searchParams.get("title") ?? "");

/** A board big enough that the JSON can never ride along in the URL. */
const bigMap = (): ProMapDef => {
  const m = map({}, 60);
  m.spaces = m.spaces.map((s) => ({ ...s, zones: ["z1"], adjacentTo: [...s.adjacentTo, "s1", "s2"] }));
  return m;
};
const pretty = (m: ProMapDef) => JSON.stringify(m, null, 2);

describe("mapSubmissionIssue", () => {
  it("keeps the [map] title prefix", () => {
    expect(titleOf(mapSubmissionIssueUrl(map()))).toBe("[map] Fairground");
    expect(titleOf(mapSubmissionIssueUrl(map({ title: "" })))).toBe("[map] Untitled map");
  });

  it("embeds a small map's JSON and reports it", () => {
    const m = map();
    const { url, embedded } = mapSubmissionIssue(m, pretty(m));
    expect(embedded).toBe(true);
    const body = bodyOf(url);
    expect(body).toContain('"schemaVersion": "1"');
    expect(body).not.toContain(PASTE_TOKEN);
    expect(body).toContain("**Your map is included below.**");
  });

  it("falls back to the paste token when the map is too big for the URL", () => {
    const m = bigMap();
    const { url, embedded } = mapSubmissionIssue(m, pretty(m));
    expect(embedded).toBe(false);
    expect(url.length).toBeLessThanOrEqual(7500);
    const body = bodyOf(url);
    expect(body).toContain(`\`\`\`json\n${PASTE_TOKEN}\n\`\`\``);
    expect(body).toContain("**Step 1 — paste your map.**");
  });

  it("reports not-embedded when no JSON is supplied at all", () => {
    expect(mapSubmissionIssue(map()).embedded).toBe(false);
    expect(bodyOf(mapSubmissionIssueUrl(map()))).toContain(PASTE_TOKEN);
  });

  it("puts the paste target above the details", () => {
    const m = bigMap();
    const body = bodyOf(mapSubmissionIssue(m, pretty(m)).url);
    expect(body.indexOf(PASTE_TOKEN)).toBeLessThan(body.indexOf("### Details"));
    expect(body.indexOf("```json")).toBeLessThan(body.indexOf("### Details"));
    expect(body.startsWith("## Map submission: Fairground")).toBe(true);
  });

  it("asks the author to confirm the paste only when they had to paste", () => {
    const big = bigMap();
    const pasteBody = bodyOf(mapSubmissionIssue(big, pretty(big)).url);
    expect(pasteBody).toContain(`- [ ] I replaced ${PASTE_TOKEN} above with my map`);
    expect(pasteBody).toContain("- [ ] The board image URL below is public (renders for both players)");
    expect(pasteBody).toContain("- [ ] I playtested this map on /pro/game");

    const small = map();
    const embeddedBody = bodyOf(mapSubmissionIssue(small, pretty(small)).url);
    expect(embeddedBody).not.toContain("I replaced");
    expect(embeddedBody).toContain("- [ ] The board image URL below is public (renders for both players)");
    expect(embeddedBody).toContain("- [ ] I playtested this map on /pro/game");
  });

  it("carries the details, and flags a missing board image", () => {
    const body = bodyOf(mapSubmissionIssueUrl(map()));
    expect(body).toContain("- **Title:** Fairground");
    expect(body).toContain("- **Spaces:** 3");
    expect(body).toContain("- **Board image URL:** https://example.com/board.webp");
    expect(body).toContain("- **Source / credit:** https://example.com/credit");
    expect(body).toContain("- **License:** CC-BY");

    const bare = bodyOf(mapSubmissionIssueUrl(map({ imageUrl: "", source: "", license: "" })));
    expect(bare).toContain("⚠️ none — add a public image URL");
    expect(bare).toContain("- **Source / credit:** (none)");
  });
});
