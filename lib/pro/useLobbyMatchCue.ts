/**
 * "Match found" cue (issue #689) — the effects half: the chime and the tab
 * title. The DECISION lives in lobbyCue.ts (pure, unit-tested); this hook only
 * feeds it observations and acts on what it returns.
 *
 * Why it exists: a player who opens a room — Quick Match (#687) or a plain
 * invite link — tabs away while they wait, and until now the game just… started,
 * silently, behind another tab. So: one polite chime, plus a tab title nobody
 * can miss out of the corner of their eye.
 *
 * The title only changes while the tab is HIDDEN (a visible tab already shows
 * the board) and is put back the moment the player returns. Mute silences the
 * sound only — the title cue always runs, because it is the half a muted
 * player is relying on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "./sfx";
import {
  advanceLobbyCue,
  initialLobbyCueState,
  LobbyCue,
  LobbyCueState,
  MATCH_FOUND_TITLE,
  seatFilledTitle,
  WAITING_TITLE,
} from "./lobbyCue";

export interface UseLobbyMatchCueOptions {
  /** the room we are seated in; a change resets the cue state */
  roomId: string | null;
  /** we hold an acked seat (ROOM_CREATED/ROOM_JOINED landed) */
  seated: boolean;
  seatsFilled: number;
  requiredPlayers: number;
  /** the first STATE for this room has arrived — the game is on */
  started: boolean;
  /** a bot fills (or is planned for) a seat: no wait, so never a cue */
  hasBot: boolean;
  /** the shared Pro sound setting (useGameFx). false = chime muted, title still fires. */
  soundOn: boolean;
}

/** what the hook is currently showing/waiting on — exposed for tests + the UI */
export interface LobbyMatchCueStatus {
  /** the last cue played (null until one fires) */
  lastCue: LobbyCue | null;
}

const isHidden = (): boolean => typeof document !== "undefined" && document.hidden;

export function useLobbyMatchCue(opts: UseLobbyMatchCueOptions): LobbyMatchCueStatus {
  const { roomId, seated, seatsFilled, requiredPlayers, started, hasBot, soundOn } = opts;

  const stateRef = useRef<LobbyCueState>(initialLobbyCueState());
  const roomRef = useRef<string | null>(null);
  const [lastCue, setLastCue] = useState<LobbyCue | null>(null);
  // The loud/soft title currently claimed by a cue; cleared when the player
  // returns. Mirrored into a ref because the cue and the title live in the SAME
  // commit: the state value the title effect closed over is one render stale,
  // and reading it would blink the page's own title in between (see below).
  const [cueTitle, setCueTitle] = useState<string | null>(null);
  const cueTitleRef = useRef<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  // decode the bank up front — by the time the opponent lands the buffer has to
  // be there (idempotent; useGameFx calls this too)
  useEffect(() => {
    sfx.init();
  }, []);

  // live tab visibility. `focus` is belt-and-braces for browsers that fire it
  // without a visibilitychange (and it is the event a click-back always sends).
  useEffect(() => {
    if (typeof document === "undefined") return;
    setHidden(document.hidden);
    const sync = () => setHidden(document.hidden);
    const onFocus = () => setHidden(false);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // coming back to the tab consumes the cue — the title goes back to normal and
  // a later tab-away doesn't re-shout an announcement already seen
  useEffect(() => {
    if (hidden) return;
    cueTitleRef.current = null;
    setCueTitle(null);
  }, [hidden]);

  // The quiet background title covers the whole pre-game sit, INCLUDING the
  // heartbeat between the last seat landing and the first STATE — otherwise the
  // title drops back to the page's own for that beat and the tab flickers on its
  // way to the announcement.
  const waiting = seated && !started && requiredPlayers > 1;

  // The decision. Runs on every change of the signals it reads; the reducer is
  // what makes it fire at most once per room.
  useEffect(() => {
    if (roomRef.current !== roomId) {
      roomRef.current = roomId;
      stateRef.current = initialLobbyCueState();
    }
    const { state, cue } = advanceLobbyCue(stateRef.current, {
      seated,
      seatsFilled,
      requiredPlayers,
      started,
      hasBot,
      now: Date.now(),
    });
    stateRef.current = state;
    if (!cue) return;
    setLastCue(cue);
    if (soundRef.current) {
      // the soft per-seat cue is the same chime, quieter and a touch brighter
      if (cue === "start") sfx.play("match-found");
      else sfx.play("match-found", { volume: 0.4, rate: 1.12 });
    }
    if (isHidden()) {
      const title =
        cue === "start" ? MATCH_FOUND_TITLE : seatFilledTitle(seatsFilled, requiredPlayers);
      cueTitleRef.current = title;
      setCueTitle(title);
    }
  }, [roomId, seated, seatsFilled, requiredPlayers, started, hasBot]);

  // The title itself: a cue's shout wins, a hidden waiting tab gets the quiet
  // line, and anything else means the page's own title stands. The original is
  // captured on the first override and restored on the last one.
  const originalRef = useRef<string | null>(null);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;
  const restore = useCallback(() => {
    if (typeof document === "undefined" || originalRef.current === null) return;
    document.title = originalRef.current;
    originalRef.current = null;
  }, []);

  // Render-time intent: the value that decides WHEN the effect runs. The effect
  // itself re-derives from the refs, because the cue that fires in this same
  // commit (the effect above, declared first) has already moved the goalposts —
  // trusting this stale value would restore the page title for one frame on the
  // way to the announcement.
  const desiredTitle = !hidden ? null : cueTitle ?? (waiting ? WAITING_TITLE : null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const want = !hiddenRef.current
      ? null
      : cueTitleRef.current ?? (waitingRef.current ? WAITING_TITLE : null);
    if (want === null) {
      restore();
      return;
    }
    if (originalRef.current === null) originalRef.current = document.title;
    document.title = want;
  }, [desiredTitle, restore]);

  // never leave a hijacked title behind on navigation
  useEffect(() => restore, [restore]);

  return { lastCue };
}
