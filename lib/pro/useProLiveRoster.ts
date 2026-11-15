import { useEffect, useState } from "react";
import { HeroListing, LobbyListing, PROTOCOL_VERSION, ServerMsg } from "./protocol";
import { isClientStale, markClientStale, serverIsNewer } from "./staleClient";

/** What the landing needs to tell "still loading" apart from "never arrived". */
export interface ProLiveRosterState {
  /** the server's roster, or null until (or unless) it replies */
  heroes: HeroListing[] | null;
  /** the socket closed/errored before a HEROES reply — the roster is not coming */
  offline: boolean;
  /**
   * The open public lobbies (LIST_LOBBIES), only when the caller asked for them
   * with `withLobbies`. Null until (or unless) the reply lands.
   */
  lobbies?: LobbyListing[] | null;
}

/** How long a `withLobbies` socket waits for LOBBIES once HEROES is in. */
const LOBBIES_GRACE_MS = 3000;

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
  autoReload = true,
  withLobbies = false
): ProLiveRosterState {
  const [state, setState] = useState<ProLiveRosterState>({
    heroes: null,
    offline: false,
  });

  useEffect(() => {
    if (!wsUrl) return;
    // A bundle the engine refused (p2p #1549) would only be refused again: don't
    // ask. A build-stale page (p2p #1605) still can, so only the protocol reason.
    if (isClientStale("protocol")) {
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
    let disposeStale = () => {};
    // `withLobbies` (the /pro launcher's "N waiting" line) rides the same
    // one-shot socket: the socket closes once both replies are in, or a short
    // grace after HEROES so a slow LOBBIES never holds it open.
    let heroesIn = false;
    let lobbiesIn = !withLobbies;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const closeWhenDone = () => {
      if (heroesIn && lobbiesIn) ws.close();
    };
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          type: "LIST_HEROES",
          ...(debug ? { debug: true } : {}),
        })
      );
      if (withLobbies) ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "LIST_LOBBIES" }));
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      // Refused by an engine newer than this bundle (p2p #1549): flag the page
      // stale. The roster holds no seat and no game, so a guarded reload is
      // safe — unless the caller has unsaved input on screen (`autoReload`
      // false). An OLDER engine refusing us is not a stale bundle: ignored.
      if (msg.type === "ERROR" && msg.code === "VERSION" && serverIsNewer((msg as { v?: unknown }).v)) {
        disposeStale = markClientStale("LIST_HEROES", () => autoReload);
        ws.close();
        return;
      }
      if (msg.type === "HEROES") {
        answered = true;
        heroesIn = true;
        const heroes = msg.heroes;
        setState((prev) => ({ ...prev, heroes, offline: false }));
        if (!lobbiesIn) grace = setTimeout(() => ws.close(), LOBBIES_GRACE_MS);
        closeWhenDone();
      }
      if (msg.type === "LOBBIES" && withLobbies) {
        lobbiesIn = true;
        const lobbies = msg.lobbies;
        setState((prev) => ({ ...prev, lobbies }));
        closeWhenDone();
      }
    };
    ws.onclose = () => {
      if (!answered) setState({ heroes: null, offline: true });
    };
    return () => {
      // Unmount/re-run: suppress the onclose handler so tearing down a healthy
      // socket never reports offline.
      answered = true;
      if (grace) clearTimeout(grace);
      disposeStale();
      ws.close();
    };
  }, [wsUrl, debug, autoReload, withLobbies]);

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
