import { useEffect, useState } from "react";
import { HeroListing, PROTOCOL_VERSION, ServerMsg } from "./protocol";

/**
 * One-shot LIST_HEROES fetch for pages that just need to know which heroes
 * the live Pro server currently supports (e.g. the /pro landing roster) —
 * without the reconnect/room machinery useProSocket carries for gameplay.
 * Returns null until the server replies (or the fetch never resolves), so a
 * hero's "ready" status can fall back to a hardcoded default until then.
 */
export function useProLiveRoster(wsUrl: string | undefined): HeroListing[] | null {
  const [heroes, setHeroes] = useState<HeroListing[] | null>(null);

  useEffect(() => {
    if (!wsUrl) return;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "LIST_HEROES" }));
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
  }, [wsUrl]);

  return heroes;
}
