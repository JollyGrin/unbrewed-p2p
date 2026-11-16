/**
 * The landing still's hand-over to the REAL panel (issue #1687, review fix 3).
 *
 * The panel says `ready` when the room's first STATE arrives. At that moment
 * the in-game view is not rendered yet (its frame measures itself first) and
 * the board's picture has not loaded: a still that gives way then is swapped
 * for bare felt. Pinned here, with the real `PuzzlePanel` under the still: it
 * stays up until the board's picture is in.
 *
 * (PuzzleBand.test.tsx covers the still itself against a stand-in panel; the
 * real-browser run is scripts/pro/landingPuzzleCheck.mjs.)
 */
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LandingPuzzle } from "@/components/LandingPage/PuzzleBand";
import { LANDING_PUZZLE } from "@/components/LandingPage/landingPuzzle";
import { __resetPuzzleSittingForTests } from "@/components/Pro/Puzzle/PuzzlePanel";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import { __resetPuzzleCatalogueForTests } from "@/lib/pro/puzzleCatalogue";
import { theme } from "@/styles/style";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

jest.mock("../../lib/analytics", () => ({ ...jest.requireActual("../../lib/analytics"), track: () => true }));

type Msg = Record<string, unknown>;
const FX: Record<"info" | "start", Msg> = JSON.parse(readFileSync(join(process.cwd(), "test", "pro", "fixtures", "puzzleRoom.json"), "utf8"));

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
const stage = () => screen.getByTestId("landing-puzzle").getAttribute("data-stage");
const boardPicture = () => document.querySelector<HTMLImageElement>('[data-testid="pro-game-view"] img[data-pro-board-map]');

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send() {} as unknown as FakeWebSocket["send"];
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 360 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
});
beforeEach(() => {
  FakeWebSocket.reset();
  __resetPuzzleCatalogueForTests();
  __resetPuzzleSittingForTests();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: true, puzzles: [FX.info.puzzle] }) }) as Response) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

it("the fixture is the landing puzzle", () => {
  expect((FX.info.puzzle as { id: string }).id).toBe(LANDING_PUZZLE.id);
});

it("the still stays up after the panel is ready, until the board's picture has loaded", async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChakraProvider theme={theme}>
        <LandingPuzzle />
      </ChakraProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByTestId("landing-puzzle-play"));
  // The panel's code, its catalogue, its socket.
  await act(async () => {
    for (let i = 0; i < 10 && FakeWebSocket.instances.length === 0; i += 1) await tick(20);
  });
  expect(FakeWebSocket.instances).toHaveLength(1);
  await act(async () => {
    latest().readyState = FakeWebSocket.OPEN;
    latest().onopen?.({});
    await tick();
  });
  expect(stage()).toBe("opening");

  // The first position: the panel is `ready`, the board is rendered, and its
  // picture is still on its way (jsdom never finishes loading an image).
  await act(async () => {
    for (const msg of [FX.info, FX.start]) latest().onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) });
    for (let i = 0; i < 4; i += 1) await tick();
  });
  expect(screen.getByTestId("puzzle-panel")).toHaveAttribute("data-board", "true");
  const picture = boardPicture();
  expect(picture).not.toBeNull();
  expect(picture!.complete).toBe(false);
  await act(async () => {
    await tick(250); // a few of the still's 100 ms looks
  });
  expect(stage()).toBe("opening");
  expect(screen.getByTestId("landing-puzzle-still")).toBeInTheDocument();

  // The picture arrives: at the swap, the board is drawn.
  Object.defineProperty(picture, "complete", { configurable: true, get: () => true });
  await act(async () => {
    await tick(250);
  });
  expect(stage()).toBe("live");
  expect(screen.queryByTestId("landing-puzzle-still")).not.toBeInTheDocument();
  expect(boardPicture()!.complete).toBe(true);
});
