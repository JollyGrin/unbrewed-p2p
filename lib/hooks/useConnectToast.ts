import { useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import type { ConnectionStatus } from "@/lib/gamesocket/socket";

export const CONNECT_TOAST_ID = "sandbox-connect";

export interface ConnectToastInfo {
  /** Hostname of the relay, never the full URL. */
  host: string;
  gid: string;
  /** Players already in the room, when a snapshot has landed. */
  players?: number;
  deckLoaded: boolean;
}

/**
 * Tells the player what the websocket is really doing (#1393): one success
 * toast the first time the socket reaches `open` in this mount, one failure
 * toast if it closes before ever opening, and a short "Reconnected" toast
 * after a drop. A fixed toast id keeps strict-mode mounts and retries from
 * stacking. `getInfo` is read at the moment of the status change, so the
 * toast carries whatever is known then without re-firing on later changes.
 */
export function useConnectToast(
  status: ConnectionStatus,
  getInfo: () => ConnectToastInfo,
) {
  const hasOpenedRef = useRef(false);
  const failedRef = useRef(false);
  const infoRef = useRef(getInfo);
  infoRef.current = getInfo;

  useEffect(() => {
    if (status === "open") {
      const info = infoRef.current();
      if (hasOpenedRef.current) {
        toast.success("Reconnected", { id: CONNECT_TOAST_ID });
        return;
      }
      hasOpenedRef.current = true;
      const lines = [`Connected to ${info.host}`, `Room ${info.gid}`];
      const extras = [
        info.players ? `${info.players} in room` : undefined,
        info.deckLoaded ? "deck loaded" : "no deck yet",
      ].filter(Boolean);
      lines.push(extras.join(" · "));
      toast.success(lines.join("\n"), { id: CONNECT_TOAST_ID });
    } else if (
      status === "closed" &&
      !hasOpenedRef.current &&
      !failedRef.current
    ) {
      failedRef.current = true;
      const info = infoRef.current();
      toast.error(`Failed to connect to GameServer: \n ${info.host}`, {
        id: CONNECT_TOAST_ID,
      });
    }
  }, [status]);
}
