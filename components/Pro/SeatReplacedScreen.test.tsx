/** "This seat is open in another tab" (p2p #1250): never a button that can only wait forever. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";

import { SeatReplacedScreen } from "./SeatReplacedScreen";

const mount = (props: Partial<Parameters<typeof SeatReplacedScreen>[0]> = {}) => {
  const onTakeBack = jest.fn();
  render(
    <ChakraProvider>
      <SeatReplacedScreen roomId="CAS1" at={null} onTakeBack={onTakeBack} {...props} />
    </ChakraProvider>,
  );
  return onTakeBack;
};

afterEach(() => window.localStorage.clear());

it("no seat token and no known match: no 'Use this tab instead', a way to play casual instead", () => {
  mount();
  expect(screen.queryByText("Use this tab instead")).not.toBeInTheDocument();
  expect(screen.getByText("Play casual instead").closest("a")).toHaveAttribute("href", "/pro/game");
});

it("a stored seat token: 'Use this tab instead' reconnects with it", () => {
  window.localStorage.setItem("unbrewed-pro-token-CAS1", "tok");
  const onTakeBack = mount();
  fireEvent.click(screen.getByText("Use this tab instead"));
  expect(onTakeBack).toHaveBeenCalledTimes(1);
});

it("a tournament room without a token still offers it (a fresh ticket) and the way back to the match", () => {
  mount({ at: { slug: "s", matchId: "m" } });
  expect(screen.getByText("Use this tab instead")).toBeInTheDocument();
  expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute("href", "/tournaments?t=s&m=m");
});
