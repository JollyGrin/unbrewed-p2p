/**
 * Client-owned copy of one of MY relay blobs (issues #496, #807).
 *
 * The relay is a whole-blob last-write-wins store that rebroadcasts the whole
 * room on every message from any player, so an inbound frame can carry my
 * blob as the relay last knew it — older than a write still in flight. Serving
 * my own state out of that echo is what duplicated cards: a play went out, a
 * stale frame put the card back in hand (the token lives on the other
 * channel), and the next send made that permanent for everyone.
 *
 * So the client owns its blobs. Every send commits here under a `rev`, and an
 * inbound copy of my own blob only replaces the committed one when it is
 * strictly newer (another tab under my name). My own echo — an equal rev — is
 * ignored, which also keeps object identity stable for closures that outlive
 * a render (a drag's pointerup).
 *
 * `rev` is a hybrid clock — max(last + 1, Date.now()) — not a bare counter,
 * so a refreshed page (whose counter would restart at 0) still outranks every
 * blob its previous session wrote, even if that session's replay arrives late.
 *
 * The join hold (#807 — read research/incident-2026-09-13-relay-gate-797.md
 * before touching it). Until the relay's join replay lands, I don't know what
 * it holds for me: after a refresh it has my real pool, and an early send
 * (the hand's 500ms auto-init, the map re-broadcast on open) would overwrite
 * it. So a channel created unsynced HOLDS sends made before the replay —
 * provisional state, flushed when the replay lands. The hold is never a gate:
 * `releaseOwn()` also flushes it when no replay arrives within a grace period
 * after the socket opens, because a relay is not obliged to replay anything
 * (the pre-July prod relay never replayed positions, and a hard gate on that
 * took every table down). A channel with no early sends worth holding is
 * created synced and never holds.
 *
 * Mutates the channel in place: it lives in a ref and is read synchronously.
 */
export interface Revisioned {
  rev?: number;
}

export interface OwnChannel<T extends Revisioned> {
  /** My blob as I last wrote it (sent, held, or adopted from the relay). */
  current?: T;
  /** Rev of `current` once committed; the next commit goes above it. */
  rev: number;
  /** The join replay landed, or the grace period gave up waiting for it. */
  synced: boolean;
  /** A send was made while unsynced; `current` is provisional until flushed. */
  held: boolean;
}

export const newOwnChannel = <T extends Revisioned>(
  synced = false,
): OwnChannel<T> => ({ rev: 0, synced, held: false });

const revOf = (blob: Revisioned | undefined) =>
  typeof blob?.rev === "number" ? blob.rev : 0;

// Blobs are JSON on the wire and my echo is my own send re-parsed, so equal
// serialisations mean the same write (undefined fields drop out of both).
const sameBlob = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * A send. Returns the blob to put on the wire, or undefined when it is held
 * (unsynced) — either way `current` is what the UI should render now.
 */
export const commitOwn = <T extends Revisioned>(
  own: OwnChannel<T>,
  blob: T,
  now = Date.now(),
): T | undefined => {
  if (!own.synced) {
    own.current = blob;
    own.held = true;
    return undefined;
  }
  own.rev = Math.max(own.rev + 1, now);
  const stamped = { ...blob, rev: own.rev };
  own.current = stamped;
  own.held = false; // this send carries whatever was held
  return stamped;
};

/**
 * An inbound copy of my own blob (`undefined` when the frame has none).
 * Returns whether `current` changed.
 *
 * The first frame after mount is the join replay: it is what the relay holds
 * for me, so it replaces anything provisional — unless `keepProvisional` says
 * the replay is only the relay's empty placeholder for a brand-new player and
 * the held send is the better first state. Later frames are adopted only when
 * strictly newer than my last write.
 */
export const receiveOwn = <T extends Revisioned>(
  own: OwnChannel<T>,
  echo: T | undefined,
  keepProvisional: (echo: T | undefined, held: T) => boolean = (e) => !e,
): boolean => {
  const valid = echo && typeof echo === "object" ? echo : undefined;
  if (!own.synced) {
    own.synced = true;
    own.rev = Math.max(own.rev, revOf(valid));
    if (own.held && own.current && keepProvisional(valid, own.current))
      return false;
    if (!valid) return false;
    own.current = valid;
    return true;
  }
  if (!valid) return false;
  const echoRev = revOf(valid);
  if (own.current !== undefined) {
    if (echoRev < own.rev) return false;
    // An equal rev is my own echo — unless another tab under my name wrote
    // the same rev (same millisecond). Then the relay's copy is the one
    // everyone else sees: take it, so the tabs can't stay split on a tie.
    // A held blob was never sent, so the relay can only have an older me.
    if (echoRev === own.rev && (own.held || sameBlob(valid, own.current)))
      return false;
  }
  own.current = valid;
  own.rev = Math.max(own.rev, echoRev);
  return true;
};

/**
 * Stop waiting for a replay that hasn't come (grace period elapsed). After
 * this, sends go straight out; the caller flushes anything held.
 */
export const releaseOwn = <T extends Revisioned>(own: OwnChannel<T>): void => {
  own.synced = true;
};

/**
 * Take the held flag once the channel is synced: true means a send was held
 * and the caller must re-send `current` (which commits and stamps it).
 */
export const takeHeld = <T extends Revisioned>(own: OwnChannel<T>): boolean => {
  if (!own.synced || !own.held) return false;
  own.held = false;
  return true;
};
