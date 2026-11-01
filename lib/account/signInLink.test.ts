const track = jest.fn();
jest.mock("../analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

import { signInLink } from "./signInLink";
import { signInUrl } from "./useAccount";

beforeEach(() => {
  track.mockClear();
  window.history.pushState({}, "", "/tournaments/spring");
});

describe("signInLink", () => {
  it("points at the OAuth handoff and emits login_started on click", () => {
    const link = signInLink("/account");
    expect(link.href).toBe(signInUrl("/account"));
    expect(track).not.toHaveBeenCalled();
    link.onClick();
    expect(track).toHaveBeenCalledWith("login_started", { provider: "discord", from_page: "/tournaments/spring" });
  });

  it("chains the call site's own click handler", () => {
    const own = jest.fn();
    signInLink("/pro", own).onClick();
    expect(track).toHaveBeenCalledTimes(1);
    expect(own).toHaveBeenCalledTimes(1);
  });
});
