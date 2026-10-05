import { fixtureRoundRobin4, fixtureRoundRobin6 } from "./fixtures";
import { discordPost } from "./share";

describe("discordPost summary", () => {
  it("mentions the top-2 final for round robin with a final", () => {
    expect(discordPost(fixtureRoundRobin6().tournament)).toMatch(/one game per match, then the top 2 play a final/);
  });
  it("does not without one", () => {
    expect(discordPost(fixtureRoundRobin4().tournament)).not.toMatch(/play a final/);
  });
});
