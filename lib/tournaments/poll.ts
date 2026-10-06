import { useEffect, useRef } from "react";

/** Shared polling rules (#1265): back off on errors, pause while the tab is hidden. */

export const MAX_POLL_MS = 60_000;

/** The interval after `failures` errors in a row: doubles each time, capped at 60 s. */
export const pollDelay = (baseMs: number, failures: number): number =>
  Math.min(MAX_POLL_MS, baseMs * 2 ** Math.min(failures, 10));

export const tabHidden = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden";

export type PollVerdict = "ok" | "fail" | "stop";

/**
 * Runs `tick` once now, then every `baseMs` (backed off after failures), never while the tab
 * is hidden, and once straight away when it becomes visible. `tick` returns
 * "stop" to end the polling for good. Returns the cancel function.
 */
export const startPoll = (baseMs: number, tick: () => Promise<PollVerdict>): (() => void) => {
  let alive = true;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  const schedule = () => {
    if (!alive) return;
    clearTimeout(timer);
    timer = setTimeout(run, pollDelay(baseMs, failures));
  };
  const run = async () => {
    if (!alive) return;
    if (tabHidden() || busy) return schedule();
    busy = true;
    const verdict = await tick().catch((): PollVerdict => "fail");
    busy = false;
    if (!alive || verdict === "stop") return;
    failures = verdict === "fail" ? failures + 1 : 0;
    schedule();
  };
  const onVisible = () => {
    if (!tabHidden() && alive) {
      clearTimeout(timer);
      void run();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  void run();
  return () => {
    alive = false;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
};

/**
 * The hook side of the same rules: calls `reload` every backed-off interval
 * while enabled and visible, and once when the tab becomes visible again.
 * `failures` is the count of consecutive failed loads (it doubles the delay).
 */
export const usePoll = (enabled: boolean, baseMs: number, failures: number, reload: () => void) => {
  useEffect(() => {
    if (!enabled || baseMs <= 0) return;
    const id = window.setInterval(() => {
      if (!tabHidden()) reload();
    }, pollDelay(baseMs, failures));
    const onVisible = () => {
      if (!tabHidden()) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, baseMs, failures, reload]);
};

/** Consecutive failed loads of `loaded` ("unavailable"), reset by a success. */
export const useFailureCount = (status: string, identity: unknown): number => {
  const seen = useRef<unknown>(null);
  const count = useRef(0);
  if (seen.current !== identity) {
    seen.current = identity;
    if (status === "unavailable") count.current += 1;
    else if (status === "ready") count.current = 0;
  }
  return count.current;
};
