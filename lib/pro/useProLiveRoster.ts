import { useEffect, useState } from "react";
import { EncounterListing, HeroListing, PROTOCOL_VERSION, ServerMsg } from "./protocol";

/**
 * One-shot LIST_HEROES fetch for pages that just need to know which heroes
 * the live Pro server currently supports (e.g. the /pro landing roster) —
 * without the reconnect/room machinery useProSocket carries for gameplay.
 * Returns null until the server replies (or the fetch never resolves), so a
 * hero's "ready" status can fall back to a hardcoded default until then.
 *
 * `debug` (v15): when true, sends `LIST_HEROES { debug: true }` so the server
 * includes `tier === 'reflavored'` heroes in the reply (hidden by default).
 */
export function useProLiveRoster(
  wsUrl: string | undefined,
  debug = false
): HeroListing[] | null {
  const [heroes, setHeroes] = useState<HeroListing[] | null>(null);

  useEffect(() => {
    if (!wsUrl) return;
    const ws = new WebSocket(wsUrl);
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
      if (msg.type === "HEROES") {
        setHeroes(msg.heroes);
        ws.close();
      }
    };
    return () => ws.close();
  }, [wsUrl, debug]);

  return heroes;
}

/**
 * One-shot LIST_ENCOUNTERS fetch for the hidden Campaign entry points. Kept
 * separate from useProLiveRoster on purpose: Campaign bosses are not public
 * roster heroes and should never become selectable normal-room fighters.
 */
export function useProLiveEncounters(
  wsUrl: string | undefined,
  debug = false
): EncounterListing[] | null {
  const [encounters, setEncounters] = useState<EncounterListing[] | null>(null);

  useEffect(() => {
    if (!wsUrl) return;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          type: "LIST_ENCOUNTERS",
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
      if (msg.type === "ENCOUNTERS") {
        setEncounters(msg.encounters);
        ws.close();
      }
    };
    return () => ws.close();
  }, [wsUrl, debug]);

  return encounters;
}
