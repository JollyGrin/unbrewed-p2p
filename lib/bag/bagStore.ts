/**
 * The bag (#644) — ONE store for decks and maps, over two interchangeable
 * backends: this browser's localStorage, and the signed-in user's account.
 *
 * Why a store and not a patch per consumer: a dozen surfaces read the bag
 * (the Bag tabs, /connect, /join, the lobby and in-game deck pickers, the map
 * pickers, the share landings, the offline table). Teaching each of them about
 * accounts would guarantee that one of them stayed localStorage-only and quietly
 * lost a signed-in player's deck. So every one of them goes through `useBag*`,
 * and this file is the only code that knows a cloud exists.
 *
 * The two tiers, and nothing in between:
 *
 * - **Guest** — localStorage IS the bag, exactly as it always was: the same
 *   keys, the same 5 MB browser ceiling, the same meter. Not one request is
 *   made on their behalf beyond the `/me` probe that already shipped.
 * - **Signed in** — the account is the bag. Adds, imports, edits and deletes go
 *   to `/bag/*`, and localStorage is written only when the API refuses or can't
 *   be reached, so nothing is ever lost to a dead network.
 *
 * Identity is the item's own stable id — `deck.id`, `map.imgUrl` — carried
 * inside the uploaded payload and matched on the way back down. #566 matched
 * cloud items by NAME, which silently overwrote one of two same-named decks.
 *
 * The standing invariant from useAccount holds throughout: an unreachable API
 * must leave the site behaving exactly as it does today.
 */
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  BagKind,
  CloudFailure,
  cloudFailureMessage,
  createCloudItem,
  deleteCloudItem,
  listCloudItems,
  readCloudItem,
  updateCloudItem,
} from "@/lib/account/bagCloud";
import { LS_KEY, MapData } from "@/lib/hooks/useLocalStorage";
import { safeRemoveItem, safeSetItem } from "@/lib/storage/quota";

/** Where an item the user is looking at actually lives. */
export type BagSource = "device" | "cloud";

/**
 * The cloud half of the store:
 * - `idle`        — nobody signed in (or we haven't asked yet)
 * - `loading`     — listing/hydration in flight
 * - `ready`       — the account bag is in hand and writes go up
 * - `unavailable` — signed in but the API didn't answer; behave like a guest
 */
export type CloudPhase = "idle" | "loading" | "ready" | "unavailable";

/** One item as it exists in the account, with its payload already hydrated. */
type CloudEntry<T> = { cloudId: string; id: string; data: T };

export type KindStore<T> = {
  kind: BagKind;
  /** localStorage key this kind's device copy lives under. */
  lsKey: string;
  /** The item's stable identity — what cloud rows are matched on. */
  idOf: (item: T) => string;
  /** Human label stored alongside the payload, for listings and share cards. */
  nameOf: (item: T) => string;
  local: T[];
  localLoaded: boolean;
  cloud: CloudEntry<T>[];
  phase: CloudPhase;
  /** The in-flight (or settled) hydration. Non-null means "already asked". */
  probe: Promise<void> | null;
  listeners: Set<() => void>;
};

/**
 * A stable, human cloud name for a map. Maps have no id of their own —
 * `imgUrl` is their identity — so fall back to the image's filename rather
 * than letting every untitled map land as "Custom map".
 */
