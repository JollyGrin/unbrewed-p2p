/**
 * The Collection nav dot's state (p2p #1657): on after a game makes an upgrade
 * affordable, off once that hero has been opened on /collection, and back only
 * when something new comes into reach.
 */
import {
  UPGRADES_SEEN_KEY,
  UpgradeSeenState,
  __resetUpgradeSeenForTest,
  hasUnseenUpgrade,
  markUpgradeSeen,
  noteAffordableUpgrade,
  parseUpgradeSeen,
  refreshAffordableUpgrades,
  withAffordable,
  withRefreshed,
  withSeen,
} from "./upgradeSeen";

const EMPTY: UpgradeSeenState = { affordable: {}, seen: {} };

describe("transitions", () => {
  it("nothing affordable → no dot", () => {
    expect(hasUnseenUpgrade(EMPTY)).toBe(false);
  });

  it("a game makes an upgrade affordable → dot; the visit clears it", () => {
    const after = withAffordable(EMPTY, "hollow-oak", 1);
    expect(hasUnseenUpgrade(after)).toBe(true);
    expect(hasUnseenUpgrade(withSeen(after, "hollow-oak"))).toBe(false);
  });

  it("visiting ANOTHER hero does not clear it", () => {
    const after = withAffordable(EMPTY, "hollow-oak", 1);
    expect(hasUnseenUpgrade(withSeen(after, "kenshiro"))).toBe(true);
  });

  it("the same tier, still affordable after another game, stays seen", () => {
    const seen = withSeen(withAffordable(EMPTY, "hollow-oak", 1), "hollow-oak");
    expect(hasUnseenUpgrade(withAffordable(seen, "hollow-oak", 1))).toBe(false);
  });

  it("a higher tier coming into reach is news again", () => {
    const seen = withSeen(withAffordable(EMPTY, "hollow-oak", 1), "hollow-oak");
    expect(hasUnseenUpgrade(withAffordable(seen, "hollow-oak", 2))).toBe(true);
  });

  it("spent, then affordable again → the dot returns", () => {
    const seen = withSeen(withAffordable(EMPTY, "hollow-oak", 1), "hollow-oak");
    const spent = withAffordable(seen, "hollow-oak", 0);
    expect(spent).toEqual(EMPTY);
    expect(hasUnseenUpgrade(withAffordable(spent, "hollow-oak", 1))).toBe(true);
  });

  it("/collection's refresh corrects listed heroes and never adds one", () => {
    const state = withAffordable(withAffordable(EMPTY, "hollow-oak", 1), "kenshiro", 2);
    // hollow-oak was bought out; kenshiro dropped to bronze; luke is affordable but was never noted.
    expect(withRefreshed(state, { "hollow-oak": 0, kenshiro: 1, "luke-skywalker": 3 })).toEqual({
      affordable: { kenshiro: 1 },
      seen: {},
    });
  });
});

describe("storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetUpgradeSeenForTest();
  });

  it("persists, and survives a fresh read", () => {
    noteAffordableUpgrade("hollow-oak", 1);
    __resetUpgradeSeenForTest();
    const stored = parseUpgradeSeen(window.localStorage.getItem(UPGRADES_SEEN_KEY));
    expect(stored).toEqual({ affordable: { "hollow-oak": 1 }, seen: {} });
    markUpgradeSeen("hollow-oak");
    expect(hasUnseenUpgrade(parseUpgradeSeen(window.localStorage.getItem(UPGRADES_SEEN_KEY)))).toBe(false);
    refreshAffordableUpgrades({});
    expect(parseUpgradeSeen(window.localStorage.getItem(UPGRADES_SEEN_KEY))).toEqual(EMPTY);
  });

  it("junk in storage reads as empty", () => {
    expect(parseUpgradeSeen("{not json")).toEqual(EMPTY);
    expect(parseUpgradeSeen('{"affordable":{"a":"x","b":-1,"c":2},"seen":[1]}')).toEqual({ affordable: { c: 2 }, seen: {} });
    expect(parseUpgradeSeen(null)).toEqual(EMPTY);
  });
});
