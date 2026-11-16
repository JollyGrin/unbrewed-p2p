/**
 * The landing puzzle (issue #1680): a still that becomes the live panel on the
 * first click.
 *
 * Pinned here: the committed still belongs to the pinned puzzle (id + version),
 * the image is what the JSON says and within its budget, nothing of the panel
 * is loaded before the click, the still stays up (with a loading state) until
 * the panel is ready, and stays for good with a link to /puzzles when the
 * engine cannot be reached.
 *
 * The real-browser half (network log, no layout shift, a full play-through) is
 * scripts/pro/landingPuzzleCheck.mjs.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { BOARD_WAIT_MS, LandingPuzzle, PANEL_LOAD_TIMEOUT_MS, PuzzleBand } from "./PuzzleBand";
import { LANDING_PUZZLE, LANDING_STILL } from "./landingPuzzle";
import { resetGrowthAnalytics } from "../../lib/growthAnalytics";

const track = jest.fn();
jest.mock("../../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

// The panel's module: `mockPanel.loaded` flips when something imports it, and the
// stand-in hands its props to the test so it can report a status.
// `stall`: the module never finishes loading (a hung chunk request). `board`:
// the stand-in says a board is on the table, as the real panel does while playing.
const mockPanel = { loaded: false, fail: false, stall: false, board: false, props: null as null | Record<string, unknown> };
jest.mock("../Pro/Puzzle/PuzzlePanel", () => {
  if (mockPanel.fail) throw new Error("chunk failed");
  if (mockPanel.stall) return { __esModule: true, then: () => {} };
  mockPanel.loaded = true;
  return {
    PuzzlePanel: (props: Record<string, unknown>) => {
      mockPanel.props = props;
      return (
        <div data-testid="puzzle-panel" data-context={String(props.context)} data-puzzle={String(props.puzzleId)} data-board={mockPanel.board ? "true" : "false"} />
      );
    },
  };
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const report = (status: string) => act(async () => (mockPanel.props!.onStatus as (s: string) => void)(status));
const renderPuzzle = () =>
  render(
    <ChakraProvider>
      <LandingPuzzle />
    </ChakraProvider>,
  );

beforeEach(() => {
  track.mockClear();
  resetGrowthAnalytics();
  mockPanel.props = null;
});

describe("the committed still", () => {
  const onDisk = JSON.parse(readFileSync(join(process.cwd(), "public", "puzzles", "landing-still.json"), "utf8"));

  it("is the pinned puzzle at the pinned version (stale? run `npm run puzzles:still -- <puzzleId>`)", () => {
    expect({ id: onDisk.puzzleId, version: onDisk.version }).toEqual({ id: LANDING_PUZZLE.id, version: LANDING_PUZZLE.version });
  });

  it("carries the goal line, the source line and both hero names", () => {
    for (const text of [onDisk.goal, onDisk.source, onDisk.heroes.solver, onDisk.heroes.enemy]) {
      expect(typeof text).toBe("string");
      expect(text.trim()).not.toBe("");
    }
  });

  it("has its image in the repo: a WebP of the stated size, under 120 KB", async () => {
    expect(onDisk.image.src).toMatch(/^\/puzzles\/[\w-]+\.webp$/);
    const file = join(process.cwd(), "public", onDisk.image.src);
    expect(statSync(file).size).toBeLessThanOrEqual(120 * 1024);
    const meta = await sharp(file).metadata();
    expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({ format: "webp", width: onDisk.image.width, height: onDisk.image.height });
  });
});

describe("LandingPuzzle", () => {
  it("is a still before any click: text, a lazy sized <img>, a play button; the panel's module is not loaded", () => {
    renderPuzzle();
    expect(screen.getByTestId("landing-puzzle-goal")).toHaveTextContent(LANDING_STILL.goal);
    expect(screen.getByTestId("landing-puzzle-source")).toHaveTextContent(LANDING_STILL.source);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", LANDING_STILL.image.src);
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("width", String(LANDING_STILL.image.width));
    expect(img).toHaveAttribute("height", String(LANDING_STILL.image.height));
    expect(img.getAttribute("alt")).toContain(LANDING_STILL.heroes.enemy);
    expect(screen.getByRole("button", { name: /play this puzzle/i })).toBeEnabled();
    expect(screen.queryByTestId("puzzle-panel")).not.toBeInTheDocument();
    expect(mockPanel.loaded).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it("the click loads the panel under the still, with a loading state, and goes live when the panel is ready", async () => {
    renderPuzzle();
    fireEvent.click(screen.getByTestId("landing-puzzle-play"));
    expect(track).toHaveBeenCalledWith("landing_puzzle_opened", { puzzle_id: LANDING_PUZZLE.id });
    expect(screen.getByTestId("landing-puzzle-loading")).toBeInTheDocument();
    // Not `disabled` (that would drop the keyboard's focus), and a second click does nothing.
    expect(screen.getByTestId("landing-puzzle-play")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByTestId("landing-puzzle-play"));
    await flush();
    expect(mockPanel.loaded).toBe(true);
    // Mounted for the pinned puzzle, in the landing context, but the still is still what shows.
    const panel = screen.getByTestId("puzzle-panel");
    expect(panel).toHaveAttribute("data-context", "landing");
    expect(panel).toHaveAttribute("data-puzzle", LANDING_PUZZLE.id);
    expect(panel.parentElement).toHaveStyle({ visibility: "hidden" });
    await report("loading");
    expect(screen.getByTestId("landing-puzzle-still")).toBeInTheDocument();

    await report("ready");
    expect(screen.queryByTestId("landing-puzzle-still")).not.toBeInTheDocument();
    expect(screen.getByTestId("puzzle-panel").parentElement).toHaveStyle({ visibility: "visible" });
    expect(screen.getByTestId("landing-puzzle")).toHaveAttribute("data-stage", "live");
    // The button went with the still: focus moves to the live panel.
    expect(screen.getByTestId("puzzle-panel").parentElement).toHaveFocus();
    // Once live the panel reports its own trouble: the still does not come back.
    await report("unavailable");
    expect(screen.getByTestId("puzzle-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("landing-puzzle-still")).not.toBeInTheDocument();
  });

  it("keeps the still and links to /puzzles when the engine cannot be reached; a second click tries again", async () => {
    renderPuzzle();
    fireEvent.click(screen.getByTestId("landing-puzzle-play"));
    await flush();
    await report("unavailable");
    expect(screen.getByTestId("landing-puzzle-still")).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-panel")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /open the puzzles page/i });
    expect(link).toHaveAttribute("href", "/puzzles");
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(track).toHaveBeenCalledWith("landing_cta_clicked", { cta: "puzzle:/puzzles", from_page: "/" });

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await flush();
    expect(screen.getByTestId("puzzle-panel")).toBeInTheDocument();
    await report("ready");
    expect(screen.queryByTestId("landing-puzzle-still")).not.toBeInTheDocument();
    // One "opened" per page load, however many clicks.
    expect(track.mock.calls.filter(([event]) => event === "landing_puzzle_opened")).toHaveLength(1);
  });

  it("the band's headline labels the section", () => {
    const { container } = render(
      <ChakraProvider>
        <PuzzleBand />
      </ChakraProvider>,
    );
    expect(container.querySelector("#puzzle-heading")).toHaveTextContent("Your move. Find the kill.");
    expect(container.querySelector("section#puzzle")).toHaveAttribute("aria-labelledby", "puzzle-heading");
  });
});

describe("a board that is slow to draw (#1687)", () => {
  afterEach(() => {
    jest.useRealTimers();
    mockPanel.board = false;
  });
  it("the still waits for the board's picture, and gives way anyway after BOARD_WAIT_MS", async () => {
    mockPanel.board = true; // a board is up, but its view (and picture) never shows
    renderPuzzle();
    fireEvent.click(screen.getByTestId("landing-puzzle-play"));
    await flush();
    jest.useFakeTimers();
    await report("ready");
    expect(screen.getByTestId("landing-puzzle")).toHaveAttribute("data-stage", "opening");
    await act(async () => void jest.advanceTimersByTime(BOARD_WAIT_MS - 300));
    expect(screen.getByTestId("landing-puzzle")).toHaveAttribute("data-stage", "opening");
    await act(async () => void jest.advanceTimersByTime(600));
    expect(screen.getByTestId("landing-puzzle")).toHaveAttribute("data-stage", "live");
  });
});

describe("when the panel's code stalls (#1687)", () => {
  afterEach(() => {
    jest.useRealTimers();
    mockPanel.stall = false;
  });
  it("keeps the still and links to /puzzles after the timeout", async () => {
    jest.resetModules();
    mockPanel.stall = true;
    jest.useFakeTimers();
    renderPuzzle();
    fireEvent.click(screen.getByTestId("landing-puzzle-play"));
    await act(async () => void (await jest.advanceTimersByTimeAsync(PANEL_LOAD_TIMEOUT_MS - 100)));
    expect(screen.getByTestId("landing-puzzle")).toHaveAttribute("data-stage", "opening");
    await act(async () => void (await jest.advanceTimersByTimeAsync(200)));
    expect(screen.getByTestId("landing-puzzle-failed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open the puzzles page/i })).toHaveAttribute("href", "/puzzles");
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});

describe("when the panel's code does not load", () => {
  it("keeps the still and links to /puzzles", async () => {
    jest.resetModules();
    mockPanel.fail = true;
    try {
      renderPuzzle();
      fireEvent.click(screen.getByTestId("landing-puzzle-play"));
      await flush();
      expect(screen.getByTestId("landing-puzzle-failed")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /open the puzzles page/i })).toHaveAttribute("href", "/puzzles");
    } finally {
      mockPanel.fail = false;
    }
  });
});
