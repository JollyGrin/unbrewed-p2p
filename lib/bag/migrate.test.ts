/**
 * "Move my bag to my account" (#644 §1).
 *
 * This is the one operation in the feature that DELETES the user's data, so
 * every case here is about the ordering: an item leaves localStorage only once
 * the server's own listing says the account has it. A half-working API, a
 * missing bulk route, and a network that dies mid-run must all end with the
 * user still holding everything they started with.
 */
import { API_URL } from "@/lib/account/apiUrl";
import { LS_KEY } from "@/lib/hooks/useLocalStorage";
import {
  __resetBagStoresForTests,
  bagItems,
  ensureCloud,
  loadStar,
  setStar,
  stores,
} from "./bagStore";
import { migrateLocalBagToAccount } from "./migrate";

jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const deck = (id: string, name = id) =>
  ({ id, name, version_id: `${id}-v1`, deck_data: { cards: [] } }) as any;

const map = (imgUrl: string, title: string) => ({ imgUrl, meta: { title } });

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

let fetchMock: jest.Mock;

const paths = () =>
  fetchMock.mock.calls.map(
    ([url, init]) => `${init?.method ?? "GET"} ${url.replace(API_URL, "")}`,
  );

/**
 * A fake `/bag/*`. `bulk` decides what POST /bag/import does — "missing" is a
 * pre-#38 API, "accepts" is unbrewed-api#38 — and `refuse` names ids the server
 * will not take, whichever route they arrive by.
 */