export const bagMapName = (map: {
  imgUrl: string;
  meta?: { title?: string };
}): string => {
  const title = map.meta?.title?.trim();
  if (title) return title;
  const tail = map.imgUrl.split(/[?#]/)[0]?.split("/").pop() ?? "";
  const decoded = (() => {
    try {
      return decodeURIComponent(tail);
    } catch {
      return tail;
    }
  })();
  const bare = decoded.replace(/\.[a-z0-9]+$/i, "");
  return bare || "Custom map";
};

const deckStore: KindStore<DeckImportType> = {
  kind: "decks",
  lsKey: LS_KEY.DECKS,
  idOf: (deck) => deck?.id,
  nameOf: (deck) => deck?.name ?? "Deck",
  local: [],
  localLoaded: false,
  cloud: [],
  phase: "idle",
  probe: null,
  listeners: new Set(),
};

const mapStore: KindStore<MapData> = {
  kind: "maps",
  lsKey: LS_KEY.MAP_LIST,
  idOf: (map) => map?.imgUrl,
  nameOf: bagMapName,
  local: [],
  localLoaded: false,
  cloud: [],
  phase: "idle",
  probe: null,
  listeners: new Set(),
};

export const stores = { decks: deckStore, maps: mapStore };

const publish = <T,>(store: KindStore<T>) =>
  store.listeners.forEach((listener) => listener());

export const subscribeBag = <T,>(
  store: KindStore<T>,
  listener: () => void,
): (() => void) => {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
};

/* ------------------------------------------------------------------ device */

/** Read this browser's copy once per page load. Never throws on bad JSON. */
export const loadLocal = <T,>(store: KindStore<T>): void => {
  if (store.localLoaded || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(store.lsKey);
    const parsed = raw ? JSON.parse(raw) : [];
    store.local = Array.isArray(parsed) ? parsed : [];
  } catch {
    store.local = [];
  }
  store.localLoaded = true;
  publish(store);
};

/** Write the device copy. False means the device is full (already toasted). */
const persistLocal = <T,>(store: KindStore<T>, next: T[]): boolean => {
  if (next.length === 0) {
    safeRemoveItem(store.lsKey);
    store.local = [];
    publish(store);
    return true;
  }
  if (!safeSetItem(store.lsKey, JSON.stringify(next))) return false;
  store.local = next;
  publish(store);
  return true;
};

/* ------------------------------------------------------------------- cloud */

/**
 * Payload reads, a few at a time. The listing is metadata-only by design, so a
 * bag of N items costs N reads; capping the concurrency keeps a big bag from
 * tripping the API's write/read buckets on a single page load.
 */
const HYDRATE_CONCURRENCY = 4;

const hydrate = async <T,>(store: KindStore<T>): Promise<void> => {
  store.phase = "loading";
  publish(store);

  const listing = await listCloudItems(store.kind);
  if (!listing.ok) {
    // A dead API (or an expired cookie) is indistinguishable from "no account"
    // as far as the bag is concerned: fall back to the device and say nothing.
    store.phase = "unavailable";
    store.cloud = [];
    publish(store);
    return;
  }

  const rows = listing.value;
  const entries: CloudEntry<T>[] = new Array(rows.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= rows.length) return;
      const row = rows[index];
      const payload = await readCloudItem(store.kind, row.id);
      if (!payload.ok) continue;
      const data = payload.value.data as T;
      const id = data ? store.idOf(data) : undefined;
      if (typeof id === "string" && id) {
        entries[index] = { cloudId: row.id, id, data };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(HYDRATE_CONCURRENCY, rows.length) }, worker),
  );

  store.cloud = entries.filter(Boolean);
  store.phase = "ready";
  publish(store);
};

/** Hydrate once per sign-in per page load. No retry — one failure is enough. */
export const ensureCloud = <T,>(store: KindStore<T>): Promise<void> => {
  if (!store.probe) store.probe = hydrate(store);
  return store.probe;
};

/** Drop the account half (sign-out, or a guest/offline probe). */
export const resetCloud = <T,>(store: KindStore<T>): void => {
  if (store.phase === "idle" && !store.probe && store.cloud.length === 0) return;
  store.phase = "idle";
  store.cloud = [];
  store.probe = null;
  publish(store);
};

/** True while writes should go to the account rather than to the device. */
const cloudWritable = <T,>(store: KindStore<T>) => store.phase === "ready";

/* -------------------------------------------------------------- the union */

/**
 * What every consumer sees: the account's items first (the account is the
 * truth), then anything still on this device that the account doesn't already
 * hold. A guest's list is byte-for-byte what it was before this file existed.
 */
export const bagItems = <T,>(store: KindStore<T>): T[] => {
  const fromCloud = store.cloud.map((entry) => entry.data);
  const cloudIds = new Set(store.cloud.map((entry) => entry.id));
  const fromDevice = store.local.filter(
    (item) => !cloudIds.has(store.idOf(item)),
  );
  return [...fromCloud, ...fromDevice];
};

