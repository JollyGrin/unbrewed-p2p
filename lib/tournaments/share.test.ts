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
