/**
 * One-tap rematch (issue #TBD) — the pure half.
 *
 * "Getting a rematch going takes far too many taps on a phone" — the whole
 * point of this module is to answer one question without touching React,
 * sockets, or the router: given the setup a just-finished game was ACTUALLY
 * played with, what does a rematch's `CREATE_ROOM` look like, and how does
 * that travel from the winner screen (which has it) to a fresh page load
 * (which doesn't)?
 *
 * The engine at wss://engine.unbrewed.xyz is fixed — this client cannot add a
 * "hey, rematch?" push to the other seat. So the hand-over is a link: the
 * presser's `CREATE_ROOM` rides a URL (`rematchQuery` → `parseRematchQuery`),
 * and the room that creates then shows the OTHER seat's join link with THEIR
 * hero pre-filled (`joinHero`) — one tap for the presser, one tap plus a
 * paste for whoever they hand the link to. Nobody else's screen updates on
 * its own; that would need a server feature this client can't add.
 *
 * What carries over exactly, and why:
 *  - hero (yours), format, timer, mulligan, the map, and every bot seat's
 *    difficulty + hero: all of it is either broadcast to EVERY seat during
 *    the game (ROOM_STATUS's roster, echoed formatId/turnTimerSeconds) or
 *    lands in the REPLAY_BUNDLE both seats get at GAME_OVER (mulligan,
 *    mapId) — so any seat, not just the host, can propose a faithful
 *    rematch.
 *  - the battlefield-items opt-out is the one setting that genuinely can't
 *    be recovered: `CREATE_ROOM.itemsEnabled` is "not echoed back" by design
 *    (protocol.ts's own v34 note) — the creator's client knows because it
 *    set it, and nobody else ever learns the boolean, only its on-board
 *    effect. A rematch therefore always plays with items ON (the server
 *    default), even if the original game had them off. Documented, not
 *    silently wrong.
 *  - the seed is deliberately NEVER carried over — a rematch is a new game.
 */
import { BotDifficulty, BotSeatFill, PlayerId } from "./protocol";

/** The bit of a finished game's roster this module needs per seat — a
 *  trimmed `RoomStatusSeat` so this file stays decoupled from the wire type. */
export interface RematchRosterSeat {
  player: PlayerId;
  heroId: string;
  bot: BotDifficulty | null;
}

/** Everything a rematch could carry over, extracted from a game that just
 *  ended. `otherSeats` excludes the presser's own seat. */
export interface FinishedGameSetup {
  formatId: string;
  /** catalog board id, or null for a pasted custom board (map.mapId is only
   *  ever set for a catalog pick — see ReplayConfig.mapId in protocol.ts) */
  mapId: string | null;
  /** 0 = untimed */
  turnTimerSeconds: number;
  mulliganWasOn: boolean;
  yourHeroId: string;
  otherSeats: RematchRosterSeat[];
}

/** Assemble `FinishedGameSetup` from the live room roster + the replay
 *  bundle's recorded config — the two sources every seat receives. Returns
 *  null when the presser's own seat isn't in the roster (defensive: an
 *  incomplete ROOM_STATUS should never offer a rematch it can't seed). */
export function buildFinishedGameSetup(input: {
  roster: RematchRosterSeat[];
  you: PlayerId;
  formatId: string;
  turnTimerSeconds: number | undefined;
  mulliganWasOn: boolean;
  mapId: string | null;
}): FinishedGameSetup | null {
  const mine = input.roster.find((s) => s.player === input.you);
  if (!mine) return null;
  return {
    formatId: input.formatId,
    mapId: input.mapId,
    turnTimerSeconds: input.turnTimerSeconds ?? 0,
    mulliganWasOn: input.mulliganWasOn,
    yourHeroId: mine.heroId,
    otherSeats: input.roster.filter((s) => s.player !== input.you),
  };
}

/** Query params for the rematch link, plain strings so the caller hands them
 *  straight to `URLSearchParams`. Follows CREATE_ROOM's own opt-out idiom:
 *  a value equal to the default is OMITTED rather than sent explicitly, so a
 *  duel/untimed/mulligan-on rematch produces the shortest, plainest link. */
export type RematchQueryParams = Record<string, string>;

