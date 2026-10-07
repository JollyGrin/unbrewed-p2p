import { useEffect, useRef, useState } from "react";

/** Shared polling rules (#1265): back off on errors, pause while the tab is hidden. */

export const MAX_POLL_MS = 60_000;

/** The interval after `failures` errors in a row: doubles each time, capped at 60 s. */
export const pollDelay = (baseMs: number, failures: number): number =>
  Math.min(MAX_POLL_MS, baseMs * 2 ** Math.min(failures, 10));

export const tabHidden = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden";

export type PollVerdict = "ok" | "fail" | "stop";

/**
 * Runs `tick` once now (or first after one interval with `{ immediate: false }`),
 * then every `baseMs` (backed off after failures), never while the tab is
 * hidden, and once straight away when it becomes visible. `tick` returns
 * "stop" to end the polling for good. Returns the cancel function.
 */
export const startPoll = (
  baseMs: number,
  tick: () => Promise<PollVerdict>,
  { immediate = true }: { immediate?: boolean } = {},
): (() => void) => {
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
  if (immediate) void run();
  else schedule();
  return () => {
    alive = false;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
};

/**
 * The hook side of the same rules, on `startPoll`: calls `reload` every
 * backed-off interval while enabled and visible, and once when the tab becomes
 * visible again (the caller's own load covers the first fetch). `failures` is
 * the count of consecutive failed loads (it doubles the delay).
 */
export const usePoll = (enabled: boolean, baseMs: number, failures: number, reload: () => void) => {
  useEffect(() => {
    if (!enabled || baseMs <= 0) return;
    return startPoll(
      pollDelay(baseMs, failures),
      async () => {
        reload();
        return "ok";
      },
      { immediate: false },
    );
  }, [enabled, baseMs, failures, reload]);
};

/**
 * The one ticker countdowns share: `read()` (wall clock by default) re-sampled
 * every `ms` while `enabled`, and afresh whenever `restartOn` changes.
 */
export const useTicker = (
  ms = 1000,
  read: () => number = Date.now,
  enabled = true,
  restartOn?: unknown,
): number => {
  const [now, setNow] = useState(read);
  useEffect(() => {
    if (!enabled) return;
    setNow(read());
    const id = window.setInterval(() => setNow(read()), ms);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, enabled, restartOn]);
  return now;
};

/** A 404 is final only the second time in a row (one can be a deploy or replication blip). */
export const NOT_FOUND_LIMIT = 2;

/**
 * Consecutive failed ("unavailable") and not-found loads of `loaded`; a success
 * resets both. Counted once per distinct result (`identity`).
 */
export const useFailureCount = (status: string, identity: unknown): { failures: number; notFound: number } => {
  const seen = useRef<unknown>(null);
  const count = useRef({ failures: 0, notFound: 0 });
  if (seen.current !== identity) {
    seen.current = identity;
    const c = count.current;
    if (status === "unavailable") count.current = { failures: c.failures + 1, notFound: 0 };
    else if (status === "not_found") count.current = { failures: c.failures, notFound: c.notFound + 1 };
    else if (status === "ready") count.current = { failures: 0, notFound: 0 };
  }
  return count.current;
};
