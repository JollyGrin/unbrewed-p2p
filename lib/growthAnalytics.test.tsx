import { act, render } from "@testing-library/react";
import {
  IRL_FIRST_OPEN_KEY,
  proJoinLinkProps,
  resetGrowthAnalytics,
  trackEntryOnce,
  trackOnce,
  useEntryEvent,
  useIrlInstallAnalytics,
} from "./growthAnalytics";
import type { AnalyticsProps } from "./analytics";

const track = jest.fn();
jest.mock("./analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

/** One frame plus the timeout queued after it. */
const flush = () => act(async () => { jest.advanceTimersByTime(50); });

const Entry = ({ props }: { props: AnalyticsProps | null | undefined }) => {
  useEntryEvent("share_link_opened", props);
  return null;
};

const Install = () => {
  useIrlInstallAnalytics();
  return null;
};

const setDisplayMode = (mode: string | null) => {
  window.matchMedia = ((query: string) => ({
    matches: mode !== null && query === `(display-mode: ${mode})`,
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  jest.useFakeTimers();
  track.mockClear();
  resetGrowthAnalytics();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setDisplayMode(null);
});
afterEach(() => jest.useRealTimers());

describe("trackOnce", () => {
  it("sends an event at most once per page load", () => {
    trackOnce("invite_link_copied", { mode: "pro" });
    trackOnce("invite_link_copied", { mode: "sandbox" });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("invite_link_copied", { mode: "pro" });
  });
});

describe("trackEntryOnce", () => {
  it("waits out the frame in which the notice starts analytics", async () => {
    let started = false;
    track.mockImplementation(() => expect(started).toBe(true));
    trackEntryOnce("join_link_opened", { mode: "sandbox" });
    // AnalyticsNotice's effect runs after the page's: its frame is queued second.
    requestAnimationFrame(() => { started = true; });
    expect(track).not.toHaveBeenCalled();
    await flush();
    expect(track).toHaveBeenCalledWith("join_link_opened", { mode: "sandbox" });
    track.mockImplementation(() => undefined);
  });
});

describe("useEntryEvent", () => {
  it("fires once when the props become known, not again on re-render", async () => {
    const { rerender } = render(<Entry props={undefined} />);
    await flush();
    expect(track).not.toHaveBeenCalled();
    rerender(<Entry props={{ kind: "deck", source: "share_page" }} />);
    rerender(<Entry props={{ kind: "deck", source: "share_page" }} />);
    await flush();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("share_link_opened", { kind: "deck", source: "share_page" });
  });

  it("a landing with nothing to send ignores a later value (a URL the page rewrote)", async () => {
    const { rerender } = render(<Entry props={null} />);
    rerender(<Entry props={{ kind: "deck", source: "deeplink" }} />);
    await flush();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("proJoinLinkProps", () => {
  it("counts a ?room= invite", () => {
    expect(proJoinLinkProps("abc", { room: "abc" })).toEqual({ mode: "pro" });
  });

  it("skips no room, a seat this browser holds, and a tournament ticket", () => {
    expect(proJoinLinkProps(null, {})).toBeNull();
    expect(proJoinLinkProps("abc", { room: "abc", tour: "t", match: "m" })).toBeNull();
    window.localStorage.setItem("unbrewed-pro-token-abc", "tok");
    expect(proJoinLinkProps("abc", { room: "abc" })).toBeNull();
  });
});

describe("useIrlInstallAnalytics", () => {
  it("sends pwa_installed on appinstalled, once", () => {
    render(<Install />);
    window.dispatchEvent(new Event("appinstalled"));
    window.dispatchEvent(new Event("appinstalled"));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("pwa_installed", undefined);
  });

  it("sends app_first_open on the first standalone launch only", async () => {
    setDisplayMode("standalone");
    const first = render(<Install />);
    await flush();
    expect(track).toHaveBeenCalledWith("app_first_open", { display_mode: "standalone" });
    expect(window.localStorage.getItem(IRL_FIRST_OPEN_KEY)).toBe("1");
    first.unmount();

    // A later launch (a new page load) finds the flag.
    track.mockClear();
    resetGrowthAnalytics();
    render(<Install />);
    await flush();
    expect(track).not.toHaveBeenCalled();
  });

  it("sends nothing in a browser tab", async () => {
    render(<Install />);
    await flush();
    expect(track).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(IRL_FIRST_OPEN_KEY)).toBeNull();
  });
});
