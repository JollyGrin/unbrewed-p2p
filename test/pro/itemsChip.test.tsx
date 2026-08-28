/**
 * The 🎁 ITEMS chip, end to end through the REAL Pro create flow (#725 ↔
 * engine #519).
 *
 * The chip exists for exactly one audience: the creator who picked a board that
 * prints battlefield items and wants them OFF for this game. Everywhere else it
 * must be invisible AND silent: hidden chip ⇒ no `itemsEnabled` key on
 * CREATE_ROOM, so every existing create stays byte-identical to today.
 *
 * The load-bearing assertions are therefore the NEGATIVE ones — Random default,
 * a hand-clicked item-less catalog board, malformed paste JSON, and the join
 * screen all render no chip and send no field — plus the positive paths: an
 * items board picked either way (pasted JSON, or the Wedding Crashers catalog
 * tile since #727) switches Off and the CREATE_ROOM frame carries
 * `itemsEnabled: false`.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, real page), same
 * as randomStagePick.test.tsx — this test lives entirely in the pre-room picker.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { ClientMsg, ProMapDef } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const HEROES = [
  { heroId: "hero-a", name: "Ellen Ripley", hp: 12, move: 3, reach: "MELEE" },
  { heroId: "hero-b", name: "King Kong", hp: 18, move: 2, reach: "MELEE" },
];

/** A minimal engine-native board carrying one scheme + one combat item (the
 *  shape of the engine's test/mapItems fixtures: ProMapDef.items[] + space.item). */
const ITEMS_MAP = {
  schemaVersion: "1.0",
  id: "wedding-crashers",
  meta: { title: "Wedding Crashers", minPlayers: 2, maxPlayers: 2, specialRules: false },
  zones: [{ id: "z", color: "#fff", label: "Z" }],
  items: [
    { id: "gift", kind: "scheme", label: "Gift Bomb", ops: [{ op: "dealDamage", amount: 1 }] },
    { id: "cake", kind: "combat", label: "Cake Knife", value: 2 },
  ],
  spaces: [
    { id: "a", x: 0.1, y: 0.1, zones: ["z"], adjacentTo: ["b"], start: { slot: 1 }, item: "gift" },
    { id: "b", x: 0.2, y: 0.2, zones: ["z"], adjacentTo: ["a"], start: { slot: 2 }, item: "cake" },
  ],
};
const ITEMS_MAP_JSON = JSON.stringify(ITEMS_MAP);

const fakeRouter = (query: Record<string, string> = {}) =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query,
    asPath: "",
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

/** Every frame the page has sent so far, newest last. */
let sent: ClientMsg[] = [];

/** Mount the picker with a roster on the wire. */
const mountPicker = async (query: Record<string, string> = {}) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter(query)}>
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

/** The 🎁 ITEMS segmented control, or null when the chip is (correctly) hidden. */
const itemsChip = () => screen.queryByRole("group", { name: "Battlefield items" });

/** Select the Custom… stage and put `json` in the paste box. */
const pasteCustomMap = async (json: string) => {
  await click(screen.getByLabelText(/Custom board/));
  const box = screen.getByPlaceholderText(/paste map JSON/);
  await act(async () => {
    fireEvent.change(box, { target: { value: json } });
  });
};

