import { useEffect, useState } from "react";
import { HeroListing, PROTOCOL_VERSION, ServerMsg } from "./protocol";
import { isClientStale, markClientStale } from "./staleClient";

/** What the landing needs to tell "still loading" apart from "never arrived". */
export interface ProLiveRosterState {
  /** the server's roster, or null until (or unless) it replies */
  heroes: HeroListing[] | null;
  /** the socket closed/errored before a HEROES reply — the roster is not coming */
  offline: boolean;
}

/**
 * One-shot LIST_HEROES fetch for pages that just need to know which heroes
 * the live Pro server currently supports (e.g. the /pro landing roster) —
 * without the reconnect/room machinery useProSocket carries for gameplay.
 *
 * `debug` (v15): when true, sends `LIST_HEROES { debug: true }` so the server
 * includes debug-only heroes in the reply (hidden by default).
 *
 * Callers that render a roster (rather than just decorating one) want the
 * `offline` bit too: `heroes === null` alone can't distinguish "the reply is a
 * few hundred ms out — show skeletons" from "the socket died — say so", and
 * pulsing skeletons forever is the worse of the two failure modes.
 *
 * `autoReload` (p2p #1549): when the engine refuses this bundle's version, may
 * the page reload itself? Pass false where a reload could throw away input.
 */
export function useProLiveRosterState(
  wsUrl: string | undefined,
  debug = false,
  autoReload = true
): ProLiveRosterState {
  const [state, setState] = useState<ProLiveRosterState>({
    heroes: null,
    offline: false,
  });

  useEffect(() => {
    if (!wsUrl) return;
    // A stale bundle (p2p #1549) would only be refused again: don't ask.
    if (isClientStale()) {
      setState({ heroes: null, offline: true });
      return;
    }
    // Re-fetching (a debug toggle, a URL change) starts from loading again, so a
    // previous run's `offline` never sticks to the new socket.
    setState({ heroes: null, offline: false });
    const ws = new WebSocket(wsUrl);
    // Set once the reply lands, so the close event that follows our own
    // `ws.close()` isn't mistaken for the connection dying.
    let answered = false;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          type: "LIST_HEROES",
          ...(debug ? { debug: true } : {}),
        })
      );
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      // Refused for its protocol version (p2p #1549): flag the page stale.
      // The roster holds no seat and no game, so a guarded reload is safe —
      // unless the caller has unsaved input on screen (`autoReload` false).
      if (msg.type === "ERROR" && msg.code === "VERSION") {
        markClientStale("LIST_HEROES", () => autoReload);
        ws.close();
        return;
      }
      if (msg.type === "HEROES") {
        answered = true;
        setState({ heroes: msg.heroes, offline: false });
        ws.close();
      }
    };
    ws.onclose = () => {
      if (!answered) setState({ heroes: null, offline: true });
    };
    return () => {
      // Unmount/re-run: suppress the onclose handler so tearing down a healthy
      // socket never reports offline.
      answered = true;
      ws.close();
    };
  }, [wsUrl, debug, autoReload]);

  return state;
}

/**
 * Heroes-only view of {@link useProLiveRosterState}, for callers that treat a
 * missing roster and a dead socket the same way.
 */
export function useProLiveRoster(
  wsUrl: string | undefined,
  debug = false
): HeroListing[] | null {
  return useProLiveRosterState(wsUrl, debug).heroes;
}
