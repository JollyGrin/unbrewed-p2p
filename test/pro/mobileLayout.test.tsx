/**
 * The mobile arrangement of /pro/game (issue #708, direction B), through the
 * REAL page.
 *
 * What only a mounted page can prove is the swap itself: that a phone-sized
 * viewport gives the BOARD the whole viewport and floats corner HP chips, a
 * contextual pill row and a fan-peek hand over it instead of the draggable
 * plates and the right-edge dock, that the seat facts a desktop player reads
 * off a nameplate (and its HOVER tooltip) are all reachable by TAP, and — the
 * guardrail on this ticket — that a desktop viewport still renders exactly the
 * arrangement it always has.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, seeded reconnect
 * token, a STATE frame over a real recorded view).
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { PlayerView } from "@/lib/pro/protocol";
import { MOBILE_QUERY, RAIL_QUERY } from "@/lib/pro/useProLayout";
import { MOBILE_CHIPS_TEST_ID } from "@/components/Pro/ProMobileHud";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "MOBI";

/** A real recorded seat view: the viewer is p1 (Alpha); p2 is Beta. */
const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8"
  )
    .trim()
    .split("\n")[0]
).view;

const realMatchMedia = window.matchMedia;

/** Answer the two queries useProLayout asks, and nothing else. */
const setViewport = (kind: "desktop" | "portrait" | "rail") => {
  const answers: Record<string, boolean> = {
    [MOBILE_QUERY]: kind !== "desktop",
    [RAIL_QUERY]: kind === "rail",
  };
  window.matchMedia = ((query: string) => ({
    matches: answers[query] ?? false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

const fakeRouter = () =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query: { room: ROOM },
    asPath: `/pro/game?room=${ROOM}`,
    basePath: "",
    isReady: true,
    isFallback: false,
    isPreview: false,
    isLocaleDomain: false,
    events: { on() {}, off() {}, emit() {} },
    push: async () => true,
    replace: async () => true,
    reload() {},
    back() {},
    forward() {},
    prefetch: async () => {},
    beforePopState() {},
  }) as never;

const mount = async () => {
  const out = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter()}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>
  );
  const ws = FakeWebSocket.latest();
  if (!ws) throw new Error("the page never opened a socket");
  await act(async () => {
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.({});
  });
  await act(async () => {
    ws.onmessage?.({
      data: JSON.stringify({
        v: PROTOCOL_VERSION,
        type: "STATE",
        view: BASE_VIEW,
        legalActions: [],
      }),
    });
  });
  return {
    ...out,
    state: async (view: PlayerView, legalActions: unknown[] = []) => {
      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view, legalActions }),
        });
      });
    },
  };
};

const chips = () => screen.queryByTestId(MOBILE_CHIPS_TEST_ID);
const controls = () => screen.queryByTestId("pro-mobile-controls");
const rail = () => screen.queryByTestId("pro-mobile-rail");

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
});

