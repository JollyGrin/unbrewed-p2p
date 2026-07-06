import { buildSandboxBugReportUrl, SandboxBugReportInput } from "./bugReport";
import { SandboxLogEntry } from "./gameLog";

const entry = (i: number): SandboxLogEntry => ({
  key: `dean-${i}`,
  player: "dean",
  at: 1_700_000_000_000 + i * 1000,
  text: `moved a token #${i}`,
});

const input = (over: Partial<SandboxBugReportInput> = {}): SandboxBugReportInput => ({
  description: "A card token got stuck under the board",
  roomId: "ABCD",
  entries: [],
  commit: "abc1234",
  appVersion: "0.1.0",
  userAgent: "jest",
  ...over,
});

const MAX = 7500;

describe("buildSandboxBugReportUrl", () => {
  it("prefills sandbox labels, title prefix, marker, room, and description", () => {
    const url = buildSandboxBugReportUrl(input({ entries: [entry(0), entry(1)] }));
    expect(url.startsWith("https://github.com/JollyGrin/unbrewed-p2p/issues/new?")).toBe(true);
    expect(url).toContain("labels=bug%2Cplayer-report%2Csandbox");
    expect(url).toContain(encodeURIComponent("[Sandbox bug]"));
    const body = decodeURIComponent(url.split("&body=")[1]);
    expect(body).toContain("Reported from the **sandbox**");
    expect(body).toContain("A card token got stuck under the board");
    expect(body).toContain("Room:** ABCD");
    expect(body).toContain("abc1234"); // commit
    expect(body).toContain("jest"); // UA
  });

  it("stays under the length ceiling even with a very long log", () => {
    const entries: SandboxLogEntry[] = [];
    for (let i = 400; i >= 0; i--) {
      entries.push({
        key: `dean-${i}`,
        player: "dean",
        at: 1_700_000_000_000 + i * 1000,
        text: `a very long activity line #${i} `.repeat(6),
      });
    }
    const url = buildSandboxBugReportUrl(input({ entries, description: "x".repeat(500) }));
    expect(url.length).toBeLessThanOrEqual(MAX);
    // full-log pointer survives the shrink
    expect(decodeURIComponent(url)).toContain("attach the CSV");
  });

  it("degrades to a placeholder title when no description is given", () => {
    const url = buildSandboxBugReportUrl(input({ description: "" }));
    expect(url).toContain(encodeURIComponent("[Sandbox bug] Bug report"));
  });
});
