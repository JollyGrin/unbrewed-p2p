import { fixtureRoundRobin4, fixtureRoundRobin6 } from "./fixtures";
import { discordPost } from "./share";

describe("discordPost summary", () => {
  it("mentions the top-2 final for round robin with a final", () => {
    expect(discordPost(fixtureRoundRobin6().tournament)).toMatch(/one game per match, then the top 2 play a final/);
  });
  it("does not without one", () => {
    expect(discordPost(fixtureRoundRobin4().tournament)).not.toMatch(/play a final/);
  });
  it("follows the real matchup setting (C1, #1236)", () => {
    const t = fixtureRoundRobin4().tournament;
    expect(discordPost({ ...t, matchupRule: { mode: "free" }, settings: {} })).toMatch(/Players choose\./);
    const set = discordPost({ ...t, matchupRule: { mode: "free" }, settings: { matchupSetBy: "organizer" } });
    expect(set).toMatch(/Organizer sets each match\./);
    expect(set).not.toMatch(/Players choose/);
  });
});

describe("escapeDiscord", () => {
  const { escapeDiscord } = jest.requireActual("./share");
  it("defuses a masked link", () => {
    expect(escapeDiscord("[x](https://phish)")).toBe("\\[x\\]\\(https:\u200b/\u200b/\u200bphish\\)");
  });
  it("escapes emphasis, code, spoilers, quotes, and strikethrough", () => {
    expect(escapeDiscord("*a* _b_ ~c~ `d` ||e|| >f")).toBe("\\*a\\* \\_b\\_ \\~c\\~ \\`d\\` \\|\\|e\\|\\| \\>f");
  });
  it("escapes backslashes, leading heading/list markers, and mentions", () => {
    expect(escapeDiscord("a\\b")).toBe("a\\\\b");
    expect(escapeDiscord("# Big")).toBe("\\# Big");
    expect(escapeDiscord("- item")).toBe("\\- item");
    expect(escapeDiscord("@everyone")).toBe("@​everyone");
  });
  it("leaves a plain name alone", () => {
    expect(escapeDiscord("Autumn Skirmish 2")).toBe("Autumn Skirmish 2");
  });
  it("escapes the tournament name in the post", () => {
    const t = fixtureRoundRobin4().tournament;
    const post = discordPost({ ...t, name: "[x](https://phish) @everyone **hi**" });
    expect(post.split("\n")[0]).toContain("\\[x\\]\\(https:\u200b/\u200b/\u200bphish\\) @​everyone \\*\\*hi\\*\\*");
    expect(post).not.toContain("](");
  });
});

describe("escapeDiscord URL defanging (#1246)", () => {
  const { escapeDiscord } = jest.requireActual("./share");
  it("breaks the autolink in a raw URL from the tournament name", () => {
    const out = escapeDiscord("https://example.com/phish");
    expect(out).not.toContain("https://");
    expect(out.replace(/\u200b/g, "")).toBe("https://example.com/phish");
  });
  it("defangs the hostile name in the Discord post", () => {
    const t = fixtureRoundRobin4().tournament;
    const post = discordPost({ ...t, name: "Free packs https://example.com/phish http://evil.test" });
    const name = post.split("\n")[0];
    expect(name).not.toMatch(/https?:\/\//);
    expect(name.replace(/\u200b/g, "")).toContain("https://example.com/phish");
  });
});

describe("escapeDiscord edges (#1252)", () => {
  const { escapeDiscord } = jest.requireActual("./share");
  const bare = (s: string) => s.replace(/\u200b/g, "");
  it("breaks bare domains after the dot", () => {
    expect(escapeDiscord("discord.gg/abc")).toBe("discord.\u200bgg/abc");
    expect(escapeDiscord("see example.com/x now")).toBe("see example.\u200bcom/x now");
    expect(escapeDiscord("www.evil.io")).toBe("www.\u200bevil.\u200bio");
  });
  it("leaves versions and plain decimals alone", () => {
    expect(escapeDiscord("Round 2.5 v1.2")).toBe("Round 2.5 v1.2");
  });
  it("escapes a leading numbered-list marker", () => {
    expect(escapeDiscord("1. first")).toBe("\\1. first");
    expect(escapeDiscord("12) second")).toBe("12\\) second");
    expect(escapeDiscord("+ plus")).toBe("\\+ plus");
  });
  it("collapses newlines and Unicode line separators", () => {
    const out = escapeDiscord("a\n# h\r\nb\u2028c\u2029d\u0085e");
    expect(out).not.toMatch(/[\r\n\u2028\u2029\u0085]/);
    expect(out).toBe("a # h b c d e");
  });
  it("keeps a hostile name on one line in the post, and a map id outside the catalog", () => {
    const t = fixtureRoundRobin4().tournament;
    const post = discordPost({ ...t, name: "Cup\n1. free.packs.gg/x\n@everyone" });
    expect(post.split("\n")[0]).toContain("Cup 1. free.\u200bpacks.\u200bgg/x @\u200beveryone");
    const withMap = discordPost({ ...t, map: { kind: "catalog", id: "evil\nid.com/x" } } as never);
    expect(bare(withMap).split("\n").some((l) => l.startsWith("id."))).toBe(false);
  });
});
