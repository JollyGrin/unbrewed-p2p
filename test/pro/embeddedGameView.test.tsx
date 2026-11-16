/**
 * The embeddable Pro game view (issue #1678): `<GameView contained>` driven by
 * an EPHEMERAL socket the host page hands it.
 *
 * What is pinned here:
 *  - the ephemeral socket leaves the browser's room keys alone, and reports no
 *    `hero_picked` (the non-ephemeral control still does both);
 *  - the view lives inside its frame: its portals too, and it picks its
 *    arrangement from the FRAME's size, not the viewport;
 *  - the host page's title is untouched;
 *  - the feature switches hide what they say, and the open opponent hand shows;
 *  - keyboard shortcuts fire only for the panel that holds focus.
 *
 * The real-browser half (bounding rects inside the panel, a bot game played in
 * each size) is scripts/pro/embedCheck.mjs.
 */
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect, useRef } from "react";
import { theme } from "@/styles/style";
import { GameView, GameViewFeatures } from "@/components/Pro/GameView";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { Action, PlayerView } from "@/lib/pro/protocol";
import { useProSocket } from "@/lib/pro/useProSocket";
import { resetEngineVersions } from "@/lib/pro/wireVersion";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const mockTrack = jest.fn((_event: string, _props?: Record<string, unknown>) => true);
jest.mock("../../lib/analytics", () => ({
  ...jest.requireActual("../../lib/analytics"),
  track: (event: string, props?: Record<string, unknown>) => mockTrack(event, props),
}));

const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"), "utf8")
    .trim()
    .split("\n")[0],
).view;
const VIEW: PlayerView = { ...BASE_VIEW, you: "p1", phase: "PLAY", winner: null, prompt: null };

// jsdom lays nothing out: the frame's measured size is whatever a test says.
let frameSize = { width: 360, height: 640 };
const sent: Record<string, unknown>[] = [];

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(this: FakeWebSocket, data: string) {
    sent.push({ url: this.url, ...JSON.parse(data) });
  } as unknown as FakeWebSocket["send"];
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => frameSize.width });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => frameSize.height });
});
beforeEach(() => {
  FakeWebSocket.reset();
  sent.length = 0;
  mockTrack.mockClear();
  frameSize = { width: 360, height: 640 };
  document.title = "Host page";
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) }) as Response) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  resetEngineVersions();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

/** A host page: its own socket, one bot room, the view in a sized box. */
const Panel = ({
  url,
  ephemeral = true,
  features,
  opponentHand,
}: {
  url: string;
  ephemeral?: boolean;
  features?: Partial<GameViewFeatures>;
  opponentHand?: string[];
}) => {
  const socket = useProSocket(url, false, false, undefined, { ephemeral });
  const { status, createRoom } = socket;
  const created = useRef(false);
  useEffect(() => {
    if (created.current || status !== "open") return;
    created.current = true;
    createRoom("hero-a", { difficulty: "easy" });
  }, [status, createRoom]);
  return (
    <div data-testid={`host-${url}`} style={{ width: frameSize.width, height: frameSize.height }}>
      <GameView socket={socket} contained features={features} opponentHand={opponentHand} fallback={<span>opening…</span>} />
    </div>
  );
};

const socketFor = (url: string) => FakeWebSocket.instances.find((s) => s.url === url)!;
const deliver = async (url: string, msg: Record<string, unknown>) => {
  await act(async () => {
    socketFor(url).onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) });
  });
};
const open = async (url: string, room: string) => {
  await act(async () => {
    const socket = socketFor(url);
    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.({});
  });
  await deliver(url, { type: "HEROES", heroes: [] });
  await deliver(url, { type: "ROOM_CREATED", roomId: room, token: `tok-${room}`, you: "p1" });
};
const state = (url: string, legalActions: Action[] = [], view: PlayerView = VIEW) =>
  deliver(url, { type: "STATE", view, legalActions, events: [] });

const mount = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChakraProvider theme={theme}>{ui}</ChakraProvider>
    </QueryClientProvider>,
  );

const roomKeys = () =>
  [...Object.keys(window.localStorage), ...Object.keys(window.sessionStorage)].filter((k) => /^unbrewed-pro-(token|resume|bots)-/.test(k));