/** Lock a fighter and press Create; returns the CREATE_ROOM frame that went out. */
const createRoom = async (label = "Create") => {
  await click(screen.getByLabelText(/Ellen Ripley/));
  await click(screen.getByRole("button", { name: label }));
  const created = sent.filter((m) => m.type === "CREATE_ROOM");
  expect(created).toHaveLength(1);
  return created[0] as ClientMsg & { customMap?: ProMapDef };
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

describe("🎁 ITEMS chip (issue #725)", () => {
  it("is hidden on the Random default — and the create sends no field", async () => {
    await mountPicker();
    expect(itemsChip()).not.toBeInTheDocument();
    const msg = await createRoom();
    expect("itemsEnabled" in msg).toBe(false);
  });

  it("is hidden on a hand-clicked item-less catalog board", async () => {
    await mountPicker();
    await click(screen.getByLabelText("Count's Castle"));
    expect(itemsChip()).not.toBeInTheDocument();
    const msg = await createRoom();
    expect("itemsEnabled" in msg).toBe(false);
  });

  it("is hidden for a blank Custom paste (the fallback board has no items)", async () => {
    await mountPicker();
    await pasteCustomMap("");
    expect(itemsChip()).not.toBeInTheDocument();
  });

  it("appears for a pasted items map, defaults On, and On sends no field", async () => {
    await mountPicker();
    await pasteCustomMap(ITEMS_MAP_JSON);
    const chip = itemsChip();
    expect(chip).toBeInTheDocument();
    // default On — items are printed on the board
    expect(within(chip!).getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
    const msg = await createRoom();
    expect(msg.customMap?.id).toBe("wedding-crashers");
    expect("itemsEnabled" in msg).toBe(false);
  });

  it("switching Off puts itemsEnabled: false on CREATE_ROOM", async () => {
    await mountPicker();
    await pasteCustomMap(ITEMS_MAP_JSON);
    await click(within(itemsChip()!).getByRole("button", { name: "Off" }));
    // the room summary names the opted-out board ("no items"), like "no mulligan"
    // (rendered twice: the desktop plate area and the mobile fixed bar)
    await click(screen.getByLabelText(/Ellen Ripley/));
    expect(screen.getAllByText(/no items/).length).toBeGreaterThan(0);
    const msg = await createRoom();
    expect(msg.customMap?.id).toBe("wedding-crashers");
    expect((msg as ClientMsg & { itemsEnabled?: boolean }).itemsEnabled).toBe(false);
  });

  it("an Off choice on an items map never leaks onto an item-less board's create", async () => {
    await mountPicker();
    // Opt out on the items map…
    await pasteCustomMap(ITEMS_MAP_JSON);
    await click(within(itemsChip()!).getByRole("button", { name: "Off" }));
    // …then switch to a catalog board: the chip hides and the field must not ride.
    await click(screen.getByLabelText("Count's Castle"));
    expect(itemsChip()).not.toBeInTheDocument();
    const msg = await createRoom();
    expect(msg.customMap?.id).toBe("counts-castle");
    expect("itemsEnabled" in msg).toBe(false);
  });

  it("swallows malformed paste JSON — no chip, no crash (create owns the error)", async () => {
    await mountPicker();
    await pasteCustomMap("{not json");
    expect(itemsChip()).not.toBeInTheDocument();
    // the create click surfaces the parse error instead of sending anything
    await click(screen.getByLabelText(/Ellen Ripley/));
    await click(screen.getByRole("button", { name: "Create" }));
    expect(sent.filter((m) => m.type === "CREATE_ROOM")).toHaveLength(0);
    // the textarea's helper line is swapped for the inline error
    expect(screen.queryByText(/only you set this up/)).not.toBeInTheDocument();
  });

  /**
   * Wedding Crashers (#727) — the catalog's own items board. This is the path
   * the chip was built for and could not exercise until the board shipped: no
   * paste box, just a tile in the picker.
   */
  describe("Wedding Crashers — the catalog items board (#727)", () => {
    it("shows the chip on the duel picker and ships the board with its four items", async () => {
      await mountPicker();
      await click(screen.getByLabelText("Wedding Crashers"));
      expect(itemsChip()).toBeInTheDocument();
      expect(within(itemsChip()!).getByRole("button", { name: "On" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      const msg = await createRoom();
      // a catalog board rides as customMap, exactly like a pasted one
      expect(msg.customMap?.id).toBe("wedding-crashers");
      expect(msg.customMap?.items?.map((i) => i.id)).toEqual([
        "item1",
        "item2",
        "item3",
        "item4",
      ]);
      expect(msg.customMap?.spaces.filter((sp) => sp.item)).toHaveLength(4);
      // On is the default, so nothing goes on the wire
      expect("itemsEnabled" in msg).toBe(false);
    });

    it("switching Off sends itemsEnabled: false with the catalog board", async () => {
      await mountPicker();
      await click(screen.getByLabelText("Wedding Crashers"));
      await click(within(itemsChip()!).getByRole("button", { name: "Off" }));
      const msg = await createRoom();
      expect(msg.customMap?.id).toBe("wedding-crashers");
      expect((msg as ClientMsg & { itemsEnabled?: boolean }).itemsEnabled).toBe(false);
    });

    // The preview modal's own 🎁 tag is covered in
    // components/Pro/MapPreviewModal.test.tsx (Chakra's focus trap needs a stub
    // that does not belong in this full-page create-flow suite).

    it("is absent from the multiplayer pickers — two start slots, duel only", async () => {
      await mountPicker();
      expect(screen.getByLabelText("Wedding Crashers")).toBeInTheDocument();
      for (const format of ["3P FFA", "2v2"]) {
        await click(screen.getByRole("button", { name: format }));
        expect(screen.queryByLabelText("Wedding Crashers")).not.toBeInTheDocument();
      }
      await click(screen.getByRole("button", { name: "Duel" }));
      expect(screen.getByLabelText("Wedding Crashers")).toBeInTheDocument();
    });
  });

  it("never renders on the join screen — creator-only like the rest of the strip", async () => {
    await mountPicker({ room: "R1" });
    expect(screen.getByText(/JOIN ROOM R1/)).toBeInTheDocument();
    expect(itemsChip()).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Opening-hand mulligan" })).not.toBeInTheDocument();
  });
});
