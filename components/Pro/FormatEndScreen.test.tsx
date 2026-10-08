/**
 * The FormatEndScreen slot (#1303) and the full-screen Adventure end screen (#1182): an
 * adventure's verdict covers the table instead of rendering inside the dock, and every other
 * format keeps the dock's VICTORY / DEFEAT panel.
 */
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { theme } from "@/styles/style";
import { FormatEndScreen, hasFormatEndScreen } from "./FormatEndScreen";
import type { FormatEndScreenProps } from "./FormatEndScreen";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";

const fighter = (id: string, name: string, extra: object = {}) => ({
  id,
  name,
  owner: id.split("/")[0],
  kind: "HERO",
  hp: 5,
  maxHp: 5,
  defeated: false,
  ...extra,
});

const adventureView = (over: object = {}): PlayerView =>
  ({
    you: "p1",
    winner: null,
    players: [{ id: "p1" }, { id: "e1" }],
    fighters: [
      fighter("p1/hero", "Kong"),
      fighter("e1/indominus", "Indominus Rex", { hp: 6, maxHp: 20, enemy: { role: "VILLAIN", move: 3, deckCount: 0, discardTop: null } }),
      fighter("e1/trex", "T. Rex", { enemy: { role: "MINION", move: 3, deckCount: 0, discardTop: null, released: true } }),
    ],
    initiative: { round: 6, phase: "TURN", deckCount: 0, current: null, row: [] },
    scenario: {
      threat: { position: 1, level: 1, overflows: 4, positions: [1], bySource: { roundEnd: 19, noTarget: 9, effect: 4 } },
      objectives: [],
      releases: [{ round: 3, fighter: "e1/trex", enemyId: "trex", spaceLabel: "2" }],
    },
    ...over,
  }) as unknown as PlayerView;

const defeat = (v: PlayerView): PlayerView =>
  ({
    ...v,
    winner: "e1",
    phase: "GAME_OVER",
    scenario: { ...v.scenario, result: { verdict: "DEFEAT", cause: { kind: "OBJECTIVE", objectiveId: "x" }, round: 9 } },
  }) as unknown as PlayerView;

const ui = (props: Partial<FormatEndScreenProps> & { formatId?: string; view: PlayerView }) => (
  <ChakraProvider theme={theme}>
    <FormatEndScreen replayHref={null} {...props} />
  </ChakraProvider>
);

// The end screen is lazy (next/dynamic): load its chunk once, then mounts render synchronously.
beforeAll(async () => {
  render(ui({ formatId: "adventure", view: defeat(adventureView()) }));
  await screen.findByTestId("adventure-end-screen");
  cleanup();
});

describe("FormatEndScreen", () => {
  it("only adventure owns its end screen", () => {
    expect(hasFormatEndScreen("adventure")).toBe(true);
    for (const id of ["duel", "ffa-3", "team-2v2", undefined, null]) expect(hasFormatEndScreen(id)).toBe(false);
  });

  it("renders nothing for other formats, or before the game ends", () => {
    const { rerender } = render(ui({ formatId: "duel", view: defeat(adventureView()) }));
    expect(screen.queryByTestId("adventure-end-screen")).toBeNull();
    rerender(ui({ formatId: "adventure", view: adventureView() }));
    expect(screen.queryByTestId("adventure-end-screen")).toBeNull();
  });

  it("covers the table with the verdict, the timeline and the replay / lobby links (#1182)", () => {
    render(ui({ formatId: "adventure", view: defeat(adventureView()), replayHref: "/pro/replays?open=r1" }));
    const screenEl = screen.getByTestId("adventure-end-screen");
    expect(screenEl).toHaveStyle({ position: "fixed" });
    expect(screen.getByTestId("adventure-end-headline")).toHaveTextContent("THE ISLAND FELL");
    expect(screen.getByText("DEFEAT · ROUND 9")).toBeInTheDocument();
    expect(screen.getByText(/broke open her fourth enclosure/)).toBeInTheDocument();
    expect(screen.getByText("HOW IT HAPPENED")).toBeInTheDocument();
    expect(screen.getByText("Heroes down: none.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /watch the replay/i })).toHaveAttribute("href", "/pro/replays?open=r1");
    expect(screen.getByRole("link", { name: /back to lobby/i })).toHaveAttribute("href", "/pro/game");
    // the rematch ruling refuses co-op rematches: no dead "try again"
    expect(screen.queryByText(/rematch|try again/i)).toBeNull();
  });

  it("puts itself away to inspect the board, and comes back", () => {
    render(ui({ formatId: "adventure", view: defeat(adventureView()) }));
    fireEvent.click(screen.getByTestId("adventure-end-hide"));
    expect(screen.queryByTestId("adventure-end-screen")).toBeNull();
    fireEvent.click(screen.getByTestId("adventure-end-show"));
    expect(screen.getByTestId("adventure-end-screen")).toBeInTheDocument();
  });

  it("records the round a released enemy fell while mounted through the game", () => {
    const live = adventureView();
    const { rerender } = render(ui({ formatId: "adventure", view: live, events: [] }));
    const fell = [{ type: "FIGHTER_DEFEATED", fighter: "e1/trex" }] as unknown as GameEvent[];
    act(() => {
      rerender(ui({ formatId: "adventure", view: { ...live } as PlayerView, events: fell }));
    });
    rerender(ui({ formatId: "adventure", view: defeat(live), events: [] }));
    expect(screen.getByText(/defeated R6/)).toBeInTheDocument();
  });

  it("an unexplained end (no result on the wire) keeps the plain headline", () => {
    render(ui({ formatId: "adventure", view: { ...adventureView(), winner: "p1" } as PlayerView }));
    expect(screen.getByTestId("adventure-end-headline")).toHaveTextContent("VICTORY!");
  });
});
