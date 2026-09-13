/**
 * Client-owned copy of one of MY relay blobs (issue #496).
 *
 * The relay is a whole-blob last-write-wins store that rebroadcasts the entire
 * room on every message from any player, so an inbound frame can carry my blob
 * as the server last knew it — older than a write still in flight. Serving my
 * own state out of that echo is what duplicated cards: a play went out, a
 * stale frame put the card back in hand (the token lives on the other
 * channel), and the next send made that permanent for everyone.
 *
 * So the client owns its blobs. Every send commits here under a monotonic
 * `rev`; an inbound copy of my own blob is adopted only when I know nothing
 * yet (the join replay after a refresh) or when it is strictly newer than
 * anything I wrote (another tab under my name). My own echo — an equal rev —
 * is ignored, which also keeps object identity stable for closures that
 * outlive a render (a drag's pointerup).
 *
 * Mutates `own` in place: it lives in a ref and is read synchronously.
 */
export interface Revisioned {
  rev?: number;
}

export interface OwnBlob<T extends Revisioned> {
  /** The blob I last committed (sent, or adopted from a newer echo). */
  current?: T;
  /** Highest rev committed; the next send is `rev + 1`. */
  rev: number;
}

export const newOwnBlob = <T extends Revisioned>(): OwnBlob<T> => ({ rev: 0 });

/** Stamp the next rev onto an outgoing blob and make it the committed copy. */
export const commitOwn = <T extends Revisioned>(
  own: OwnBlob<T>,
  blob: T,
): T => {
  own.rev += 1;
  const stamped = { ...blob, rev: own.rev };
  own.current = stamped;
  return stamped;
};

/**
 * Adopt an inbound copy of my own blob when allowed. Returns whether it was.
 * Blobs from clients predating `rev` read as rev 0, so they only ever seed.
 */
export const adoptOwnEcho = <T extends Revisioned>(
  own: OwnBlob<T>,
  echo: T | undefined,
): boolean => {
  if (!echo || typeof echo !== "object") return false;
  const echoRev = typeof echo.rev === "number" ? echo.rev : 0;
  if (own.current !== undefined && echoRev <= own.rev) return false;
  own.current = echo;
  own.rev = Math.max(own.rev, echoRev);
  return true;
};
