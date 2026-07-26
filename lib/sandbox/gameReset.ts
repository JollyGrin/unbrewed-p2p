import { PlayerState, ResetRequest, ResetVote } from "@/lib/gamesocket/message";

/**
 * Room-wide "New game" reset (docs/game-reset-plan.md).
 *
 * The relay is write-your-own-blob-only, so a reset can't be a server call: it
 * is a convergent signal every client applies to itself, exactly like the
 * shared map. Three fields ride the blob — a `resetRequest` (proposer), a
 * `resetVote` per player (consent), and `resetEpoch` (the only field that
 * actually triggers a wipe).
 *
 * Everything here is pure so the adopt rule can be tested as a table
 * (gameReset.test.ts) without a socket, a pool, or React.
 */

/** Requests nobody answers (a ghost blob) expire — matches CLAIM_TTL_MS. */
export const RESET_REQUEST_TTL_MS = 60_000;

export type ResetPlayers = Record<string, PlayerState | undefined>;

export const isRequestExpired = (request: ResetRequest, now: number): boolean =>
  now - request.at >= RESET_REQUEST_TTL_MS;

/** Highest reset epoch anyone in the room has applied. */
export const maxResetEpoch = (players: ResetPlayers): number =>
  Object.values(players).reduce(
    (max, player) => Math.max(max, player?.resetEpoch ?? 0),
    0,
  );

/**
 * The epoch a commit should publish: one past anything we've seen. Two players
 * committing concurrently both land on the same number, so the room converges
 * on one epoch and each client wipes exactly once.
 */
export const nextEpoch = (players: ResetPlayers, myEpoch: number): number =>
  Math.max(maxResetEpoch(players), myEpoch) + 1;

export type EpochAction =
  /** Already up to date — nothing to do. */
  | "none"
  /** Someone reset while we were away (or just now): wipe and re-seed. */
  | "wipe"
  /** Record the epoch without wiping — we have nothing to wipe yet. */
  | "adopt";

/**
 * The adopt rule, and the whole of the reset's correctness:
 *
 *     apply the wipe iff maxEpoch > myEpoch
 *
 * `myEpoch` is what *this player* has already applied — seeded from the
 * relay's replay of our own blob on the first snapshot, so it survives a
 * refresh. No seed-suppression flag is needed (contrast the dice path, which
 * needs `hasSeededRollsRef` precisely because it has no per-player marker):
 *
 * - refresh after a reset → my replayed blob carries the epoch → equal → none
 * - stale rejoin          → my replayed blob carries the OLD epoch → wipe
 * - brand-new joiner      → epoch 0 < max but no pool yet → adopt, no wipe
 */
export const resolveResetEpoch = (args: {
  players: ResetPlayers;
  self: string;
  /** Highest epoch we have applied locally (>= our own blob's value). */
  myEpoch: number;
  /** Whether we have a pool to wipe. A joiner with none only adopts. */
  hasPool: boolean;
}): { epoch: number; action: EpochAction; by?: string } => {
  const { players, self, myEpoch, hasPool } = args;
  const epoch = Math.max(maxResetEpoch(players), myEpoch);
  if (epoch <= myEpoch) return { epoch: myEpoch, action: "none" };
  return {
    epoch,
    action: hasPool ? "wipe" : "adopt",
    by: committerOf(players, self, epoch),
  };
};

/**
 * Who to name in the log line. The epoch itself carries no author, so we
 * attribute it to a remote player already advertising it (the committer, i.e.
 * the proposer). Ties are broken by name so every client logs the same name.
 */
const committerOf = (
  players: ResetPlayers,
  self: string,
  epoch: number,
): string | undefined =>
  Object.entries(players)
    .filter(([name, player]) => name !== self && (player?.resetEpoch ?? 0) === epoch)
    .map(([name]) => name)
    .sort()[0];

/**
 * Who has to accept before the proposer may commit: every OTHER player who has
 * a pool, i.e. is actually playing. A seat with no pool has nothing to lose by
 * the wipe, so it never blocks (this is also what makes a solo lobby and
 * /offline commit immediately, with no consent step at all).
 */
export const requiredVoters = (
  players: ResetPlayers,
  proposer: string,
): string[] =>
  Object.entries(players)
    .filter(([name, player]) => name !== proposer && !!player?.pool)
    .map(([name]) => name)
    .sort();

const voteFor = (
  player: PlayerState | undefined,
  requestId: string,
): ResetVote | undefined =>
  (player?.resetVotes ?? []).find((vote) => vote.requestId === requestId);

export type RequestOutcome = "waiting" | "commit" | "declined";

/**
 * Tally a request the local player proposed. Unanimous accept commits; a
 * single decline drops it; otherwise we keep waiting on the named seats (which
 * the dialog shows, and which may include a ghost blob — hence "Reset anyway"
 * once the request expires).
 */
export const evaluateResetRequest = (args: {
  players: ResetPlayers;
  proposer: string;
  request: ResetRequest;
}): { outcome: RequestOutcome; waitingOn: string[]; declinedBy?: string } => {
  const { players, proposer, request } = args;
  const voters = requiredVoters(players, proposer);

  const declinedBy = voters.find(
    (name) => voteFor(players[name], request.id)?.accept === false,
  );
  if (declinedBy) return { outcome: "declined", waitingOn: [], declinedBy };

  const waitingOn = voters.filter(
    (name) => voteFor(players[name], request.id)?.accept !== true,
  );
  return {
    outcome: waitingOn.length === 0 ? "commit" : "waiting",
    waitingOn,
  };
};

/**
 * A live request from someone else that we haven't answered yet. Expired
 * requests are ignored so a prompt from a long-departed proposer never
 * resurfaces; refreshing mid-request DOES re-show the prompt (the request
 * lives on their blob), which is why answering has to be idempotent.
 *
 * `myVotes` is the caller's LOCAL vote list, not the copy on our replayed
 * blob: answering has to hide the prompt immediately, not a round-trip later.
 */
export const incomingResetRequest = (args: {
  players: ResetPlayers;
  self: string;
  now: number;
  myVotes: ResetVote[];
}): { from: string; request: ResetRequest } | undefined => {
  const { players, self, now, myVotes } = args;
  const answered = new Set(myVotes.map((vote) => vote.requestId));
  return Object.entries(players)
    .filter(([name]) => name !== self)
    .flatMap(([name, player]) => {
      const request = player?.resetRequest;
      if (!request?.id || isRequestExpired(request, now)) return [];
      if (answered.has(request.id)) return [];
      return [{ from: name, request }];
    })
    .sort((a, b) => a.request.at - b.request.at || a.from.localeCompare(b.from))[0];
};

/**
 * Drop votes for requests nobody advertises anymore, so the list stays bounded
 * across a long session (same shape as the transfer-ack pruning).
 */
export const pruneResetVotes = (
  votes: ResetVote[],
  players: ResetPlayers,
): ResetVote[] => {
  const live = new Set(
    Object.values(players)
      .map((player) => player?.resetRequest?.id)
      .filter((id): id is string => !!id),
  );
  return votes.filter((vote) => live.has(vote.requestId));
};
