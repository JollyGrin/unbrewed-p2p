import {
  collapsedMatchups,
  collapsedMatchupsView,
  crownLine,
  formatRate,
  gamesOnHero,
  heroesHref,
  heroIdFromQuery,
  heroIndexRows,
  heroRankTrack,
  isMostPlayed,
  MATCHUPS_SHOWN,
  matchupBars,
  ordinal,
  pilotGapLine,
  pilotRows,
  shareOfAllGames,
  unratedMatchups,
  unratedSummaryLine,
  windowFromQuery,
  winRate,
} from "./heroPage";
import { ROSTER_SIZE } from "./roster";
import type { CommunityHero, HeroMatchup, HeroPilot } from "./types";

const pilot = (username: string, wins: number, games: number): HeroPilot => ({
  username,
  avatarUrl: null,
  wins,
  games,
  draws: 0,
});

describe("query parsing and the window toggle", () => {
  it("reads ?h= as a trimmed lower-case id", () => {
    expect(heroIdFromQuery(" The-Mandalorian ")).toBe("the-mandalorian");
    expect(heroIdFromQuery(["appa", "thrall"])).toBe("appa");
    expect(heroIdFromQuery("")).toBeNull();
    expect(heroIdFromQuery(undefined)).toBeNull();
  });

  it("defaults to this month; only `all` switches", () => {
    expect(windowFromQuery(undefined)).toBe("month");
    expect(windowFromQuery("month")).toBe("month");
    expect(windowFromQuery("bogus")).toBe("month");
    expect(windowFromQuery("all")).toBe("all");
  });

  it("builds hrefs that only carry window=all", () => {
    expect(heroesHref("appa", "month")).toBe("/heroes?h=appa");
    expect(heroesHref("appa", "all")).toBe("/heroes?h=appa&window=all");
    expect(heroesHref(null, "month")).toBe("/heroes");
    expect(heroesHref(null, "all")).toBe("/heroes?window=all");
  });
});

