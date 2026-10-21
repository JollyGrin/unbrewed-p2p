import { renderHook } from "@testing-library/react";
import { toast } from "react-hot-toast";
import type { ConnectionStatus } from "@/lib/gamesocket/socket";
import { CONNECT_TOAST_ID, useConnectToast } from "./useConnectToast";

jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const info = () => ({
  host: "relay.test",
  gid: "room-7",
  players: 2,
  deckLoaded: true,
});

const setup = (initial: ConnectionStatus = "connecting") =>
  renderHook(({ status }) => useConnectToast(status, info), {
    initialProps: { status: initial },
  });

describe("useConnectToast (#1393)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stays silent while connecting, not even after 10s", () => {
    jest.useFakeTimers();
    setup();
    jest.advanceTimersByTime(10_000);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("fires one success toast with host, room, players on first open", () => {
    const { rerender } = setup();
    rerender({ status: "open" });
    expect(toast.success).toHaveBeenCalledTimes(1);
    const [msg, opts] = (toast.success as jest.Mock).mock.calls[0];
    expect(msg).toContain("relay.test");
    expect(msg).toContain("room-7");
    expect(msg).toContain("2 in room");
    expect(msg).toContain("deck loaded");
    expect(opts).toEqual({ id: CONNECT_TOAST_ID });
  });

  it("toasts a failure once when closed before ever opening", () => {
    const { rerender } = setup();
    rerender({ status: "closed" });
    rerender({ status: "connecting" });
    rerender({ status: "closed" });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not repeat the success toast on reconnect, only a short one", () => {
    const { rerender } = setup();
    rerender({ status: "open" });
    rerender({ status: "closed" });
    rerender({ status: "connecting" });
    rerender({ status: "open" });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledTimes(2);
    expect((toast.success as jest.Mock).mock.calls[1][0]).toBe("Reconnected");
  });
});
