/**
 * The "juice" hook for Pro matches: diffs each server snapshot into FxEvents
 * (fxEvents.ts), plays the matching sounds (sfx.ts) and manages the transient
 * board visuals (floating damage numbers, block/K.O. bursts) plus the
 * hurt-vignette trigger. Both channels have persistent toggles (localStorage)
 * surfaced as chips in the HUD.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { GameEvent, PlayerView, SpaceId } from "./protocol";
import { diffFxEvents } from "./fxEvents";
import { sfx } from "./sfx";

/** one transient overlay on the board, anchored to a space */
export interface BoardFxItem {
  key: string;
  space: SpaceId;
  kind: "damage" | "heal" | "blocked" | "defeat";
  label: string;
}

const BOARD_FX_TTL_MS = 1600;

/** boolean persisted per-browser; defaults ON; hydration-safe (reads after mount) */
const useStoredToggle = (storageKey: string): [boolean, () => void] => {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(storageKey) !== "off");
    } catch {
      /* storage blocked — stay on */
    }
  }, [storageKey]);
  const toggle = useCallback(() => {
    setOn((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(storageKey, next ? "on" : "off");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);
  return [on, toggle];
};

export function useGameFx(snapshot: { view: PlayerView; events?: GameEvent[] } | null) {
  const [soundOn, toggleSoundStored] = useStoredToggle("pro-sound-fx");
  const [visualOn, toggleVisual] = useStoredToggle("pro-visual-fx");
  const [boardFx, setBoardFx] = useState<BoardFxItem[]>([]);
  // increments when YOUR hero takes damage — keys the red vignette flash
  const [hurtKey, setHurtKey] = useState(0);

  const prevViewRef = useRef<PlayerView | null>(null);
  const seqRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // effects read the live toggle values without re-running on toggle
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const visualRef = useRef(visualOn);
  visualRef.current = visualOn;

  useEffect(() => {
    sfx.init();
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // toggling sound back on gives instant feedback (and the click unlocks audio)
  const toggleSound = useCallback(() => {
    if (!soundRef.current) sfx.play("turn", { volume: 0.7 });
    toggleSoundStored();
  }, [toggleSoundStored]);

  useEffect(() => {
    if (!snapshot) return;
    const events = diffFxEvents(prevViewRef.current, snapshot.view, snapshot.events);
    prevViewRef.current = snapshot.view;
    if (events.length === 0) return;

    const sound = soundRef.current;
    const visual = visualRef.current;
    const added: BoardFxItem[] = [];
    const addFx = (space: SpaceId | null, kind: BoardFxItem["kind"], label: string) => {
      if (!visual || !space) return;
      added.push({ key: `fx-${seqRef.current++}`, space, kind, label });
    };

    for (const e of events) {
      switch (e.type) {
        case "commit":
          if (sound) sfx.play("commit");
          break;
        case "reveal":
          if (sound) {
            sfx.play("flip");
            // defender's card flips 0.18s after the attacker's (CombatSlot revealDelay)
            if (e.count === 2) sfx.play("flip", { delayMs: 180 });
          }
          break;
        case "draw":
          if (sound) sfx.play("draw");
          break;
        case "damage":
          if (sound) sfx.play(e.amount >= 3 ? "hit-heavy" : "hit");
          addFx(e.space, "damage", `−${e.amount}`);
          if (visual && e.mine && e.heroHit) setHurtKey((k) => k + 1);
          break;
        case "heal":
          if (sound) sfx.play("heal");
          addFx(e.space, "heal", `+${e.amount}`);
          break;
        case "blocked":
          if (sound) sfx.play("blocked");
          addFx(e.space, "blocked", "BLOCKED");
          break;
        case "defeated":
          // your own fighter falling tolls lower
          if (sound) sfx.play("defeat", e.mine ? { rate: 0.8 } : undefined);
          addFx(e.space, "defeat", "K.O.");
          break;
        case "turn":
          if (sound) sfx.play("turn");
          break;
        case "victory":
          if (sound) sfx.play("victory");
          break;
        case "loss":
          if (sound) sfx.play("loss");
          break;
      }
    }

    if (added.length > 0) {
      setBoardFx((cur) => [...cur, ...added]);
      const keys = new Set(added.map((i) => i.key));
      timersRef.current.push(
        setTimeout(() => setBoardFx((cur) => cur.filter((i) => !keys.has(i.key))), BOARD_FX_TTL_MS)
      );
    }
  }, [snapshot]);

  return { boardFx, hurtKey, soundOn, visualOn, toggleSound, toggleVisual };
}