describe("rates and shares", () => {
  it("needs 3 games for a win rate", () => {
    expect(winRate(2, 2)).toBeNull();
    expect(winRate(2, 3)).toBe(67);
    expect(formatRate(null)).toBe("·");
    expect(formatRate(54)).toBe("54%");
  });

  it("share of all games is null when the total wasn't sent", () => {
    expect(shareOfAllGames(212, 1482)).toBe(14);
    expect(shareOfAllGames(0, 0)).toBe(0);
    expect(shareOfAllGames(5, null)).toBeNull();
  });

  it("most played needs the single top hero with games", () => {
    const heroes = [
      { heroId: "appa", games: 3 },
      { heroId: "the-mandalorian", games: 212 },
    ] as CommunityHero[];
    expect(isMostPlayed("the-mandalorian", heroes)).toBe(true);
    expect(isMostPlayed("appa", heroes)).toBe(false);
    expect(isMostPlayed("appa", null)).toBe(false);
    expect(isMostPlayed("appa", [{ heroId: "appa", games: 0 } as CommunityHero])).toBe(false);
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [6, "6th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [101, "101st"],
    [111, "111th"],
  ])("%i → %s", (n, text) => expect(ordinal(n)).toBe(text));
});

describe("hero rank track", () => {
  it("matches the mockup at 24 games", () => {
    const track = heroRankTrack(24, "The Mandalorian");
    expect(track.sentence).toBe("24 games as The Mandalorian. One more game makes Silver.");
    expect(track.fill).toBe(49);
    expect(track.steps.map((s) => s.caption)).toEqual([
      "1 game · done",
      "5 games · done",
      "25 games · 1 to go",
      "100 games",
    ]);
  });

  it("counts down in plural and tops out at Gold", () => {
    expect(heroRankTrack(7, "Appa").sentence).toBe("7 games as Appa. 18 more games make Silver.");
    expect(heroRankTrack(1, "Appa").sentence).toBe("1 game as Appa. 4 more games make Bronze.");
    const gold = heroRankTrack(140, "Appa");
    expect(gold.sentence).toBe("140 games as Appa. Gold. The top rank.");
    expect(gold.fill).toBe(100);
    expect(gold.steps.every((s) => s.reached)).toBe(true);
  });

  it("has an inviting zero state", () => {
    const track = heroRankTrack(0, "Appa");
    expect(track.sentence).toBe("No games as Appa yet. One game makes Tried.");
    expect(track.fill).toBe(0);
    expect(track.steps[0].caption).toBe("1 game · 1 to go");
  });

  it("sums the viewer's byHero rows for the hero", () => {
    const byHero = [
      { heroId: "appa", games: 3 },
      { heroId: "thrall", games: 9 },
      { heroId: "appa", games: 2 },
    ];
    expect(gamesOnHero(byHero, "appa")).toBe(5);
    expect(gamesOnHero(null, "appa")).toBe(0);
  });
});

describe("top pilots", () => {
  const pilots = [
    pilot("TinCanTom", 71, 118),
    pilot("pawnstorm", 38, 66),
    pilot("Dunmore", 19, 38),
    pilot("JollyGrin", 15, 24),
    pilot("Brindle", 12, 2),
  ];

  it("ranks in api order, tiers by games, marks the viewer case-insensitively", () => {
    const rows = pilotRows(pilots, "jollygrin");
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0].tier).toBe("Gold hero rank");
    expect(rows[3]).toMatchObject({ you: true, tier: "Bronze hero rank", rate: 63 });
    expect(rows[4].rate).toBeNull();
  });

  it("gap line names the row above and its place", () => {
    expect(pilotGapLine(pilotRows(pilots, "JollyGrin"))).toBe(
      "You are 4 wins behind Dunmore for 3rd.",
    );
    expect(pilotGapLine(pilotRows(pilots, "pawnstorm"))).toBe(
      "You are 33 wins behind TinCanTom for 1st.",
    );
  });

  it("singular and tie wording", () => {
    const rows = pilotRows([pilot("a", 5, 9), pilot("b", 4, 9), pilot("c", 4, 12)], "b");
    expect(pilotGapLine(rows)).toBe("You are 1 win behind a for 1st.");
    expect(pilotGapLine(pilotRows([pilot("a", 5, 9), pilot("c", 5, 12)], "c"))).toBe(
      "You are level on wins with a for 1st.",
    );
  });

  it("no gap line for #1, a viewer off the list, or a guest", () => {
    expect(pilotGapLine(pilotRows(pilots, "TinCanTom"))).toBeNull();
    expect(pilotGapLine(pilotRows(pilots, "nobody"))).toBeNull();
    expect(pilotGapLine(pilotRows(pilots, null))).toBeNull();
  });
});

describe("matchups", () => {
  const bars = matchupBars([
    { opponentHeroId: "king-kong", opponentHeroName: null, games: 22, wins: 15, draws: 0 },
    { opponentHeroId: "kenshiro", opponentHeroName: null, games: 21, wins: 7, draws: 0 },
    { opponentHeroId: "appa", opponentHeroName: null, games: 2, wins: 2, draws: 0 },
    { opponentHeroId: "zzz-new", opponentHeroName: "New Hero", games: 4, wins: 2, draws: 0 },
  ]);

  it("drops opponents under 3 games and sorts by win rate", () => {
    expect(bars.map((b) => b.opponentHeroId)).toEqual(["king-kong", "zzz-new", "kenshiro"]);
  });

  it("diverges from 50% with a capped width", () => {
    expect(bars[0]).toMatchObject({ rate: 68, side: "win", width: 90, tip: "68% over 22 games" });
    expect(bars[1]).toMatchObject({ rate: 50, side: "win", width: 0, name: "New Hero" });
    expect(bars[2]).toMatchObject({ rate: 33, side: "loss", width: 85 });
    const lopsided = matchupBars([
      { opponentHeroId: "thrall", opponentHeroName: null, games: 10, wins: 0, draws: 0 },
    ]);
    expect(lopsided[0].width).toBe(100);
  });
});

