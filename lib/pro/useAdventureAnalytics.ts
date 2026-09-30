import { useEffect, useRef } from "react";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";
import { analyticsEnabled } from "@/lib/analytics";
import {
  trackExit,
  trackGameStarted,
  trackPromptLatency,
  trackRound,
  trackThreat,
  trackVerdict,
} from "@/lib/analytics/adventure";

/** The winner screen's rematch controls: the one-tap link and the negotiated offer button. */
const isRematchTarget = (t: EventTarget | null): boolean =>
  t instanceof Element && !!t.closest('a[href*="rematch=1"], [data-testid="rematch-offer"] button');

/**
 * Headless funnel tracker for the Adventure surface (#1097), mounted by
 * AdventureBoard so regular formats never run it. Reads the redacted view and the
 * STATE event batch only; every effect no-ops when analytics is disabled.
 */
export const useAdventureAnalytics = (view: PlayerView, events?: readonly GameEvent[]): void => {
  const on = analyticsEnabled();
  const viewRef = useRef(view);
  viewRef.current = view;
  const started = useRef(false);
  const lastRound = useRef<number | null>(null);
  const seenBatch = useRef<readonly GameEvent[] | undefined>(undefined);
  const verdictSent = useRef(false);
  const exited = useRef(false);
  const prompt = useRef<{ id: string; kind: string; team: boolean; at: number } | null>(null);

  // started + round milestones
  const round = view.initiative?.round ?? null;
  useEffect(() => {
    if (!on) return;
    if (!started.current) {
      started.current = true;
      trackGameStarted(view);
    }
    if (round != null && round !== lastRound.current) {
      lastRound.current = round;
      trackRound(view, round);
    }
  }, [on, round, view]);

  // threat + verdict from each STATE batch, once per batch
  useEffect(() => {
    if (!on || !events || seenBatch.current === events) return;
    seenBatch.current = events;
    for (const e of events) {
      if (e.type === "THREAT_CHANGED") trackThreat(view, e);
      else if (e.type === "GAME_ENDED" && !verdictSent.current) {
        verdictSent.current = true;
        trackVerdict(view, e.reason, round);
      }
    }
  }, [on, events, view, round]);

  // chooser-prompt latency: only prompts addressed to this seat
  const p = view.prompt;
  const mine = p && p.player === view.you ? p : null;
  const promptId = mine?.promptId ?? null;
  useEffect(() => {
    if (!on) return;
    const open = prompt.current;
    if (open && open.id !== promptId) {
      trackPromptLatency(open.kind, open.team, performance.now() - open.at);
      prompt.current = null;
    }
    if (mine && !prompt.current) {
      prompt.current = { id: mine.promptId, kind: mine.kind, team: mine.onBehalfOf === "TEAM", at: performance.now() };
    }
  }, [on, promptId, mine]);

  // rematch vs leave: a rematch click is seen (capture) before the page goes away
  useEffect(() => {
    if (!on) return;
    exited.current = false; // StrictMode remounts re-arm the exit report
    let rematch = false;
    const onClick = (ev: MouseEvent) => {
      if (viewRef.current.winner && isRematchTarget(ev.target)) rematch = true;
    };
    const finish = () => {
      if (exited.current) return;
      exited.current = true;
      trackExit(viewRef.current, rematch ? "rematch" : "leave", verdictSent.current);
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", finish);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", finish);
      finish();
    };
  }, [on]);
};
