/**
 * The puzzle panel (issue #1679) against a fake socket.
 *
 * The frames are a real transcript: `fixtures/puzzleRoom.json` was recorded
 * from the engine's puzzle room (protocol v41, `taranis-one-swing`), so the
 * views the panel renders here are the ones the server sends.
 *
 * Every state the ticket lists is pinned: loading, playing, the pips after one
 * action, the failed verdict with its HP, the solved verdict with tries and
 * seconds, paused / resumed with the try kept, the waiting contexts (no way out
 * to a full game, no error card), the solve-rate line only when the catalogue
 * has a rate, and the source line for the three kinds of source.
 *
 * The real-browser half (containment, the page's scroll, a full play-through)
 * is scripts/pro/puzzleCheck.mjs.
 */
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toast } from "react-hot-toast";
import { theme } from "@/styles/style";
import { PuzzlePanel, PuzzlePanelProps, __resetPuzzleSittingForTests } from "@/components/Pro/Puzzle/PuzzlePanel";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { PuzzleSummary } from "@/lib/pro/protocol";
import { __resetPuzzleCatalogueForTests, puzzleSourceLine, solveRateLine } from "@/lib/pro/puzzleCatalogue";
import { PUZZLE_PROGRESS_KEY, markPuzzleSolved } from "@/lib/pro/puzzleProgress";
import { PUZZLE_ROOM_TIMEOUT_MS } from "@/lib/pro/usePuzzleSocket";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const mockTrack = jest.fn((_event: string, _props?: Record<string, unknown>, _opts?: unknown) => true);
jest.mock("../../lib/analytics", () => ({
  ...jest.requireActual("../../lib/analytics"),
  track: (event: string, props?: Record<string, unknown>, opts?: unknown) => mockTrack(event, props, opts),
}));

type Msg = Record<string, unknown>;
const FX: Record<"info" | "start" | "afterDeclare" | "solvedFinal" | "solvedResult" | "hint" | "failedFinal" | "failedResult", Msg> = JSON.parse(
  readFileSync(join(process.cwd(), "test", "pro", "fixtures", "puzzleRoom.json"), "utf8"),
);
const PUZZLE = FX.info.puzzle as PuzzleSummary;
const second: PuzzleSummary = { ...PUZZLE, id: "second-puzzle", order: PUZZLE.order + 10 };
const third: PuzzleSummary = { ...PUZZLE, id: "third-puzzle", order: PUZZLE.order + 20 };
const URL = "ws://puzzle";

let catalogue: PuzzleSummary[] | null = [PUZZLE, second, third];
const sent: Msg[] = [];

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(this: FakeWebSocket, data: string) {
    sent.push({ socket: FakeWebSocket.instances.indexOf(this), ...JSON.parse(data) });
  } as unknown as FakeWebSocket["send"];
  // jsdom lays nothing out: give the contained frame a phone-sized box.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 360 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
});
beforeEach(() => {
  FakeWebSocket.reset();
  sent.length = 0;
  mockTrack.mockClear();
  catalogue = [PUZZLE, second, third];
  __resetPuzzleCatalogueForTests();
  __resetPuzzleSittingForTests();
  document.title = "Host page";
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/puzzles.json") && catalogue)
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: true, puzzles: catalogue }) } as Response;
    return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
const tick = () => new Promise((r) => setTimeout(r, 5));
/**
 * Deliver frames back to back, as a socket does (the reply to an action lands
 * in the same tick as the action's own STATE), then let the panel's
 * one-snapshot-per-tick queue run dry.
 */
const deliver = async (...msgs: Msg[]) => {
  await act(async () => {
    for (const msg of msgs) latest().onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) });
    for (let i = 0; i <= msgs.length; i += 1) await tick();
  });
};
const openSocket = async () => {
  await act(async () => {
    const socket = latest();
    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.({});
    await tick();
  });
};

const mount = async (props: Partial<PuzzlePanelProps> = {}) => {
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChakraProvider theme={theme}>
        <div style={{ width: 360, height: 720 }}>
          <PuzzlePanel context="page" wsUrl={URL} resultDelayMs={0} {...props} />
        </div>
      </ChakraProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    await tick(); // the catalogue fetch
  });
  return view;
};