const server = (options?: {
  bulk?: "missing" | "accepts";
  refuse?: string[];
  refusalStatus?: number;
}) => {
  const bulk = options?.bulk ?? "missing";
  const refuse = new Set(options?.refuse ?? []);
  const rows: Record<"decks" | "maps", { id: string; data: any }[]> = {
    decks: [],
    maps: [],
  };
  let next = 0;

  const accept = (kind: "decks" | "maps", data: any) => {
    const id = kind === "decks" ? data.id : data.imgUrl;
    if (refuse.has(id)) return false;
    rows[kind].push({ id: `row-${++next}`, data });
    return true;
  };

  fetchMock = jest.fn(async (url: string, init?: any) => {
    const path = url.replace(API_URL, "");
    const method = init?.method ?? "GET";

    if (path === "/bag/import") {
      if (bulk === "missing") return reply(404, { error: "not_found" });
      const body = JSON.parse(init.body);
      for (const kind of ["decks", "maps"] as const) {
        for (const row of body[kind] ?? []) accept(kind, row.data);
      }
      return reply(200, { imported: next });
    }
    for (const kind of ["decks", "maps"] as const) {
      if (path === `/bag/${kind}` && method === "GET") {
        return reply(200, {
          [kind]: rows[kind].map((row) => ({
            id: row.id,
            name: "n",
            bytes: 1,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
          })),
        });
      }
      if (path === `/bag/${kind}` && method === "POST") {
        const body = JSON.parse(init.body);
        return accept(kind, body.data)
          ? reply(201, { id: rows[kind][rows[kind].length - 1].id })
          : reply(options?.refusalStatus ?? 413, { error: "too_large" });
      }
      if (path.startsWith(`/bag/${kind}/`)) {
        const id = path.slice(`/bag/${kind}/`.length);
        const row = rows[kind].find((entry) => entry.id === id);
        return row
          ? reply(200, { id, name: "n", data: row.data })
          : reply(404, { error: "not_found" });
      }
    }
    throw new TypeError(`unrouted ${method} ${path}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return rows;
};

const localDecks = () =>
  JSON.parse(localStorage.getItem(LS_KEY.DECKS) ?? "null");
const localMaps = () =>
  JSON.parse(localStorage.getItem(LS_KEY.MAP_LIST) ?? "null");

beforeEach(() => {
  localStorage.clear();
  __resetBagStoresForTests();
});

const seed = () => {
  localStorage.setItem(
    LS_KEY.DECKS,
    JSON.stringify([deck("d1", "Bruce Lee"), deck("d2", "Yennenga")]),
  );
  localStorage.setItem(
    LS_KEY.MAP_LIST,
    JSON.stringify([map("a.png", "My Arena")]),
  );
};

describe("the happy path", () => {
  it("moves everything up and empties the device, per-item-looping a pre-#38 API", async () => {
    seed();
    setStar("d2");
    const rows = server({ bulk: "missing" });

    const report = await migrateLocalBagToAccount();

    expect(report.moved).toBe(3);
    expect(report.kept).toEqual([]);
    expect(rows.decks.map((row) => row.data.id).sort()).toEqual(["d1", "d2"]);
    expect(rows.maps.map((row) => row.data.imgUrl)).toEqual(["a.png"]);

    // The device is empty — the keys are gone, not left holding "[]".
    expect(localDecks()).toBeNull();
    expect(localMaps()).toBeNull();

    // …and every deck is still in the bag, from the account.
    expect(bagItems(stores.decks).map((d) => d.id).sort()).toEqual(["d1", "d2"]);
    // The star follows the deck: it points at an id, which the move preserves.
    expect(loadStar()).toBe("d2");
    expect(
      bagItems(stores.decks).find((d) => d.id === loadStar()),
    ).toBeDefined();

    // It really did fall back to per-item creates after the 404.
    expect(paths()).toContain("POST /bag/import");
    expect(paths().filter((p) => p === "POST /bag/decks")).toHaveLength(2);
  });

  it("uses the bulk route in ONE request when the API has it", async () => {
    seed();
    server({ bulk: "accepts" });

    const report = await migrateLocalBagToAccount();

    expect(report.moved).toBe(3);
    expect(localDecks()).toBeNull();
    // Nothing was uploaded twice: the bulk route took it all.
    expect(paths().filter((p) => p.startsWith("POST /bag/decks"))).toEqual([]);
    expect(paths().filter((p) => p.startsWith("POST /bag/maps"))).toEqual([]);
  });
});

describe("when the account won't take something", () => {
  it("removes only the items it confirmed, and says why the rest stayed", async () => {
    seed();
    server({ bulk: "missing", refuse: ["d2"] });

    const report = await migrateLocalBagToAccount();

    expect(report.moved).toBe(2);
    expect(report.kept).toEqual([
      { kind: "decks", id: "d2", name: "Yennenga", ok: false, reason: "too_large" },
    ]);
    // d1 left, d2 stayed. The map went up, so its key is gone.
    expect(localDecks()).toEqual([deck("d2", "Yennenga")]);
    expect(localMaps()).toBeNull();
    // Both are still in the bag, from their respective backends.
    expect(bagItems(stores.decks).map((d) => d.id).sort()).toEqual(["d1", "d2"]);
  });

  it("deletes nothing at all when the API can't be reached", async () => {
    seed();
    fetchMock = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const report = await migrateLocalBagToAccount();

    expect(report.blocked).toBe("unavailable");
    expect(report.moved).toBe(0);
    expect(localDecks()).toHaveLength(2);
    expect(localMaps()).toHaveLength(1);
    // It gave up on the first listing rather than uploading blind.
    expect(paths()).not.toContain("POST /bag/import");
  });
});

describe("re-running it", () => {
  it("is idempotent — nothing already up there is uploaded again", async () => {
    seed();
    const rows = server({ bulk: "missing", refuse: ["d2"] });

    await migrateLocalBagToAccount();
    const afterFirst = paths().length;

    // Second run, with the refusal lifted.
    const rerun = server({ bulk: "missing" });
    rerun.decks.push(...rows.decks);
    rerun.maps.push(...rows.maps);

    const report = await migrateLocalBagToAccount();

    expect(report.moved).toBe(1); // only the one that had stayed behind
    expect(report.items.map((item) => item.id)).toEqual(["d2"]);
    expect(localDecks()).toBeNull();
    expect(afterFirst).toBeGreaterThan(0);
  });

  it("is a no-op once the device is empty", async () => {
    server({ bulk: "missing" });
    await ensureCloud(stores.decks);

    const report = await migrateLocalBagToAccount();

    expect(report).toEqual({ moved: 0, kept: [], items: [] });
    expect(paths()).not.toContain("POST /bag/import");
  });
});
