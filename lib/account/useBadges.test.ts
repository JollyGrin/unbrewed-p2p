/**
 * The badge case's re-probe (p2p #1399): the post-game card asks `/me/badges`
 * again to diff `unlocked`, and a refresh that fails must leave the case the
 * player can already see exactly as it was.
 */
import { __resetBadgeStoreForTests, ensureBadgeProbe, reprobeBadges } from "./useBadges";
import type { BadgesResult } from "./badges";

const okCase = (ids: Array<[string, boolean]>): BadgesResult => ({
  ok: true,
  value: { badges: ids.map(([id, unlocked]) => ({ id, name: id, blurb: "", unlocked, unlockedWhy: "" })), selected: [] },
});

let replies: BadgesResult[] = [];
jest.mock("./badges", () => ({
  ...jest.requireActual("./badges"),
  fetchBadgeCase: jest.fn(async () => replies.shift() ?? { ok: false, reason: "unavailable", selected: [] }),
  putWornBadges: jest.fn(),
}));

// The store is module state; read it back the way consumers do — through a
// probe that resolves to the current snapshot.
const { fetchBadgeCase } = jest.requireMock("./badges") as { fetchBadgeCase: jest.Mock };

beforeEach(() => {
  __resetBadgeStoreForTests();
  replies = [];
  fetchBadgeCase.mockClear();
});

it("re-asks the api once and resolves with the refreshed catalog", async () => {
  replies = [okCase([["first-win", true]]), okCase([["first-win", true], ["streak-5", true]])];
  await ensureBadgeProbe();
  const refreshed = await reprobeBadges();
  expect(refreshed?.map((b) => b.id)).toEqual(["first-win", "streak-5"]);
  expect(fetchBadgeCase).toHaveBeenCalledTimes(2);
  // Later ensure calls share the re-probe rather than firing a third request.
  await ensureBadgeProbe();
  expect(fetchBadgeCase).toHaveBeenCalledTimes(2);
});

it("a failed refresh resolves null (the case on screen is left alone)", async () => {
  replies = [okCase([["first-win", true]])];
  await ensureBadgeProbe();
  expect(await reprobeBadges()).toBeNull();
  expect(fetchBadgeCase).toHaveBeenCalledTimes(2);
});
