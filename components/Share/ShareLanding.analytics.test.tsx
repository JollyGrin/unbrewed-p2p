/**
 * `share_link_opened` (#1513): once per landing on /share/{deck,map,replay}/<id>,
 * as soon as the id is known (the routes and the 404.html rescue both render
 * these components), never again on re-render.
 */
import { act, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ShareLanding } from "./ShareLanding";
import { ReplaySharePage } from "../Pro/ReplayShareLanding";
import { resetGrowthAnalytics } from "../../lib/growthAnalytics";
import { __resetAccountStoreForTests } from "../../lib/account/useAccount";

const track = jest.fn();
jest.mock("../../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));
jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/share/deck/cloud-id", query: {}, pathname: "/share/deck/[id]" }),
}));
jest.mock("../../lib/pro/replayCloud", () => ({ fetchSharedReplay: () => new Promise(() => {}) }));

const flush = () => act(async () => { jest.advanceTimersByTime(50); });

beforeEach(() => {
  jest.useFakeTimers();
  track.mockClear();
  resetGrowthAnalytics();
  __resetAccountStoreForTests();
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

describe("share_link_opened (share pages)", () => {
  it.each(["deck", "map"] as const)("/share/%s: once the id arrives", async (route) => {
    const view = (id?: string) => (
      <ChakraProvider>
        <ShareLanding route={route} id={id} />
      </ChakraProvider>
    );
    const { rerender } = render(view(undefined));
    await flush();
    expect(track).not.toHaveBeenCalled();
    rerender(view("cloud-id"));
    rerender(view("cloud-id"));
    await flush();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("share_link_opened", { kind: route, source: "share_page" });
  });

  it("/share/replay: once the id arrives", async () => {
    const view = (id: string | null) => (
      <ChakraProvider>
        <ReplaySharePage id={id} />
      </ChakraProvider>
    );
    const { rerender } = render(view(null));
    await flush();
    expect(track).not.toHaveBeenCalled();
    rerender(view("replay-id"));
    await flush();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("share_link_opened", { kind: "replay", source: "share_page" });
  });
});