/** Mount, open the socket and play the room up to its first STATE. */
const start = async (props: Partial<PuzzlePanelProps> = {}, info: Msg = FX.info) => {
  const view = await mount(props);
  await openSocket();
  await deliver(info, FX.start);
  return view;
};

const pips = () => screen.getAllByTestId("puzzle-pip").map((p) => p.getAttribute("data-filled"));
const tracked = (event: string) => mockTrack.mock.calls.filter(([name]) => name === event).map(([, props]) => props);

describe("loading and playing", () => {
  it("shows a loading state until the room's first STATE, then the game view", async () => {
    await mount();
    expect(screen.getByTestId("puzzle-loading")).toBeInTheDocument();
    // The goal is already known from the catalogue.
    expect(screen.getByTestId("puzzle-goal")).toHaveTextContent(PUZZLE.goal.text);
    expect(screen.queryByTestId("pro-game-view")).not.toBeInTheDocument();

    await openSocket();
    expect(sent.find((m) => m.type === "CREATE_PUZZLE_ROOM")).toMatchObject({ puzzleId: PUZZLE.id, context: "page", v: PROTOCOL_VERSION });
    expect(screen.getByTestId("puzzle-loading")).toBeInTheDocument();

    await deliver(FX.info, FX.start);
    expect(screen.queryByTestId("puzzle-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("pro-game-view")).toBeInTheDocument();
    expect(screen.getByTestId("puzzle-goal")).toHaveTextContent("Defeat The Hollow Oak this turn");
    expect(pips()).toEqual(["true", "true"]);
  });

  it("shows the opponent's hand face up, titled for a puzzle", async () => {
    await start();
    const hand = screen.getByTestId("revealed-hand-panel");
    expect(hand).toHaveTextContent("Opponent's hand");
    expect(hand).toHaveTextContent("shown in puzzles");
  });

  it("empties one pip after one action", async () => {
    await start();
    await deliver(FX.afterDeclare);
    expect(pips()).toEqual(["true", "false"]);
    expect(screen.getByTestId("puzzle-pips")).toHaveAttribute("aria-label", "1 of 2 actions left");
  });

  it("opens the first puzzle this browser has not solved when none is named", async () => {
    markPuzzleSolved(PUZZLE.id);
    await mount();
    await openSocket();
    expect(sent.find((m) => m.type === "CREATE_PUZZLE_ROOM")).toMatchObject({ puzzleId: "second-puzzle" });
  });

  it("with autoStart off, opens no socket until the visitor starts", async () => {
    await mount({ autoStart: false });
    expect(FakeWebSocket.instances).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Start puzzle" }));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe("the verdict", () => {
  it("failed: '<hero> survives' with the HP left, Try again and Show the solution", async () => {
    await start();
    await deliver(FX.failedFinal, FX.failedResult);
    const card = await screen.findByTestId("puzzle-result-failed");
    expect(card).toHaveTextContent("The Hollow Oak survives");
    expect(within(card).getByTestId("puzzle-result-hp")).toHaveTextContent("3 HP left");
    expect(pips()).toEqual(["false", "false"]);

    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(sent.filter((m) => m.type === "PUZZLE_RESET")).toEqual([expect.objectContaining({ roomId: "PZ-FIXTURE" })]);
    await deliver({ ...FX.info, tryNumber: 2 }, FX.start);
    expect(screen.queryByTestId("puzzle-result-failed")).not.toBeInTheDocument();
    expect(pips()).toEqual(["true", "true"]);
    // Same room, same socket.
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("solved: tries, seconds, what the real player did, Next puzzle and the full-game link", async () => {
    await start({}, { ...FX.info, puzzle: { ...PUZZLE, source: { kind: "human", turn: 14 } } });
    await deliver(FX.solvedFinal, { ...FX.solvedResult, tryNumber: 2, seconds: 9.1, sourceActual: "Attacked with Skirmish and left The Hollow Oak on 2 HP" });
    const card = await screen.findByTestId("puzzle-result-solved");
    expect(card).toHaveTextContent("Solved");
    expect(within(card).getByTestId("puzzle-result-stats")).toHaveTextContent("Try 2 · 9.1 seconds");
    expect(within(card).getByTestId("puzzle-source-actual")).toHaveTextContent("In the real game: Attacked with Skirmish and left The Hollow Oak on 2 HP");
    expect(within(card).getByRole("button", { name: "Next puzzle" })).toBeInTheDocument();
    expect(within(card).getByTestId("puzzle-full-game")).toHaveAttribute("href", expect.stringMatching(/^\/pro\/game\?vs=/));
    // No XP is paid for a puzzle: none is promised anywhere.
    expect(screen.getByTestId("puzzle-panel").textContent).not.toMatch(/xp/i);
  });

  it("preselects the solver hero for the full game only when it is on the roster", async () => {
    await start();
    await deliver(FX.solvedFinal, FX.solvedResult);
    expect((await screen.findByTestId("puzzle-full-game")).getAttribute("href")).not.toContain("hero=");
    await deliver({ type: "HEROES", heroes: [{ heroId: PUZZLE.heroes.solver.id, name: "King Taranis" }] });
    expect(screen.getByTestId("puzzle-full-game")).toHaveAttribute("href", `/pro/game?vs=ai-medium&hero=${PUZZLE.heroes.solver.id}`);
  });

  it("a waiting context has no way out to a full game", async () => {
    await start({ context: "lobby_wait" });
    await deliver(FX.solvedFinal, FX.solvedResult);
    const card = await screen.findByTestId("puzzle-result-solved");
    expect(within(card).getByRole("button", { name: "Next puzzle" })).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-full-game")).not.toBeInTheDocument();
    expect(screen.queryByText("Play a full game vs a bot")).not.toBeInTheDocument();
  });

  it("Next puzzle goes to the next unsolved one on a fresh socket, and says so to the host", async () => {
    const onPuzzleChange = jest.fn();
    markPuzzleSolved("second-puzzle");
    await start({ onPuzzleChange });
    await deliver(FX.solvedFinal, FX.solvedResult);
    fireEvent.click(await screen.findByRole("button", { name: "Next puzzle" }));
    expect(onPuzzleChange).toHaveBeenCalledWith("third-puzzle");
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);
    await openSocket();
    expect(sent.filter((m) => m.type === "CREATE_PUZZLE_ROOM").map((m) => m.puzzleId)).toEqual([PUZZLE.id, "third-puzzle"]);
    expect(tracked("puzzle_next_clicked")).toEqual([{ puzzle_id: PUZZLE.id, context: "page", next_puzzle_id: "third-puzzle" }]);
  });

  it("after the last unsolved puzzle: 'You solved them all' with the full-game link", async () => {
    markPuzzleSolved("second-puzzle");
    markPuzzleSolved("third-puzzle");
    await start();
    await deliver(FX.solvedFinal, FX.solvedResult);
    fireEvent.click(await screen.findByRole("button", { name: "Next puzzle" }));
    const done = await screen.findByTestId("puzzle-all-solved");
    expect(done).toHaveTextContent("You solved them all");
    expect(within(done).getByTestId("puzzle-full-game")).toBeInTheDocument();
  });
});

describe("the solution", () => {
  it("plays without a verdict, then offers a fresh room; a solve after it is not counted", async () => {
    const onSolved = jest.fn();
    await start({ onSolved });
    await deliver(FX.failedFinal, FX.failedResult);
    fireEvent.click(await screen.findByRole("button", { name: "Show the solution" }));
    expect(sent.filter((m) => m.type === "PUZZLE_SOLUTION_REQUEST")).toHaveLength(1);

    await deliver({ type: "PUZZLE_SOLUTION", roomId: "PZ-FIXTURE", status: "playing", steps: 3 }, { ...FX.start, legalActions: [] });
    expect(screen.queryByTestId("puzzle-result-failed")).not.toBeInTheDocument();
    expect(screen.getByTestId("puzzle-status")).toHaveTextContent("Playing the solution");
    await deliver({ ...FX.solvedFinal, legalActions: [] }, { type: "PUZZLE_SOLUTION", roomId: "PZ-FIXTURE", status: "done", steps: 3 });
    const card = await screen.findByTestId("puzzle-solution-done");
    expect(window.localStorage.getItem(PUZZLE_PROGRESS_KEY)).toBeNull();

    // "Try again" now means a FRESH room: the old one would never count a solve.
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(sent.filter((m) => m.type === "PUZZLE_RESET")).toHaveLength(0);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);

    // An honest solve in the fresh room counts.
    await openSocket();
    await deliver({ ...FX.info, roomId: "PZ-FRESH" }, FX.start);
    await deliver(FX.solvedFinal, { ...FX.solvedResult, roomId: "PZ-FRESH" });
    expect(await screen.findByTestId("puzzle-result-solved")).not.toHaveTextContent("not counted");
    expect(JSON.parse(window.localStorage.getItem(PUZZLE_PROGRESS_KEY)!)).toEqual([PUZZLE.id]);
    expect(tracked("puzzle_solved")).toHaveLength(1);
    expect(onSolved).toHaveBeenCalledTimes(1);
  });

  it("a solve the server marks solutionShown is shown as solved but neither counted nor remembered", async () => {
    const onSolved = jest.fn();
    await start({ onSolved }, { ...FX.info, solutionShown: true });
    await deliver(FX.solvedFinal, { ...FX.solvedResult, solutionShown: true });
    const card = await screen.findByTestId("puzzle-result-solved");
    expect(card).toHaveTextContent("not counted");
    expect(window.localStorage.getItem(PUZZLE_PROGRESS_KEY)).toBeNull();
    expect(tracked("puzzle_solved")).toEqual([]);
    expect(onSolved).not.toHaveBeenCalled();
    // Its "Try again" is a fresh room too.
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("Reset while the solution plays opens a fresh room as well", async () => {
    await start();
    await deliver({ type: "PUZZLE_SOLUTION", roomId: "PZ-FIXTURE", status: "playing", steps: 3 }, { ...FX.start, legalActions: [] });
    fireEvent.click(screen.getByTestId("puzzle-reset"));
    expect(sent.filter((m) => m.type === "PUZZLE_RESET")).toHaveLength(0);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("offers no 'Next puzzle' when the only unsolved puzzle is the one on the table", async () => {
    markPuzzleSolved("second-puzzle");
    markPuzzleSolved("third-puzzle");
    await start();
    await deliver({ type: "PUZZLE_SOLUTION", roomId: "PZ-FIXTURE", status: "playing", steps: 3 }, { ...FX.start, legalActions: [] });
    await deliver({ type: "PUZZLE_SOLUTION", roomId: "PZ-FIXTURE", status: "done", steps: 3 });
    const card = await screen.findByTestId("puzzle-solution-done");
    expect(within(card).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Next puzzle" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-all-solved")).not.toBeInTheDocument();
  });
});

describe("paused", () => {
  it("covers the panel, turns its inputs off, keeps the try, and resumes", async () => {
    const view = await start();
    await deliver(FX.afterDeclare);
    const wrap = (paused: boolean) => (
      <QueryClientProvider client={new QueryClient()}>
        <ChakraProvider theme={theme}>
          <div style={{ width: 360, height: 720 }}>
            <PuzzlePanel context="page" wsUrl={URL} resultDelayMs={0} paused={paused} />
          </div>
        </ChakraProvider>
      </QueryClientProvider>
    );
    view.rerender(wrap(true));
    expect(screen.getByTestId("puzzle-paused")).toHaveTextContent("Puzzle paused. Your progress is kept.");
    expect(screen.getByTestId("puzzle-stage")).toHaveAttribute("inert");
    expect(screen.getByTestId("puzzle-hint")).toBeDisabled();
    expect(screen.getByTestId("puzzle-reset")).toBeDisabled();
    fireEvent.click(screen.getByTestId("puzzle-reset"));
    expect(sent.filter((m) => m.type === "PUZZLE_RESET")).toHaveLength(0);
    // The socket and the try are untouched.
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(latest().readyState).toBe(FakeWebSocket.OPEN);

    // A verdict that lands during the pause offers nothing to press until it clears.
    await deliver(FX.failedFinal, FX.failedResult);
    await act(async () => {
      await tick();
    });
    expect(screen.queryByTestId("puzzle-result-failed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    view.rerender(wrap(false));
    expect(screen.getByTestId("puzzle-result-failed")).toBeInTheDocument();
    cleanup();
  });

  it("resumes a try in progress exactly where it was", async () => {
    const view = await start();
    await deliver(FX.afterDeclare);
    const wrap = (paused: boolean) => (
      <QueryClientProvider client={new QueryClient()}>
        <ChakraProvider theme={theme}>
          <div style={{ width: 360, height: 720 }}>
            <PuzzlePanel context="page" wsUrl={URL} resultDelayMs={0} paused={paused} />
          </div>
        </ChakraProvider>
      </QueryClientProvider>
    );
    view.rerender(wrap(true));
    view.rerender(wrap(false));
    expect(screen.queryByTestId("puzzle-paused")).not.toBeInTheDocument();
    expect(screen.getByTestId("puzzle-stage")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("pro-game-view")).toBeInTheDocument();
    expect(pips()).toEqual(["true", "false"]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(sent.filter((m) => m.type === "CREATE_PUZZLE_ROOM")).toHaveLength(1);
  });
});

describe("footer", () => {
  it("shows the solve-rate line only when the catalogue provides a rate", async () => {
    await start();
    expect(screen.queryByTestId("puzzle-rate")).not.toBeInTheDocument();
    expect(screen.getByTestId("puzzle-panel").textContent).not.toMatch(/Solved by/);
    cleanup();
    FakeWebSocket.reset();
    __resetPuzzleCatalogueForTests();

    catalogue = [{ ...PUZZLE, solveRate: 0.41, attempts: 120 }, second];
    await start();
    expect(screen.getByTestId("puzzle-rate")).toHaveTextContent("Solved by 41% of players");
    await deliver(FX.solvedFinal, FX.solvedResult);
    expect(await screen.findByTestId("puzzle-result-rate")).toHaveTextContent("Solved by 41% of players");
  });

  it("Hint asks the server and shows its words; Reset starts the next try", async () => {
    await start();
    fireEvent.click(screen.getByTestId("puzzle-hint"));
    expect(sent.filter((m) => m.type === "PUZZLE_HINT_REQUEST")).toEqual([expect.objectContaining({ roomId: "PZ-FIXTURE" })]);
    await deliver(FX.hint);
    expect(screen.getByTestId("puzzle-status")).toHaveTextContent("Attack The Hollow Oak with King Taranis.");
    fireEvent.click(screen.getByTestId("puzzle-reset"));
    expect(sent.filter((m) => m.type === "PUZZLE_RESET")).toHaveLength(1);
    await deliver({ ...FX.info, tryNumber: 2 }, FX.start);
    expect(screen.getByTestId("puzzle-status")).toBeEmptyDOMElement();
  });

  it("is muted until the visitor unmutes", async () => {
    await start();
    const mute = screen.getByTestId("puzzle-sound");
    expect(mute).toHaveAttribute("aria-pressed", "false");
    expect(mute).toHaveAccessibleName("Unmute puzzle sound");
    fireEvent.click(mute);
    expect(mute).toHaveAttribute("aria-pressed", "true");
    expect(mute).toHaveAccessibleName("Mute puzzle sound");
  });

  it("routes the view's notices into the status line, not the host page's toaster", async () => {
    const error = jest.spyOn(toast, "error");
    await start();
    await deliver({ type: "ERROR", code: "ILLEGAL_ACTION", message: "not legal" });
    await waitFor(() => expect(screen.getByTestId("puzzle-status")).not.toBeEmptyDOMElement());
    expect(error).not.toHaveBeenCalled();
    // The room is still there.
    expect(screen.getByTestId("pro-game-view")).toBeInTheDocument();
    error.mockRestore();
  });
});

describe("the source line", () => {
  const withSource = (source: PuzzleSummary["source"]) => ({ ...PUZZLE, source });
  it("is truthful to source.kind and never names a player", () => {
    expect(puzzleSourceLine(withSource({ kind: "human", turn: 14 }))).toBe("From a real game · turn 14 · you are King Taranis");
    expect(puzzleSourceLine(withSource({ kind: "bot", turn: 14 }))).toBe("From a bot game · turn 14 · you are King Taranis");
    expect(puzzleSourceLine(withSource({ kind: "authored", turn: 1 }))).toBe("Training puzzle · you are King Taranis");
  });

  it.each([
    ["human", "From a real game · turn 14 · you are King Taranis"],
    ["bot", "From a bot game · turn 14 · you are King Taranis"],
    ["authored", "Training puzzle · you are King Taranis"],
  ] as const)("renders the %s wording in the header", async (kind, line) => {
    await start({}, { ...FX.info, puzzle: withSource({ kind, turn: 14 }) });
    expect(screen.getByTestId("puzzle-source")).toHaveTextContent(line);
  });

  it("solveRateLine: a percentage, or nothing without a rate", () => {
    expect(solveRateLine({ solveRate: 0.414 })).toBe("Solved by 41% of players");
    expect(solveRateLine({ solveRate: 0 })).toBe("Solved by 0% of players");
    expect(solveRateLine({})).toBeNull();
    expect(solveRateLine(null)).toBeNull();
  });
});

describe("failing quietly", () => {
  it("page: a quiet 'unavailable' card when the socket never opens", async () => {
    await mount();
    await act(async () => {
      latest().onclose?.({});
    });
    expect(screen.getByTestId("puzzle-unavailable")).toHaveTextContent("Puzzles are unavailable right now.");
  });

  it("page: 'connection lost' with a reload once a room was up", async () => {
    await start();
    await act(async () => {
      latest().onclose?.({});
    });
    fireEvent.click(within(screen.getByTestId("puzzle-lost")).getByRole("button", { name: "Reload puzzle" }));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("page: an unknown puzzle is 'unavailable', not a crash", async () => {
    await mount({ puzzleId: "no-such-puzzle" });
    await openSocket();
    await deliver({ type: "ERROR", code: "UNKNOWN_PUZZLE", message: "no such puzzle" });
    expect(screen.getByTestId("puzzle-unavailable")).toBeInTheDocument();
  });

  it.each(["quick_search", "lobby_wait"] as const)("%s: renders nothing at all on failure", async (context) => {
    await start({ context });
    expect(screen.getByTestId("puzzle-panel")).toBeInTheDocument();
    await act(async () => {
      latest().onclose?.({});
    });
    expect(screen.queryByTestId("puzzle-panel")).not.toBeInTheDocument();
  });

  it("a waiting context renders nothing when there is no catalogue and no puzzle named", async () => {
    catalogue = null;
    await mount({ context: "quick_search" });
    expect(screen.queryByTestId("puzzle-panel")).not.toBeInTheDocument();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("a room the server dropped for idling is reopened only when the visitor asks", async () => {
    await start({ context: "lobby_wait" });
    await deliver({ type: "PUZZLE_CLOSED", roomId: "PZ-FIXTURE", reason: "idle" });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(latest().readyState).toBe(FakeWebSocket.CLOSED);
    fireEvent.click(within(screen.getByTestId("puzzle-expired")).getByRole("button", { name: "Start again" }));
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(screen.getByTestId("puzzle-loading")).toBeInTheDocument();
  });

  it("any error before the room's first STATE is 'unavailable', not an endless loading", async () => {
    await mount();
    await openSocket();
    await deliver({ type: "ERROR", code: "RATE_LIMITED", message: "slow down" });
    expect(screen.getByTestId("puzzle-unavailable")).toBeInTheDocument();
  });

  it("gives up on a server that opens and never answers", async () => {
    jest.useFakeTimers();
    try {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <ChakraProvider theme={theme}>
            <PuzzlePanel context="page" wsUrl={URL} puzzleId={PUZZLE.id} />
          </ChakraProvider>
        </QueryClientProvider>,
      );
      await act(async () => {
        latest().readyState = FakeWebSocket.OPEN;
        latest().onopen?.({});
        jest.advanceTimersByTime(PUZZLE_ROOM_TIMEOUT_MS + 10);
      });
      expect(screen.getByTestId("puzzle-unavailable")).toBeInTheDocument();
      expect(latest().readyState).toBe(FakeWebSocket.CLOSED);
    } finally {
      jest.useRealTimers();
    }
  });

  it("ignores a late frame from the previous puzzle's socket", async () => {
    await start();
    const old = latest();
    const onmessage = old.onmessage;
    await deliver(FX.solvedFinal, FX.solvedResult);
    fireEvent.click(await screen.findByRole("button", { name: "Next puzzle" }));
    expect(old.onmessage).toBeNull();
    await act(async () => {
      onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...FX.failedResult }) });
      await tick();
    });
    expect(screen.queryByTestId("puzzle-result-failed")).not.toBeInTheDocument();
    expect(screen.getByTestId("puzzle-loading")).toBeInTheDocument();
  });
});

describe("the host page", () => {
  it("is left alone: title, URL, storage keys other than the progress list; unmount closes the socket", async () => {
    const href = window.location.href;
    const view = await start();
    await deliver(FX.solvedFinal, FX.solvedResult);
    await screen.findByTestId("puzzle-result-solved");
    expect(document.title).toBe("Host page");
    expect(window.location.href).toBe(href);
    // (`chakra-ui-color-mode` is this test's own ChakraProvider.)
    expect(Object.keys(window.localStorage).filter((k) => k !== "chakra-ui-color-mode")).toEqual([PUZZLE_PROGRESS_KEY]);
    expect(Object.keys(window.sessionStorage)).toEqual([]);
    const socket = latest();
    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
    view.unmount();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("sends nothing a real room would: no CREATE_ROOM, no RECONNECT, one socket", async () => {
    await start();
    expect(sent.map((m) => m.type).sort()).toEqual(["CREATE_PUZZLE_ROOM", "LIST_HEROES"]);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe("analytics (never per move)", () => {
  it("puzzle_started once per puzzle per sitting, on the first interaction", async () => {
    await start();
    expect(tracked("puzzle_started")).toEqual([]);
    fireEvent.click(screen.getByTestId("puzzle-hint"));
    fireEvent.click(screen.getByTestId("puzzle-hint"));
    fireEvent.click(screen.getByTestId("puzzle-reset"));
    expect(tracked("puzzle_started")).toEqual([{ puzzle_id: PUZZLE.id, context: "page", order: PUZZLE.order }]);
  });

  it("puzzle_attempt_finished per verdict; puzzle_solved and onSolved on the first honest solve only", async () => {
    const onSolved = jest.fn();
    await start({ onSolved, context: "landing" });
    await deliver(FX.failedFinal, FX.failedResult);
    await screen.findByTestId("puzzle-result-failed");
    expect(tracked("puzzle_attempt_finished")).toEqual([
      { puzzle_id: PUZZLE.id, context: "landing", result: "failed", try_number: 1, seconds: 0.6, hint_used: false, solution_shown: false },
    ]);
    expect(tracked("puzzle_solved")).toEqual([]);

    await deliver({ ...FX.info, tryNumber: 2 }, FX.start);
    await deliver(FX.solvedFinal, { ...FX.solvedResult, tryNumber: 2, seconds: 4.2 });
    await screen.findByTestId("puzzle-result-solved");
    expect(tracked("puzzle_attempt_finished")).toHaveLength(2);
    expect(tracked("puzzle_attempt_finished")[1]).toMatchObject({ result: "solved", try_number: 2, hint_used: true });
    expect(tracked("puzzle_solved")).toEqual([{ puzzle_id: PUZZLE.id, context: "landing", tries: 2, seconds: 4.2 }]);
    expect(onSolved).toHaveBeenCalledWith({ puzzleId: PUZZLE.id, tries: 2, seconds: 4.2, first: true });
    expect(JSON.parse(window.localStorage.getItem(PUZZLE_PROGRESS_KEY)!)).toEqual([PUZZLE.id]);

    // Solving it again is an attempt, not a second "solved".
    await deliver({ ...FX.info, tryNumber: 3 }, FX.start);
    await deliver(FX.solvedFinal, { ...FX.solvedResult, tryNumber: 3 });
    await waitFor(() => expect(tracked("puzzle_attempt_finished")).toHaveLength(3));
    expect(tracked("puzzle_solved")).toHaveLength(1);
    expect(onSolved).toHaveBeenLastCalledWith(expect.objectContaining({ first: false }));
  });

  it("puzzle_full_game_clicked from the verdict's link", async () => {
    await start();
    await deliver(FX.solvedFinal, FX.solvedResult);
    const link = await screen.findByTestId("puzzle-full-game");
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(tracked("puzzle_full_game_clicked")).toEqual([{ puzzle_id: PUZZLE.id, context: "page", hero_preselected: false }]);
  });
});
