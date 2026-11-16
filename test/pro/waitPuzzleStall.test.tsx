/**
 * The waiting puzzle's lazy load, stalled (issue #1687): a panel chunk that
 * neither loads nor fails (a hung request) must end as "no puzzle" after
 * PUZZLE_LOAD_TIMEOUT_MS — `onStatus("unavailable")`, so the page puts its
 * classic waiting screen back instead of an empty box for ever.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { WaitPuzzle } from "@/components/Pro/Puzzle/WaitPuzzle";
import { PUZZLE_LOAD_TIMEOUT_MS, withPuzzleTimeout } from "@/lib/pro/puzzleCatalogue";
import { theme } from "@/styles/style";

// A module that never finishes loading: `import()` of it stays pending.
jest.mock("../../components/Pro/Puzzle/PuzzlePanel", () => ({
  __esModule: true,
  then: () => {},
}));

afterEach(() => jest.useRealTimers());

it("a chunk that never arrives reports unavailable after the timeout", async () => {
  jest.useFakeTimers();
  const onStatus = jest.fn();
  render(
    <ChakraProvider theme={theme}>
      <WaitPuzzle context="quick_search" paused={false} onStatus={onStatus} />
    </ChakraProvider>,
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(PUZZLE_LOAD_TIMEOUT_MS - 100);
  });
  expect(onStatus).not.toHaveBeenCalled();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(200);
  });
  expect(onStatus.mock.calls).toEqual([["unavailable"]]);
  expect(screen.getByTestId("wait-puzzle")).toBeEmptyDOMElement();
});

it("withPuzzleTimeout: the value when it arrives in time, a rejection when it does not", async () => {
  jest.useFakeTimers();
  await expect(withPuzzleTimeout(Promise.resolve("in time"), 50)).resolves.toBe("in time");
  await expect(withPuzzleTimeout(Promise.reject(new Error("broke")), 50)).rejects.toThrow("broke");
  const stalled = withPuzzleTimeout(new Promise(() => {}), 50);
  const caught = expect(stalled).rejects.toThrow("timed out");
  await jest.advanceTimersByTimeAsync(60);
  await caught;
});
