/**
 * `useBagDecks()` / `useBagMaps()` (#644) — the ONLY way a component reads or
 * writes the bag.
 *
 * They return the same shape as the localStorage-only hooks they replace
 * (`useLocalDeckStorage` / `useLocalMapStorage`), so migrating a consumer is
 * mechanical, with two deliberate differences:
 *
 * 1. **Writes are async.** A signed-in add is an HTTP round trip; a guest's is
 *    a synchronous localStorage write dressed as a resolved promise. Callers
 *    `await` either way, and neither can tell which happened.
 * 2. **There is a loading state.** A cloud bag arrives one round trip after
 *    mount, so pickers must render a spinner rather than "your bag is empty".
 *    `decks` stays `undefined` (and `isLoading` true) until the bag is known.
 *
 * See lib/bag/bagStore.ts for the backends themselves.
 */
import { useCallback, useEffect, useState } from "react";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useAccount } from "@/lib/account/useAccount";
import { MapData } from "@/lib/hooks/useLocalStorage";
import {
  BagSource,
  KindStore,
  addItem,
  bagItems,
  clearBag,
  clearStar,
  cloudIdOf,
  ensureCloud,
  importItems,
  loadLocal,
  loadStar,
  removeItem,
  resetCloud,
  setStar as writeStar,
  sourceOf,
  stores,
  subscribeBag,
  subscribeStar,
  updateItem,
} from "./bagStore";

/** Shared plumbing: subscribe, load the device copy, probe the account. */
const useKindStore = <T,>(store: KindStore<T>): { isLoading: boolean } => {
  const account = useAccount();
  const [, forceRender] = useState(0);

  useEffect(() => {
    const rerender = () => forceRender((tick) => tick + 1);
    const unsubscribe = subscribeBag(store, rerender);
    loadLocal(store);
    rerender();
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    // A guest costs nothing: nothing here fires until `/me` says "signed-in".
    if (account.status === "signed-in") ensureCloud(store);
    else if (account.status === "guest" || account.status === "offline") {
      resetCloud(store);
    }
  }, [account.status, store]);

  // Signed in but the account hasn't answered yet is the one state where the
  // bag genuinely isn't known — everything else resolves to the device copy.
  const isLoading =
    !store.localLoaded ||
    account.status === "loading" ||
    (account.status === "signed-in" &&
      (store.phase === "idle" || store.phase === "loading"));

  return { isLoading };
};

export type BagDeckView = {
  /** `undefined` while the bag is still resolving — never a premature `[]`. */
  decks: DeckImportType[] | undefined;
  isLoading: boolean;
  star: string;
  starredDeck: DeckImportType | undefined;
  /** "cloud" for an account deck, "device" for a localStorage one. */
  sourceOf: (id: string) => BagSource;
  /** The account row id, for a share link. Undefined for a device deck. */
  cloudIdOf: (id: string) => string | undefined;
  setStar: (id: string) => void;
  /** False only when nothing was stored at all (device full). */
  pushDeck: (deck: DeckImportType) => Promise<boolean>;
  removeDeckbyId: (id: string) => Promise<void>;
  updateDeck: (deck: DeckImportType) => Promise<void>;
  importDecks: (decks: DeckImportType[]) => Promise<number>;
  clearDecks: () => Promise<void>;
};

export const useBagDecks = (): BagDeckView => {
  const store = stores.decks;
  const { isLoading } = useKindStore(store);
  const [star, setStarState] = useState("");

  useEffect(() => {
    const sync = () => setStarState(loadStar());
    sync();
    return subscribeStar(sync);
  }, []);

  // The DEVICE half is available the moment localStorage is read, and is
  // returned right away — a guest must never wait on the `/me` probe to see
  // their own decks. `isLoading` says only that the ACCOUNT half may still be
  // coming, which is what stops a picker from claiming the bag is empty.
  const decks = store.localLoaded ? bagItems(store) : undefined;

  const setStar = useCallback((id: string) => writeStar(id), []);

  const pushDeck = useCallback(
    async (deck: DeckImportType) => {
      const outcome = await addItem(store, deck);
      // A refusal that still landed on the device is a success for the user;
      // only "nothing was stored" is a failure the caller must not toast over.
      if (!outcome.ok && outcome.reason === "device_full") return false;
      // A deck you add should be ready to play: star it if nothing is starred.
      if (!loadStar()) writeStar(deck.id);
      return true;
    },
    [store],
  );

  return {
    decks,
    isLoading,
    star,
    starredDeck: decks?.find((deck) => deck.id === star),
    sourceOf: (id) => sourceOf(store, id),
    cloudIdOf: (id) => cloudIdOf(store, id),
    setStar,
    pushDeck,
    removeDeckbyId: useCallback(
      async (id: string) => {
        await removeItem(store, id);
      },
      [store],
    ),
    updateDeck: useCallback(
      async (deck: DeckImportType) => {
        await updateItem(store, deck);
      },
      [store],
    ),
    importDecks: useCallback(
      async (incoming: DeckImportType[]) => {
        const added = await importItems(store, incoming);
        if (added > 0 && !loadStar()) {
          const first = incoming.find((deck) => deck?.id);
          if (first) writeStar(first.id);
        }
        return added;
      },
      [store],
    ),
    clearDecks: useCallback(async () => {
      await clearBag(store);
      clearStar();
    }, [store]),
  };
};

export type BagMapView = {
  /** Always an array — the map pickers merge it with the built-in catalog. */
  data: MapData[];
  isLoading: boolean;
  sourceOf: (imgUrl: string) => BagSource;
  cloudIdOf: (imgUrl: string) => string | undefined;
  add: (map: MapData) => Promise<boolean>;
  remove: (imgUrl: string) => Promise<void>;
  importMaps: (maps: MapData[]) => Promise<number>;
  clear: () => Promise<void>;
};

export const useBagMaps = (): BagMapView => {
  const mapStore = stores.maps;
  const { isLoading } = useKindStore(mapStore);
  const data = bagItems(mapStore);

  return {
    data,
    isLoading,
    sourceOf: (imgUrl) => sourceOf(mapStore, imgUrl),
    cloudIdOf: (imgUrl) => cloudIdOf(mapStore, imgUrl),
    add: useCallback(async (map: MapData) => {
      const outcome = await addItem(stores.maps, map);
      return outcome.ok || outcome.reason !== "device_full";
    }, []),
    remove: useCallback(async (imgUrl: string) => {
      await removeItem(stores.maps, imgUrl);
    }, []),
    importMaps: useCallback(
      (maps: MapData[]) => importItems(stores.maps, maps),
      [],
    ),
    clear: useCallback(async () => {
      await clearBag(stores.maps);
    }, []),
  };
};

/**
 * Whether this browser still holds bag items of its own. Drives the storage
 * meter (a signed-in user with an empty device bag has no local ceiling to
 * show) and the "Move my bag to my account" call to action.
 */
export const useLocalBagRemainder = (): {
  decks: number;
  maps: number;
  total: number;
} => {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const rerender = () => forceRender((tick) => tick + 1);
    const offDecks = subscribeBag(stores.decks, rerender);
    const offMaps = subscribeBag(stores.maps, rerender);
    loadLocal(stores.decks);
    loadLocal(stores.maps);
    rerender();
    return () => {
      offDecks();
      offMaps();
    };
  }, []);
  const decks = stores.decks.local.length;
  const maps = stores.maps.local.length;
  return { decks, maps, total: decks + maps };
};
