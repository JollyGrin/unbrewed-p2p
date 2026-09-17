/**
 * Turn reminder (player request: "I play matches alongside other things and
 * forget it's my move") — the effects half, structured like
 * useLobbyMatchCue.ts: the DECISION lives in the pure reducer
 * (turnReminder.ts); this hook only feeds it observations and acts on what
 * it returns.
 *
 * Three channels, because no single one reaches every player:
 *  - Vibration where the browser exposes one (Android Chrome, …). iOS Safari
 *    has NO `navigator.vibrate` at all — not gated behind a permission, the
 *    API simply doesn't exist there — so this can never be the channel an
 *    iPhone player relies on. It is a bonus on top of the other two, never
 *    the carrier.
 *  - The shared "turn" sound (sfx.ts) when the player's sound setting is on —
 *    audible with the tab foregrounded OR backgrounded, on every platform,
 *    which makes it the one channel that actually reaches an iPhone.
 *  - A visible cue: a quiet, repeatable on-screen pulse (see
 *    components/Pro/TurnReminderCue.tsx) while the tab is in front, and —
 *    mirroring the lobby cue's trick — the document title while it's hidden.
 *
 * Unlike the lobby cue, a player who has simply stopped touching the app
 * produces no new views at all, so a ticking interval (not just the `view`
 * effect) is what actually notices the silence. Both paths call the same
 * `check`, which re-derives `owed`/`progressKey` from the CURRENT view via
 * refs — replaying an identical check is a no-op in the pure reducer, so a
 * re-applied snapshot batch (drainApplyQueue) can never double-fire a nudge.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "./sfx";
import {
  advanceTurnReminder,
  initialTurnReminderState,
  TurnReminderReason,
  TurnReminderState,
} from "./turnReminder";
import type { PlayerView } from "./protocol";

/** How often the wall clock is re-checked between view changes. Coarser than
 *  the reminder's own thresholds (see turnReminder.ts) on purpose — this only
 *  needs to notice a threshold has passed, not measure it precisely. */
const TICK_MS = 5_000;

/** Tab title while the reminder is showing and the tab is backgrounded —
 *  unmissable in a tab strip, same trick as lobbyCue.ts's titles. */
const NUDGE_TITLE: Record<TurnReminderReason, string> = {
  turn: "⏰ Still your turn…",
  defense: "⏰ Still your move to defend…",
};

/** One fired nudge, for the foreground on-screen cue — `key` changes on every
 *  nudge so a host component can key a remount off it and replay its pulse. */
export interface TurnReminderPulse {
  key: number;
  reason: TurnReminderReason;
}

export interface UseTurnReminderOptions {
  /** null before the first STATE lands (pre-game) — this hook has to run
   *  unconditionally, ahead of the page's own "no snapshot yet" early return,
   *  same shape as useGameFx's nullable `snapshot`. */
  view: PlayerView | null;
  /** the per-device setting (useTurnReminderSetting.ts). Off means silence on
   *  every channel, including the title — unlike sound-only mute elsewhere in
   *  Pro, a player who turned this off asked not to be reminded at all. */
  enabled: boolean;
  /** the shared Pro sound setting (useGameFx.ts's soundOn) */
  soundOn: boolean;
}

export interface TurnReminderStatus {
  /** the most recent nudge, for a host component to render the on-screen
   *  pulse off — null until the first one fires. */
  pulse: TurnReminderPulse | null;
}

const isHidden = (): boolean => typeof document !== "undefined" && document.hidden;

/**
 * What this seat currently owes, or null. Pre-game (no view yet), spectator,
 * setup, and game-over all fall out of these same checks rather than needing
 * special cases: a spectator's (a "god view") view carries no seat flagged
 * `you: true` (see teams.ts), `phase !== "PLAY"` covers setup, and `winner`
 * covers game-over.
 */