describe("collapsed matchups (issue #944, both ends)", () => {
  // Distinct win rates (100 games each, wins = i) so sort order is
  // unambiguous: opponent-0 is the worst matchup, opponent-(n-1) the best.
  const opponents = (n: number): HeroMatchup[] =>
    Array.from({ length: n }, (_, i) => ({
      opponentHeroId: `opponent-${i}`,
      opponentHeroName: null,
      games: 100,
      wins: i,
      draws: 0,
    }));

  it("12 opponents: unchanged, nothing cut", () => {
    const bars = matchupBars(opponents(12));
    const { top, bottom } = collapsedMatchups(bars);
    expect(bars).toHaveLength(MATCHUPS_SHOWN);
    expect(top).toEqual(bars);
    expect(bottom).toEqual([]);
  });

  it("13 opponents: the 6 best and the 6 worst, the middle row cut", () => {
    const bars = matchupBars(opponents(13));
    const { top, bottom } = collapsedMatchups(bars);
    expect(top).toHaveLength(6);
    expect(bottom).toHaveLength(6);
    // Best-first throughout, and still descending across the divider.
    expect(top.map((b) => b.opponentHeroId)).toEqual([
      "opponent-12",
      "opponent-11",
      "opponent-10",
      "opponent-9",
      "opponent-8",
      "opponent-7",
    ]);
    expect(bottom.map((b) => b.opponentHeroId)).toEqual([
      "opponent-5",
      "opponent-4",
      "opponent-3",
      "opponent-2",
      "opponent-1",
      "opponent-0",
    ]);
    // opponent-6 (the middle, 7th-best of 13) is the one row collapsed hides.
    expect([...top, ...bottom].some((b) => b.opponentHeroId === "opponent-6")).toBe(false);
  });

  it("30 opponents: still just the 6 best and 6 worst", () => {
    const bars = matchupBars(opponents(30));
    const { top, bottom } = collapsedMatchups(bars);
    expect(top.map((b) => b.opponentHeroId)).toEqual([
      "opponent-29",
      "opponent-28",
      "opponent-27",
      "opponent-26",
      "opponent-25",
      "opponent-24",
    ]);
    expect(bottom.map((b) => b.opponentHeroId)).toEqual([
      "opponent-5",
      "opponent-4",
      "opponent-3",
      "opponent-2",
      "opponent-1",
      "opponent-0",
    ]);
  });
});

describe("unrated matchups (issue #949: list every opponent)", () => {
  it("keeps only opponents under 3 games, sorted by games desc then name", () => {
    const rows = unratedMatchups([
      { opponentHeroId: "king-kong", opponentHeroName: null, games: 22, wins: 15, draws: 0 },
      { opponentHeroId: "zzz-new", opponentHeroName: "New Hero", games: 2, wins: 1, draws: 0 },
      { opponentHeroId: "appa", opponentHeroName: null, games: 2, wins: 0, draws: 1 },
      { opponentHeroId: "thrall", opponentHeroName: null, games: 1, wins: 1, draws: 0 },
    ]);
    expect(rows.map((r) => r.opponentHeroId)).toEqual(["appa", "zzz-new", "thrall"]);
  });

  it("formats the record W–L, adding –D only when draws > 0", () => {
    const rows = unratedMatchups([
      { opponentHeroId: "a", opponentHeroName: null, games: 1, wins: 1, draws: 0 },
      { opponentHeroId: "b", opponentHeroName: null, games: 2, wins: 0, draws: 0 },
      { opponentHeroId: "c", opponentHeroName: null, games: 2, wins: 1, draws: 1 },
    ]);
    expect(rows.find((r) => r.opponentHeroId === "a")).toMatchObject({
      record: "1–0",
      tip: "1–0 over 1 game (too few for a win rate)",
    });
    expect(rows.find((r) => r.opponentHeroId === "b")).toMatchObject({ record: "0–2" });
    expect(rows.find((r) => r.opponentHeroId === "c")).toMatchObject({
      record: "1–0–1",
      tip: "1–0–1 over 2 games (too few for a win rate)",
    });
  });

  it("summary line pluralises correctly", () => {
    expect(unratedSummaryLine(1)).toBe("1 more hero faced once or twice");
    expect(unratedSummaryLine(12)).toBe("12 more heroes faced once or twice");
  });
});

