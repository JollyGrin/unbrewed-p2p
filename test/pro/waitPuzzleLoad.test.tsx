/**
 * The waiting puzzle's lazy load (issue #1681): a panel chunk that will not
 * load (a deploy swapped it, the network dropped) must end as "no puzzle" —
 * `onUnavailable`, so the page puts its old screen back — never as a thrown
 * error on the game page.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { WaitPuzzle } from "@/components/Pro/Puzzle/WaitPuzzle";
import { theme } from "@/styles/style";

jest.mock("../../components/Pro/Puzzle/PuzzlePanel", () => {
  throw new Error("ChunkLoadError: loading chunk failed");
});

it("a chunk that fails to load reports unavailable and renders nothing", async () => {
  const onUnavailable = jest.fn();
  render(
    <ChakraProvider theme={theme}>
      <WaitPuzzle context="lobby_wait" paused={false} onUnavailable={onUnavailable} />
    </ChakraProvider>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(onUnavailable).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("wait-puzzle")).toBeEmptyDOMElement();
});
