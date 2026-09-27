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
 *  - hero (yours), format, timer, mulligan, items on/off, the map, and every
 *    bot seat's difficulty + hero. The heroes, format, map, mulligan and the
 *    items opt-out all ride the REPLAY_BUNDLE every seat gets at GAME_OVER
 *    (`config.players`, `config.options.{mulligan,itemsDisabled}`), and the
 *    timer is echoed on ROOM_CREATED/JOINED — so any seat, not just the host,
 *    can propose a faithful rematch, even after a mid-game reload (#876).
 *  - which seats are BOTS is the one thing no in-game message says: only
 *    ROOM_STATUS's roster carries it, and a bot room (started straight from
 *    CREATE_ROOM) or a mid-game RECONNECT never gets one. So the socket hook
 *    records the bot seats this browser learned — from its own CREATE_ROOM, or
 *    from any ROOM_STATUS — per room (recentRooms `setRoomBots`), and that
 *    record survives a reload (`ProRoomInfo.bots`).
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
  /** the game was played with its board's battlefield items switched OFF */
  itemsWereOff: boolean;
  /** catalog board id, or null for a pasted custom board (map.mapId is only
   *  ever set for a catalog pick — see ReplayConfig.mapId in protocol.ts) */
  mapId: string | null;
  /** 0 = untimed */
  turnTimerSeconds: number;
  mulliganWasOn: boolean;
  yourHeroId: string;
  otherSeats: RematchRosterSeat[];
}

/** Which seats are AI, by seat id — the one piece of a rematch the replay
 *  bundle doesn't carry (see the header). */
export type RoomBots = Partial<Record<PlayerId, BotDifficulty>>;

/** The bot seats a CREATE_ROOM asks for, as a `RoomBots` record: duel's single
 *  `bot` always fills p2 (protocol v3), every other format names its seats in
 *  `botSeats[]`. What the socket hook remembers per room at create time. */
export function botsFromCreateRoom(
  bot: { difficulty: BotDifficulty } | undefined,
  botSeats: BotSeatFill[] | undefined,
): RoomBots {
  const bots: RoomBots = {};
  if (bot) bots.p2 = bot.difficulty;
  for (const s of botSeats ?? []) bots[s.player] = s.difficulty;
  return bots;
}

/** Assemble `FinishedGameSetup` from the replay bundle every seat receives at
 *  GAME_OVER (`config.players` gives every seat's concrete hero — a Random pick
 *  already resolved) plus the room's known bot seats. No ROOM_STATUS roster is
 *  needed, so the Rematch button shows vs AI and after a mid-game reload
 *  (#876). Returns null when the presser's own seat isn't in the bundle
 *  (defensive: never offer a rematch it can't seed). */
export function buildFinishedGameSetup(input: {
  players: Partial<Record<PlayerId, { heroId: string }>>;
  bots: RoomBots;
  you: PlayerId;
  formatId: string;
  turnTimerSeconds: number | undefined;
  mulliganWasOn: boolean;
  itemsWereOff: boolean;
  mapId: string | null;
}): FinishedGameSetup | null {
  const mine = input.players[input.you];
  if (!mine) return null;
  const otherSeats: RematchRosterSeat[] = (Object.keys(input.players) as PlayerId[])
    .filter((player) => player !== input.you && !!input.players[player])
    .sort()
    .map((player) => ({ player, heroId: input.players[player]!.heroId, bot: input.bots[player] ?? null }));
  return {
    formatId: input.formatId,
    itemsWereOff: input.itemsWereOff,
    mapId: input.mapId,
    turnTimerSeconds: input.turnTimerSeconds ?? 0,
    mulliganWasOn: input.mulliganWasOn,
    yourHeroId: mine.heroId,
    otherSeats,
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
  if (setup.itemsWereOff) query.items = "0";

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
 *  the query isn't a rematch link at all (no `rematch=1`), already names a
 *  `room=`, or is missing the one field with no sane default (`hero`) — either way the page should fall
 *  back to its normal boot path instead of firing a broken CREATE_ROOM. */
export interface ParsedRematch {
  heroId: string;
  formatId: string;
  mapId: string | null;
  turnTimerSeconds: number;
  mulligan: boolean;
  itemsEnabled: boolean;
  botSeats: BotSeatFill[];
  joinHeroId: string | null;
}

const oneString = (v: string | string[] | undefined): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

export function parseRematchQuery(
  query: Record<string, string | string[] | undefined>,
): ParsedRematch | null {
  if (oneString(query.rematch) !== "1") return null;
  // A URL that already names a room wins (#876): that room is where this
  // player sits, so a stale `rematch=1` beside it must RECONNECT, never create.
  if (oneString(query.room)) return null;
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
    itemsEnabled: oneString(query.items) !== "0",
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
  /** undefined omits the field — absent/true = items on, the default */
  itemsEnabled?: boolean;
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
    itemsEnabled: parsed.itemsEnabled ? undefined : false,
  };
}

/** Every query key a rematch link can carry (`rematchQuery`'s output). */
export const REMATCH_QUERY_KEYS = [
  "rematch",
  "hero",
  "format",
  "map",
  "timer",
  "mulligan",
  "items",
  "bots",
  "joinHero",
] as const;

/** `query` with a rematch link's keys removed — what the URL becomes once the
 *  rematch's CREATE_ROOM has fired, so a refresh (or a copied URL) RECONNECTs
 *  to the room it made instead of creating yet another one (#876). A query
 *  that isn't a rematch link (no `rematch` key) comes back untouched: an
 *  ordinary invite's `?hero=` preset is not ours to strip. */
export function withoutRematchQuery<Q extends Record<string, string | string[] | undefined>>(query: Q): Q {
  if (query.rematch === undefined) return query;
  const rest = { ...query };
  for (const key of REMATCH_QUERY_KEYS) delete rest[key];
  return rest;
}
