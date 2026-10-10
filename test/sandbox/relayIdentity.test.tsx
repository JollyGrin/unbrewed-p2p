/**
 * #1322 — the sandbox ws URL carries the signed-in account id and Discord
 * username (an unverified label for the relay operator). Guests send nothing,
 * and an account that resolves after the first connect rides the next
 * reconnect without tearing down the live socket.
 */
import React from "react";
import { act, render } from "@testing-library/react";
import { WebGameProvider } from "@/lib/contexts/WebGameProvider";
import type { AccountState } from "@/lib/account/useAccount";

jest.mock("next/router", () => ({
  useRouter: () => ({
    isReady: true,
    query: { name: "alice", gid: "g1" },
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

let mockAccount: AccountState = { status: "loading", account: null };
jest.mock("../../lib/account/useAccount", () => ({
  useAccount: () => mockAccount,
}));

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: () => void;
  onerror?: () => void;
  constructor(readonly url: URL) {
    FakeSocket.instances.push(this);
  }
  send() {}
  close() {}
}

const realWebSocket = global.WebSocket;
beforeEach(() => {
  jest.useFakeTimers();
  FakeSocket.instances = [];
  (global as any).WebSocket = FakeSocket;
  mockAccount = { status: "loading", account: null };
});
afterEach(() => {
  jest.useRealTimers();
  global.WebSocket = realWebSocket;
});

const urlOf = (i: number) => new URL(FakeSocket.instances[i].url.toString());
const tree = () => (
  <WebGameProvider>
    <div />
  </WebGameProvider>
);

it("a guest's ws URL carries only the name", () => {
  mockAccount = { status: "guest", account: null };
  render(tree());
  expect(urlOf(0).search).toBe("?name=alice");
});

it("a signed-in player's ws URL carries account and discord", () => {
  mockAccount = {
    status: "signed-in",
    account: { id: "acct-1", username: "dean", avatarUrl: null },
  };
  render(tree());
  expect(urlOf(0).search).toBe("?name=alice&account=acct-1&discord=dean");
});

it("an account that resolves late shows up on the next reconnect", () => {
  const view = render(tree());
  expect(urlOf(0).search).toBe("?name=alice");

  mockAccount = {
    status: "signed-in",
    account: { id: "acct-1", username: "dean", avatarUrl: null },
  };
  view.rerender(tree());
  // The live socket is not torn down just because the account resolved.
  expect(FakeSocket.instances).toHaveLength(1);

  act(() => {
    FakeSocket.instances[0].onclose?.();
    jest.advanceTimersByTime(1000);
  });
  expect(FakeSocket.instances).toHaveLength(2);
  expect(urlOf(1).search).toBe("?name=alice&account=acct-1&discord=dean");
});
