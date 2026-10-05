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
