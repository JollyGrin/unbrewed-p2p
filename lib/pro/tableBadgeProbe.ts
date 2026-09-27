/**
 * Dev-only `?badgeProbe` (#902): every fighter on the TABLETOP wears every
 * badge it can — the "reach 2" tag, a pick number, a chip, a status dot and
 * (heroes) a flag badge — so `scripts/visual-probe/tableTextOcclusion.cjs` can
 * measure all of them in one real game instead of steering the engine into an
 * attack prompt. Only WHICH badges show is forced; where and how they draw is
 * the real renderer. Sticky for the tab (sessionStorage), because /pro/game
 * rewrites its URL once the room exists. Never on in a production build.
 */
import { useEffect, useState } from "react";
import type { FighterStatus } from "./protocol";
import type { FlagTokenBadge } from "./heroStateFlags";

const KEY = "pro-badge-probe";

export const useTableBadgeProbe = (): boolean => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    try {
      if (new URLSearchParams(window.location.search).has("badgeProbe")) window.sessionStorage.setItem(KEY, "1");
      setOn(window.sessionStorage.getItem(KEY) === "1");
    } catch {
      /* storage blocked — the probe stays off */
    }
  }, []);
  return on;
};

export const BADGE_PROBE_STATUS: FighterStatus = { kind: "PINNED" };
export const BADGE_PROBE_CHIP = "+1 ✦";
export const BADGE_PROBE_FLAG: FlagTokenBadge = {
  icon: "✦",
  label: "Probe",
  title: "badge probe",
  bg: "#2F5E3A",
  color: "#EAF7EC",
};
