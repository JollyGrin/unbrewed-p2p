/**
 * @jest-environment jsdom
 *
 * E1 through a REAL router (#1238). PR #1237's pending-pick note was written and
 * then wiped by its own ticket-strip `router.replace`: that replace fires
 * routeChangeStart, and the "leaving the page" listener forgot the note. The
 * page tests in tournamentTicket.test.tsx use a fake router whose events are
 * no-ops, so they never saw it. next-router-mock's MemoryRouter emits
 * routeChangeStart on push/replace like Next does — but synchronously, while
 * Next 13.3 first awaits the page list + build manifest (router.js `change()`),
 * so the event lands after the page's effects have subscribed. The mock's
 * push/replace are deferred a tick below to match; without that the event
 * fires before the listener exists and the bug can't be seen.
 */
import "@testing-library/jest-dom";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockRouter from "next-router-mock";
import { MemoryRouterProvider } from "next-router-mock/MemoryRouterProvider/next-11";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const PENDING = "unbrewed-pro-tournament-pending";
const HEROES = [
  { heroId: "kenshiro", name: "Kenshiro", hp: 16, move: 2, reach: "MELEE" },
  { heroId: "boba-fett", name: "Boba Fett", hp: 15, move: 2, reach: "RANGED" },
];
let SENT: Record<string, unknown>[] = [];

const mount = async (url: string) => {
  mockRouter.setCurrentUrl(url);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouterProvider>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </MemoryRouterProvider>
    </QueryClientProvider>,
  );
  const socket = FakeWebSocket.latest();
  if (!socket) throw new Error("the page never opened a socket");
  await act(async () => {
    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.({});
  });
};

const deliver = async (msg: Record<string, unknown>) => {
  const socket = FakeWebSocket.latest()!;
  await act(async () => {
    socket.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) });
  });
};

const flush = async (n = 5) => {
  for (let i = 0; i < n; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};

const reload = async (url: string) => {
  cleanup();
  FakeWebSocket.reset();
  SENT = [];
  await mount(url);
  await deliver({ type: "HEROES", heroes: HEROES });
  await flush();
};

beforeAll(() => {
  for (const method of ["push", "replace"] as const) {
    const original = mockRouter[method].bind(mockRouter);
    mockRouter[method] = (async (url, as, options) => {
      await new Promise((r) => setTimeout(r, 0));
      return original(url, as, options);
    }) as typeof original;
  }
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(data: string) {
    SENT.push(JSON.parse(data));
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  SENT = [];
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const TICKET_URL = "/pro/game?ticket=payload.sig&tour=autumn-skirmish&match=m2-1&lockMap=catalog%3Acounts-castle";

describe("E1 through a real router (#1238)", () => {
  it("the ticket-strip replace keeps the note; F5 at the picker shows the ticket card, not the lobby", async () => {
    const starts: string[] = [];
    const onStart = (url: string) => starts.push(url);
    mockRouter.events.on("routeChangeStart", onStart);
    await mount(TICKET_URL);
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush();
    mockRouter.events.off("routeChangeStart", onStart);

    // the replace really ran through the router and really fired routeChangeStart
    expect(starts).toContain("/pro/game");
    expect(mockRouter.query).toEqual({});
    expect(screen.getByText("TOURNAMENT · pick your hero")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(PENDING)).toContain("m2-1");

    await reload("/pro/game"); // F5: the ticket is gone from the URL
    expect(screen.getByTestId("ticket-error")).toBeInTheDocument();
    expect(screen.getByText("Back to the match")).toBeInTheDocument();
    expect(screen.queryByText("CREATE A ROOM")).not.toBeInTheDocument();
    expect(SENT.filter((m) => m.type === "CREATE_ROOM")).toHaveLength(0); // ticket never reused
  });

  it("leaving the picker for another page clears the note", async () => {
    await mount(TICKET_URL);
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush();
    expect(window.sessionStorage.getItem(PENDING)).not.toBeNull();
    await act(async () => {
      await mockRouter.push("/tournaments/autumn-skirmish");
    });
    expect(window.sessionStorage.getItem(PENDING)).toBeNull();
  });

  it("a created room clears the note (the room note takes over)", async () => {
    await mount(`${TICKET_URL}&lockHero=kenshiro`);
    await flush();
    expect(SENT.filter((m) => m.type === "CREATE_ROOM")).toHaveLength(1);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await flush();
    expect(mockRouter.query).toEqual({ room: "SF2ROOM" });
    expect(window.sessionStorage.getItem(PENDING)).toBeNull();
  });

  it("a ticket error clears the note: a reload shows the casual lobby", async () => {
    await mount(TICKET_URL);
    await deliver({ type: "HEROES", heroes: HEROES });
    await deliver({ type: "ERROR", code: "TICKET_EXPIRED", message: "x" });
    await flush();
    expect(window.sessionStorage.getItem(PENDING)).toBeNull();
    await reload("/pro/game");
    expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
  });

  it("a stale (30-min) note shows the casual lobby on reload", async () => {
    await mount(TICKET_URL);
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush();
    const note = JSON.parse(window.sessionStorage.getItem(PENDING)!);
    window.sessionStorage.setItem(PENDING, JSON.stringify({ ...note, ts: Date.now() - 31 * 60 * 1000 }));
    await reload("/pro/game");
    expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(PENDING)).toBeNull();
  });
});