export function rematchQuery(setup: FinishedGameSetup): RematchQueryParams {
  const query: RematchQueryParams = { rematch: "1", hero: setup.yourHeroId };
  if (setup.formatId !== "duel") query.format = setup.formatId;
  if (setup.mapId) query.map = setup.mapId;
  if (setup.turnTimerSeconds > 0) query.timer = String(setup.turnTimerSeconds);
  if (!setup.mulliganWasOn) query.mulligan = "0";

  // Bot seats ride the link so the presser's rematch starts with the SAME AI
  // teammates/opponent already seated — no re-adding them by hand. Encoded as
  // "<seat>:<difficulty>:<hero>" triples; the hero is percent-encoded because
  // it's the one free-form piece sharing this string with our own ":"/","
  // delimiters.
  const bots = setup.otherSeats.filter((s): s is RematchRosterSeat & { bot: BotDifficulty } => s.bot !== null);
  if (bots.length > 0) {
    query.bots = bots.map((s) => `${s.player}:${s.bot}:${encodeURIComponent(s.heroId)}`).join(",");
  }

  // The one-human-opponent case (a duel, or a bot-filled multiplayer room
  // with exactly one other person) gets its hero pre-filled on the JOIN link
  // the presser is about to hand over — the "best client-side
  // approximation" this task settles for: the protocol has no channel to
  // push the new room at that seat directly. Two or more other humans means
  // there's no single seat to pre-fill for, so it's left for each of them to
  // pick their own hero exactly as they would joining any other room.
  const humans = setup.otherSeats.filter((s) => s.bot === null);
  if (humans.length === 1) query.joinHero = humans[0].heroId;

  return query;
}

/** A rematch link's payload, decoded back out of `router.query`. Null when
 *  the query isn't a rematch link at all (no `rematch=1`) or is missing the
 *  one field with no sane default (`hero`) — either way the page should fall
 *  back to its normal boot path instead of firing a broken CREATE_ROOM. */
export interface ParsedRematch {
  heroId: string;
  formatId: string;
  mapId: string | null;
  turnTimerSeconds: number;
  mulligan: boolean;
  botSeats: BotSeatFill[];
  joinHeroId: string | null;
}

const oneString = (v: string | string[] | undefined): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

export function parseRematchQuery(
  query: Record<string, string | string[] | undefined>,
): ParsedRematch | null {
  if (oneString(query.rematch) !== "1") return null;
  const heroId = oneString(query.hero);
  if (!heroId) return null;

  const timer = Number(oneString(query.timer) ?? 0);
  const botsRaw = oneString(query.bots);
  const botSeats: BotSeatFill[] = botsRaw
    ? botsRaw
        .split(",")
        .map((entry) => entry.split(":"))
        .filter((parts) => parts.length >= 2 && !!parts[0] && !!parts[1])
        .map((parts) => {
          const [player, difficulty, hero] = parts;
          return {
            player: player as PlayerId,
            difficulty: difficulty as BotDifficulty,
            ...(hero ? { heroId: decodeURIComponent(hero) } : {}),
          };
        })
    : [];

  return {
    heroId,
    formatId: oneString(query.format) ?? "duel",
    mapId: oneString(query.map),
    turnTimerSeconds: Number.isFinite(timer) && timer > 0 ? timer : 0,
    mulligan: oneString(query.mulligan) !== "0",
    botSeats,
    joinHeroId: oneString(query.joinHero),
  };
}

/** What `createRoom(...)` should be called with for a parsed rematch —
 *  duel's single AI seat rides `CREATE_ROOM.bot`, every other format's AI
 *  seats ride `botSeats[]`, the same split the create-lobby's own submit
 *  handler makes (pages/pro/game.tsx `onConfirm`). `customMap` is left to the
 *  caller: resolving `mapId` to a `ProMapDef` needs the map catalog, which
 *  this module deliberately doesn't import (kept protocol-only and pure). */
export interface RematchCreateRoomArgs {
  heroId: string;
  bot?: { difficulty: BotDifficulty; heroId?: string };
  botSeats: BotSeatFill[];
  /** undefined omits the field — CREATE_ROOM's own "absent = duel" idiom */
  formatId?: string;
  /** undefined omits the field — 0/absent = untimed */
  turnTimerSeconds?: number;
  /** undefined omits the field — absent/true = on, the default */
  mulligan?: boolean;
}

export function rematchCreateRoomArgs(parsed: ParsedRematch): RematchCreateRoomArgs {
  const isDuel = parsed.formatId === "duel";
  const soleBotSeat = isDuel ? parsed.botSeats[0] : undefined;
  return {
    heroId: parsed.heroId,
    bot: soleBotSeat
      ? { difficulty: soleBotSeat.difficulty, ...(soleBotSeat.heroId ? { heroId: soleBotSeat.heroId } : {}) }
      : undefined,
    botSeats: isDuel ? [] : parsed.botSeats,
    formatId: isDuel ? undefined : parsed.formatId,
    turnTimerSeconds: parsed.turnTimerSeconds > 0 ? parsed.turnTimerSeconds : undefined,
    mulligan: parsed.mulligan ? undefined : false,
  };
}
