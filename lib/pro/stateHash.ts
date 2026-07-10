import { PlayerView } from "./protocol";

/**
 * A short, stable, non-secret digest of a game view — quoted in the render-crash
 * error panel (see ProErrorBoundary) so a bug report can pin down exactly which
 * state the client choked on. NOT cryptographic and NOT the engine's replay
 * `stateHash`; just enough to tell two states apart at a glance. Built from
 * public, deterministic fields only (nothing redacted/hidden leaks), and kept
 * defensive: a malformed view is exactly the kind of thing that crashed the
 * render, so we must never throw while summarizing it.
 */
export function stateHash(view: PlayerView | null | undefined): string {
  if (!view) return "no-state";
  try {
    const fighters = Array.isArray(view.fighters) ? view.fighters : [];
    const key = [
      view.turnNumber,
      view.phase,
      view.turnPhase ?? "",
      view.activePlayer,
      view.actionsRemaining,
      ...fighters.map(
        (f) => `${f.id}:${f.hp}@${f.space ?? "-"}${f.defeated ? "x" : ""}`
      ),
    ].join("|");
    // djb2 — tiny, deterministic, dependency-free.
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  } catch {
    return "unhashable";
  }
}
