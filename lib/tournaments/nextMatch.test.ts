import { fixtureMatch, fixtureMyTournaments } from "./fixtures";
import { nextMatchView, sizeOf, timeLeftText } from "./nextMatch";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const iso = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

const view = (state: "waiting" | "opponent_ready" | "you_ready" | "in_play", withDetail = true) => {
  const my = fixtureMyTournaments(state, new Date(NOW).toISOString());
  const detail = withDetail ? fixtureMatch(state, new Date(NOW).toISOString()).detail : null;
  return nextMatchView(my.nextMatch!, detail, sizeOf(my.nextMatch!, my.tournaments), NOW);
};

describe("nextMatchView", () => {
  it("your turn: I'm ready, with matchup, opponent activity and time left", () => {
    const v = view("waiting");
    expect(v.state).toBe("open");
    expect(v.title).toBe("Semifinal 2 vs bountyhuntr");
    expect(v.primary).toBe("ready");
    expect(v.primaryLabel).toBe("I'm ready to play");
    expect(v.youPlay).toBe("You play Kenshiro");
    expect(v.map).toBeTruthy();
    expect(v.opponentActive).toMatch(/bountyhuntr signed in \d+ min ago/);
    expect(v.timeLeft).toBe("1d 2h left");
    expect(v.href).toBe("/tournaments?t=fixture-match-waiting&m=m2-1");
  });

  it("opponent ready: join now with the seat clock", () => {
    const v = view("opponent_ready");
    expect(v.state).toBe("opponent_ready");
    expect(v.primary).toBe("join");
    expect(v.caption).toBe("bountyhuntr is ready · seat held 11:48");
    expect(v.title).toBe("Semifinal 2 is waiting for you");
  });

  it("you're ready: view match, seat held", () => {
    const v = view("you_ready");
    expect(v.state).toBe("you_ready");
    expect(v.primary).toBe("view");
    expect(v.caption).toMatch(/^You're ready · seat held 14:/);
  });

  it("in play now: view match", () => {
    const v = view("in_play");
    expect(v.state).toBe("in_play");
    expect(v.caption).toBe("In play now");
    expect(v.primary).toBe("view");
  });

  it("still draws from /me/tournaments alone when the match detail is missing", () => {
    const v = view("waiting", false);
    expect(v.state).toBe("open");
    expect(v.opponent).toBe("bountyhuntr");
    expect(v.opponentActive).toBeNull();
  });
});

describe("timeLeftText", () => {
  it("formats days, hours and minutes, and null once passed", () => {
    expect(timeLeftText(iso(41), NOW)).toBe("1d 17h left");
    expect(timeLeftText(iso(5.2), NOW)).toBe("5h 12m left");
    expect(timeLeftText(iso(0.7), NOW)).toBe("42m left");
    expect(timeLeftText(iso(-1), NOW)).toBeNull();
    expect(timeLeftText(null, NOW)).toBeNull();
  });
});