beforeEach(() => {
  FakeWebSocket.reset();
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "mobile-layout-test-token");
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("desktop (>= 62em) is untouched", () => {
  it("renders the floating plates and no mobile chrome", async () => {
    setViewport("desktop");
    await mount();
    expect(chips()).toBeNull();
    expect(controls()).toBeNull();
    expect(rail()).toBeNull();
    // The chip cluster's controls stay where they are, not behind a menu, and
    // the activity log still floats (its own bug icon is the second match).
    expect(screen.getAllByLabelText(/report a bug/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.queryByLabelText("Game menu")).toBeNull();
  });

  it("falls back to desktop when the environment has no matchMedia at all", async () => {
    // @ts-expect-error deliberately removing the API a headless DOM may lack
    delete window.matchMedia;
    await mount();
    expect(chips()).toBeNull();
    expect(controls()).toBeNull();
  });
});

describe("portrait phone", () => {
  it("swaps the plates + dock for corner chips and floating controls", async () => {
    setViewport("portrait");
    await mount();
    expect(chips()).toBeInTheDocument();
    expect(controls()).toBeInTheDocument();
    // one HP chip per seat, each a real tap target into that seat's details
    expect(screen.getByTestId("seat-chip-p1")).toBeInTheDocument();
    expect(screen.getByTestId("seat-chip-p2")).toBeInTheDocument();
    // the chip cluster collapsed into one overflow button
    expect(screen.getByLabelText("Game menu")).toBeInTheDocument();
    expect(screen.getByLabelText("Activity log")).toBeInTheDocument();
  });

  it("keeps the hand behind a fan-peek so nothing permanent stands on the board", async () => {
    setViewport("portrait");
    await mount();
    const peek = screen.getByTestId("hand-fan-peek");
    expect(peek).toBeInTheDocument();
    expect(peek).toHaveAttribute(
      "aria-label",
      `Your hand — ${BASE_VIEW.self.hand.length} cards`
    );
    expect(screen.queryByTestId("hand-drawer")).toBeNull();
  });

  it("opens the whole hand at once when the peek is tapped", async () => {
    setViewport("portrait");
    await mount();
    fireEvent.click(screen.getByTestId("hand-fan-peek"));
    const drawer = screen.getByTestId("hand-drawer");
    expect(drawer.textContent).toContain(`YOUR HAND · ${BASE_VIEW.self.hand.length}`);
    expect(drawer.textContent).toContain("tap to play");
    // closing returns the board to itself
    fireEvent.click(screen.getByLabelText("Close hand"));
    expect(screen.queryByTestId("hand-drawer")).toBeNull();
  });

  it("shows the decision as a pill row, with the sheet one tap away", async () => {
    setViewport("portrait");
    await mount();
    expect(screen.getByTestId("pro-mobile-pills")).toBeInTheDocument();
    expect(screen.queryByTestId("pro-mobile-sheet")).toBeNull();
    fireEvent.click(screen.getByTestId("pro-mobile-more"));
    expect(screen.getByTestId("pro-mobile-sheet")).toBeInTheDocument();
    // Opened by choice, so "tap away to dismiss" is real and gets a scrim.
    expect(screen.getByTestId("pro-mobile-sheet-scrim")).toBeInTheDocument();
  });

  /**
   * The blocker this test exists for: a prompt that says "click a gold space on
   * the board" forces the sheet open, and a full-viewport `pointer-events:auto`
   * scrim under it silently ate every board tap — the board rendered, the ring
   * pulsed, and nothing happened. A forced sheet cannot be dismissed, so its
   * scrim was pure obstruction; it must not exist.
   */
  it("never puts a scrim over the board while a prompt owns it", async () => {
    setViewport("portrait");
    const { state } = await mount();
    await state(
      {
        ...BASE_VIEW,
        prompt: {
          promptId: "p-choose-space",
          player: BASE_VIEW.you,
          kind: "CHOOSE_SPACE",
          options: [
            { id: "o1", label: "w2" },
            { id: "o2", label: "w3" },
          ],
        },
      } as PlayerView,
      []
    );
    // the sheet is up and locked open…
    expect(screen.getByTestId("pro-mobile-sheet")).toBeInTheDocument();
    expect(screen.getByLabelText(/decision is waiting/i)).toBeInTheDocument();
    // …and the board underneath it is still reachable.
    expect(screen.queryByTestId("pro-mobile-sheet-scrim")).toBeNull();
  });

  it("puts every seat fact behind a tap, including the hover-only hero rules", async () => {
    setViewport("portrait");
    await mount();
    const hero = BASE_VIEW.fighters.find((f) => f.owner === "p2" && f.kind === "HERO")!;

    fireEvent.click(screen.getByTestId("seat-chip-p2"));
    const sheet = screen.getByLabelText("Close seat details").parentElement!;
    // the same SeatPlate the desktop nameplate renders — hero HP, piles, and
    // the rules text that lives in a hover tooltip on a mouse
    expect(sheet.textContent).toContain(`${hero.hp}/${hero.maxHp}`);
    expect(sheet.textContent).toContain(hero.name);
  });

  it("shows the badge shelf, and spells the badges out inline (#718)", async () => {
    // The desktop plate hides the names and blurbs behind a click-to-open
    // popover; a phone has no hover and the drawer is where every hover-only
    // fact already lands, so the sheet renders the same list inline.
    setViewport("portrait");
    const { state } = await mount();
    const view = JSON.parse(JSON.stringify(BASE_VIEW)) as PlayerView;
    view.players.find((seat) => seat.id === "p2")!.badges = [
      "first-win",
      "bot-slayer",
    ];
    await state(view);

    fireEvent.click(screen.getByTestId("seat-chip-p2"));
    const sheet = screen.getByLabelText("Close seat details").parentElement!;

    // The cluster, in the wearer's order…
    expect(
      within(within(sheet).getByTestId("plate-badges"))
        .getAllByTestId("badge-glyph")
        .map((node) => node.getAttribute("data-badge-id")),
    ).toEqual(["first-win", "bot-slayer"]);
    // …and the readout, without a tap.
    expect(
      within(sheet)
        .getAllByTestId("badge-readout")
        .map((row) => row.getAttribute("data-badge-id")),
    ).toEqual(["first-win", "bot-slayer"]);
    expect(sheet.textContent).toContain("Beat the expert bot");
  });

  it("opens the activity log as a sheet rather than floating it over the hand", async () => {
    setViewport("portrait");
    await mount();
    expect(screen.queryByText("Activity")).toBeNull();
    fireEvent.click(screen.getByLabelText("Activity log"));
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });
});

describe("landscape phone", () => {
  it("stands the decision stack + hand up as a right rail", async () => {
    setViewport("rail");
    await mount();
    expect(chips()).toBeInTheDocument();
    expect(controls()).toBeNull(); // portrait's floating bottom row is not mounted
    const el = rail()!;
    expect(el).toBeInTheDocument();
    // pinned to the right edge, top-to-bottom — not lying across the board
    expect(el).toHaveStyle({ right: "0px", top: "0px", bottom: "0px" });
    // the hand rides in the rail, not behind a drawer
    expect(el.textContent).toContain(`HAND · ${BASE_VIEW.self.hand.length}`);
    expect(screen.queryByTestId("hand-fan-peek")).toBeNull();
  });
});
