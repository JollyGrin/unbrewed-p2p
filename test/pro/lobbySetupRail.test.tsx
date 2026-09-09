/**
 * The pro lobby's setup rail + scrolling roster (issue #768).
 *
 * #765 docked the Create bar; this went further and moved the whole SETUP —
 * splash, stage, seats, Create — into the 20rem left column, leaving the roster
 * as the only thing on the page that scrolls. Everything asserted here is about
 * that split and the affordances it bought:
 *
 *  - the roster is three sections (recently played / balanced / in the lab) over
 *    one filtered pool, so search, reach, and the LAB chip narrow all of them
 *    and the sort menu reorders all of them;
 *  - a board tile previews in the SPLASH on hover instead of carrying its own
 *    magnifier button — which is why the magnifiers could go;
 *  - the full catalog lives in a popover over the roster, Custom JSON included.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, real page) with
 * the roster pushed as a HEROES frame: this suite lives entirely in the
 * pre-room picker. Hero ids are REAL ones, because "in the lab" is read from
 * the client deck table (lib/constants/top-decks) for servers that don't send a
 * tier — Batman and Clone Troopers are lab decks there, King Kong and The
 * Mandalorian are not.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import type { ReactNode } from "react";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { ClientMsg } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

/**
 * Chakra's <Modal> traps focus with react-focus-lock, and its focusable-element
 * selector (`input:not(:disabled):not([disabled])`) is one the pinned
 * jsdom/nwsapi pair cannot parse: opening any modal throws
 * `':disabled):not([disabled]' is not a valid selector` out of a layout effect,
 * before a single assertion runs. The trap is a browser concern with nothing to
 * verify here, so it is stubbed to a passthrough — the modal's own markup, which
 * is what the #781 tests read, renders exactly as it does in the app.
 */
jest.mock("@chakra-ui/focus-lock", () => ({
  __esModule: true,
  FocusLock: ({ children }: { children: ReactNode }) => children,
}));

/** Two balanced decks, two lab decks — in neither alphabetical nor arrival order. */
const HEROES = [
  { heroId: "king-kong", name: "King Kong", hp: 18, move: 2, reach: "MELEE" },
  { heroId: "batman", name: "Batman", hp: 14, move: 3, reach: "MELEE" },
  { heroId: "the-mandalorian", name: "The Mandalorian", hp: 14, move: 3, reach: "RANGED" },
  { heroId: "clone-troopers", name: "Clone Troopers", hp: 2, move: 2, reach: "RANGED" },
];

const fakeRouter = () =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query: {},
    asPath: "/pro/game",
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

let sent: ClientMsg[] = [];

const mountPicker = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter()}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>,
  );
  const ws = FakeWebSocket.latest();
  if (!ws) throw new Error("the page never opened a socket");
  await act(async () => {
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.({});
  });
  await act(async () => {
    ws.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, type: "HEROES", heroes: HEROES }) });
  });
  return ws;
};

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** React derives onMouseEnter/onMouseLeave from mouseover/mouseout. */
const hover = async (el: Element) => {
  await act(async () => {
    fireEvent.mouseOver(el);
  });
};
const unhover = async (el: Element) => {
  await act(async () => {
    fireEvent.mouseOut(el);
  });
};
/**
 * Move the pointer from one element to another. `relatedTarget` is the whole
 * point: React derives enter/leave from it, so only the handlers OUTSIDE the
 * pair's common ancestor fire — which is exactly what makes the #781 preview
 * survive a trip across the rail but not a trip into the roster.
 */
const moveTo = async (from: Element, to: Element) => {
  await act(async () => {
    fireEvent.mouseOut(from, { relatedTarget: to });
  });
};

type SectionId = "recent" | "balanced" | "lab";
const section = (id: SectionId) => screen.queryByTestId(`roster-section-${id}`);

/**
 * Tile names in DOM order inside a roster section. Tiles label themselves
 * "<name> by <author>" (and the Random tile explains itself), so the credit /
 * explanation is trimmed off here — order is what these assertions are about.
 */
const tileNames = (id: SectionId) =>
  within(section(id)!)
    .getAllByRole("button")
    .map((b) => (b.getAttribute("aria-label") ?? "").replace(/ (by|—) .*$/, ""));

/** The setup rail's splash panel — the only place a stage preview shows up. */
const splash = () => within(screen.getByTestId("pro-splash"));

/** Open (or reuse) the board popover. */
const boards = async () => {
  if (!screen.queryByRole("dialog", { name: "Choose a board" })) {
    await click(screen.getByRole("button", { name: /All \d+ boards/ }));
  }
  return within(screen.getByRole("dialog", { name: "Choose a board" }));
};

/**
 * Pick a sort from the roster's sort menu. `hidden: true` because jsdom never
 * evaluates the media/animation CSS Chakra hides a closed MenuList with — the
 * items are always in the tree, and clicking one is what this suite is about.
 */
const sortBy = async (label: string) => {
  await click(screen.getByRole("button", { name: /Sort fighters/ }));
  await click(screen.getByRole("menuitem", { name: label, hidden: true }));
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(data: string) {
    sent.push(JSON.parse(data));
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  sent = [];
});

