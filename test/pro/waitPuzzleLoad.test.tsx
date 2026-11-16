/**
 * The waiting puzzle's lazy load (issue #1681): a panel chunk that will not
 * load (a deploy swapped it, the network dropped) must end as "no puzzle" —
 * `onStatus("unavailable")`, so the page puts its old screen back — never as a
 * thrown error on the game page.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { LobbyWaitBar, WaitPuzzle } from "@/components/Pro/Puzzle/WaitPuzzle";
import { theme } from "@/styles/style";

jest.mock("../../components/Pro/Puzzle/PuzzlePanel", () => {
  throw new Error("ChunkLoadError: loading chunk failed");
});

it("a chunk that fails to load reports unavailable and renders nothing", async () => {
  const onStatus = jest.fn();
  render(
    <ChakraProvider theme={theme}>
      <WaitPuzzle context="lobby_wait" paused={false} onStatus={onStatus} />
    </ChakraProvider>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(onStatus.mock.calls).toEqual([["unavailable"]]);
  expect(screen.getByTestId("wait-puzzle")).toBeEmptyDOMElement();
});

it("the one-bar lobby keeps the board line and the custom board's submit link within reach (#1687)", () => {
  const noop = () => {};
  render(
    <ChakraProvider theme={theme}>
      <LobbyWaitBar
        title="ROOM AB12"
        waiting="You are King Kong · waiting for an opponent"
        rule={null}
        board="playing on a custom board"
        extra={<button type="button">happy with this board? submit it to unbrewed</button>}
        joinUrl="https://example.test/pro/game?room=AB12"
        onCopy={noop}
        copied={false}
        roomPublic={false}
        onTogglePublic={noop}
        soundOn
        onToggleSound={noop}
        onHide={noop}
        joined={null}
      />
    </ChakraProvider>,
  );
  expect(screen.getByTestId("wait-bar-waiting")).toHaveTextContent("waiting for an opponent · playing on a custom board");
  expect(screen.getByRole("button", { name: /submit it to unbrewed/i })).toBeInTheDocument();
});