describe("the ephemeral socket (useProSocket { ephemeral: true })", () => {
  it("writes no reconnect token, bot seats or recent-rooms entry, and reports no hero_picked", async () => {
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle");

    expect(sent.some((m) => m.type === "CREATE_ROOM")).toBe(true);
    expect(roomKeys()).toEqual([]);
    expect(window.localStorage.getItem("unbrewed-pro-recent-rooms")).toBeNull();
    expect(mockTrack.mock.calls.filter(([event]) => event === "hero_picked")).toEqual([]);
    expect(screen.getByTestId("pro-game-view")).toBeInTheDocument();
  });

  it("(control) the default socket still stores the token, the room and the pick", async () => {
    mount(<Panel url="ws://game" ephemeral={false} />);
    await open("ws://game", "GM1");
    await state("ws://game");

    expect(window.localStorage.getItem("unbrewed-pro-token-GM1")).toBe("tok-GM1");
    expect(window.localStorage.getItem("unbrewed-pro-recent-rooms")).toContain("GM1");
    expect(mockTrack.mock.calls.filter(([event]) => event === "hero_picked")).toHaveLength(1);
  });

  it("does not read the real game's token for the same room: it never RECONNECTs into that seat", async () => {
    window.localStorage.setItem("unbrewed-pro-token-PZ1", "the-real-seat");
    window.sessionStorage.setItem("unbrewed-pro-token-PZ1", "the-real-seat");
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    // a dropped socket reopens: the ephemeral seat's own (in-memory) token is replayed
    await act(async () => {
      socketFor("ws://puzzle").onopen?.({});
    });
    const reconnects = sent.filter((m) => m.type === "RECONNECT");
    expect(reconnects.every((m) => m.token === "tok-PZ1")).toBe(true);
    expect(window.localStorage.getItem("unbrewed-pro-token-PZ1")).toBe("the-real-seat");
  });
});

describe("contained mode", () => {
  it("shows the fallback until the first STATE, then the view inside its frame", async () => {
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    expect(screen.getByText("opening…")).toBeInTheDocument();
    await state("ws://puzzle");
    const frame = screen.getByTestId("pro-contained");
    expect(within(frame).getByTestId("pro-game-view")).toBeInTheDocument();
    expect(screen.queryByText("opening…")).toBeNull();
  });

  it.each([
    ["a 360×640 box wears the phone arrangement", { width: 360, height: 640 }, "pro-mobile-controls"],
    ["a 720×520 box wears the rail", { width: 720, height: 520 }, "pro-mobile-rail"],
    ["a 960×600 box wears the rail (too short for the desktop overlays)", { width: 960, height: 600 }, "pro-mobile-rail"],
    ["a 1120×680 box wears the desktop arrangement", { width: 1120, height: 680 }, "pro-hand-dock"],
  ])("picks the arrangement from the frame, not the viewport: %s", async (_name, size, testId) => {
    frameSize = size;
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle");
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    for (const other of ["pro-mobile-controls", "pro-mobile-rail", "pro-hand-dock"].filter((t) => t !== testId)) {
      expect(screen.queryByTestId(other)).toBeNull();
    }
  });

  it("keeps every Chakra portal inside the frame, and leaves the page title alone", async () => {
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle");
    const frame = screen.getByTestId("pro-contained");
    // the game menu is a Chakra Menu: a portal
    fireEvent.click(within(frame).getByLabelText("Game menu"));
    // (ChakraProvider's own always-mounted toast regions are the host app's)
    const strays = [...document.querySelectorAll(".chakra-portal")]
      .filter((p) => !frame.contains(p) && [...p.children].some((c) => !/^chakra-toast-manager/.test(c.id)))
      .map((p) => p.innerHTML.slice(0, 200));
    expect(strays).toEqual([]);
    expect(within(frame).getByText(/report a bug/i)).toBeInTheDocument();
    expect(frame.querySelectorAll(".chakra-portal").length).toBeGreaterThan(1);
    expect(document.title).toBe("Host page");
  });

  it("by default offers nothing that leaves the panel: no room link, no board-view toggle", async () => {
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle");
    fireEvent.click(screen.getByLabelText("Game menu"));
    expect(screen.queryByText(/copy join link/i)).toBeNull();
    expect(screen.queryByText(/tabletop|flat board/i)).toBeNull();
    // …while what stays inside the panel is still there
    expect(screen.getByText(/report a bug/i)).toBeInTheDocument();
  });
});