export const sourceOf = <T,>(store: KindStore<T>, id: string): BagSource =>
  store.cloud.some((entry) => entry.id === id) ? "cloud" : "device";

/** The account row id for an item, when it has one — for share links. */
export const cloudIdOf = <T,>(
  store: KindStore<T>,
  id: string,
): string | undefined => store.cloud.find((entry) => entry.id === id)?.cloudId;

/* ------------------------------------------------------------------ writes */

/** Where an add ended up, so callers can toast the truth. */
export type WriteOutcome =
  | { ok: true; where: BagSource }
  | { ok: false; reason: "device_full" | CloudFailure };

/**
 * The one sentence a signed-in user sees when their account couldn't be
 * reached. It promises the follow-up action that actually exists (§1's button)
 * rather than implying a background sync that nothing performs.
 */
export const FELL_BACK_TO_DEVICE =
  "Saved on this device — move it to your account from Bag → Backup & Share when you're back online.";

const addLocal = <T,>(store: KindStore<T>, item: T): WriteOutcome =>
  persistLocal(store, [...store.local, item])
    ? { ok: true, where: "device" }
    : { ok: false, reason: "device_full" };

/**
 * Add one item. Signed in and reachable → the account, and localStorage is not
 * touched at all. Anything else → the device, exactly as before.
 *
 * An item whose id is already in the account is UPDATED in place rather than
 * duplicated: pressing "add" twice on one deck must not leave two rows that
 * fight over the same id.
 */
export const addItem = async <T,>(
  store: KindStore<T>,
  item: T,
): Promise<WriteOutcome> => {
  loadLocal(store);
  if (!cloudWritable(store)) return addLocal(store, item);

  const id = store.idOf(item);
  const existing = store.cloud.find((entry) => entry.id === id);
  const name = store.nameOf(item);
  const result = existing
    ? await updateCloudItem(store.kind, existing.cloudId, name, item)
    : await createCloudItem(store.kind, name, item);

  if (result.ok) {
    store.cloud = existing
      ? store.cloud.map((entry) =>
          entry.cloudId === existing.cloudId ? { ...entry, data: item } : entry,
        )
      : [...store.cloud, { cloudId: result.value.id, id, data: item }];
    publish(store);
    return { ok: true, where: "cloud" };
  }

  // The API refused or vanished — keep the item rather than the purity of the
  // account-only rule. A 409 from a pre-#38 (still capped) API lands here too.
  const local = addLocal(store, item);
  return local.ok ? { ok: false, reason: result.reason } : local;
};

/** Replace an item in place, on whichever backend currently holds it. */
export const updateItem = async <T,>(
  store: KindStore<T>,
  item: T,
): Promise<boolean> => {
  loadLocal(store);
  const id = store.idOf(item);
  const entry = store.cloud.find((candidate) => candidate.id === id);
  if (!entry) {
    return persistLocal(
      store,
      store.local.map((candidate) =>
        store.idOf(candidate) === id ? item : candidate,
      ),
    );
  }
  const result = await updateCloudItem(
    store.kind,
    entry.cloudId,
    store.nameOf(item),
    item,
  );
  if (!result.ok) return false;
  store.cloud = store.cloud.map((candidate) =>
    candidate.cloudId === entry.cloudId ? { ...candidate, data: item } : candidate,
  );
  publish(store);
  return true;
};

/** Remove an item from wherever it lives (both, if it somehow lives in both). */
export const removeItem = async <T,>(
  store: KindStore<T>,
  id: string,
): Promise<boolean> => {
  loadLocal(store);
  let ok = true;
  const entry = store.cloud.find((candidate) => candidate.id === id);
  if (entry) {
    const result = await deleteCloudItem(store.kind, entry.cloudId);
    if (result.ok) {
      store.cloud = store.cloud.filter(
        (candidate) => candidate.cloudId !== entry.cloudId,
      );
      publish(store);
    } else {
      ok = false;
    }
  }
  if (store.local.some((item) => store.idOf(item) === id)) {
    persistLocal(
      store,
      store.local.filter((item) => store.idOf(item) !== id),
    );
  }
  return ok;
};

