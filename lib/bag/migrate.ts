/**
 * "Move my bag to my account" (#644 §1) — the one-press migration from this
 * browser's localStorage to the signed-in user's account.
 *
 * It is a MOVE, and the ordering is the whole point: an item leaves
 * localStorage only after the API has confirmed it is in the account. The
 * confirmation is the server's own listing, not the response body of the write
 * — so a bulk endpoint that doesn't exist, one that half-applied, and a network
 * drop mid-flight are all the same situation, and all recover the same way.
 *
 * Consequences that fall out of that, each of which the tests pin:
 * - a partial failure leaves exactly the failed items on the device;
 * - a total failure deletes nothing;
 * - re-running is safe and cheap, because anything already up there by id is
 *   simply not uploaded again.
 *
 * The starred deck needs no special handling: STAR_DECK_ID points at the deck's
 * own stable id, which is unchanged by the move, and the unified store resolves
 * that id against whichever backend now holds it.
 */
import {
  BagKind,
  BulkImportItem,
  CloudFailure,
  bulkImportCloudItems,
  createCloudItem,
  listCloudItems,
  readCloudItem,
} from "@/lib/account/bagCloud";
import { safeRemoveItem, safeSetItem } from "@/lib/storage/quota";
import { KindStore, loadLocal, stores } from "./bagStore";

/** One line in the per-item result list the panel renders. */
export type MigrationItem = {
  kind: BagKind;
  /** The item's stable local id (`deck.id` / `map.imgUrl`). */
  id: string;
  name: string;
  ok: boolean;
  /** Why it stayed on the device. Absent when `ok`. */
  reason?: CloudFailure;
};

export type MigrationReport = {
  /** Items now in the account that were on the device when we started. */
  moved: number;
  /** Items that stayed put, with a reason each. */
  kept: MigrationItem[];
  items: MigrationItem[];
  /**
   * The migration never even started — no account, or the API didn't answer.
   * Nothing was uploaded and nothing was deleted.
   */
  blocked?: "unavailable";
};

/** Re-list + re-read one kind, so `store.cloud` matches the server exactly. */
const relist = async <T,>(store: KindStore<T>): Promise<boolean> => {
  const listing = await listCloudItems(store.kind);
  if (!listing.ok) return false;
  const entries: { cloudId: string; id: string; data: T }[] = [];
  for (const row of listing.value) {
    const payload = await readCloudItem(store.kind, row.id);
    if (!payload.ok) continue;
    const data = payload.value.data as T;
    const id = data ? store.idOf(data) : undefined;
    if (typeof id === "string" && id) entries.push({ cloudId: row.id, id, data });
  }
  store.cloud = entries;
  store.phase = "ready";
  store.probe = Promise.resolve();
  store.listeners.forEach((listener) => listener());
  return true;
};

/** Drop from localStorage exactly the ids the account is now confirmed to hold. */
const pruneLocal = <T,>(store: KindStore<T>, confirmed: Set<string>): void => {
  const survivors = store.local.filter(
    (item) => !confirmed.has(store.idOf(item)),
  );
  if (survivors.length === store.local.length) return;
  // Through the quota helpers so the storage meter re-reads: the point of the
  // move is that the bar shrinks (and disappears) as the device empties.
  if (survivors.length === 0) safeRemoveItem(store.lsKey);
  else safeSetItem(store.lsKey, JSON.stringify(survivors));
  store.local = survivors;
  store.listeners.forEach((listener) => listener());
};

/** Everything on this device that the account doesn't already hold, by id. */
const pendingOf = <T,>(store: KindStore<T>) => {
  loadLocal(store);
  const upThere = new Set(store.cloud.map((entry) => entry.id));
  const seen = new Set<string>();
  return store.local.filter((item) => {
    const id = store.idOf(item);
    if (!id || upThere.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const toBulkRows = <T,>(store: KindStore<T>, items: T[]): BulkImportItem[] =>
  items.map((item) => ({ name: store.nameOf(item), data: item }));

/**
 * Move every local deck and map into the account.
 *
 * Callable only when signed in; if either listing can't be refreshed the whole
 * run aborts with `blocked` before a single byte is deleted.
 */
export const migrateLocalBagToAccount =
  async (): Promise<MigrationReport> => {
    const decks = stores.decks;
    const maps = stores.maps;

    // Start from the server's truth, so a re-run knows what's already up there
    // and an unreachable API stops us here rather than half-way through.
    if (!(await relist(decks)) || !(await relist(maps))) {
      return { moved: 0, kept: [], items: [], blocked: "unavailable" };
    }

    const pendingDecks = pendingOf(decks);
    const pendingMaps = pendingOf(maps);
    if (pendingDecks.length + pendingMaps.length === 0) {
      return { moved: 0, kept: [], items: [] };
    }

    // One request for the whole bag when the API supports it (unbrewed-api#38).
    // The result is deliberately ignored: what landed is decided by the re-list
    // below, which is also what makes a 404 from a pre-#38 API a non-event.
    await bulkImportCloudItems({
      decks: toBulkRows(decks, pendingDecks),
      maps: toBulkRows(maps, pendingMaps),
    });
    await relist(decks);
    await relist(maps);

    const items: MigrationItem[] = [];

    const runKind = async <T,>(store: KindStore<T>, pending: T[]) => {
      const upThere = new Set(store.cloud.map((entry) => entry.id));
      for (const item of pending) {
        const id = store.idOf(item);
        const name = store.nameOf(item);
        if (upThere.has(id)) {
          items.push({ kind: store.kind, id, name, ok: true });
          continue;
        }
        // Whatever the bulk route didn't take, item by item — the path that
        // also runs in full against an API that never had a bulk route.
        const result = await createCloudItem(store.kind, name, item);
        if (result.ok) {
          store.cloud = [
            ...store.cloud,
            { cloudId: result.value.id, id, data: item },
          ];
          upThere.add(id);
          items.push({ kind: store.kind, id, name, ok: true });
        } else {
          items.push({
            kind: store.kind,
            id,
            name,
            ok: false,
            reason: result.reason,
          });
        }
      }
      store.listeners.forEach((listener) => listener());
      pruneLocal(
        store,
        new Set(
          items
            .filter((entry) => entry.kind === store.kind && entry.ok)
            .map((entry) => entry.id),
        ),
      );
    };

    await runKind(decks, pendingDecks);
    await runKind(maps, pendingMaps);

    const kept = items.filter((item) => !item.ok);
    return { moved: items.length - kept.length, kept, items };
  };