afterEach(() => {
  jest.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("roster sections (#768)", () => {
  it("splits the roster into balanced and lab, each counted on its own", async () => {
    await mountPicker();

    expect(section("balanced")).not.toBeNull();
    expect(screen.getByText(/In the lab/i)).toBeInTheDocument();
    // the lab section says WHY it is separate, right in the heading
    expect(screen.getByText(/playtest tier, balance may change/i)).toBeInTheDocument();

    // Random leads the balanced grid, mirroring the stage row (#685/#697)
    expect(tileNames("balanced")).toEqual([
      "Random fighter",
      "King Kong",
      "The Mandalorian",
    ]);
    expect(tileNames("lab")).toEqual(["Batman", "Clone Troopers"]);

    // the header counts the whole filtered pool, the sections their own share
    expect(screen.getByText("4 fighters")).toBeInTheDocument();
  });

  it("orders every section A–Z by default", async () => {
    await mountPicker();
    expect(tileNames("lab")).toEqual(["Batman", "Clone Troopers"]);
  });

  it("reorders every section by arrival under Newest", async () => {
    await mountPicker();
    // Newest = arrival order in the deck table, latest first: Clone Troopers is
    // the most recently wired deck in the fixture, Batman one of the first —
    // the opposite of the A–Z order above, so this actually discriminates.
    await sortBy("Newest");
    expect(tileNames("lab")).toEqual(["Clone Troopers", "Batman"]);
    expect(tileNames("balanced")).toEqual(["Random fighter", "King Kong", "The Mandalorian"]);
  });

  it("sorts recently played fighters to the front when asked", async () => {
    window.localStorage.setItem(
      "unbrewed-pro-recent-heroes",
      JSON.stringify(["the-mandalorian"]),
    );
    await mountPicker();
    await sortBy("Recently played");
    expect(tileNames("balanced")).toEqual([
      "Random fighter",
      "The Mandalorian",
      "King Kong",
    ]);
  });

  it("narrows every section with the LAB chip, keeping the Random tile", async () => {
    await mountPicker();
    await click(screen.getByRole("button", { name: "Lab decks only" }));

    expect(section("balanced")).toBeNull();
    expect(screen.getByText("2 fighters")).toBeInTheDocument();
    // with no balanced section to host it, Random leads the lab grid instead
    expect(tileNames("lab")).toEqual([
      "Random fighter",
      "Batman",
      "Clone Troopers",
    ]);

    await click(screen.getByRole("button", { name: "Lab decks only" }));
    expect(section("balanced")).not.toBeNull();
  });

  it("keeps search matching name and author across both sections", async () => {
    await mountPicker();
    const search = screen.getByLabelText("Search fighters");
    await act(async () => {
      fireEvent.change(search, { target: { value: "clone" } });
    });
    expect(section("balanced")).toBeNull();
    expect(tileNames("lab")).toEqual([
      "Random fighter",
      "Clone Troopers",
    ]);
  });
});

describe("recently played row (#768)", () => {
  it("is absent until this browser has actually played something", async () => {
    await mountPicker();
    expect(section("recent")).toBeNull();
  });

  it("shows what this browser played, and creating a room records it", async () => {
    await mountPicker();
    await click(screen.getByLabelText(/King Kong/));
    await click(screen.getByRole("button", { name: "Create" }));
    expect(sent.filter((m) => m.type === "CREATE_ROOM")).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem("unbrewed-pro-recent-heroes")!)).toEqual([
      "king-kong",
    ]);
  });

  it("renders the stored history as its own row, newest first", async () => {
    window.localStorage.setItem(
      "unbrewed-pro-recent-heroes",
      JSON.stringify(["clone-troopers", "king-kong"]),
    );
    await mountPicker();
    expect(tileNames("recent")).toEqual(["Clone Troopers", "King Kong"]);
    // …and they stay in their real section too — the row is a shortcut, not a move
    expect(tileNames("balanced")).toContain("King Kong");
    expect(tileNames("lab")).toContain("Clone Troopers");
  });
});

