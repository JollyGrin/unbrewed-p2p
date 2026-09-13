import { useEffect, useState } from "react";

/**
 * Keys, the gameserver list, and the shared `MapData` shape.
 *
 * The deck and map hooks that used to live here are gone (#644): the bag is now
 * account-first for a signed-in user, and localStorage is only one of its two
 * backends. Everything that reads or writes the bag goes through
 * `lib/bag/useBag.ts`, which is the ONLY module allowed to touch these two keys
 * — that is what stops a surface from quietly staying device-only.
 */
export const LS_KEY = {
  DECKS: "DECKS",
  STAR_DECK: "STAR_DECK_ID",
  SERVER_ACTIVE: "SERVER_ACTIVE",
  SERVER_LIST: "SERVER_LIST",
  MAP_LIST: "MAP_LIST",
};

export const DEFAULT_SERVER = "https://unbrewed-relay-production.up.railway.app";

/**
 * The old default relay (#805). Fly can no longer deploy, so it is frozen on a
 * pre-July relay build; anyone still pinned to it is moved to DEFAULT_SERVER.
 */
export const RETIRED_DEFAULT_SERVER = "https://unbrewed-v2.fly.dev";

const isRetiredServer = (server: string) =>
  server.replace(/\/+$/, "") === RETIRED_DEFAULT_SERVER;

/**
 * Moves a device off the retired Fly relay: an active server equal to it is
 * cleared (so the new default applies) and it is swapped for the new default
 * in the saved list. Any other custom server is left alone. Idempotent.
 */
export const migrateRetiredServer = (storage: Storage) => {
  const active = storage.getItem(LS_KEY.SERVER_ACTIVE);
  if (active && isRetiredServer(active)) {
    storage.removeItem(LS_KEY.SERVER_ACTIVE);
  }

  const rawList = storage.getItem(LS_KEY.SERVER_LIST);
  if (!rawList) return;
  let list: unknown;
  try {
    list = JSON.parse(rawList);
  } catch {
    return;
  }
  if (!Array.isArray(list) || !list.some(isRetiredServer)) return;
  const migrated = Array.from(
    new Set(list.map((s) => (isRetiredServer(s) ? DEFAULT_SERVER : s))),
  );
  storage.setItem(LS_KEY.SERVER_LIST, JSON.stringify(migrated));
};

export const useLocalServerStorage = () => {
  const defaultServer = DEFAULT_SERVER;
  const [activeServer, setActiveServer] = useState<string>(defaultServer);
  const [serverList, setServerList] = useState<string[]>([]);

  useEffect(() => {
    migrateRetiredServer(localStorage);
    const localActiveServer: string | null = localStorage.getItem(
      LS_KEY.SERVER_ACTIVE,
    );
    const localServerList: string | null = localStorage.getItem(
      LS_KEY.SERVER_LIST,
    );
    if (localActiveServer) {
      setActiveServer(localActiveServer);
    }
    if (localServerList) {
      setServerList(JSON.parse(localServerList));
    } else {
      setServerList([defaultServer]);
    }
  }, []);

  const setActive = (server: string) => {
    const urlRegexPattern = new RegExp(
      "^https?:\\/\\/[a-z0-9-]+(\\.[a-z0-9-]+)+([/?].*)?$",
      "i",
    );
    const isUrl = urlRegexPattern.test(server);
    if (!isUrl && server !== "http://localhost:1111") {
      alert("Not a valid url");
      return;
    }

    localStorage.setItem(LS_KEY.SERVER_ACTIVE, server);
    if (!serverList.includes(server)) {
      localStorage.setItem(
        LS_KEY.SERVER_LIST,
        JSON.stringify([...serverList, server]),
      );
    }

    setActiveServer(server);
  };

  const setList = (servers: string[]) => {
    localStorage.setItem(LS_KEY.SERVER_LIST, JSON.stringify(servers));
    setServerList(servers);
  };

  return {
    activeServer,
    getLocalActiveServer: () => activeServer,
    defaultServer,
    serverList,
    setActiveServer: setActive,
    setServerList: setList,
  };
};

export type MapData = {
  isStarred?: boolean;
  imgUrl: string;
  /** Lightweight snapshot for grid cards; falls back to imgUrl when absent. */
  thumbUrl?: string;
  /** Provenance of a built-in snapshot: "legacy" | "official" | "community". */
  source?: string;
  size?: string;
  minPlayers?: number;
  maxPlayers?: number;
  upvotes?: number;
  meta?: {
    author?: string;
    url?: string;
    title: string;
  };
};
