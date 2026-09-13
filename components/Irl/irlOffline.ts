import axios from "axios";
import { useEffect } from "react";
import toast from "react-hot-toast";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DEFAULT_DECK_API, EVERGREEN_DECK_IDS } from "@/lib/evergreenDecks";
import { APP_COMMIT } from "@/lib/pro/appVersion";

/**
 * IRL Mode at a table with no signal (issue #801) — the page half of
 * public/irl-sw.js. Only /irl registers the worker, and only for its own
 * scope: every other route stays exactly as it was.
 */
export const IRL_SW_SCOPE = "/irl";

export const IRL_UPDATED_TOAST =
  "IRL Mode updated — reload when you're between games";

const isDev = process.env.NODE_ENV !== "production";

/** The commit is the cache version: each deploy gets its own `irl-<sha>`. */
export const irlWorkerUrl = (commit: string = APP_COMMIT, dev = isDev) =>
  `/irl-sw.js?v=${encodeURIComponent(commit)}${dev ? "&dev=1" : ""}`;

/** The commit a worker was registered for, read back off its script URL. */
export const workerCommit = (scriptURL: string): string | null => {
  try {
    return new URL(scriptURL).searchParams.get("v");
  } catch {
    return null;
  }
};

let loggedScope = false;

/**
 * Register the /irl worker after mount. A worker from another deploy taking
 * over toasts instead of reloading: a reload mid-combat is worse than one
 * stale session, and the game state survives either way (#798). A first
 * install — or a new worker for the build already running — says nothing.
 */
export const useIrlServiceWorker = () => {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const onControllerChange = () => {
      const commit = sw.controller && workerCommit(sw.controller.scriptURL);
      if (commit && commit !== APP_COMMIT) {
        toast(IRL_UPDATED_TOAST, { id: "irl-updated", icon: "✨", duration: 10_000 });
      }
    };
    sw.addEventListener("controllerchange", onControllerChange);
    sw.register(irlWorkerUrl(), { scope: IRL_SW_SCOPE })
      .then((registration) => {
        if (isDev && !loggedScope) {
          loggedScope = true;
          console.info(`[irl-sw] scope ${registration.scope}`);
        }
      })
      .catch((err) => console.warn("[irl-sw] registration failed", err));
    return () => sw.removeEventListener("controllerchange", onControllerChange);
  }, []);
};

const URL_KEY = /^url$|Url$/;
const LINK = /^(https?:\/\/|\/)/;

/**
 * Every image the tray can show for this deck — card faces, sprite sheets,
 * backs, token portraits: any `*Url` / `url` string in `deck_data`.
 */
export const irlDeckArtUrls = (deck: DeckImportType): string[] => {
  const found = new Set<string>();
  const walk = (value: unknown, key: string) => {
    if (typeof value === "string") {
      if (URL_KEY.test(key) && LINK.test(value)) found.add(value);
    } else if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => walk(v, k));
    }
  };
  walk(deck.deck_data, "");
  return [...found];
};

/** Where `fetchDeckById` looks first for this id (lib/evergreenDecks.ts). */
export const irlDeckJsonUrl = (deckId: string) =>
  EVERGREEN_DECK_IDS.has(deckId)
    ? `/evergreen-decks/${deckId}.json`
    : DEFAULT_DECK_API + deckId;

/**
 * Hand the opened deck's art and JSON to the worker, so a card first drawn
 * offline still has a face and a signed-in player's deck (whose bag lives in
 * the cloud, not on the device) reloads with no signal. Only decks opened in
 * IRL Mode are ever cached — nothing else in the bag.
 */
export const warmIrlDeck = (deck: DeckImportType, deckId: string = deck.id) => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const message = {
    type: "irl:warm",
    art: irlDeckArtUrls(deck),
    decks: [irlDeckJsonUrl(deckId)],
  };
  void navigator.serviceWorker.ready.then((registration) =>
    registration.active?.postMessage(message),
  );
};

/** A deck fetch that never got an answer — no signal, rather than a bad id. */
export const isOfflineError = (error: unknown) =>
  (typeof navigator !== "undefined" && navigator.onLine === false) ||
  (axios.isAxiosError(error) && !error.response);
