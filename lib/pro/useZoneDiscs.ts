/**
 * The viewer's zone-disc preference for the tabletop (#1395): per device,
 * same shape as `useBoardView` — read from localStorage AFTER mount so the
 * server render and the first client paint agree, every storage access
 * guarded — and OFF when nothing is stored (see lib/pro/zoneDiscs.ts).
 */
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_ZONE_DISCS, parseZoneDiscs, serializeZoneDiscs } from "./zoneDiscs";

export const ZONE_DISCS_KEY = "pro-table-zone-discs";

export const useZoneDiscs = (): [boolean, () => void] => {
  const [on, setOn] = useState<boolean>(DEFAULT_ZONE_DISCS);

  useEffect(() => {
    try {
      setOn(parseZoneDiscs(window.localStorage.getItem(ZONE_DISCS_KEY)));
    } catch {
      /* storage blocked — the default (off) applies */
    }
  }, []);

  const toggleZoneDiscs = useCallback(() => {
    setOn((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(ZONE_DISCS_KEY, serializeZoneDiscs(next));
      } catch {
        /* storage blocked — the choice just won't survive a reload */
      }
      return next;
    });
  }, []);

  return [on, toggleZoneDiscs];
};
