/**
 * Stale client, Pro protocol reason (p2p #1549): this tab's bundle speaks a
 * protocol version the engine no longer accepts, so it answered ERROR{VERSION}.
 * Nothing this tab sends will ever be accepted again; reloading picks up the
 * new bundle.
 *
 * Set by every Pro socket (useProSocket and the one-shot roster fetch). The
 * page-wide flag, banner and reload guard are shared with the stale-build check
 * (p2p #1605) and live in `lib/staleClient.ts`; they are re-exported here.
 */
import { track } from "@/lib/analytics";
import { markStale } from "@/lib/staleClient";
import { PROTOCOL_VERSION } from "./protocol";

export {
  RELOAD_GUARD_KEY,
  RELOAD_GUARD_MS,
  isClientStale,
  reloadIfGuardAllows,
  reloadPage,
  resetClientStale,
  useClientStale,
} from "@/lib/staleClient";

/**
 * Is an ERROR{VERSION} frame telling us THIS bundle is too old? The engine
 * stamps every frame, ERROR included, with its own PROTOCOL_VERSION. The
 * engine also refuses a client that is NEWER than it (Pages deployed before
 * Railway on a joint bump, or an engine rollback): that tab is up to date, a
 * reload can't help, and it must keep retrying until the engine catches up.
 * A frame without a numeric `v` proves nothing, so it is not stale either.
 */
export const serverIsNewer = (serverV: unknown): boolean =>
  typeof serverV === "number" && Number.isFinite(serverV) && serverV > PROTOCOL_VERSION;

/**
 * Flag the page stale (sticky until reload). `messageType` is the last frame
 * this socket sent — ERROR frames don't say which request they answer.
 * `canAutoReload` is the caller's "no seat, no game snapshot" verdict; the tab
 * must also be visible, and a hidden tab reloads when it next becomes visible.
 * Returns a disposer for that pending visibility listener: call it on unmount.
 */
export const markClientStale = (messageType: string | null, canAutoReload: () => boolean): (() => void) =>
  markStale("protocol", canAutoReload, () => {
    // Beacon: the reload below may follow immediately, before a batched send.
    // `client_version` is this bundle's: the frame's `v` is the engine's own.
    track(
      "client_version_stale",
      { client_version: PROTOCOL_VERSION, message_type: messageType ?? undefined },
      { beacon: true },
    );
  });