function owedReasonOf(view: PlayerView | null): TurnReminderReason | null {
  if (!view) return null;
  if (view.phase !== "PLAY" || view.winner) return null;
  if (!view.players.some((p) => p.you)) return null;
  if (view.combat?.stage === "COMMIT_DEFENSE" && view.combat.defenderPlayer === view.you) {
    return "defense";
  }
  if (view.activePlayer === view.you) return "turn";
  return null;
}

/** A value that changes whenever the CURRENT ask changes shape without the
 *  reason itself flipping — an action taken, a prompt resolving, a combat
 *  stage advancing. See turnReminder.ts's `progressKey` contract. */
function progressKeyOf(view: PlayerView, reason: TurnReminderReason): string {
  if (reason === "defense") {
    return `defense:${view.combat?.stage}:${view.combat?.attacker}:${view.combat?.target}:${view.prompt?.promptId ?? ""}`;
  }
  return `turn:${view.turnNumber}:${view.actionsRemaining}:${view.turnPhase}:${view.prompt?.promptId ?? ""}`;
}

export function useTurnReminder({ view, enabled, soundOn }: UseTurnReminderOptions): TurnReminderStatus {
  const stateRef = useRef<TurnReminderState>(initialTurnReminderState());
  const viewRef = useRef(view);
  viewRef.current = view;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const pulseSeqRef = useRef(0);

  const [pulse, setPulse] = useState<TurnReminderPulse | null>(null);
  const [cueTitle, setCueTitle] = useState<string | null>(null);

  // decode the bank up front, same as every other Pro sound consumer — idempotent
  useEffect(() => {
    sfx.init();
  }, []);

  const check = useCallback(() => {
    if (!enabledRef.current) return;
    const v = viewRef.current;
    const reason = owedReasonOf(v);
    const signals = {
      owed: reason,
      progressKey: reason && v ? progressKeyOf(v, reason) : "",
      now: Date.now(),
    };
    const { state, due } = advanceTurnReminder(stateRef.current, signals);
    stateRef.current = state;
    if (!due || !state.owed) return;

    // iOS Safari has no navigator.vibrate at all — this call is simply absent
    // there, never throws, and the other two channels below carry the nudge.
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(60);
    }
    if (soundRef.current) sfx.play("turn", { volume: 0.7 });

    pulseSeqRef.current += 1;
    setPulse({ key: pulseSeqRef.current, reason: state.owed });
    if (isHidden()) setCueTitle(NUDGE_TITLE[state.owed]);
  }, []);

  // a real event: re-check whenever a new view lands
  useEffect(() => {
    check();
  }, [view, check]);

  // …and a ticking interval, since a player who has stopped acting produces
  // no new views at all — the interval is what notices that silence.
  useEffect(() => {
    const id = setInterval(check, TICK_MS);
    return () => clearInterval(id);
  }, [check]);

  // switching the setting off mid-wait drops the clock entirely, so turning
  // it back on later starts fresh rather than nudging instantly off a stale
  // wait it wasn't watching.
  useEffect(() => {
    if (!enabled) stateRef.current = initialTurnReminderState();
  }, [enabled]);

  // the backgrounded-tab title: same restore-on-return contract as the lobby
  // cue (lib/pro/useLobbyMatchCue.ts) — returning to the tab consumes it.
  const originalTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (cueTitle === null) return;
    if (originalTitleRef.current === null) originalTitleRef.current = document.title;
    document.title = cueTitle;
  }, [cueTitle]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const restore = () => {
      if (document.hidden || originalTitleRef.current === null) return;
      document.title = originalTitleRef.current;
      originalTitleRef.current = null;
      setCueTitle(null);
    };
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("focus", restore);
    return () => {
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("focus", restore);
    };
  }, []);

  // never leave a hijacked title behind on navigation
  useEffect(
    () => () => {
      if (typeof document !== "undefined" && originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
      }
    },
    []
  );

  return { pulse };
}