/**
 * Merge items in, skipping ids already in the bag. Returns how many landed —
 * the same contract the localStorage-only importer had, so "Imported 0 decks"
 * still means "nothing new", not "the write failed".
 */
export const importItems = async <T,>(
  store: KindStore<T>,
  incoming: T[],
): Promise<number> => {
  loadLocal(store);
  const present = new Set(bagItems(store).map((item) => store.idOf(item)));
  const fresh: T[] = [];
  for (const item of incoming) {
    const id = item ? store.idOf(item) : undefined;
    if (!id || present.has(id)) continue;
    present.add(id);
    fresh.push(item);
  }
  if (fresh.length === 0) return 0;

  if (!cloudWritable(store)) {
    return persistLocal(store, [...store.local, ...fresh]) ? fresh.length : 0;
  }

  let added = 0;
  const strandedOnDevice: T[] = [];
  for (const item of fresh) {
    const result = await createCloudItem(
      store.kind,
      store.nameOf(item),
      item,
    );
    if (result.ok) {
      store.cloud = [
        ...store.cloud,
        { cloudId: result.value.id, id: store.idOf(item), data: item },
      ];
      added += 1;
    } else {
      strandedOnDevice.push(item);
    }
  }
  if (strandedOnDevice.length) {
    if (persistLocal(store, [...store.local, ...strandedOnDevice])) {
      added += strandedOnDevice.length;
    }
  }
  publish(store);
  return added;
};

/** Empty the bag the user can see — both backends. */
export const clearBag = async <T,>(store: KindStore<T>): Promise<void> => {
  loadLocal(store);
  const entries = store.cloud;
  store.cloud = [];
  persistLocal(store, []);
  publish(store);
  for (const entry of entries) {
    await deleteCloudItem(store.kind, entry.cloudId);
  }
};

/* -------------------------------------------------------------------- star */

/**
 * The starred deck id. It stays a localStorage pointer on both tiers: it is a
 * per-device choice ("what am I playing on THIS machine"), it costs 40 bytes,
 * and keeping it local means the game-start path can still read it
 * synchronously. It points at an id, so it survives that deck moving to the
 * account untouched — which is exactly what §1 needs.
 */
let starId = "";
let starLoaded = false;
const starListeners = new Set<() => void>();

export const subscribeStar = (listener: () => void): (() => void) => {
  starListeners.add(listener);
  return () => {
    starListeners.delete(listener);
  };
};

export const loadStar = (): string => {
  if (!starLoaded && typeof window !== "undefined") {
    starId = window.localStorage.getItem(LS_KEY.STAR_DECK) ?? "";
    starLoaded = true;
  }
  return starId;
};

export const readStar = (): string => starId;

export const setStar = (id: string): void => {
  starLoaded = true;
  starId = id;
  safeSetItem(LS_KEY.STAR_DECK, id);
  starListeners.forEach((listener) => listener());
};

export const clearStar = (): void => {
  starLoaded = true;
  starId = "";
  safeRemoveItem(LS_KEY.STAR_DECK);
  starListeners.forEach((listener) => listener());
};

/**
 * The starred deck, resolved from whichever backend holds it, readable outside
 * React. Game start (lib/sandbox/initGame.ts) calls this from an event handler
 * on a page where the bag is already mounted, so a cloud deck is hydrated by
 * then; the localStorage scan stays as the guest path and the cold fallback.
 */
export const readStarredDeckFromBag = (): DeckImportType | undefined => {
  if (typeof window === "undefined") return undefined;
  const id = loadStar();
  if (!id) return undefined;
  const fromCloud = deckStore.cloud.find((entry) => entry.id === id);
  if (fromCloud) return fromCloud.data;
  loadLocal(deckStore);
  return deckStore.local.find((deck) => deck?.id === id);
};

/** Re-exported for callers that only want to name a failure. */
export { cloudFailureMessage };

/** Test-only: cold-start every backend. */
export const __resetBagStoresForTests = () => {
  for (const store of [deckStore, mapStore] as KindStore<any>[]) {
    store.local = [];
    store.localLoaded = false;
    store.cloud = [];
    store.phase = "idle";
    store.probe = null;
    store.listeners.clear();
  }
  starId = "";
  starLoaded = false;
  starListeners.clear();
};