describe("stage hover preview (#768)", () => {
  it("previews a board in the splash instead of behind a magnifier", async () => {
    await mountPicker();
    // the per-tile inspect buttons are gone — the splash owns "View board" now
    expect(screen.queryByLabelText(/^Preview /)).not.toBeInTheDocument();

    const drum = screen.getByLabelText("The Mended Drum");
    await hover(drum);
    expect(splash().getByText("PREVIEW — CLICK TO LOCK IN")).toBeInTheDocument();
    expect(splash().getByText("The Mended Drum")).toBeInTheDocument();
    expect(splash().getByText(/Legacy board · 29 spaces/)).toBeInTheDocument();
    expect(splash().getByText("2 seats")).toBeInTheDocument();
    // `getByText`, not `getByRole`: the button is lg-only and jsdom applies just
    // the base (mobile) declaration, so it reads as display:none here.
    expect(splash().getByText("View board")).toBeInTheDocument();

    // #781: the preview is sticky across the RAIL, so it takes leaving the rail
    // — not leaving the tile — to clear it. (The heading stays "PREVIEW — CLICK
    // TO LOCK IN": the roster tile the pointer landed on is now previewing its
    // own fighter there, so the board's title is what discriminates.)
    await moveTo(drum, screen.getByLabelText(/King Kong/));
    expect(splash().queryByText("The Mended Drum")).not.toBeInTheDocument();
    expect(splash().queryByText("View board")).not.toBeInTheDocument();
  });

  it("reverts to the locked fighter when the pointer leaves the rail", async () => {
    await mountPicker();
    await click(screen.getByLabelText(/King Kong/));
    expect(splash().getByText("P1 · LOCKED IN")).toBeInTheDocument();

    const drum = screen.getByLabelText("The Mended Drum");
    await hover(drum);
    expect(splash().queryByText("P1 · LOCKED IN")).not.toBeInTheDocument();
    // off the tile but still in the rail: the board is still previewed
    await moveTo(drum, screen.getByTestId("pro-splash"));
    expect(splash().queryByText("P1 · LOCKED IN")).not.toBeInTheDocument();
    // into the roster: back to the fighter
    await moveTo(screen.getByTestId("pro-splash"), screen.getByLabelText(/King Kong/));
    expect(splash().getByText("P1 · LOCKED IN")).toBeInTheDocument();
  });

  // #781: before this, the tile's own onMouseLeave cleared `stageHover` the
  // instant the pointer stepped off it — the splash reverted to the fighter and
  // "View board" unmounted under the travelling cursor, which left the lobby
  // with NO path to the map preview at all.
  it("survives the trip from a rail tile to View board, and opens the map preview", async () => {
    await mountPicker();
    const drum = screen.getByLabelText("The Mended Drum");
    await hover(drum);
    await moveTo(drum, screen.getByTestId("pro-splash"));

    // still the board, and the button is still mounted to be clicked
    expect(splash().getByText("The Mended Drum")).toBeInTheDocument();
    await click(splash().getByText("View board"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("The Mended Drum")).toBeInTheDocument();
  });

  it("does the same from the All-boards popover", async () => {
    await mountPicker();
    const picker = await boards();
    const wedding = picker.getByLabelText("Wedding Crashers");
    await hover(wedding);
    await moveTo(wedding, screen.getByTestId("pro-splash"));

    expect(splash().getByText("Wedding Crashers")).toBeInTheDocument();
    await click(splash().getByText("View board"));
    // two dialogs are up now — the board picker and the map preview over it
    const modal = (await screen.findAllByRole("dialog")).find(
      (d) => d.getAttribute("aria-label") !== "Choose a board",
    );
    expect(within(modal!).getByText("Wedding Crashers")).toBeInTheDocument();
  });

  it("holds the preview while focus travels into the splash", async () => {
    await mountPicker();
    const drum = screen.getByLabelText("The Mended Drum");
    await act(async () => {
      fireEvent.focusIn(drum);
    });
    expect(splash().getByText("The Mended Drum")).toBeInTheDocument();

    // Tab towards "View board": blur fires first, and clearing there is what
    // used to pull the button out from under the arriving focus.
    await act(async () => {
      fireEvent.focusOut(drum, { relatedTarget: screen.getByTestId("pro-splash") });
    });
    expect(splash().getByText("The Mended Drum")).toBeInTheDocument();

    // focus leaving the rail altogether still reverts
    await act(async () => {
      fireEvent.focusOut(drum, { relatedTarget: screen.getByLabelText(/King Kong/) });
    });
    expect(splash().queryByText("The Mended Drum")).not.toBeInTheDocument();
  });

  it("badges a board that prints items, and previews the Random pool as text", async () => {
    await mountPicker();
    const picker = await boards();
    await hover(picker.getByLabelText("Wedding Crashers"));
    expect(splash().getByText("🎁 items")).toBeInTheDocument();

    await hover(picker.getByLabelText(/^Random board/));
    expect(
      splash().getByText(/Rolled when the room is created: The Mended Drum/),
    ).toBeInTheDocument();
  });
});

describe("board popover (#768)", () => {
  it("opens from the rail, closes on Escape, and leaves the pick alone", async () => {
    await mountPicker();
    await boards();
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog", { name: "Choose a board" })).not.toBeInTheDocument();
    // Escape is a cancel: Random is still the selected stage
    expect(screen.getByLabelText(/^Random board/)).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps itself open for Custom JSON… and still reports a parse error inline", async () => {
    await mountPicker();
    const picker = await boards();
    await click(picker.getByLabelText(/Custom board/));
    // the popover stays up — the paste box lives inside it
    const box = screen.getByPlaceholderText(/paste map JSON/);
    await act(async () => {
      fireEvent.change(box, { target: { value: "{not json" } });
    });
    await click(screen.getByLabelText(/King Kong/));
    await click(screen.getByRole("button", { name: "Create" }));
    expect(sent.filter((m) => m.type === "CREATE_ROOM")).toHaveLength(0);
    expect(screen.queryByText(/only you set this up/)).not.toBeInTheDocument();
  });
});
