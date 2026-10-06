/** The in-room banner's polling (#1265): hidden tab, 404, cancelled, backoff. */
import { ChakraProvider } from "@chakra-ui/react";
import { act, render } from "@testing-library/react";

import { getMatch } from "../../lib/tournaments/api";

import { MatchDecidedBanner } from "./MatchDecidedBanner";

jest.mock("../../lib/tournaments/api", () => ({ getMatch: jest.fn() }));
jest.mock("../../lib/account/useAccount", () => ({ useAccount: () => ({ status: "signed-in", account: { id: "u-me" } }) }));
const get = getMatch as jest.Mock;

const open = { ok: true, value: { match: { status: "open", winner: null, decidedBy: null }, tournament: { status: "running" }, players: {} } };
const tick = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};
const mount = () =>
  render(
    <ChakraProvider>
      <MatchDecidedBanner at={{ slug: "s", matchId: "m" }} />
    </ChakraProvider>,
  );

beforeEach(() => {
  jest.useFakeTimers();
  get.mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("pauses while hidden and fetches once on becoming visible", async () => {
  get.mockResolvedValue(open);
  mount();
  await tick(0);
  expect(get).toHaveBeenCalledTimes(1);
  const vis = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await tick(90_000);
  expect(get).toHaveBeenCalledTimes(1);
  vis.mockReturnValue("visible");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(0);
  expect(get).toHaveBeenCalledTimes(2);
});

it("stops after a 404 and after a cancelled tournament", async () => {
  get.mockResolvedValue({ ok: false, reason: "not_found" });
  mount();
  await tick(0);
  await tick(120_000);
  expect(get).toHaveBeenCalledTimes(1);

  get.mockReset().mockResolvedValue({ ok: true, value: { ...open.value, tournament: { status: "cancelled" } } });
  mount();
  await tick(0);
  await tick(120_000);
  expect(get).toHaveBeenCalledTimes(1);
});

it("backs off on errors: the interval doubles per failure (15s -> 30s -> 60s cap) and resets on success", async () => {
  get.mockResolvedValue({ ok: false, reason: "unavailable" });
  mount();
  await tick(0);
  expect(get).toHaveBeenCalledTimes(1); // failure 1: next in 30s
  await tick(29_999);
  expect(get).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(get).toHaveBeenCalledTimes(2); // failure 2: next in 60s
  await tick(59_999);
  expect(get).toHaveBeenCalledTimes(2);
  await tick(1);
  expect(get).toHaveBeenCalledTimes(3); // capped at 60s
  await tick(60_000);
  expect(get).toHaveBeenCalledTimes(4);
  get.mockResolvedValue(open);
  await tick(60_000);
  expect(get).toHaveBeenCalledTimes(5); // success: back to 15s
  await tick(15_000);
  expect(get).toHaveBeenCalledTimes(6);
});