describe("feature switches", () => {
  const FORFEIT: Action = { type: "FORFEIT", player: "p1" };

  it("forfeit / reportBug / soundToggles off: none of them is offered", async () => {
    mount(<Panel url="ws://puzzle" features={{ forfeit: false, reportBug: false, soundToggles: false, undo: false }} />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle", [FORFEIT], { ...VIEW, canUndo: true });
    fireEvent.click(screen.getByLabelText("Game menu"));
    expect(screen.queryByText(/forfeit/i)).toBeNull();
    expect(screen.queryByText(/report a bug/i)).toBeNull();
    expect(screen.queryByText(/sound/i)).toBeNull();
    expect(screen.queryByText(/undo last action/i)).toBeNull();
  });

  it("(control) the same state with the defaults offers forfeit, the bug report and sound", async () => {
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle", [FORFEIT], { ...VIEW, canUndo: true });
    fireEvent.click(screen.getByLabelText("Game menu"));
    expect(screen.getAllByText(/forfeit/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/report a bug/i)).toBeInTheDocument();
    expect(screen.getAllByText(/sound/i).length).toBeGreaterThan(0);
  });

  it("undo off: an opponent's undo request is declined instead of hanging on a dialog", async () => {
    mount(<Panel url="ws://puzzle" features={{ undo: false }} />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle");
    await deliver("ws://puzzle", { type: "UNDO_REQUESTED", roomId: "PZ1", by: "p2", rewindActions: [] });
    expect(sent.filter((m) => m.type === "UNDO_RESPONSE")).toEqual([expect.objectContaining({ accept: false })]);
  });

  it("postGame off: no end screen once the game is decided", async () => {
    mount(<Panel url="ws://puzzle" features={{ postGame: false }} />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle", [], { ...VIEW, phase: "GAME_OVER", winner: "p1" });
    expect(screen.queryByTestId("post-game-result")).toBeNull();
  });

  it("(control) postGame on: the end screen, with no link that leaves the page or opens an unsaved replay", async () => {
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle", [], { ...VIEW, phase: "GAME_OVER", winner: "p1" });
    expect(screen.getAllByTestId("post-game-result").length).toBeGreaterThan(0);
    expect(screen.queryByText(/rematch/i)).toBeNull();
    expect(screen.queryByText(/back to lobby/i)).toBeNull();
    expect(screen.queryByText(/view your replay/i)).toBeNull();
  });
});

describe("the open opponent hand", () => {
  it("renders the hand it is handed, face up, with the existing hand-card visuals", async () => {
    mount(<Panel url="ws://puzzle" opponentHand={VIEW.self.hand} />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle");
    const panel = screen.getByTestId("revealed-hand-panel");
    expect(within(panel).getByText(/'s hand$/)).toBeInTheDocument();
    expect(within(panel).getByText("face up")).toBeInTheDocument();
    expect(within(panel).queryByText(/as of turn/)).toBeNull();
  });

  it("reads the puzzle room's `openHand` off the opponent view when no prop is passed", async () => {
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle", [], { ...VIEW, opponent: { ...VIEW.opponent!, openHand: VIEW.self.hand } });
    expect(within(screen.getByTestId("revealed-hand-panel")).getByText("face up")).toBeInTheDocument();
  });

  it("is absent without one", async () => {
    mount(<Panel url="ws://puzzle" />);
    await open("ws://puzzle", "PZ1");
    await state("ws://puzzle");
    expect(screen.queryByTestId("revealed-hand-panel")).toBeNull();
  });
});

describe("keyboard shortcuts with two panels on one page", () => {
  const SOLE: Action = { type: "END_MANEUVER", player: "p1" };
  const actionsSent = (url: string) => sent.filter((m) => m.url === url && m.type === "ACTION");

  it("act only on the panel that holds focus", async () => {
    mount(
      <>
        <Panel url="ws://a" />
        <Panel url="ws://b" />
        <button data-testid="host-button">host</button>
      </>,
    );
    await open("ws://a", "RA");
    await open("ws://b", "RB");
    await state("ws://a", [SOLE]);
    await state("ws://b", [SOLE]);
    const [frameA, frameB] = screen.getAllByTestId("pro-contained");

    // focus on the host page: the spacebar belongs to the page
    screen.getByTestId("host-button").focus();
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(actionsSent("ws://a")).toHaveLength(0);
    expect(actionsSent("ws://b")).toHaveLength(0);

    // focus in panel B: only B acts
    act(() => frameB.focus());
    fireEvent.keyDown(frameB, { key: " ", code: "Space" });
    expect(actionsSent("ws://b")).toEqual([expect.objectContaining({ roomId: "RB", action: SOLE })]);
    expect(actionsSent("ws://a")).toHaveLength(0);

    // …and a full-page view on the same page would stand down too (see contained.test.ts)
    // …and A, when A has it
    act(() => frameA.focus());
    fireEvent.keyDown(frameA, { key: " ", code: "Space" });
    expect(actionsSent("ws://a")).toEqual([expect.objectContaining({ roomId: "RA", action: SOLE })]);
    expect(actionsSent("ws://b")).toHaveLength(1);
  });
});
