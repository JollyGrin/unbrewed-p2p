/**
 * The post-game panel (p2p #1397): the three result variants, the end-reason
 * line, final HP for every fighter, who you played, the guest line, and the
 * endgame actions under their unchanged conditions.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PlayerView, ViewFighter, ViewPlayer } from "@/lib/pro/protocol";
import type { GameStats } from "@/lib/pro/gameStats";
import { ProPostGame, ProPostGameProps } from "./ProPostGame";

const fighter = (over: Partial<ViewFighter>): ViewFighter =>
  ({
    id: "p1/hero",
    owner: "p1",
    kind: "HERO",
    name: "Kenshiro",
    space: "a1",
    tailSpace: null,
    hp: 5,
    maxHp: 16,
    reach: "MELEE",
    size: "NORMAL",
    defeated: false,
    ...over,
  }) as ViewFighter;

const player = (over: Partial<ViewPlayer>): ViewPlayer =>
  ({ id: "p1", heroId: "kenshiro", you: false, handCount: 0, deckCount: 0, discard: [], ...over }) as unknown as ViewPlayer;

const view = (over: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: "p1",
    phase: "GAME_OVER",
    winner: "p1",
    turnNumber: 11,
    map: { meta: { title: "Mended Drum" } },
    players: [
      player({ id: "p1", heroId: "hollow-oak", you: true }),
      player({ id: "p2", heroId: "kenshiro", displayName: "Specter_Knight", badges: ["first-win", "streak-5"] }),
    ],
    fighters: [
      fighter({ id: "p1/hero", owner: "p1", name: "The Hollow Oak", hp: 5, maxHp: 16 }),
      fighter({ id: "p1/fox", owner: "p1", kind: "SIDEKICK", name: "The Ember Fox", hp: 0, maxHp: 6, defeated: true }),
      fighter({ id: "p2/hero", owner: "p2", name: "Kenshiro", hp: 0, maxHp: 15, defeated: true }),
    ],
    ...over,
  }) as unknown as PlayerView;

const props = (over: Partial<ProPostGameProps> = {}): ProPostGameProps => ({
  view: view(),
  layout: "panel",
  endReason: "HERO_DEFEATED",
  bots: {},
  accountStatus: "signed-in",
  username: "deanlol",
  endNote: null,
  endAction: null,
  rematchHref: null,
  rematchNegotiation: null,
  replayHref: null,
  ...over,
});

describe("result + end reason", () => {
  it("VICTORY in gold with the knockout line", () => {
    render(<ProPostGame {...props()} />);
    const title = screen.getByTestId("post-game-result");
    expect(title).toHaveTextContent("VICTORY");
    expect(title).toHaveAttribute("data-result", "victory");
    expect(screen.getByTestId("game-end-reason")).toHaveTextContent("Won by knockout · Kenshiro fell on turn 11");
    expect(screen.getByText("Mended Drum")).toBeInTheDocument();
    expect(screen.getByText("11 turns")).toBeInTheDocument();
  });

  it("DEFEAT, muted", () => {
    render(<ProPostGame {...props({ view: view({ winner: "p2" }) })} />);
    const title = screen.getByTestId("post-game-result");
    expect(title).toHaveTextContent("DEFEAT");
    expect(title).toHaveAttribute("data-result", "defeat");
    expect(screen.getByTestId("game-end-reason")).toHaveTextContent("Lost by knockout");
  });

  it("NO WINNER for a GAME_OVER with no winner", () => {
    render(<ProPostGame {...props({ view: view({ winner: null }), endReason: "SIMULTANEOUS" })} />);
    expect(screen.getByTestId("post-game-result")).toHaveTextContent("NO WINNER");
    expect(screen.getByTestId("game-end-reason")).toHaveTextContent("Both heroes fell");
  });

  it("omits the reason line when it is unknown, and keeps the tournament note where it was", () => {
    render(<ProPostGame {...props({ endReason: null, endNote: "Opponent was still away — forfeit." })} />);
    expect(screen.queryByTestId("game-end-reason")).toBeNull();
    expect(screen.getByTestId("game-end-note")).toHaveTextContent("still away");
    expect(screen.getByTestId("post-game-result")).toHaveTextContent("VICTORY");
  });
});

describe("matchup", () => {
  it("lists final HP for every fighter on both sides, KO when defeated, and a gold border on the winner", () => {
    render(<ProPostGame {...props()} />);
    const seats = screen.getAllByTestId("post-game-seat");
    expect(seats).toHaveLength(2);
    expect(seats[0]).toHaveAttribute("data-won", "true");
    expect(seats[1]).toHaveAttribute("data-won", "false");

    const mine = within(seats[0]).getAllByTestId("post-game-hp-row");
    expect(mine.map((r) => r.textContent)).toEqual(["The Hollow Oak5 / 16", "The Ember FoxKO"]);
    expect(within(seats[0]).getByText("You · deanlol")).toBeInTheDocument();

    const theirs = within(seats[1]).getAllByTestId("post-game-hp-row");
    expect(theirs.map((r) => r.textContent)).toEqual(["KenshiroKO"]);
    expect(within(seats[1]).getByText("No sidekick")).toBeInTheDocument();
  });

  it("a human opponent: name linked to the public profile, with badge glyphs", () => {
    render(<ProPostGame {...props()} />);
    const them = screen.getAllByTestId("post-game-seat")[1];
    const link = within(them).getByRole("link", { name: "Specter_Knight" });
    expect(link).toHaveAttribute("href", "/stats?u=Specter_Knight");
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(them).getAllByTestId("badge-glyph")).toHaveLength(2);
  });

  it("a guest opponent: \"Guest\", no link", () => {
    const v = view();
    v.players[1] = player({ id: "p2", heroId: "kenshiro" });
    render(<ProPostGame {...props({ view: v })} />);
    const them = screen.getAllByTestId("post-game-seat")[1];
    expect(within(them).getByText("Guest")).toBeInTheDocument();
    expect(within(them).queryByRole("link")).toBeNull();
  });

  it("a bot opponent: the tier label and its tag pill, no link", () => {
    render(<ProPostGame {...props({ bots: { p2: "expert" } })} />);
    const them = screen.getAllByTestId("post-game-seat")[1];
    expect(within(them).getByText("Expert bot")).toBeInTheDocument();
    expect(within(them).getByTestId("post-game-bot-tag")).toHaveTextContent("alpha");
    expect(within(them).queryByRole("link")).toBeNull();
    expect(within(them).queryByTestId("badge-glyph")).toBeNull();
  });

  it("your own card as a guest says so", () => {
    render(<ProPostGame {...props({ accountStatus: "guest", username: null })} />);
    expect(within(screen.getAllByTestId("post-game-seat")[0]).getByText("You · guest")).toBeInTheDocument();
  });
});

describe("the earned slot", () => {
  it("signed out: the quiet guest line with a Discord sign-in link, inside the earned slot", () => {
    render(<ProPostGame {...props({ accountStatus: "guest", username: null })} />);
    const earned = screen.getByTestId("post-game-earned");
    expect(within(earned).getByTestId("post-game-guest")).toHaveTextContent(/isn't saved to an account/);
    const signIn = within(earned).getByRole("link", { name: /sign in with discord/i });
    expect(signIn.getAttribute("href")).toMatch(/\/auth\/discord\?return_to=%2Fpro$/);
    expect(signIn).toHaveAttribute("target", "_blank");
  });

  it("signed in: whatever part 3 drops in, nothing otherwise — and both slots stay in the grid", () => {
    const { rerender } = render(<ProPostGame {...props()} />);
    expect(screen.getByTestId("post-game-earned")).toBeEmptyDOMElement();
    expect(screen.getByTestId("post-game-how-it-went")).toBeEmptyDOMElement();
    expect(screen.queryByTestId("post-game-guest")).toBeNull();

    rerender(<ProPostGame {...props({ earned: { phase: "casual" }, stats: STATS })} />);
    expect(screen.getByTestId("post-game-earned")).toHaveTextContent("No XP");
    expect(screen.getByTestId("post-game-how-it-went")).toHaveTextContent("How it went");
  });
});

// p1 (you) moved first; p2 drew first blood on turn 1; your biggest hit was 6 on turn 4.
const STATS: GameStats = {
  turns: [{ p1: 3 }, { p2: 4 }, {}, { p2: 6, p1: 2 }, { p2: 1 }],
  biggestHitOn: { p1: { amount: 3, turn: 1 }, p2: { amount: 6, turn: 4 } },
  firstBlood: { victim: "p1", turn: 1 },
  firstPlayer: "p1",
};

describe("how it went (p2p #1398)", () => {
  it("panel: the four stats, one bar per turn, the clock and first player in the meta column", () => {
    render(<ProPostGame {...props({ stats: STATS, clockMs: 754_000, firstPlayer: "p1" })} />);
    const card = within(screen.getByTestId("post-game-how-it-went"));
    expect(card.getByText("How it went")).toBeInTheDocument();
    const stat = (name: string) => card.getAllByTestId("how-it-went-stat").find((el) => el.getAttribute("data-stat") === name)!;
    expect(stat("dealt")).toHaveTextContent("11damage dealt");
    expect(stat("taken")).toHaveTextContent("5damage taken");
    expect(stat("biggest-hit")).toHaveTextContent("6biggest hit · t4");
    expect(stat("first-blood")).toHaveTextContent("t1first blood · Specter_Knight");
    // The strip pads to the view's 11 turns, light = dealt, dim = taken.
    const bars = card.getAllByTestId("how-it-went-bar");
    expect(bars).toHaveLength(11);
    expect(bars[3]).toHaveAttribute("data-dealt", "6");
    expect(bars[3]).toHaveAttribute("data-taken", "2");
    expect(card.getByText("turn 1")).toBeInTheDocument();
    expect(card.getByText("turn 11")).toBeInTheDocument();
    // Meta column: the client-observed clock and who moved first.
    expect(screen.getByTestId("post-game-clock")).toHaveTextContent("12:34");
    expect(screen.getByTestId("post-game-first-player")).toHaveTextContent("You moved first");
  });

  it("names a bot or the opponent in the first blood caption; the first player can be the bot", () => {
    render(<ProPostGame {...props({ stats: { ...STATS, firstPlayer: "p2" }, firstPlayer: "p2", bots: { p2: "medium" } })} />);
    const stats = screen.getAllByTestId("how-it-went-stat");
    expect(stats.find((el) => el.getAttribute("data-stat") === "first-blood")).toHaveTextContent("first blood · bot");
    expect(screen.getByTestId("post-game-first-player")).toHaveTextContent("Bot moved first");
  });

  it("sheet (phone): dealt, taken, big hit and the clock in one row, no strip, first player as a footer", () => {
    render(<ProPostGame {...props({ layout: "sheet", stats: STATS, clockMs: 61_000, firstPlayer: "p2" })} />);
    const card = within(screen.getByTestId("post-game-how-it-went"));
    const names = card.getAllByTestId("how-it-went-stat").map((el) => el.getAttribute("data-stat"));
    expect(names).toEqual(["dealt", "taken", "biggest-hit", "clock"]);
    expect(card.getAllByTestId("how-it-went-stat")[3]).toHaveTextContent("01:01clock");
    expect(card.queryByTestId("how-it-went-strip")).toBeNull();
    expect(card.getByTestId("post-game-first-player")).toHaveTextContent("Specter_Knight moved first");
    expect(screen.queryByTestId("post-game-clock")).toBeNull();
  });

  it("no numbers (reload, no bundle): no card, no clock, no first player", () => {
    render(<ProPostGame {...props({ stats: null, clockMs: null, firstPlayer: null })} />);
    expect(screen.getByTestId("post-game-how-it-went")).toBeEmptyDOMElement();
    expect(screen.queryByTestId("post-game-clock")).toBeNull();
    expect(screen.queryByTestId("post-game-first-player")).toBeNull();
  });

  it("a game with no damage yet still shows the card with dashes, and the clock alone when that is all there is", () => {
    render(<ProPostGame {...props({ stats: { turns: [], biggestHitOn: {}, firstBlood: null, firstPlayer: null }, clockMs: 5_000 })} />);
    const stats = screen.getAllByTestId("how-it-went-stat");
    expect(stats.find((el) => el.getAttribute("data-stat") === "biggest-hit")).toHaveTextContent("—biggest hit");
    expect(stats.find((el) => el.getAttribute("data-stat") === "first-blood")).toHaveTextContent("—first blood");
    expect(screen.getByTestId("post-game-clock")).toHaveTextContent("00:05");
  });
});

describe("actions", () => {
  it("one-tap rematch link, local replay link, share button, back to lobby", () => {
    const copied: number[] = [];
    render(
      <ProPostGame
        {...props({
          rematchHref: "/pro/game?rematch=1&hero=GINGERBREAD",
          replayHref: "/pro/replays?open=r80279f0e",
          onCopyShareLink: () => copied.push(1),
        })}
      />,
    );
    expect(screen.getByRole("link", { name: /rematch — same setup/i })).toHaveAttribute("href", "/pro/game?rematch=1&hero=GINGERBREAD");
    expect(screen.getByRole("link", { name: /view your replay/i })).toHaveAttribute("href", "/pro/replays?open=r80279f0e");
    fireEvent.click(screen.getByRole("button", { name: /copy share link/i }));
    expect(copied).toEqual([1]);
    expect(screen.getByRole("link", { name: /back to lobby/i })).toHaveAttribute("href", "/pro/game");
  });

  it("a reload into a finished room: result + matchup only, no rematch / replay / share", () => {
    render(<ProPostGame {...props({ endReason: null, bots: null })} />);
    expect(screen.getByTestId("post-game-result")).toHaveTextContent("VICTORY");
    expect(screen.getAllByTestId("post-game-seat")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /rematch/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /view your replay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy share link/i })).toBeNull();
    expect(screen.getByRole("link", { name: /back to lobby/i })).toBeInTheDocument();
  });

  it("the tournament's end action takes Rematch's place", () => {
    render(<ProPostGame {...props({ rematchHref: "/pro/game?rematch=1", endAction: <a href="/t/match">Back to the match</a> })} />);
    expect(screen.getByRole("link", { name: /back to the match/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /rematch/i })).toBeNull();
  });

  it("the sheet layout stacks the same sections and HP as text", () => {
    render(<ProPostGame {...props({ layout: "sheet", rematchHref: "/pro/game?rematch=1", replayHref: "/pro/replays?open=x" })} />);
    expect(screen.getByTestId("pro-post-game")).toHaveAttribute("data-layout", "sheet");
    const rows = screen.getAllByTestId("post-game-hp-row").map((r) => r.textContent);
    expect(rows).toEqual(["The Hollow Oak 5 / 16", "·The Ember Fox KO", "Kenshiro KO"]);
    expect(screen.getByText(/turn 11 · Mended Drum/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /rematch — same setup/i })).toBeInTheDocument();
  });
});
