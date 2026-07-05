import { buildBugReportUrl, turnsInLog, BugReportInput } from "./bugReport";
import { ProLogEntry } from "./gameLog";
import { PlayerView, ViewFighter } from "./protocol";

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "King Kong",
  space: "s1",
  tailSpace: null,
  hp: 18,
  maxHp: 18,
  reach: "MELEE",
  defeated: false,
  ...over,
});

const view = (over: Partial<PlayerView> = {}): PlayerView => ({
  you: "p1",
  phase: "PLAY",
  turnNumber: 4,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: { schemaVersion: "1", id: "m", meta: { title: "Drum", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  catalog: {},
  fighters: [
    fighter({ id: "p1/hero", owner: "p1", name: "King Kong", hp: 12 }),
    fighter({ id: "p2/hero", owner: "p2", name: "Baba Yaga", hp: 9, maxHp: 14, reach: "RANGED" }),
  ],
  tokens: [],
  self: { id: "p1", heroId: "king-kong", hand: ["a#1", "b#1"], deckCount: 20, discard: ["c#1"], committedCard: null, counters: {} },
  opponent: { id: "p2", heroId: "baba-yaga", handCount: 5, deckCount: 18, discard: [], hasCommitted: false, counters: {} },
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

const entry = (i: number, turn: number): ProLogEntry => ({
  key: `log-${i}`,
  ts: 1_700_000_000_000 + i * 1000,
  turn,
  who: i % 2 === 0 ? "you" : "opp",
  text: `event number ${i} on turn ${turn}`,
});

const input = (over: Partial<BugReportInput> = {}): BugReportInput => ({
  description: "Defense card didn't reduce damage",
  when: { kind: "just-now" },
  view: view(),
  roomId: "ABCD",
  entries: [],
  commit: "abc1234",
  appVersion: "0.1.0",
  userAgent: "jest",
  ...over,
});

const MAX = 7500;

describe("buildBugReportUrl", () => {
  it("prefills labels, title, matchup, turn and description", () => {
    const url = buildBugReportUrl(input({ entries: [entry(0, 4), entry(1, 4)] }));
    expect(url.startsWith("https://github.com/JollyGrin/unbrewed-p2p/issues/new?")).toBe(true);
    expect(url).toContain("labels=bug%2Cplayer-report");
    const body = decodeURIComponent(url.split("&body=")[1]);
    expect(body).toContain("Defense card didn't reduce damage");
    expect(body).toContain("King Kong"); // reporter hero
    expect(body).toContain("Baba Yaga"); // opponent hero
    expect(body).toContain("Room:** ABCD");
    expect(body).toContain("v"); // protocol version line
    expect(body).toContain("abc1234"); // commit
    expect(body).toContain("jest"); // UA
  });

  it("captures the combat role when a combat is live", () => {
    const url = buildBugReportUrl(
      input({
        view: view({
          combat: {
            attackerPlayer: "p1",
            defenderPlayer: "p2",
            attacker: "p1/hero",
            target: "p2/hero",
            stage: "DAMAGE",
            attackerCard: null,
            defenderCard: null,
            outcome: null,
            attackDamageDealt: null,
          },
        }),
      })
    );
    const body = decodeURIComponent(url.split("&body=")[1]);
    expect(body).toContain("you were ATTACKER");
  });

  it("stays under the length ceiling even with a very long log", () => {
    const entries: ProLogEntry[] = [];
    // newest-first, 400 fat events
    for (let i = 400; i >= 0; i--) {
      entries.push({
        key: `log-${i}`,
        ts: 1_700_000_000_000 + i * 1000,
        turn: Math.ceil(i / 4),
        who: "you",
        text: `a very long activity line #${i} `.repeat(6),
      });
    }
    const url = buildBugReportUrl(input({ entries, description: "x".repeat(500) }));
    expect(url.length).toBeLessThanOrEqual(MAX);
    // full-log pointer survives the shrink
    expect(decodeURIComponent(url)).toContain("attach the CSV");
  });

  it("windows around a chosen earlier turn", () => {
    const entries: ProLogEntry[] = [];
    for (let i = 60; i >= 0; i--) entries.push(entry(i, Math.ceil((i + 1) / 5)));
    const url = buildBugReportUrl(input({ entries, when: { kind: "earlier", turn: 3 } }));
    const body = decodeURIComponent(url.split("&body=")[1]);
    expect(body).toContain("around turn 3");
    expect(url.length).toBeLessThanOrEqual(MAX);
  });
});

describe("turnsInLog", () => {
  it("returns distinct turns newest-first", () => {
    const entries = [entry(5, 3), entry(4, 3), entry(3, 2), entry(2, 1)];
    expect(turnsInLog(entries)).toEqual([3, 2, 1]);
  });
});
