/**
 * Cloud bag state (issue #566) — one shared listing per kind per page load.
 *
 * Mirrors the `/me` probe's store idiom (lib/account/useAccount.ts) for the
 * same reason: several components want this list at once (the per-deck "Save to
 * cloud" button, the cloud shelf on the Backup & Share tab, the map shelf), and
 * they must add up to ONE request rather than one each.
 *
 * Two invariants the tests pin:
 *
 * 1. **A guest costs nothing.** Nothing here fetches until the account probe
 *    has actually said "signed-in", so a signed-out visitor makes zero requests
 *    beyond the single `/me` that already existed.
 * 2. **Explicit sync only.** There is no polling, no auto-upload and no merge.
 *    Every request in this file traces back to a button press, except the one
 *    listing fetched when a signed-in user opens the Bag.
 */
import { useCallback, useEffect, useState } from "react";
import {
  BAG_ITEM_CAP,
  BagKind,
  CloudBagItem,
  CloudFailure,
  CloudResult,
  createCloudItem,
  deleteCloudItem,
  listCloudItems,
  readCloudItem,
  updateCloudItem,
} from "./bagCloud";
import { useAccount } from "./useAccount";

/**
 * What the cloud UI should show:
 * - `loading`  — the account probe hasn't answered, or the listing is in flight
 * - `guest`    — API reachable, nobody signed in → offer "Sign in to sync"
 * - `offline`  — API unreachable → render nothing at all (same as the chip)
 * - `ready`    — signed in, listing in hand
 */
export type CloudBagStatus = "loading" | "guest" | "offline" | "ready";

type StoreEntry = {
  status: "loading" | "offline" | "ready";
  items: CloudBagItem[];
  /** The in-flight (or settled) listing. Non-null means "already asked". */
  probe: Promise<void> | null;
  listeners: Set<() => void>;
};

const stores: Record<BagKind, StoreEntry> = {
  decks: { status: "loading", items: [], probe: null, listeners: new Set() },
  maps: { status: "loading", items: [], probe: null, listeners: new Set() },
};

const publish = (kind: BagKind) => {
  stores[kind].listeners.forEach((listener) => listener());
};

const applyListing = (kind: BagKind, result: CloudResult<CloudBagItem[]>) => {
  const store = stores[kind];
  if (result.ok) {
    store.status = "ready";
    store.items = result.value;
  } else if (result.reason === "offline" || result.reason === "unauthorized") {
    // An expired cookie is indistinguishable from a dead API as far as the
    // shelf is concerned: there is nothing to show and nothing to retry.
    store.status = "offline";
    store.items = [];
  }
  publish(kind);
};

/** Fetch the listing once per kind per page load. No retry on failure. */
const ensureCloudBagProbe = (kind: BagKind): Promise<void> => {
  const store = stores[kind];
  if (!store.probe) {
    store.probe = listCloudItems(kind).then((result) =>
      applyListing(kind, result),
    );
  }
  return store.probe;
};

/** Re-list after a write, so `bytes`/`updatedAt` always match the server. */
const refreshCloudBag = async (kind: BagKind): Promise<void> => {
  const result = await listCloudItems(kind);
  stores[kind].probe = Promise.resolve();
  applyListing(kind, result);
};

/** Drop everything on sign-out, so the next sign-in re-lists from scratch. */
const resetCloudBag = (kind: BagKind) => {
  const store = stores[kind];
  if (store.status === "loading" && store.items.length === 0 && !store.probe) {
    return;
  }
  store.status = "loading";
  store.items = [];
  store.probe = null;
  publish(kind);
};

export type CloudBagView = {
  status: CloudBagStatus;
  items: CloudBagItem[];
  /** Item cap for this kind, so the UI can render `N/100`. */
  cap: number;
  /** Sum of stored payload sizes, for the quota line. */
  usedBytes: number;
  isFull: boolean;
  /**
   * Upload `data` under `name`. An existing cloud item with the SAME name is
   * overwritten in place (PUT) rather than duplicated — pressing "Save to
   * cloud" twice on one deck must not eat two of the user's 100 slots. Match is
   * by name because the listing deliberately carries no payloads to compare.
   */
  save: (
    name: string,
    data: unknown,
  ) => Promise<CloudResult<{ id: string; replaced: boolean }>>;
  /** Download one item's payload, for "Load into bag". */
  load: (id: string) => Promise<CloudResult<unknown>>;
  remove: (id: string) => Promise<CloudResult<null>>;
};

export const useCloudBag = (kind: BagKind): CloudBagView => {
  const account = useAccount();
  const store = stores[kind];
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((tick) => tick + 1);
    const entry = stores[kind];
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
    };
  }, [kind]);

  useEffect(() => {
    if (account.status === "signed-in") {
      ensureCloudBagProbe(kind);
    } else if (account.status === "guest" || account.status === "offline") {
      resetCloudBag(kind);
    }
  }, [account.status, kind]);

  const save = useCallback(
    async (name: string, data: unknown) => {
      const existing = stores[kind].items.find((item) => item.name === name);
      const result = existing
        ? await updateCloudItem(kind, existing.id, name, data)
        : await createCloudItem(kind, name, data);
      if (!result.ok) return result as CloudResult<never>;
      await refreshCloudBag(kind);
      return {
        ok: true as const,
        value: { id: result.value.id, replaced: !!existing },
      };
    },
    [kind],
  );

  const load = useCallback(
    async (id: string): Promise<CloudResult<unknown>> => {
      const result = await readCloudItem(kind, id);
      return result.ok ? { ok: true, value: result.value.data } : result;
    },
    [kind],
  );

  const remove = useCallback(
    async (id: string): Promise<CloudResult<null>> => {
      const result = await deleteCloudItem(kind, id);
      if (result.ok) await refreshCloudBag(kind);
      return result;
    },
    [kind],
  );

  const status: CloudBagStatus =
    account.status === "loading"
      ? "loading"
      : account.status === "guest"
        ? "guest"
        : account.status === "offline"
          ? "offline"
          : store.status;

  const items = status === "ready" ? store.items : [];

  return {
    status,
    items,
    cap: BAG_ITEM_CAP,
    usedBytes: items.reduce((total, item) => total + (item.bytes ?? 0), 0),
    isFull: items.length >= BAG_ITEM_CAP,
    save,
    load,
    remove,
  };
};

/** Re-exported so UI can render a failure without importing the transport. */
export type { CloudFailure };

/** Test-only: cold-start both stores. */
export const __resetCloudBagStoresForTests = () => {
  (Object.keys(stores) as BagKind[]).forEach((kind) => {
    const store = stores[kind];
    store.status = "loading";
    store.items = [];
    store.probe = null;
    store.listeners.clear();
  });
};