describe("collapsed matchups view (issue #949: unrated rows fill leftover slots up to 12)", () => {
  const opponents = (n: number, games: number): HeroMatchup[] =>
    Array.from({ length: n }, (_, i) => ({
      opponentHeroId: `rated-${i}`,
      opponentHeroName: null,
      games,
      wins: i + 1,
      draws: 0,
    }));

  const unrated = (n: number): HeroMatchup[] =>
    Array.from({ length: n }, (_, i) => ({
      opponentHeroId: `unrated-${i}`,
      opponentHeroName: null,
      games: 1,
      wins: i % 2,
      draws: 0,
    }));

  it("Cecil's month: 1 rated + 12 unrated — 12 rows shown, 1 more folded into the summary", () => {
    const rated = matchupBars(opponents(1, 3));
    const rows = unratedMatchups(unrated(12));
    const view = collapsedMatchupsView(rated, rows);
    expect(view.top).toHaveLength(1);
    expect(view.bottom).toHaveLength(0);
    expect(view.shownUnrated).toHaveLength(11);
    expect(view.summaryCount).toBe(1);
    expect(view.total).toBe(13);
    expect(view.hasMore).toBe(true);
  });

  it("0 rated, 5 unrated: all 5 show directly, nothing hidden, no Show all", () => {
    const rows = unratedMatchups(unrated(5));
    const view = collapsedMatchupsView([], rows);
    expect(view.top).toHaveLength(0);
    expect(view.bottom).toHaveLength(0);
    expect(view.shownUnrated).toHaveLength(5);
    expect(view.summaryCount).toBe(0);
    expect(view.total).toBe(5);
    expect(view.hasMore).toBe(false);
  });

  it("0 rated, more than 12 unrated: the first 12 show, the rest is summarised", () => {
    const rows = unratedMatchups(unrated(14));
    const view = collapsedMatchupsView([], rows);
    expect(view.shownUnrated).toHaveLength(12);
    expect(view.summaryCount).toBe(2);
    expect(view.total).toBe(14);
    expect(view.hasMore).toBe(true);
  });

  it("14 rated + 5 unrated: rated both-ends fills all 12 slots, unrated folds into one summary line", () => {
    const rated = matchupBars(opponents(14, 100));
    const rows = unratedMatchups(unrated(5));
    const view = collapsedMatchupsView(rated, rows);
    expect(view.top).toHaveLength(6);
    expect(view.bottom).toHaveLength(6);
    expect(view.shownUnrated).toHaveLength(0);
    expect(view.summaryCount).toBe(5);
    expect(view.total).toBe(19);
    expect(view.hasMore).toBe(true);
  });

  it("rated alone fills every slot: no unrated shown or summarised", () => {
    const rated = matchupBars(opponents(12, 100));
    const rows = unratedMatchups(unrated(3));
    const view = collapsedMatchupsView(rated, rows);
    expect(view.top).toHaveLength(12);
    expect(view.bottom).toHaveLength(0);
    expect(view.shownUnrated).toHaveLength(0);
    expect(view.summaryCount).toBe(3);
    expect(view.hasMore).toBe(true);
  });
});

describe("crown and index", () => {
  it("crown line", () => {
    expect(crownLine({ wins: 71, games: 118 })).toBe("71 wins in 118 games.");
    expect(crownLine({ wins: 1, games: 1 })).toBe("1 win in 1 game.");
  });

  it("lists every roster hero, most played first, unplayed last", () => {
    const rows = heroIndexRows([
      { heroId: "thrall", heroName: null, games: 40, wins: 20, draws: 0, crown: null },
      { heroId: "appa", heroName: null, games: 90, wins: 50, draws: 0, crown: { username: "x", avatarUrl: null, wins: 9, games: 12 } },
      { heroId: "thetis", heroName: null, games: 500, wins: 1, draws: 0, crown: null },
    ]);
    expect(rows).toHaveLength(ROSTER_SIZE);
    expect(rows.map((r) => r.heroId).slice(0, 3)).toEqual(["appa", "thrall", "baba-yaga"]);
    expect(rows[0]).toMatchObject({ rate: 56, played: true, crown: { username: "x" } });
    expect(rows[2]).toMatchObject({ played: false, games: 0, rate: null });
    expect(rows.some((r) => r.heroId === "thetis")).toBe(false);
  });

  it("with no community data it is the roster alphabetically", () => {
    const rows = heroIndexRows(null);
    expect(rows).toHaveLength(ROSTER_SIZE);
    expect(rows.every((r) => !r.played)).toBe(true);
    expect(rows[0].name).toBe("Appa");
  });
});
