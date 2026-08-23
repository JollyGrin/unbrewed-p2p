/**
 * Pro protocol v1 — SOURCE OF TRUTH.
 *
 * The ONLY coupling between the public client (unbrewed-p2p) and this private
 * server. The client contains ZERO rules logic: it renders `view`, offers
 * `legalActions` as UI affordances, answers `prompt`s, and sends actions.
 * Everything here is plain JSON-serializable data.
 *
 * ## Sync procedure (docs/pro/tasks/T-015 in the public repo)
 * Any change here bumps PROTOCOL_VERSION. Copy this file VERBATIM to
 * `unbrewed-p2p/lib/pro/protocol.ts` and note the sync in both commit bodies.
 * This file must compile standalone in both repos: NO imports — the engine
 * shapes it mirrors (Action, PendingPrompt kinds, MapDef) are duplicated here
 * by hand and drift is caught by the type-level tests in
 * `test/protocol.test.ts` (this repo only).
 *
 * ## Reconciliation vs the client DRAFT (v0, 2026-07-04)
 * - Prompt answers are a regular action (`RESPOND_PROMPT`) — the reducer gates
 *   them like any other action. The draft's separate `PROMPT_RESPONSE` client
 *   message is GONE; there is exactly one ACTION path.
 * - `PlayerView` gained `counters` (public per-player counters), `maneuver`
 *   (boost/moved bookkeeping the UI needs during MANEUVER_MOVE), `catalog`
 *   (CardDefId -> printed card metadata so the client can render rule-true
 *   values without correlating against unbrewed-api decks), and a redacted
 *   `prompt` summary for the NON-choosing player (`options: []` = waiting).
 * - No event stream in v1: the client diffs consecutive views (the reveal beat
 *   is `combat.attackerCard` flipping null -> id). Revisit if diffing hurts.
 *
 * ## Reconnect tokens
 * Issued once per seat on CREATE/JOIN. Opaque, stored client-side
 * (sessionStorage), replayed via RECONNECT after a drop; the server re-binds
 * the socket to the seat and re-sends STATE. Tokens do not rotate in v1 and
 * die with the room (in-memory, TTL ~2h after last activity).
 *
 * ## v3 (2026-07-05): bot rooms
 * `CREATE_ROOM` gained optional `bot` — when present the server fills p2 with
 * a scripted AI seat and the game starts immediately (ROOM_CREATED is followed
 * by STATE; there is no JOIN). `bot.heroId` omitted = server picks randomly
 * among supported heroes. The bot plays through the same action pipeline as a
 * human; the client needs NO new message types — the opponent just acts.
 * OPPONENT_STATUS is never sent for a bot seat (it is always "connected").
 *
 * ## v4 (2026-07-05): custom-map playtest
 * `CREATE_ROOM` gained optional `customMap` — a full `ProMapDef` the creator
 * supplies to playtest an unpublished board without shipping it to the server
 * repo. The server validates it (validateMap) and, if clean, uses it for that
 * room only; a bad map answers ERROR{BAD_MAP}. Composes with `bot`.
 *
 * ## v5 (2026-07-05): public lobbies
 * Rooms carry a `public` flag (default false: invite-link rooms stay unlisted).
 * SET_VISIBILITY (from a ws bound to a seat in that room) toggles it and is acked
 * with VISIBILITY. LIST_LOBBIES returns the public, one-seat, game-not-started,
 * recently-active rooms as LobbyListing[] (client polls; no server push — a room
 * drops out the moment its second seat fills or it goes stale). `ageMs` is
 * wait-time since room creation and does NOT reset on a visibility toggle.
 * Composes with `bot` and `customMap` (a bot/custom-map room can still be public).
 *
 * ## v6 (2026-07-05): two-space large fighters
 * `ViewFighter` gained `tailSpace: SpaceId | null` — a LARGE fighter's body
 * occupies TWO adjacent spaces (`space` = head, `tailSpace` = tail); render two
 * linked tokens with a stretch-band between them ("one fighter"). NORMAL
 * fighters always send `null` — the shape is additive and normal fighters are
 * untouched. No new prompt kinds: head/tail placement reuses CHOOSE_SPACE, the
 * tail prompt's options carry `data: { space, head }` so the pending head can
 * be rendered. `MOVE_FIGHTER.path` for a large fighter is the LEADING end's
 * path and may start from either body space; the final pose is
 * (path[n], path[n-1]) — animate each end along the lead/trail paths.
 *
 * ## v7 (2026-07-06): deploy-safe games (SIGTERM warning + resume tokens)
 * Rooms are in-memory, so a Railway redeploy (which SIGTERMs the old instance)
 * would silently kill live games. Three additive messages fix this:
 * - `SERVER_RESTARTING` (server->client): the old instance broadcasts this on
 *   SIGTERM before it closes sockets. The client shows a "server updating" toast
 *   and lets its reconnect/backoff loop take over against the new instance.
 * - `RESUME_TOKEN` (server->client): the server periodically pushes an OPAQUE,
 *   encrypted+authenticated blob per seat (and once more on SIGTERM). It encodes
 *   `{setup, seed, actionLog, dslVersion, stateHash}` — the deterministic-replay
 *   format — so EITHER client can revive the whole room on a fresh instance. The
 *   blob is AES-256-GCM sealed with a server-only key: a client cannot read it,
 *   so replaying it never breaches the redactFor boundary. Client stores it in
 *   localStorage (crash-recovery / "resume tomorrow" fall out for free). When the
 *   key is unset the server NEVER emits a token (fail closed).
 * - `RESUME_ROOM` (client->server): carries a stored blob to a healthy instance.
 *   The server decrypts + verifies it, replays the log, and recreates the room +
 *   both seats with FRESH reconnect tokens, answering `ROOM_JOINED` + `STATE`.
 *   First client to revive wins; a second `RESUME_ROOM` for the same room id just
 *   reconnects to the now-live room. On `dslVersion` mismatch the server still
 *   replays and lets the per-game `stateHash` decide (a semantics change that did
 *   not touch this game's cards still resumes); a genuine divergence answers
 *   ERROR{RESUME_FAILED}.
 */

/**
 * ## v8 (2026-07-06): full-match replay bundles (issue #122)
 * The engine is deterministic (seeded PRNG in GameState, no wall-clock/Math.random),
 * so a whole match is reproducible from `{ config, actionLog }`. Two additions:
 * - `REPLAY_BUNDLE` (server → both seats at GAME_OVER): the unredacted,
 *   self-contained `ReplayBundle` — nothing is secret once the game is over. The
 *   client saves it locally for the /pro/replays scrubber; it is never required to
 *   render a live game.
 * - `ReplayExpansion` / `ReplayError`: the shape returned by the STATELESS HTTP
 *   `POST /replay` endpoint (NOT a ws message). It re-runs a bundle's actionLog
 *   through the authoritative reducer and returns the God-view step sequence
 *   (both hands/decks/discards/tokens at every step) so the browser renders a
 *   full-information replay without shipping the rules engine. The same endpoint
 *   validates imported/shared bundles: an illegal actionLog is rejected by
 *   construction, and a schema/dsl-version mismatch refuses rather than render a
 *   subtly-wrong game.
 *
 * ## v10 (2026-07-08): prompt attribution + player-redacted event stream
 * One release train ships two additive features under a single version (issues
 * #35 and #36):
 *
 * - Prompt attribution (issue #35): `ViewPrompt` gained optional `source` — WHAT
 *   opened the prompt, so the client can label a choice with the card/ability
 *   asking (players were guessing; see unbrewed-p2p#147/#151). Projected in
 *   redactFor from the parked effect run's scope.source: a resolving card's
 *   instance → `{ card }`, a hero ability → `{ hero }`, and system prompts with
 *   no effect run (combat commit, sidekick placement, maneuver, maneuver-boost)
 *   → `null`. Hidden-info guarded: a card instance is named ONLY when its face is
 *   public to BOTH players (a scheme in discard, a revealed combat card); a
 *   still-hidden face sends `null` instead, so `source` never leaks an identity
 *   `redactFor` otherwise strips.
 *
 * - Player-redacted event stream (issue #36): STATE gained an optional
 *   `events: GameEvent[]` — the structured events the engine produced for the
 *   action that triggered THIS broadcast, redacted for the receiving player (own
 *   hidden cards survive; the opponent's are masked to '(hidden)'). Present only
 *   on action-triggered broadcasts; join/reconnect/resume STATE omits it (never
 *   replay old events into a rejoining client's feed). The client appends them to
 *   its activity feed, replacing the snapshot-diffing in
 *   unbrewed-p2p/lib/pro/gameLog.ts; a client that ignores `events` sees a
 *   byte-identical `view`/`legalActions` and behaves exactly as on v9. The
 *   `GameEvent` union below mirrors engine/types.ts (drift caught at compile time
 *   in server/redact.ts). One additive engine event, `EFFECT_FIRED`, was added so
 *   delayed effect damage can be attributed to its source card.
 *
 * ## v11 (2026-07-08): pro undo — request/rewind negotiation (issue #39)
 * A player may undo THEIR OWN last discrete move (single level); on the opponent's
 * consent the server rewinds authoritative state to immediately before that move
 * and rebroadcasts a fresh STATE to both seats. Undo is a META-negotiation — it is
 * NOT an `Action` and is NEVER recorded in the deterministic replay log (the rewind
 * is implemented by truncating `actionLog` + re-running the engine, so a recorded
 * undo would be self-referential). Four additive messages, none of which touch the
 * `ACTION` path:
 * - `UNDO_REQUEST` (client→server): request to undo your own last move. The server
 *   computes the cut index (start of your last discrete move, walking back over your
 *   trailing prompt/combat entries so the rewind lands on a clean boundary, never
 *   mid-prompt) and pushes UNDO_REQUESTED to the opponent. One pending request per
 *   room; a second while one is pending — or a request with nothing to undo — answers
 *   ERROR{UNDO_UNAVAILABLE}.
 * - `UNDO_REQUESTED` (server→opponent): the opponent is ALWAYS prompted, never
 *   blindsided. `requester` names who asked (so the prompt reads "P1 wants to undo…").
 *   `rewindActions` summarizes every action that will be rewound — INCLUDING the
 *   opponent's own moves taken in between (which the rewind also removes, by design)
 *   — so they can consent informedly. A summary is `{ player, action }` (the action
 *   TYPE only — no card ids — so the pre-consent prompt leaks no hidden identities).
 * - `UNDO_RESPONSE {accept}` (client→server): the opponent's answer. accept=true →
 *   the server truncates the log, replays from the seed, and broadcasts the earlier
 *   STATE to both seats (no new "undo result" message — the STATE broadcast is the
 *   result). accept=false → UNDO_REJECTED to the requester, no state change. A bot
 *   opponent cannot consent, so the server auto-accepts on its behalf.
 * - `UNDO_REJECTED` (server→requester): the request was declined, or superseded by a
 *   fresh action / staleness. No state change.
 * Redaction re-derives from the rebuilt state via redactFor, so an undo cannot leak
 * hidden info beyond the accepted rewind; resume tokens auto-track the truncated log
 * (pushed inside broadcastState).
 *
 * `PlayerView.canUndo` (per-viewer, recomputed on every STATE broadcast) tells each
 * client whether that viewer has an eligible last discrete move to undo right now —
 * the frontend gates its Undo button entirely on this flag.
 *
 * ## v12 (2026-07-08): Buster Keaton STUNT event variants
 * The v0.13.0 DSL batch adds three additive GameEvent variants emitted by Buster
 * Keaton primitives: `CARD_PLAYED_FROM_HAND` (nested STUNT play),
 * `CARD_RETURNED_TO_HAND` (combat cleanup returns a revealed combat card), and
 * `CARD_REVEALED` (The Cameraman's random hand reveal). All are public reveal/play
 * moments and are redacted/audited by server/redact.ts.
 *
 * ## v13 (2026-07-09): multiplayer room exposure
 * Wire player ids now use the reserved runtime-player id space (`p1`..`p16`) so
 * STATE, legal actions, events, replay bundles, resume tokens, and room seating
 * can represent 3–4 player formats. `CREATE_ROOM` accepts `formatId` (default
 * `duel`); rooms fill seats in runtime order and start once the selected format's
 * player count is reached. PlayerView keeps the duel `self`/`opponent` aliases
 * for compatibility and adds `players[]`, the multiplayer-safe per-seat view.
 *
 * ## v14 (2026-07-10): host-filled easy bot slots
 * `CREATE_ROOM.botSeats[]` lets the host mark non-host runtime seats as easy AI
 * occupants in any supported format. Human joins still fill the next open runtime
 * slot; planned bot slots materialize automatically once earlier human slots are
 * filled.
 *
 * ## Additive field (2026-07-11, no version bump): per-seat `team`
 * `ViewPlayer.team` and `ReplayStepPlayer.team` expose the format-defined team id
 * (`teamOf(setupPlan, player)`) for every seat, in every format — duel/ffa give
 * each seat its own distinct team id, so the client's team-affiliation UI stays
 * format-agnostic. Public info: identical for every viewer, never redacted. Purely
 * additive to existing objects — no PROTOCOL_VERSION bump; older clients that
 * don't read the field are unaffected (issue #98).
 *
 * ## Additive change (2026-07-12, no version bump): multiplayer FORFEIT
 * `FORFEIT.player` widens from DuelPlayerId to PlayerId, and the action gains an
 * optional `endsMatch` (issue #117). In multiplayer formats a forfeit is a
 * voluntary SEAT elimination: the seat's fighters are removed and the game
 * usually continues; the forfeited seat keeps receiving its normal redacted
 * view (live-game spectating). The game ends immediately (reason FORFEIT) only
 * when the format's team logic says so, or when the server's human-stake rule
 * fires: after the elimination, no living seat belongs to a team containing a
 * human player. `endsMatch` is that server-stamped verdict riding in the logged
 * action so replay bundles reproduce the same GAME_OVER deterministically —
 * clients MUST NOT send it (the server ignores/overwrites a client-authored
 * flag) and duel forfeits never carry it. Older duel clients are unaffected.
 *
 * ## Additive change (2026-07-12, no version bump): multiplayer BOOST_MOVE
 * `BOOST_MOVE.player` widens from DuelPlayerId to PlayerId (issue #119):
 * maneuver boosts are now enumerated in every format under the duel conditions
 * (maneuver not yet boosted, some living on-board fighter unmoved; one action
 * per boost-bearing hand card). Semantics are unchanged — discard the card
 * (public), add its boost to the maneuver's movement, once per maneuver. No
 * shape change beyond the id union; older duel clients are unaffected.
 *
 * ## Additive change (2026-07-12, no version bump): live room status + presence
 * (issue #121, p2p #208). Three additions, all ignorable by older duel clients:
 * - `ROOM_STATUS` (server → every connected seat): the live waiting-room fill —
 *   per-slot hero identity, connectedness, and bot-ness (all public info; hero
 *   picks are public pre-game). Broadcast on join, on pre-game seat release, and
 *   on reconnect/disconnect while the room is waiting. The `seats: PlayerId[]`
 *   field on ROOM_CREATED/ROOM_JOINED is unchanged — ROOM_STATUS is the live
 *   channel. Planned-but-not-yet-materialized bot slots are listed like seats
 *   (a joiner can never take them, so they count as filled).
 * - `OPPONENT_STATUS` gains `player` (WHICH seat this is about — duel clients
 *   that ignore it behave as today) and, when a mid-game abandonment clock is
 *   running, `autoForfeitAt` (epoch ms deadline) so clients can render
 *   "P3 disconnected — auto-forfeit in 1:32". A reconnect broadcasts the
 *   all-clear (`connected: true`, no `autoForfeitAt`).
 * - Server behavior (no new client message): pre-game, a disconnected seat is
 *   released after a grace window (PRO_PREGAME_GRACE_MS, default 60s) — its
 *   reconnect token dies with it and a later joiner may take the slot. Mid-game
 *   in MULTIPLAYER formats only, a non-bot seat disconnected past
 *   PRO_ABANDON_FORFEIT_MS (default 2 min) is auto-forfeited: the server
 *   injects a normal FORFEIT through the #117 human-stake stamping at the
 *   seat's next clock edge, so the action log replays identically. Duel keeps
 *   the wait-for-reconnect behavior unchanged.
 *
 * ## v15 (2026-07-12): hero tiers + debug gating (#107 Phase 1)
 * `HeroListing` gains `tier` (`'reflavored' | 'spice' | 'community'`) so the
 * client can render a ★ on reflavored names under `?debug`. `LIST_HEROES` and
 * `CREATE_ROOM` both gain an optional `debug` flag (default false/absent):
 * false hides debug-only heroes from the HEROES listing and from
 * the server's random bot-hero pool (duel `bot.heroId` omitted, and
 * `botSeats[].heroId` omitted); `debug: true` includes them in both. An
 * EXPLICIT `heroId` — the player's own pick, a named `bot.heroId`/
 * `botSeats[].heroId`, or `JOIN_ROOM.heroId` — is never gated by tier; only
 * the two random-pick pools are filtered. Purely additive (new optional
 * request fields, a new listing field): an older client that omits `debug`
 * gets `debug: false` behavior — a reflavored hero (today only `thetis`)
 * drops out of its `HEROES` listing and its random-bot pools.
 *
 * ## v16 (2026-07-12): public per-player `flags` (issue #132)
 * `ViewSelf`/`ViewOpponent`/`ViewPlayer` gain `flags: Record<string, boolean>` —
 * the player's currently-active named flags (setFlag op, engine PlayerState.flags),
 * keyed by flag name -> true (absent = not active). ALL flags are public, exactly
 * like `counters` — no per-flag special-casing. This is the standing wire
 * primitive for any deck's custom public state (today: Thetis/Thetis Spice
 * HIGH_TIDE; future: stances, charges, forms). Purely additive; an older client
 * that ignores `flags` is unaffected.
 *
 * ## Additive field (2026-07-12, no version bump): `ViewPrompt.description`
 * (issue #134). A multi-step effect (e.g. Coil and Slip's damage-then-move) left
 * every step's prompt looking identical ("Effect of X / click a pulsing
 * fighter"), so a player could not tell WHICH step they were answering — see
 * `source` (v10) for WHAT card is asking; `description` is WHAT is being chosen.
 * Generated mechanically at emission time from the op being resolved (op verb +
 * amount) — never per-card authored — and only for CHOOSE_TARGET/CHOOSE_SPACE
 * prompts where that summary is unambiguous; other prompt kinds and system
 * prompts (setup, commit, maneuver) omit it. Purely additive and presentation-
 * only; an older client that ignores it is unaffected.
 *
 * ## Additive change (2026-07-13, no version bump): per-decision move timer
 * (issue #122, p2p #223). Opt-in at room creation; a room without it behaves
 * byte-identically to before (no new messages are ever sent).
 * - `CREATE_ROOM.turnTimerSeconds?` — every time a seat is on the clock (turn
 *   action, maneuver move, combat commit, prompt response, discard-to-limit,
 *   setup placement) it has this many seconds to act. Integer 10–300; absent
 *   or 0 = no timer (today's behavior); anything else answers
 *   ERROR{BAD_MESSAGE}. Echoed in ROOM_CREATED/ROOM_JOINED/ROOM_STATUS
 *   (present only when the timer is on) so every client knows the room rules.
 * - `TURN_TIMER` (server → every connected seat; timed rooms only): the one
 *   countdown channel — chosen over piggybacking STATE metadata so pause/
 *   resume edges (which have no STATE broadcast) still notify, and over
 *   OPPONENT_STATUS because the acting seat itself needs the deadline most.
 *   Broadcast on every clock change: `deadline` (epoch ms) when the clock is
 *   running for `player`, `deadline: null` when `player` is on the engine
 *   clock but their timer is NOT running (bot seat — driven immediately — or
 *   a disconnected seat, see below). A (re)connect re-broadcasts the current
 *   snapshot; TURN_TIMER may arrive before or after the accompanying STATE
 *   and is self-contained. Render a countdown; on expiry the SERVER acts.
 * - Enforcement: at the deadline the server plays ONE uniformly-random legal
 *   action for the seat (the same enumeration that drives easy bot seats,
 *   FORFEIT excluded) — bot-style, never a resignation. The injected action
 *   lands in the action log like any other, so replays/resumes reproduce it.
 * - Presence interplay: the timer runs only while the acting seat is a
 *   CONNECTED human. A disconnected actor's clock pauses (broadcast
 *   `deadline: null`) and absence is handled by the presence rules — duel
 *   waits for reconnect; multiplayer runs the #121 abandonment clock (so the
 *   two clocks never double-fire). Reconnecting re-arms a full fresh window.
 *   Timers are in-memory only: a resumed room keeps the SETTING (it rides in
 *   the resume token) but deadlines start fresh.
 *
 * ## v17 (2026-07-13): map-authored battlefield item spaces (Teen Spirit)
 * Additive map + runtime surfaces for board item tokens (issue #152). `ProMapSpace`
 * gains `item?` (the item id spawned on that space) and `passage?` (a
 * secret-passage marker rendered by the client); `ProMapDef` gains `items?`
 * (`ProMapItem[]` — combat items carry `value`, scheme items carry opaque `ops`).
 * `PlayerView.itemTokens?` lists tokens still on the board (space -> item id), public
 * ("the effects aren't secret") and cleared as items are consumed. New action
 * `USE_SCHEME_ITEM` (use a scheme item; costs an action, NOT a scheme-card play) and
 * an optional `attachItem?` on `COMMIT_ATTACK_CARD`/`COMMIT_DEFENSE_CARD` (attach the
 * combat item on the fighter's space — attacker decides before the defender). Events
 * `ITEM_USED` + `COMBAT_ITEM_ATTACHED`, and `ACTION_SPENT.action` adds `SCHEME_ITEM`.
 * Purely additive: item-less maps carry none of the new fields and behave identically.
 *
 * ## Additive field (2026-07-13, no version bump): `PlayerView.moveGraphs`
 * Incremental (step-by-step) maneuver movement (issue #55, p2p #285). During
 * MANEUVER_MOVE the active player's view now carries a per-fighter `MoveGraph` —
 * the traversable spaces, per-node `canStop`, and the directed legal single steps
 * among them — so the thin client can step a maneuver hop by hop LOCALLY and commit
 * ONE `MOVE_FIGHTER` with the accumulated (possibly back-and-forth) path. No new
 * action or client→server message: `MOVE_FIGHTER` already carries arbitrary paths
 * and the server already accepts any legal path whose endpoint is a reachable
 * destination, so this is a pure view enrichment. Present only for the mover during
 * MANEUVER_MOVE (absent otherwise, and for LARGE fighters); a client that ignores
 * it keeps today's one-click-to-destination behavior. Scope: maneuvers only —
 * effect/scheme `CHOOSE_SPACE` moves stay server-canonical teleports.
 *
 * ## Additive field (2026-07-13, no version bump): `wonCombatThisTurn` (issue #59)
 * `ViewSelf`/`ViewOpponent`/`ViewPlayer` gain `wonCombatThisTurn: boolean` — whether
 * that player is in engine `GameState.combatsWonThisTurn` (won >=1 combat this turn, or
 * was "considered to have won" via markCombatWon). Public, identical for every viewer,
 * turn-scoped (clears at turn start). Drives the client's affordance for General
 * Grievous's six "if you won a combat this turn" cards — legibility only, never
 * correctness (legalActions stays authoritative). Purely additive; an older client that
 * ignores it is unaffected.
 *
 * ## Additive field family (2026-07-18, no version bump): turn-scoped event flags (engine v0.22.0)
 * `ViewSelf`/`ViewOpponent`/`ViewPlayer` gain four more public turn-scoped booleans, mirroring
 * `wonCombatThisTurn` exactly (public, identical for every viewer, clear at turn start):
 *   - `lostCombatThisTurn`  — engine `GameState.combatsLostThisTurn` membership (lost >=1 combat).
 *   - `firstAttackThisTurn` — NOT yet in `GameState.attackedThisTurn` (their next attack is the first).
 *   - `playedACardThisTurn` — `GameState.cardsPlayedThisTurn[pid]` non-empty (played >=1 card publicly).
 *   - `tookDamageThisTurn`  — engine `GameState.damageTakenThisTurn` membership (an owned fighter took damage).
 * Back the DSL predicates LOST_COMBAT_THIS_TURN / FIRST_ATTACK_THIS_TURN / PLAYED_A_CARD_THIS_TURN /
 * TOOK_DAMAGE_THIS_TURN. Legibility only (legalActions stays authoritative). Purely additive; an
 * older client ignoring them is unaffected. Sync note: the four fields must be copied verbatim to
 * unbrewed-p2p `lib/pro/protocol.ts` (a client-wiring ticket is drafted in
 * docs/plans/turn-scoped-state-convert.md). No shipped deck consumes them yet.
 *
 * ## v18 (2026-07-14): lab hero tier (unbrewed-engine #180, client sibling p2p #323)
 * `HeroTier` gains `'lab'` for playable-but-unsettled decks that should stay
 * hidden from the default roster and random bot pools. As with `reflavored`,
 * `LIST_HEROES.debug` and `CREATE_ROOM.debug` include lab heroes; explicitly
 * named hero ids remain accepted for direct debug links.
 *
 * ## v19 (2026-07-15): deck sections for Start a Match
 * `HeroListing` gains `deckSection` (`'recommended' | 'community'`) so the
 * client can split the Start a Match roster into maintained recommendations and
 * Search Community Decks. This is separate from `tier`, which still controls
 * visibility/debug gating and provenance labels.
 *
 * ## v20 (2026-07-15): lab decks are public community playtest decks
 * `LIST_HEROES` includes `tier:'lab'` decks by default, always in the community
 * section. Random bot pools still exclude lab decks unless debug is requested.
 *
 * ## v21 (2026-07-16): ongoing schemes are public per-player cards
 * Player/replay views expose each seat's active `ongoingScheme`, or null/absent
 * when none is active, so clients can render face-up ongoing scheme cards outside discard.
 *
 * ## v22 (2026-07-18): additional defense combat card
 * Specter Knight's `playAdditionalDefense` primitive can put one extra revealed
 * defense card into the live combat. `ViewCombat.additionalDefenseCard` exposes
 * it like the primary defense card, and `ADDITIONAL_DEFENSE_PLAYED` announces the
 * reveal/play event. The selection uses existing `RESPOND_PROMPT` actions.
 *
 * ## Additive field (2026-07-16, no version bump): `ViewFighter.statuses?`
 * (unbrewed-engine #204, unblocks p2p #371). A generic per-fighter status-
 * effect list — the fighter-scoped parallel to the per-player `flags` model
 * (v16) — so the client can render effects inflicted on a fighter that isn't
 * its own controller's hero (roots today; poison/snare/marks/buffs are the
 * same shape tomorrow) without a new protocol field per effect. Today it
 * carries at most one entry, `{ kind: 'PINNED', expiresAtTurn, expiresAt }`,
 * derived at redact time from the engine `pin` op (Entangling Roots, Thrall's
 * earthbind totem) whenever `Fighter.pins[]` is non-empty (the turn-edge
 * sweep guarantees a present entry is currently active) — previously the only
 * signal was the transient `FIGHTER_PINNED` log event, with no persistent
 * view field. `kind` is mechanical/engine-stable; the client owns the
 * kind -> flavor label/badge mapping. Public for both seats — nothing here is
 * secret. Deliberately per-fighter, not folded into `flags`: these effects
 * can target `OPPOSING_FIGHTER` (may be a sidekick) and are typically
 * inflicted by the opponent, so they don't fit the hero-scoped flag shape.
 * Purely additive; an older client that ignores it is unaffected.
 *
 * ## Additive request field (2026-07-18, no version bump): per-seat telemetry pilot
 * `CREATE_ROOM.pilot?` and `JOIN_ROOM.pilot?` let socket-driven non-bot seats
 * tag telemetry as `llm:<model>` instead of the default `human`. Built-in bots
 * still report `bot:<difficulty>`. Invalid pilot labels answer BAD_MESSAGE.
 *
 * ## v23 (2026-07-27): the `expert` bot tier, behind a server flag (issue #263)
 * `BotDifficulty` gains `"expert"` — the ISMCTS search bot, which cleared its
 * acceptance gate at 91.7% over 1,000 games vs the shipped `hard` (#239).
 * `HeroListing` gains an OPTIONAL `botTiers?: BotDifficulty[]`.
 *
 * ### The tier is DORMANT unless the server enables it
 * A v23 build ships with the tier switched OFF (`EXPOSE_EXPERT=1` turns it on).
 * While dormant the server presents the v22 surface EXACTLY:
 * - `HeroListing.botTiers` is OMITTED from every listing, and
 * - a CREATE_ROOM naming `expert` is refused with the same
 *   `BAD_MESSAGE: Unknown bot difficulty: expert` a v22 server answers.
 * So a client may not infer from `PROTOCOL_VERSION` alone that the tier is
 * claimable. `PROTOCOL_VERSION` says what the build CAN do; the listing says
 * what this server WILL do.
 *
 * ### Client rule for `botTiers` (both directions of skew)
 * ABSENT `botTiers` means "this server does not advertise per-hero bot tiers" —
 * the client MUST fall back to the v22 tier set (`easy|medium|hard`) for that
 * hero. PRESENT `botTiers` is authoritative and MUST be used as-is; a client
 * must not assume two heroes carry the same list, even though today they do
 * (see the #283 note below). Asking for a tier a hero does not list is refused
 * with BAD_MESSAGE, so the field is UI affordance over an enforced rule.
 *
 * ### Policy change (2026-07-28, no version bump): expert on every hero (#283)
 * `botTiers` originally carried `expert` only on the three heroes the #239
 * ladder measured. It now carries it on every served hero once exposure is on.
 * The wire SHAPE is unchanged — same optional field, same per-hero list, same
 * refusal — so this is a server policy change, not a protocol one, and a client
 * written against the v23 rule above needs no edit. What moved is where the
 * honesty lives: strength is still measured on 3 heroes and 1 map, and the
 * remaining decks are labelled ALPHA client-side (p2p#458) instead of being
 * silently greyed out. Clients SHOULD carry that label; the server cannot.
 *
 * ### Otherwise additive in every direction
 * - The DEFAULT is unchanged. Nothing on the wire carries a default difficulty;
 *   `expert` is reachable only by a client that names it.
 * - A v22 client is unaffected: it never sends the value and ignores the new
 *   field, and v22 stays in the server's accepted set for a deploy window.
 *
 * ### `medium` changed identity (no wire change)
 * `medium` is now flat Monte Carlo at 16 sweeps instead of the 1-ply greedy bot,
 * so the ladder is one search with four budgets. The enum, the defaults and
 * every message shape are untouched — budgets have always been server-side and
 * opaque to clients — but a client that LABELS the tiers ("Medium — greedy")
 * may want new copy, and live win-rate baselines against `medium` reset on the
 * deploy exactly as they do for `hard`. In telemetry the seats relabel
 * themselves: `medium` reports `bot:mc(16,10000ms)` and `expert`
 * `bot:ismcts(512,10000ms)` under #278's algorithm-based scheme.
 *
 * Capacity, not protocol: the server caps concurrent bot SEARCHES process-wide
 * (every searching tier shares one gate) and serves an over-cap decision at the
 * contended budget rather than letting contention silently thin every search.
 * Invisible on the wire by design — see server/botAdmission.ts (#278).
 *
 * ## v24 (2026-07-28): combat event enrichment (issue #281, p2p#510/#511)
 * Three additive event-stream changes so a client can EXPLAIN a combat it could
 * previously only report. All three are event-only — no state/view shape changes,
 * no new messages, no behavior change; an older client that ignores them renders
 * exactly as on v23.
 *
 * - `EFFECT_CANCELED` gains `voided`, `boostVoided` and `card` (p2p#506). The
 *   client printed a fixed "attack card effects were cancelled" for EVERY cancel,
 *   which is wrong for a card with no cancellable effect blocks: per the King
 *   Arthur/Excalibur ruling (02 §5.5) such a card can never be "cancelled", so its
 *   printed value AND its ability-attached boost still count. `voided: false` is
 *   the engine saying exactly that; `boostVoided` reports the discardIfCanceled
 *   consequence when it does land.
 *
 * - `COMBAT_VALUE_BREAKDOWN` (new, p2p#506) — emitted once per combat at damage
 *   calc, immediately before `COMBAT_DAMAGE`/`COMBAT_RESOLVED`: the itemized
 *   effective value of both sides (printed/override, effect delta, attached
 *   boosts, ability boosts, total). `VALUE_MODIFIED` already narrated the deltas;
 *   boost contributions were invisible, so "why 9 vs 2?" was unanswerable.
 *
 * - `EFFECT_RESOLVING` (new, p2p#507/#511) — the effect-resolution marker. Only
 *   SCHEDULED effects carried a source (`EFFECT_SCHEDULED`/`EFFECT_FIRED`); inline
 *   IMMEDIATELY/DURING/AFTER blocks, triggers and schemes emitted nothing about
 *   their origin, so SNIPE's "AFTER: draw 1" emptying a deck and killing its own
 *   player read as an unattributed exhaustion. The marker precedes the block's
 *   events and repeats after `PROMPT_RESOLVED` for prompt-resolved ops, and the
 *   contract is positional: everything after a marker belongs to that `source`
 *   until the next marker (a repeated identical marker is idempotent). Enough to
 *   render
 *   `AFTER · SNIPE: draw 1 → deck empty → exhaustion 2 dmg → defeated`.
 *
 * ## v25 (2026-07-29): per-player set-aside piles (engine #293, DSL v0.29.0)
 * A new PUBLIC card zone: named, face-up, ordered per-player piles of cards parked
 * out of hand/deck/discard — "tuck it under your hero card" (Luke Skywalker's
 * TRAINING pile), and the shape the roadmap's exile / card-BURN / revealed-cards
 * zones will reuse. Additive in every direction:
 *
 * - `ViewSelf.piles`, `ViewOpponent.piles`, `ViewPlayer.piles` and
 *   `ReplayStepPlayer.piles` — `{ [pileName]: CardInstanceId[] }`, ABSENT when the
 *   seat has tucked nothing. Both seats see full card identities (the pile is public
 *   information, like the discard pile), so there is no redaction asymmetry.
 * - `CARD_TUCKED` / `CARD_RETURNED_FROM_PILE` events narrate the moves.
 * - A client that ignores the field renders exactly as on v24, except that a tucked
 *   card is in no zone it knows — clients SHOULD render the pile beside the discard.
 *
 * ## v26 (2026-08-01): board objects generalized (engine #317, DSL v0.33.0)
 * `ViewToken` stopped being "a Thrall totem". The engine's board-object collection
 * now carries a KIND plus a per-kind policy, and the first new kind is `corpse` —
 * a defeated fighter's body that stays on the board for a few turns (Gerry the
 * Isopod). Additive; a v25 client keeps rendering totems correctly.
 *
 * - `ViewToken.kind` widened from the literal `"totem"` to `ViewTokenKind`
 *   (`"totem" | "corpse"`, and it will grow). Same on `TOKEN_PLACED` /
 *   `TOKEN_DESTROYED`.
 * - `ViewToken.ownerTurnsRemaining` — countdown pips; ABSENT = permanent.
 * - `ViewToken.origin` — display provenance, e.g. `"corpse-of:p1/sidekick-2"`, so a
 *   corpse can render as the greyed fighter it was. ABSENT for card-placed objects.
 * - `TOKEN_DESTROYED.reason` gains `"EXPIRED"` (the countdown ran out).
 * - **Client-visible behaviour change:** board objects may now SHARE A SPACE (a
 *   corpse and a totem, or two corpses). Anything keying board objects by space
 *   — notably a CHOOSE_SPACE prompt-option map — must key by `ViewToken.id`.
 *
 * ## v27 (2026-08-01): benign removal (engine #318, DSL v0.34.0)
 * One additive `GameEvent` variant. `removeFromBoard` — declared in the DSL since
 * v0.1 and always throwing until now — took a body off the board WITHOUT defeating
 * it (Gerry the Isopod's "Cannibalize": eat a living Larry). That is a distinct
 * thing from a defeat and must not reuse `FIGHTER_DEFEATED`, which every client
 * treats as a death (FX, log line, and — for this deck — a corpse marker).
 *
 * - `FIGHTER_REMOVED { fighter, space }` — the fighter left `space` alive. The
 *   figure's own record no longer carries a space, which is why the event does.
 *   A client that does not know the variant simply drops it and still sees the
 *   figure disappear from the next `PlayerView`; nothing else moved.
 *
 * ## v28 (2026-08-01): the SMALL fighter class (engine #318, DSL v0.35.0)
 * The official small-fighter rules (Teen Spirit p.16) land in the engine, and one of
 * them is client-visible in a way nothing before it was: **several fighters may now
 * occupy the same space.**
 *
 * - `ViewFighter.size` — `"NORMAL" | "LARGE" | "SMALL"`. LARGE was always inferable
 *   from `tailSpace`; SMALL is not inferable from anything else on the wire.
 * - **Client-visible behaviour change:** up to 4 SMALL fighters plus at most one
 *   non-small may share a `space`, and they may belong to DIFFERENT players. Anything
 *   keying fighters by space — board rendering, target pickers, the CHOOSE_SPACE
 *   prompt map — must handle N fighters per space and key by `ViewFighter.id`.
 * - Same-space fighters are mutually ADJACENT when either is small, so a legal attack
 *   may name a target on the attacker's own space. Targeting is already fighter-id
 *   keyed; only range HINTS drawn from space adjacency need to know.
 *
 * ## Additive fields (2026-08-05, no version bump): optional player identity
 * Part of the accounts epic (issue #344). `CREATE_ROOM`/`JOIN_ROOM` gain two
 * OPTIONAL fields, and the seat's public shapes gain one:
 * - `displayName?` (request) — a human label for the seat. Sanitized server-side
 *   (control characters stripped, trimmed, truncated to 32 chars; empty after
 *   that = absent) and BROADCAST to every seat as `RoomStatusSeat.displayName`
 *   and `ViewSelf`/`ViewOpponent`/`ViewPlayer.displayName`.
 * - `playerId?` (request) — an opaque pseudonymous token, max 64 chars (longer
 *   or malformed drops the FIELD, never the join). It goes to TELEMETRY ONLY;
 *   it is never broadcast, never rendered, never logged.
 * Both are CLIENT-CLAIMED and UNVERIFIED in v1: cosmetic labeling and
 * pseudonymous attribution, never authorization. Seating, legality and
 * redaction key off the runtime seat id exactly as before. A signed-token
 * upgrade is a later phase (see server/identity.ts for the trust model).
 * Purely additive to existing objects — no PROTOCOL_VERSION bump. With the
 * request fields absent the wire is byte-identical to v28 behavior, so an older
 * client that never sends or reads them is completely unaffected.
 *
 * ## Additive fields (2026-08-06, no version bump): optional seat badge
 * Issue #347, the same pattern as `displayName` above. `CREATE_ROOM`/`JOIN_ROOM`
 * gain one more OPTIONAL field, and the seat's public shapes gain one:
 * - `badge?` (request) — an opaque badge id (e.g. `bot-slayer`), sanitized
 *   exactly like `displayName` (control characters stripped, trimmed, truncated
 *   to 32 chars; empty after that = absent) and BROADCAST beside the name as
 *   `RoomStatusSeat.badge` and `ViewSelf`/`ViewOpponent`/`ViewPlayer.badge`.
 * The server NEVER interprets the id: the client maps id → art and renders
 * nothing for an id it does not know, so the badge catalog can grow without a
 * server deploy. Client-claimed and UNVERIFIED like the fields above — purely
 * cosmetic, never authorization, and NEVER sent to telemetry. Bot seats never
 * carry one. Purely additive, so no PROTOCOL_VERSION bump: with the field
 * absent not one message grows a key.
 *
 * ## v29 (2026-08-12): per-fighter durable markers (engine #360)
 * The engine gained per-FIGHTER durable state — named, stacking, PUBLIC marks that
 * outlive the effect that applied them (Kenshiro's 708-Meridian mark, Inigo Montoya's
 * Revenge tokens). `counter`/`setFlag` are per-PLAYER and so cannot say WHICH of a
 * seat's fighters is marked, which is what made this a protocol-visible gap rather than
 * a deck detail. Two additions, both purely additive:
 * - Two `GameEvent` variants, `FIGHTER_MARKED` / `FIGHTER_MARKS_CLEARED` (above), for
 *   the log and for spot animations.
 * - `FighterStatus` gains `name?` / `count?`, carrying `kind: 'MARKED'` entries — the
 *   PERSISTENT view of the same fact, one entry per marker name, so a reconnecting
 *   client renders the marks without having replayed the log. This is the same
 *   "add a kind, never a ViewFighter field" path `PINNED` took.
 * Nothing here is secret: markers are identical for every viewer and redactFor sends
 * them to both seats. CLIENT SURFACE (unbrewed-p2p): the board fighter token badge row
 * (the component that renders the PINNED status) and the event log formatter. An older
 * client that ignores the new kind and the two events is unaffected — no existing
 * message shape changed, and no engine deck emits either today.
 *
 * ## Additive fields (2026-08-18, no version bump): opaque seat cosmetics
 * Issue #392, wave 0 of the card-cosmetics epic (unbrewed-p2p#610). The same
 * client-claimed/UNVERIFIED pattern as `badge` above, with one deliberate
 * difference: an over-cap value REJECTS the join instead of truncating.
 * - `cosmetics?` (request, `CREATE_ROOM`/`JOIN_ROOM`) — an OPAQUE string, max
 *   512 BYTES of UTF-8. Ids only — never a URL, never base64, never inline
 *   image data: this field rides `ViewPlayer`, which is rebroadcast to every
 *   seat on every action, so an unbounded blob would be a bandwidth
 *   amplification vector. Over the cap = `BAD_MESSAGE`, not a truncation,
 *   because a truncated loadout blob is garbage rather than a shorter label.
 *   Empty/absent/non-string all mean "this seat claimed no cosmetics".
 * - `ViewPlayer.cosmetics?` — echoed VERBATIM per seat. Public (both seats see
 *   it — showing your upgrades off to the opponent is the point), never
 *   redacted, absent when unclaimed.
 * - `ReplayPlayerSetup.cosmetics?` — frozen into replay bundles so an old
 *   replay re-renders with the skins it was played with. RENDER-ONLY: the
 *   engine strips the field back off before the setup reaches the reducer.
 *
 * ⛔ THE INVARIANT (copy it into any follow-up ticket): a cosmetic changes what
 * a card LOOKS like and nothing else. The engine reads an upgraded card
 * byte-for-byte identically to a plain one. No cosmetic may change any game
 * state, any legal move, any bot decision, any log line, any replay outcome,
 * any balance number, or any card identity — ever. The server's ENTIRE
 * relationship with this field is **store it, echo it, cap it**: it is never
 * parsed, never logged, never sent to telemetry, never visible to a bot (bots
 * decide from `GameState`, which has never heard of a seat label), and no
 * cosmetic id, art or tier table ever enters this repo. Enforced by
 * `test/cosmetics.test.ts` (differential determinism + bot blindness + the
 * cap) and `test/cosmeticsGuard.test.ts` (a grep guard over `engine/`, `ai/`
 * and `data/heroes/`). Purely additive, so no PROTOCOL_VERSION bump: with the
 * field absent not one message grows a key.
 *
 * ## Additive fields (2026-08-21, no version bump): incremental EFFECT movement
 * Issue #411 (extends #55), client ticket unbrewed-p2p#654. #55 made a MANEUVER
 * steppable — you spend your move one space at a time and the PATH you walk is
 * what the server records. Card and scheme movement stayed a teleport: the client
 * picked an endpoint and the server picked which fighters you "moved through".
 * For several cards the path IS the effect ("each fighter you moved through takes
 * 1"), so effect moves now step the same way. Two additive fields, no new message:
 * - `ViewPrompt.moveGraph?` — the same `MoveGraph` shape as
 *   `PlayerView.moveGraphs`, attached to the CHOOSE_SPACE destination prompt of a
 *   move (a `move` op, or a multi-fighter move's per-fighter destination pick).
 *   Choosing seat only; omitted for LARGE (two-space) movers, which keep one-click
 *   canonical poses. `canStop` is exactly the set of destinations this effect
 *   offers — the prompt's non-`stay` option ids — so `awayFrom` /
 *   "must end adjacent to" / occupancy filters are already folded in; every other
 *   node is walk-through only. The mover's own space is a node and never a stop:
 *   not moving is still the separate `stay` / `Decline move` option.
 * - `RESPOND_PROMPT.path?` — the accumulated route, `path[0]` = the mover's
 *   current space, `path[last]` = the `optionId` you are answering with. The
 *   server validates it against that graph (every step an edge, length-1 <=
 *   `allowance`, endpoint `canStop`) and REJECTS an illegal one with
 *   `ILLEGAL_ACTION`; revisiting a space is legal, it just spends steps. Omit the
 *   field and the server uses its canonical shortest path — byte-identical to
 *   today, which is what bots and older clients keep doing.
 * Purely additive, so no PROTOCOL_VERSION bump: with both fields absent not one
 * message grows a key.
 *
 * ## Additive fields (2026-08-21, no version bump): incremental LARGE movement
 * Issue #415 (follow-up to #55 / #411), client ticket unbrewed-p2p#658. Both earlier
 * passes omitted LARGE (two-space) bodies, so exactly the cards where the path
 * matters most — Stampede ("each fighter you moved through takes 1", played by a
 * LARGE hero) and Remote Control (moving the LARGE Batmobile) — were the ones still
 * picking a destination in one click. A LARGE body SNAKE-STEPS (one end leads, the
 * other is dragged into its former space), so its graph's nodes are ORDERED POSES:
 * - `PlayerView.largeMoveGraphs?: LargeMoveGraph[]` — during MANEUVER_MOVE, active
 *   seat only, absent when the seat has no LARGE body.
 * - `ViewPrompt.largeMoveGraph?: LargeMoveGraph` — on the same move prompts that
 *   carry `moveGraph` for a NORMAL mover, choosing seat only.
 * Answers are unchanged: `MOVE_FIGHTER.path` and `RESPOND_PROMPT.path` already carry
 * the LEADING END's path, which the server has always validated for a LARGE mover.
 * `MoveGraph` / `moveGraphs` / `moveGraph` are untouched and stay NORMAL+SMALL only,
 * and the tail is NEVER prompted for: it follows the head. Purely additive, so no
 * PROTOCOL_VERSION bump — with both fields absent not one message grows a key.
 *
 * ## v30 (2026-08-20): the opening-hand mulligan (engine #395)
 * After the opening hands are dealt and BEFORE the heroes are placed, each seat
 * gets a ONE-TIME keep-or-redraw choice: shuffle your whole hand back into your
 * deck and draw the same number again. One mulligan per seat per game, no partial
 * redraws. Under the hood the two decisions are ordinary sequential prompts (p1,
 * then p2) — there is no new "both seats act at once" primitive on this wire — but
 * they FEEL simultaneous because a decision applies nothing until BOTH are in:
 * - `PromptKind` gains `"MULLIGAN"` (options `KEEP` / `MULLIGAN`), answered with
 *   the usual `RESPOND_PROMPT`. The waiting seat gets the standard redacted prompt
 *   summary (`options: []`), and the `PROMPT_RESOLVED` event's `optionId` is masked
 *   for them exactly as it is for a face-down combat commit — so nobody can learn
 *   the other seat's answer while the window is open. NOTHING in `PlayerView`
 *   changes while it is open (no hand, deck count, or discard moves).
 * - Two `GameEvent` variants, `MULLIGAN_TAKEN` / `HAND_KEPT`, emitted for BOTH
 *   seats when the window closes — the decisions are public after the fact.
 * - `CREATE_ROOM.mulligan?` — per-room opt-OUT. Absent = on, which is the default
 *   for every new room; `false` reproduces the pre-v30 flow exactly (no prompt, no
 *   events, no action-log entries). Not echoed back: the client that set it knows,
 *   and both seats see the window itself the moment it opens.
 * CLIENT SURFACE (unbrewed-p2p#622): render the MULLIGAN prompt (a two-button
 * modal over your own opening hand + a "waiting for your opponent" state), and
 * format the two events in the activity log. A room created by an older client
 * still opens the window — the prompt is an ordinary prompt, so a client that
 * renders unknown prompt kinds generically can already answer it.
 *
 * ## v31 (2026-08-22): atomic position swap (engine #445, DSL v0.46.0)
 * One additive `GameEvent` variant, and the only wire change in that batch — the other
 * four items (off-turn TURN_START/TURN_END triggers, the transient `reveal` op, card-filter
 * parity, `move.chooser`) are entirely server-side and reuse shapes already here:
 * `reveal` emits the existing `CARD_REVEALED`, and a redirected move prompt is an
 * ordinary `CHOOSE_SPACE` addressed to the other seat, which the client already renders
 * (it answers whatever prompt names it).
 *
 * - `POSITIONS_SWAPPED { a, b, aTo, bTo }` — two fighters exchanged spaces atomically.
 *   A TELEPORT, not movement: no path, no "moved through", no accompanying
 *   FIGHTER_MOVED, and it does NOT count as having moved this turn. `aTo`/`bTo` are the
 *   landing poses (two spaces for a LARGE body). A client that does not know the variant
 *   drops it and still sees both figures relocated in the next `PlayerView`.
 * CLIENT SURFACE (unbrewed-p2p): an activity-log line and, ideally, a swap animation
 * distinct from a walk. Nothing breaks without it.
 *
 * ## v31 unchanged (2026-08-23): cross-player pile attach (engine #459, DSL v0.49.0)
 * A card may now be tucked into ANOTHER player's set-aside pile and keep its controller
 * ("tuck the card under the hero card of any opponent" — Boba Fett). Two purely additive
 * OPTIONAL fields, both absent unless a pile actually mixes owners, so no message grows a
 * key for any deck shipped before v0.49.0 and PROTOCOL_VERSION does not move:
 *
 * - `CARD_TUCKED.controller?` — see the variant below.
 * - `ViewSelf.pileControllers` / `ViewOpponent` / `ViewPlayer` / `ReplayStepPlayer` —
 *   `{ [pileName]: { [cardInstanceId]: PlayerId } }`, listing ONLY the entries whose
 *   controller is not the seat holding the pile. Public exactly as `piles` is.
 *   SUPERSEDED AND DELETED at v33 — the controller now rides the pile ENTRY. See below.
 * CLIENT SURFACE (unbrewed-p2p): render a foreign-controlled pile entry under the HOST's
 * nameplate (that is where `piles` puts it) but attributed to its controller — the whole
 * point of a bounty is that it sits on your opponent and pays its owner.
 *
 * ## v31 unchanged (2026-08-23): cross-player pile EXIT (engine #473, DSL v0.57.0)
 * The other direction of the same story: a card may now LEAVE a pile hosted by another
 * player, and it is routed to its CONTROLLER's hand / discard / pile, never the host's
 * (Boba Fett's bounty transfer and defeat sweep). Server-side vocabulary only —
 * `returnFromPile.of`, `discardFromPile.of` and `discardFromPile.to.of` are DSL fields no
 * message carries. One OPTIONAL additive event field, absent unless the pile was foreign,
 * so no message grows a key for any deck shipped before v0.57.0 and PROTOCOL_VERSION does
 * not move:
 *
 * - `CARD_RETURNED_FROM_PILE.host?` — WHERE the pile was, when that is not `player`.
 *   The discard-routing exit deliberately keeps emitting a plain `CARD_DISCARDED` whose
 *   `player` is the controller: pile provenance was never on that event even for own-pile
 *   exits, and the host's stack shrinking is already visible in `piles`.
 * CLIENT SURFACE (unbrewed-p2p): an activity-log line may now say "took their bounty back
 * from <host>". A client that ignores `host` logs the return without naming the host;
 * nothing breaks, and `piles` still describes the new truth.
 */
/**
 * v32 (engine #463, DSL v0.56.0) — THE EFFECT-INITIATED ATTACK. One additive `GameEvent`
 * variant, `EFFECT_ATTACK_INITIATED { attacker, target, card }`: a card effect opened a
 * REAL combat outside any action, with a NAMED PRINTED card as the attack card and no
 * action spent (Boba Fett *Slave I* → SEISMIC CHARGE). Everything after it is an ordinary
 * combat from `COMMIT_DEFENSE` onward — the defender's `COMMIT_DEFENSE_CARD` /
 * `DECLINE_DEFENSE` enumeration is unchanged, and there is no new action type, prompt kind
 * or `LegalOption` shape.
 *
 * CLIENT SURFACE (unbrewed-p2p): `card` is a CardDef id that is NOT IN THE DECK LIST — it
 * is a printed second face (`HeroDef.linkedCards`), so a client that resolves card art and
 * text by deck membership will miss it and must fall back on the id. The combat itself
 * arrives with `ViewCombat.attackerCard` already populated at `COMMIT_DEFENSE` — face-up
 * before the defender commits — which is the same shape a "Fire, you fools!" sub-attack has
 * had since v0.17.0, so that half needs nothing new.
 */
/**
 * v33 (engine #481, DSL v0.60.0, SCHEMA_VERSION 5) — THE PILE ENTRY. A BREAKING shape
 * change to one already-optional field, and a deletion.
 *
 * WHAT MOVED
 * - `ViewSelf.piles` / `ViewOpponent.piles` / `ViewPlayer.piles` / `ReplayStepPlayer.piles`
 *   are now `{ [pileName]: PileEntry[] }` instead of `{ [pileName]: CardInstanceId[] }`.
 *   A `PileEntry` is either the bare instance id (this seat controls the card — what
 *   EVERY entry was before v0.49.0 and what every own-pile tuck still emits) or
 *   `{card, controller}` for a card another seat parked here and still owns.
 * - `ViewSelf.pileControllers` / `ViewOpponent` / `ViewPlayer` / `ReplayStepPlayer` — the
 *   v0.49.0 `{ [pileName]: { [cardInstanceId]: PlayerId } }` companion map — is DELETED.
 *   Its information now rides the entry it describes.
 * - Nothing else. `CARD_TUCKED.controller?` and `CARD_RETURNED_FROM_PILE.host?` are
 *   unchanged, no action, prompt kind or `LegalOption` shape moves, and a seat that has
 *   tucked nothing still carries no `piles` key at all.
 *
 * WHY (the bug it fixes): `CardInstanceId` is `<cardDefId>#<n>` minted PER SEAT, so two
 * seats running the SAME deck hold identical ids. A pile is the only zone that mixes
 * owners, so an id-keyed controller map cannot describe one host's pile holding two cards
 * under one id — which two Boba Fett seats in ffa-3 / team-2v2 reach the moment both tuck
 * a bounty under the same third player. The server used to throw a room-level
 * `server_error` there rather than mis-attribute a card; it now represents it.
 *
 * CLIENT SURFACE (unbrewed-p2p): a client that renders piles MUST be updated — reading
 * `piles[name][i]` as a string is now wrong for a foreign entry, and the bounty-stack
 * render that keyed off `pileControllers` has to read `entry.controller` instead. Two
 * concrete consequences: instance ids are NOT unique within a pile, so a pile list must be
 * keyed by POSITION and never by card id; and the owner colour for an entry is
 * `typeof e === "string" ? <the seat holding the pile> : e.controller`.
 */
/**
 * v34 (engine #493 — Ellen Ripley). ONE ADDITIVE EVENT, and it is the smallest kind of
 * breaking change: a new `GameEvent` member.
 *
 * - `COMBAT_DEFENDER_CHANGED { from, to }` is emitted mid-combat when a card substitutes the
 *   DEFENDING FIGHTER (`{op:'setCombatDefender'}` — *"Ripley and Newt may swap spaces; if
 *   they do, the other fighter is now the defender"*). The combat, the defending PLAYER and
 *   both revealed cards are unchanged; only which FIGHTER is defending moves.
 * - Nothing else moves: no action, no prompt kind, no `LegalOption` shape, no view field.
 *   Every other event is byte-identical.
 *
 * CLIENT SURFACE (unbrewed-p2p): a client rendering a live combat MUST re-point its
 * defender slot at `to` when this arrives — `to` is the fighter that takes the damage, and
 * the one every later DURING/AFTER effect, range check and adjacency test reads. A client
 * that ignores the event will draw the damage landing on the wrong figure. It always
 * arrives BEFORE `COMBAT_VALUE_BREAKDOWN` / `COMBAT_DAMAGE` for that combat.
 */
export const PROTOCOL_VERSION = 34;

/**
 * Scripted-AI strength preset (server-side budgets; client treats as opaque).
 * `expert` (v23) is offered per hero — see `HeroListing.botTiers` — and only
 * when the server's exposure switch is on.
 */
export type BotDifficulty = "easy" | "medium" | "hard" | "expert";

export interface BotSeatFill {
  player: PlayerId;
  difficulty: BotDifficulty;
  heroId?: string;
}

// ---------------------------------------------------------------------------
// Shared primitives (mirror engine/types.ts — keep in lockstep)
// ---------------------------------------------------------------------------

export type RuntimePlayerId =
  | "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7" | "p8"
  | "p9" | "p10" | "p11" | "p12" | "p13" | "p14" | "p15" | "p16";
export type DuelPlayerId = "p1" | "p2";
export type PlayerId = RuntimePlayerId;
// Mirrors engine/format.ts TeamId (opaque format-defined team id, e.g. "A"/"B").
// Public info — every viewer sees the same team id for a given seat (issue #98).
export type TeamId = string;
export type FighterId = string; // '<playerId>/hero' | '<playerId>/sidekick-<n>'
export type CardInstanceId = string; // '<cardDefId>#<n>'
export type CardDefId = string; // 'king-kong/clobber'
/**
 * One entry in a public named set-aside pile (v33, engine #481). A BARE instance id means
 * the card is controlled by the seat whose `piles` holds it; the OBJECT form names a
 * different CONTROLLER — the card is parked under this seat but belongs to (and pays)
 * another ("tuck it under the hero card of any opponent" — Boba Fett's bounties).
 *
 * Read it as `typeof e === "string" ? e : e.card` for the id and
 * `typeof e === "string" ? host : e.controller` for the owner colour. Instance ids are
 * NOT globally unique — they are minted per seat — so a pile CAN hold two entries with the
 * same id and different controllers (two seats running the same deck, both tucking under a
 * third). Never key a pile render by instance id; key it by position.
 */
export type PileEntry = CardInstanceId | { card: CardInstanceId; controller: PlayerId };
export type SpaceId = string;
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type CombatOutcome = "ATTACKER_WON" | "DEFENDER_WON" | "UNKNOWN";

// Actions are the ONLY way the client advances the game. The server's
// legalActions() enumerates which of these are currently legal; the client
// never constructs an action the server didn't offer (exceptions: MOVE_FIGHTER
// may carry any legal path to an offered destination, and FORFEIT may always be
// sent by the player on the clock — the server's legalActions offers it too).
export type DruidForm = "Human" | "Bear" | "Moonkin";

export type Action =
  | { type: "PLACE_SIDEKICK"; player: PlayerId; fighter: FighterId; space: SpaceId }
  | { type: "MANEUVER"; player: PlayerId }
  | { type: "BOOST_MOVE"; player: PlayerId; card: CardInstanceId }
  | { type: "MOVE_FIGHTER"; player: PlayerId; fighter: FighterId; path: SpaceId[] }
  | { type: "SHAPESHIFT"; player: PlayerId; form: DruidForm; via: "MANEUVER" | "OMEN" | "TRAVEL" }
  | { type: "END_MANEUVER"; player: PlayerId }
  | { type: "SCHEME"; player: PlayerId; card: CardInstanceId }
  // Use a battlefield SCHEME item (v17 — Teen Spirit). The active fighter must
  // occupy `space` and it must hold a scheme item token. Costs an action but is NOT
  // "playing a scheme card". The client sends the space the server offered.
  | { type: "USE_SCHEME_ITEM"; player: PlayerId; space: SpaceId }
  | { type: "DECLARE_ATTACK"; player: PlayerId; attacker: FighterId; target: FighterId }
  // attachItem (v17): the attacker may attach the COMBAT item on its space to this
  // card — decided BEFORE the defender's defend decision, and public. The server
  // offers both the plain and attach variants; absent = no attach.
  | { type: "COMMIT_ATTACK_CARD"; player: PlayerId; card: CardInstanceId; attachItem?: boolean }
  // attachItem (v17): the defender may attach the COMBAT item on its space.
  | { type: "COMMIT_DEFENSE_CARD"; player: PlayerId; card: CardInstanceId; attachItem?: boolean }
  | { type: "DECLINE_DEFENSE"; player: PlayerId }
  | { type: "DISCARD_TO_LIMIT"; player: PlayerId; card: CardInstanceId }
  // `path` (issue #411, LARGE arm #415): the route the player actually walked on a
  // move prompt that carries a `moveGraph` / `largeMoveGraph`. NORMAL mover: spaces
  // from the mover's current space to `optionId`. LARGE mover: the LEADING END's
  // path, whose final pose (path[n], path[n-1]) must be `optionId` (a pose key).
  // Absent = the server's canonical shortest path, exactly as before.
  | { type: "RESPOND_PROMPT"; player: PlayerId; promptId: string; optionId: string; path?: SpaceId[] }
  // Concede (v9; multiplayer semantics 2026-07-12, issue #117). Legal for
  // whoever is on the clock during PLAY. Duel: the server ends the game with the
  // OTHER player as winner and emits the replay bundle. Multiplayer: voluntary
  // seat elimination — the game continues unless team logic or the human-stake
  // rule ends it (see the 2026-07-12 header note). The client constructs this
  // directly (the second always-available exception to "never send an action the
  // server didn't offer", alongside MOVE_FIGHTER paths) but NEVER sets
  // `endsMatch` — that flag is stamped by the server into the logged action and
  // appears in replay bundle actionLogs.
  | { type: "FORFEIT"; player: PlayerId; endsMatch?: boolean };

// ---------------------------------------------------------------------------
// Structured event stream (v10). MIRROR of engine/types.ts `GameEvent` — the
// engine is the source of truth; a compile-time assignability check in
// server/redact.ts fails the build if the two unions drift. Events reach a
// client on the STATE that carries the action that produced them, redacted
// per-player by redactEventForPlayer (server/redact.ts) so a card in a hidden
// zone is masked to '(hidden)'. The client appends them to its activity feed;
// a client that ignores `events` behaves exactly as before v10.
// ---------------------------------------------------------------------------
export type GameEvent =
  | { type: "HERO_PLACED"; fighter: FighterId; space: SpaceId }
  | { type: "SIDEKICK_PLACED"; fighter: FighterId; space: SpaceId }
  | { type: "TURN_STARTED"; player: PlayerId; turnNumber: number }
  | { type: "ACTION_SPENT"; player: PlayerId; action: "MANEUVER" | "SCHEME" | "ATTACK" | "SCHEME_ITEM" }
  | { type: "CARD_DRAWN"; player: PlayerId; card: CardInstanceId }
  | { type: "EXHAUSTION_DAMAGE"; player: PlayerId }
  | { type: "DAMAGE_APPLIED"; fighter: FighterId; amount: number; source: "EXHAUSTION" | "EFFECT" | "ATTACK" }
  | { type: "FIGHTER_DEFEATED"; fighter: FighterId }
  | { type: "MOVE_BOOSTED"; player: PlayerId; card: CardInstanceId; boost: number }
  | { type: "FIGHTER_MOVED"; fighter: FighterId; path: SpaceId[] }
  // v31 (DSL v0.46.0, engine #445): two fighters exchanged spaces atomically
  // (`swapPositions`). A TELEPORT, NOT movement — there is no path, nothing "moved
  // through", and no FIGHTER_MOVED accompanies it, so this is the only record of the
  // exchange. `aTo`/`bTo` are each fighter's LANDING pose (two spaces for a LARGE body).
  // A client that does not know the variant drops it and still sees both figures in
  // their new spaces on the next `PlayerView`.
  | { type: "POSITIONS_SWAPPED"; a: FighterId; b: FighterId; aTo: SpaceId[]; bTo: SpaceId[] }
  | { type: "FORM_CHANGED"; player: PlayerId; fighter: FighterId; form: DruidForm }
  | { type: "DIE_ROLLED"; player: PlayerId; sides: number; result: number; source: string }
  | { type: "SCHEME_PLAYED"; player: PlayerId; card: CardInstanceId }
  | { type: "CARD_DISCARDED"; player: PlayerId; card: CardInstanceId; reason: "HAND_LIMIT" | "BOOST" | "COMBAT" | "EFFECT" | "MILL" }
  | { type: "ATTACK_DECLARED"; attacker: FighterId; target: FighterId }
  | { type: "CARD_COMMITTED"; player: PlayerId }
  | { type: "CARDS_REVEALED"; attackerCard: CardInstanceId; defenderCard: CardInstanceId | null }
  // v34 (#493): the DEFENDING FIGHTER changed mid-combat (`setCombatDefender` — Ellen Ripley
  // *GET BEHIND ME*, "if they do, the other fighter is now the defender"). Same combat, same
  // defending player, same revealed cards: the damage will land on `to` instead of `from`.
  // A client showing the combat must re-point at `to` — it is the fighter that takes the
  // damage and the one every later DURING/AFTER effect and range check reads.
  | { type: "COMBAT_DEFENDER_CHANGED"; from: FighterId; to: FighterId }
  | { type: "COMBAT_DAMAGE"; amount: number }
  | { type: "COMBAT_RESOLVED"; outcome: CombatOutcome }
  | { type: "COMBAT_ENDED" }
  | { type: "TURN_ENDED"; player: PlayerId }
  | { type: "GAME_ENDED"; winner: PlayerId; reason: "HERO_DEFEATED" | "SIMULTANEOUS" | "FORFEIT" }
  | { type: "PROMPT_OPENED"; player: PlayerId; kind: PromptKind; promptId: string }
  | { type: "PROMPT_RESOLVED"; player: PlayerId; promptId: string; optionId: string }
  | { type: "VALUE_MODIFIED"; role: "ATTACK" | "DEFENSE"; delta: number; newEffective: number }
  | { type: "VALUE_SET"; role: "ATTACK" | "DEFENSE"; to: number; locked: boolean }
  | { type: "CARD_BOOSTED"; role: "ATTACK" | "DEFENSE"; card: CardInstanceId; blind: boolean }
  | { type: "BOOST_RETRIEVED"; player: PlayerId; card: CardInstanceId }
  // v24 (#281): `voided` says whether the cancel actually voided one of the named
  // card's own cancellable, non-empty effect blocks (02 §5.5). FALSE = the cancel
  // resolved but nothing was lost (a card with no effect blocks, e.g. Gromnir, or only
  // UNCANCELLABLE ones) — clients MUST NOT narrate "effects cancelled" in that case;
  // the printed value and any ability-attached boost still count. `boostVoided` is the
  // ability-attached-boost consequence (HeroDef attackBoost discardIfCanceled path):
  // the boost rides the card but stops counting toward its value. `card` names WHICH
  // combat card was hit (role alone is ambiguous with an additional defense in play);
  // null for a synthetic sub-attack card.
  | { type: "EFFECT_CANCELED"; role: "ATTACK" | "DEFENSE"; scope: string; card: CardInstanceId | null; voided: boolean; boostVoided: boolean }
  | { type: "ACTIONS_GAINED"; player: PlayerId; amount: number }
  | { type: "TURN_END_FORCED"; player: PlayerId }
  | { type: "DEFENSE_IGNORED" }
  | { type: "DAMAGE_PREVENTED"; scope: "ALL" }
  | { type: "COUNTER_CHANGED"; player: PlayerId; name: string; value: number }
  | { type: "FLAG_SET"; player: PlayerId; flag: string }
  | { type: "FLAG_CLEARED"; player: PlayerId; flag: string }
  | { type: "CARD_KEPT"; player: PlayerId; card: CardInstanceId }
  | { type: "ABILITY_BOOST_COMMITTED"; player: PlayerId }
  | { type: "DECK_TOP_REORDERED"; player: PlayerId; count: number }
  | { type: "STAT_SET"; fighter: FighterId; stat: "MOVE"; to: number; expiresAtTurn: number; expiresAt: "START" | "END" }
  | { type: "HP_FLOOR_SET"; fighter: FighterId; floor: number; expiresAtTurn: number; expiresAt: "START" | "END" }
  | { type: "HP_SET"; fighter: FighterId; to: number }
  | { type: "EFFECT_SCHEDULED"; source: string; fireAt: "START" | "END" | "COMBAT_END" }
  // v10: mirror of EFFECT_SCHEDULED emitted when a scheduled effect actually
  // fires — lets the client attribute delayed effect damage to the source card.
  | { type: "EFFECT_FIRED"; source: string; fireAt: "START" | "END" | "COMBAT_END" }
  | { type: "CARD_FOUND"; player: PlayerId; card: CardInstanceId; from: "DECK" | "DISCARD" }
  | { type: "CARD_SHUFFLED_INTO_DECK"; player: PlayerId; card: CardInstanceId; from: "HAND" | "DISCARD" }
  | { type: "CARD_RETURNED_TO_HAND"; player: PlayerId; card: CardInstanceId }
  // v25 (DSL v0.29.0 — set-aside piles): a played card was tucked into a named
  // public pile ("under the hero card") instead of discarding, and the inverse —
  // a tucked card taken back to its owner's hand. Both are full information: the
  // pile's contents ride every seat's view (see ViewSelf.piles).
  // v0.49.0 (engine #459): `controller` is present ONLY on a cross-player tuck ("tuck the
  // card under the hero card of any opponent"). `player` is unchanged and still names the
  // pile's HOST — where the card now sits, which is what a client renders; `controller`
  // says whose card it still is. Purely additive: absent on every same-seat tuck.
  | { type: "CARD_TUCKED"; player: PlayerId; card: CardInstanceId; pile: string; controller?: PlayerId }
  | { type: "CARD_RETURNED_FROM_PILE"; player: PlayerId; card: CardInstanceId; pile: string; host?: PlayerId } // v0.57.0: `player` is the CONTROLLER (whose hand it lands in); OPTIONAL `host` names WHERE the pile was, and is absent unless that is somebody else
  | { type: "CARD_PLAYED_FROM_HAND"; player: PlayerId; card: CardInstanceId }
  | { type: "ADDITIONAL_DEFENSE_PLAYED"; player: PlayerId; card: CardInstanceId }
  | { type: "CARD_REVEALED"; player: PlayerId; card: CardInstanceId }
  | { type: "DECK_SHUFFLED"; player: PlayerId }
  // v30 — opening-hand mulligan (engine #395). Emitted ONLY when the window closes,
  // once for EVERY seat (one of the two), in setup order: the decision is public
  // after the fact, so the activity log can say "p1 mulliganed their opening hand"
  // / "p2 kept their hand" without inferring it from the shuffle/draw traffic.
  // A MULLIGAN_TAKEN is followed by that seat's CARD_SHUFFLED_INTO_DECK batch,
  // DECK_SHUFFLED and CARD_DRAWN batch (card ids redacted for the other seat).
  | { type: "MULLIGAN_TAKEN"; player: PlayerId }
  | { type: "HAND_KEPT"; player: PlayerId }
  | { type: "TOKEN_PLACED"; token: string; kind: ViewTokenKind; owner: PlayerId; space: SpaceId; origin?: string }
  | { type: "TOKEN_DESTROYED"; token: string; kind: ViewTokenKind; owner: PlayerId; space: SpaceId; reason: "EFFECT" | "ENTERED" | "REPLACED" | "OWNER_ELIMINATED" | "EXPIRED" }
  | { type: "FIGHTER_REVIVED"; fighter: FighterId; space: SpaceId }
  // v27 — benign removal: the fighter left `space` ALIVE (removeFromBoard). Not a death.
  | { type: "FIGHTER_REMOVED"; fighter: FighterId; space: SpaceId }
  | { type: "FIGHTER_PINNED"; fighter: FighterId; expiresAtTurn: number; expiresAt: "START" | "END" }
  // v29 — per-fighter durable markers (engine #360). `total` is the fighter's resulting
  // stack count for that name, so "Revenge x3" renders from the event alone; a null
  // expiry stamp means the mark is DURABLE (survives turn edges until cleared or the
  // fighter is defeated). Neither the turn-edge expiry sweep nor a defeat emits an
  // event — both are derivable from TURN_STARTED / FIGHTER_DEFEATED.
  | { type: "FIGHTER_MARKED"; fighter: FighterId; name: string; count: number; total: number; expiresAtTurn: number | null; expiresAt: "START" | "END" | null }
  | { type: "FIGHTER_MARKS_CLEARED"; fighter: FighterId; name: string | null; removed: number }
  | { type: "FIGHTER_TAIL_PLACED"; fighter: FighterId; space: SpaceId }
  | { type: "FIGHTER_EJECTED"; fighter: FighterId; to: SpaceId }
  | { type: "REGION_CLOSED"; region: string }
  // v0.14.0 (Grievous batch A): markCombatWon marks the controller as having won a combat this
  // turn; returnPlayedCard takes a played-this-turn card back to hand (discard case; the
  // live-combat-card case reuses CARD_RETURNED_TO_HAND at cleanup).
  | { type: "COMBAT_WON_MARKED"; player: PlayerId }
  | { type: "PLAYED_CARD_RETURNED"; player: PlayerId; card: CardInstanceId }
  // v0.16.0 (Grievous batch C — Multi-Arm Barrage). SECOND_ATTACK_COMMITTED is card-less
  // (like CARD_COMMITTED): the face-down second attack must not leak. BONUS_ATTACK_STARTED
  // marks Combat 2 opening; BONUS_ATTACK_PASSED marks the attacker declining it.
  | { type: "SECOND_ATTACK_COMMITTED"; player: PlayerId }
  | { type: "BONUS_ATTACK_STARTED"; attacker: FighterId; target: FighterId }
  | { type: "BONUS_ATTACK_PASSED"; player: PlayerId }
  // v0.17.0 (Grievous batch D — "Fire, you fools!"): a chosen droid's fixed-value sub-attack
  // opens against `target`. Full information — the value is printed on card 210.
  | { type: "SUB_ATTACK_INITIATED"; attacker: FighterId; target: FighterId; value: number }
  // v0.54.0 (#463): `{op:'attackWith'}` opened a REAL combat from an effect, outside any
  // action — a named LINKED printed card (`card`) attacks `target`, no action spent. The
  // combat that follows is an ordinary one from COMMIT_DEFENSE onward.
  | { type: "EFFECT_ATTACK_INITIATED"; attacker: FighterId; target: FighterId; card: CardDefId }
  // v0.45.0 (#378): a whole-card cancel (Feint) landed on a synthetic sub-attack card, so the
  // rest of that card's chain — `severed` still-queued links — never opens. `card` is the
  // parent card whose text queued them. Narration only: the canceled link's own combat has
  // already resolved on printed value.
  | { type: "CHAIN_SEVERED"; card: CardDefId; severed: number }
  // Battlefield items (v17 — Teen Spirit). ITEM_USED = a scheme item was activated
  // (token consumed). COMBAT_ITEM_ATTACHED = a combat item was attached to a combat
  // card at commit (token consumed); the +value bump lands in the DURING window.
  | { type: "ITEM_USED"; player: PlayerId; space: SpaceId; item: string }
  | { type: "COMBAT_ITEM_ATTACHED"; player: PlayerId; role: "ATTACK" | "DEFENSE"; space: SpaceId; item: string; value: number }
  // v24 (#281): effect-resolution marker. Emitted immediately BEFORE the ops of one
  // effect block / trigger / scheme run, and again right after PROMPT_RESOLVED when the
  // answer belongs to a parked run, so every consequence event that follows
  // (CARD_DRAWN, EXHAUSTION_DAMAGE, FIGHTER_MOVED, DAMAGE_APPLIED, …) is attributable
  // to `source` UNTIL THE NEXT MARKER. `source` is a card instance id, `hero:<pid>` for
  // a hero ability, or `item:<id>` for a battlefield item. Engine-driven system prompts
  // (combat commit, setup placement) emit no marker at all. A run that prompts several
  // times re-emits the SAME marker after each answer — consecutive identical markers are
  // idempotent, and a client may collapse them into one feed entry.
  | { type: "EFFECT_RESOLVING"; source: string; window: EffectWindow; player: PlayerId }
  // v24 (#281): the combat value math, emitted once per combat at damage calc,
  // immediately before COMBAT_DAMAGE / COMBAT_RESOLVED. VALUE_MODIFIED narrates deltas
  // as they land; this is the reconciled total the outcome was decided on. `defense` is
  // empty when the defender declined (or when `ignoreDefense`), and holds two entries
  // when an additional defense card is in play.
  | { type: "COMBAT_VALUE_BREAKDOWN"; attack: ValueBreakdown; defense: ValueBreakdown[]; effectiveAttack: number; effectiveDefense: number; ignoreDefense: boolean };

/**
 * The timing context an effect run belongs to (v24, #281) — reported by
 * EFFECT_RESOLVING so a client can label the marker ("AFTER · SNIPE"). Engine-internal
 * 'SYSTEM' runs never reach the wire (they emit no marker), so the value is listed for
 * completeness only.
 */
export type EffectWindow =
  | "IMMEDIATELY"
  | "DURING"
  | "AFTER"
  | "SCHEME"
  | "TRIGGER"
  | "SCHEDULED"
  | "SETUP"
  | "ITEM"
  | "SYSTEM";

/**
 * One combat card's effective-value components (v24, #281). `total` is authoritative
 * (it is the engine's effectiveValue, and matches `ViewCombatCard.effectiveValue`); the
 * components explain it:
 *   total = max(0, (override ?? printed) + delta + boosts + abilityBoosts)
 * A `locked` card ("cannot be changed") freezes at (override ?? printed) and reports 0
 * for every other channel. `abilityBoosts` is 0 when an actual cancel voided the card
 * (02 §5.5) — the same fact EFFECT_CANCELED.boostVoided reported.
 */
export interface ValueBreakdown {
  role: "ATTACK" | "DEFENSE";
  card: CardInstanceId | null; // null = synthetic sub-attack card
  printed: number;
  override: number | null;
  delta: number;
  boosts: number;
  abilityBoosts: number;
  locked: boolean;
  total: number;
}

export type LegalOption = { id: string; label: string; data?: Json };

export type PromptKind =
  | "CHOOSE_TARGET"
  | "CHOOSE_SPACE"
  | "YES_NO"
  | "CHOOSE_OPTION"
  | "COMMIT_COMBAT_CARD"
  | "PAY_COST"
  // v30 — the one-time opening-hand mulligan (engine #395). Two options, ids
  // "KEEP" and "MULLIGAN"; answered with RESPOND_PROMPT like any other prompt.
  // Opened during SETUP, before the heroes are on the board. The OTHER seat gets
  // the usual redacted summary (`options: []` = "they are deciding") and learns
  // nothing about the answer until both seats have decided.
  | "MULLIGAN";

/**
 * The prompt as the viewer sees it. The choosing player receives the full
 * options; the other player receives `options: []` (render "opponent is
 * deciding…"). Answer by sending the RESPOND_PROMPT action offered in
 * `legalActions`.
 */
export interface ViewPrompt {
  promptId: string;
  player: PlayerId;
  kind: PromptKind;
  options: LegalOption[];
  /** What opened this prompt: a resolving card's instance (face public to both
   *  players), a hero ability, or null for system prompts (setup, commit,
   *  maneuver). Lets the client show WHICH effect is asking. A card is named
   *  only when its face is public to BOTH viewers — a face still hidden from the
   *  receiving viewer sends null instead, so this never leaks a redacted id. */
  source?: { card: CardInstanceId } | { hero: PlayerId } | null;
  /** Mechanical summary of WHAT is being chosen (op verb + amount, e.g. "Choose
   *  a fighter to take 2 damage") — issue #134. Generated at emission time from
   *  the op being resolved, never per-card authored; undefined where a non-vague
   *  summary isn't mechanically derivable (system prompts, or prompt kinds other
   *  than CHOOSE_TARGET/CHOOSE_SPACE). Public: never depends on hidden info. */
  description?: string;
  /** Issue #411 — incremental EFFECT movement. Present ONLY on the CHOOSE_SPACE
   *  destination prompt of a move (a card/scheme `move`, or a multi-fighter
   *  move's per-fighter destination pick), only for the choosing seat, and only
   *  when the mover is NORMAL-sized. Walk it locally exactly like
   *  `PlayerView.moveGraphs` and answer with `RESPOND_PROMPT.path`. `canStop`
   *  marks the destinations this effect actually offers (the same set as the
   *  prompt's non-`stay` option ids), so every card-specific filter is already
   *  applied; other nodes are walk-through only. A client that ignores this
   *  keeps today's one-click-to-destination behavior. */
  moveGraph?: MoveGraph;
  /** Issue #415 — the same affordance for a LARGE (two-space) mover, whose nodes
   *  are ordered (lead, trail) POSES. Present on exactly the same prompts, for the
   *  same seat, under the same `canStop` intersection; exactly one of `moveGraph` /
   *  `largeMoveGraph` is ever present. See LargeMoveGraph. */
  largeMoveGraph?: LargeMoveGraph;
}

// ---------------------------------------------------------------------------
// Map (mirror engine/map.ts MapDef — the server sends the full graph in the
// view; clients never load map files themselves)
// ---------------------------------------------------------------------------

export interface ProMapZone {
  id: string;
  color: string;
  label: string;
}

// A board region (v0.12.0 — Baba Yaga's Hut): a partition rendered as an inset
// minimap panel. See engine docs/plans/baba-yaga-hut-design.md D11.
export interface ProMapRegion {
  id: string;
  label: string;
  imageUrl?: string; // region inset background
  spaceDiameter?: number; // pawn size inside the region frame
}

export interface ProMapSpace {
  id: SpaceId;
  x: number; // normalized 0–1 fraction of image width
  y: number; // normalized 0–1 fraction of image height
  zones: string[]; // SET semantics — multi-zone spaces list every zone
  adjacentTo: SpaceId[]; // undirected, stored symmetrically
  oneWayTo?: SpaceId[]; // directed MOVEMENT-ONLY edges (e.g. Drum stairs)
  region?: string; // region id (absent = main board) — v0.12.0
  start?: { slot: number };
  item?: string; // v17 — battlefield item id spawned here (ProMapItem.id)
  passage?: boolean; // v17 — secret-passage space marker rendered by the client
}

// A battlefield item printed on the board (v17 — Teen Spirit). 'combat' items add a
// DURING COMBAT value bump; 'scheme' items are use-activated. `ops` (scheme items)
// is the effect DSL body — opaque to the client, resolved server-side. The client
// renders a badge on `item` spaces (purple versatile square / yellow scheme square)
// and clears it when the token leaves `itemTokens`.
export interface ProMapItem {
  id: string;
  kind: "combat" | "scheme";
  label: string;
  value?: number; // combat items: the value bump
  ops?: Json; // scheme items: effect body (opaque to the client)
}

export interface ProMapDef {
  schemaVersion: string;
  id: string;
  meta: {
    title: string;
    minPlayers: number;
    maxPlayers: number;
    specialRules: boolean;
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    spaceDiameter?: number; // pawn/space size as a fraction of image WIDTH
    set?: string;
    source?: string;
    license?: string;
  };
  zones: ProMapZone[];
  regions?: ProMapRegion[]; // v0.12.0 — board regions (absent on ordinary maps)
  items?: ProMapItem[]; // v17 — battlefield item definitions (absent on ordinary maps)
  spaces: ProMapSpace[];
}

// ---------------------------------------------------------------------------
// Card catalog — printed metadata for every CardDefId in the match, so the
// client renders rule-true numbers. Strip a CardInstanceId's '#n' suffix to
// look it up. (Display art can still be matched by title against the
// unbrewed-api deck; the catalog is the mechanical truth.)
// ---------------------------------------------------------------------------

export interface CardMeta {
  title: string;
  type: "attack" | "defense" | "scheme" | "versatile";
  value: number | null;
  boost: number | null;
}

// ---------------------------------------------------------------------------
// Per-player redacted view. The server strips the opponent's secrets and
// replaces them with counts; the viewer's own secrets arrive in full.
// ---------------------------------------------------------------------------

export interface ViewFighter {
  id: FighterId;
  owner: PlayerId;
  kind: "HERO" | "SIDEKICK";
  name: string;
  space: SpaceId | null;
  // v6: the second body space of a LARGE fighter (adjacent to `space`), or null
  // for NORMAL fighters / off-board. Render as two linked tokens + stretch-band.
  tailSpace: SpaceId | null;
  hp: number;
  maxHp: number;
  reach: "MELEE" | "RANGED" | "LUNGE"; // LUNGE v0.15.0 (General Grievous) — client renders the lunge reach icon
  // v28 — the fighter's size class. LARGE was previously inferable from `tailSpace`;
  // SMALL is not inferable from anything on the wire, and the client needs it: several
  // small fighters legally SHARE a space (≤4 smalls + ≤1 non-small), so the board must
  // stack them, and same-space fighters are mutually adjacent for targeting.
  size: "NORMAL" | "LARGE" | "SMALL";
  defeated: boolean;
  // Additive field (2026-07-16, no version bump): per-fighter status effects
  // (issue #204) — the fighter-scoped parallel to ViewSelf/ViewOpponent.flags
  // (v16, per-player). `kind` is a mechanical, engine-stable tag (e.g.
  // 'PINNED' for the pin op / FIGHTER_PINNED event, matching future
  // statOverrides-derived kinds); the client maps `kind` to its own
  // flavor label/icon — the engine never bakes in per-hero flavor text.
  // `expiresAtTurn`/`expiresAt` mirror the underlying absolute-stamped expiry
  // (present when the effect is timed; both entries may be absent for a
  // permanent status once one exists). This is a per-FIGHTER field rather
  // than folded into the per-player `flags` model because these effects can
  // target a fighter that is not its controller's own hero (OPPOSING_FIGHTER,
  // possibly a sidekick) and are typically inflicted by the opponent. Public:
  // nothing about a fighter's status is secret. An older client that ignores
  // it is unaffected.
  statuses?: FighterStatus[];
}

export interface FighterStatus {
  kind: string; // e.g. 'PINNED' — mechanical/engine-stable, not display text
  expiresAtTurn?: number | null;
  expiresAt?: "START" | "END" | null;
  // v29 — set on `kind: 'MARKED'` (per-fighter durable markers, engine #360): the
  // marker's engine-stable NAME (e.g. 'MERIDIAN', 'REVENGE') and how many stacks of it
  // the fighter carries. One status entry per distinct name, sorted by name. The client
  // maps name → badge art exactly as it maps `kind` → icon; a name it does not know
  // should still render a generic mark with the count. Absent on every other kind.
  name?: string;
  count?: number;
}

// Board object kinds (protocol v26). 'totem' = Thrall's totems, unchanged.
// 'corpse' = a defeated fighter's body left on the board (Gerry the Isopod). A
// client that does not know a kind should still render SOMETHING at `space` —
// kinds are additive and this union will grow (walls, traps, decoys).
export type ViewTokenKind = "totem" | "corpse";

// Neutral board objects. Nothing about one is hidden — the full list is sent to
// both players; the client renders a non-interactive sprite at `space` and diffs
// appearances/disappearances (TOKEN_PLACED/TOKEN_DESTROYED).
//
// NO board object participates in occupancy: fighters enter, pass through, and end
// on any object's space. Two objects CAN share a space (a corpse and a totem, or two
// corpses) — the pre-v26 "tokens never share a space" assumption no longer holds, so
// a client keying board objects by space must key by `id` instead.
export interface ViewToken {
  id: string;
  kind: ViewTokenKind;
  owner: PlayerId;
  space: SpaceId;
  // Countdown lifecycle (protocol v26). Remaining OWNER turns before the object is
  // removed — render as pips. It ticks down at the start of each of the owner's
  // turns and the object disappears at the start of the owner's turn on which this
  // reads 0, so "0" means "gone at your next turn's start". ABSENT = permanent
  // (every totem).
  ownerTurnsRemaining?: number;
  // Provenance for display only, e.g. "corpse-of:p1/sidekick-2" — lets the client
  // label a corpse with the fighter it came from (a greyed Larry, not a generic
  // marker). Absent for card-placed objects. The engine never reads it.
  origin?: string;
}

// Incremental maneuver movement (issue #55). A per-fighter graph the client walks
// LOCALLY to step a maneuver hop by hop (up to `allowance` total steps), then
// commits ONE MOVE_FIGHTER with the accumulated (possibly back-and-forth) path —
// the server already accepts any legal path whose endpoint is a reachable
// destination. `nodes` are every space reachable within `allowance` steps
// (including pass-through-only spaces); `canStop` marks the legal resting places
// (empty, not barred — a valid MOVE_FIGHTER endpoint); `edges` are the directed
// legal single steps among `nodes` (adjacentTo ∪ oneWayTo ∪ portals ∪ passages —
// undirected edges appear both ways so you can wander back, one-way arrows appear
// one way only). The fighter's own start space is a node with `canStop=false`
// (staying put is END_MANEUVER). See PlayerView.moveGraphs.
export interface MoveGraphNode {
  space: SpaceId;
  canStop: boolean;
}

export interface MoveGraph {
  fighter: FighterId;
  allowance: number; // max total steps (baseMove / MOVE override + applied maneuver boost)
  nodes: MoveGraphNode[];
  edges: [SpaceId, SpaceId][];
}

// Incremental LARGE-fighter movement (issue #415). A LARGE (two-space) body
// SNAKE-STEPS: one end leads and the other is DRAGGED into the lead's former space,
// so the tail is never a free choice — there is no "place the tail" step, and the
// old "click the second gold space to finish the move" click disappears. Its graph
// therefore has ORDERED POSES for nodes rather than spaces.
//
// `canStop` = a legal END pose: both spaces free of other non-small fighters, not
// the pose you started in, and — on a prompt — one of the destinations the effect
// actually offered (so `awayFrom` / "must end adjacent to" / pins are folded in).
// Poses that are only walked through stay in the list.
export interface LargeMoveGraphPose {
  lead: SpaceId;
  trail: SpaceId;
  canStop: boolean;
}

export interface LargeMoveGraph {
  fighter: FighterId;
  allowance: number; // max total steps (baseMove / MOVE override + applied maneuver boost)
  // BOTH orientations of the current pose are listed — `(space, tailSpace)` and
  // `(tailSpace, space)`. Choosing one is choosing which end leads; neither is
  // `canStop` (a zero-net move is not a move — staying put is END_MANEUVER, or the
  // prompt's `stay` / `Decline move` option).
  poses: LargeMoveGraphPose[];
  // Directed legal single snake steps `[[fromLead, fromTrail], [toLead, toTrail]]`,
  // always with `toTrail === fromLead`. A step may never enter the body's own
  // trailing space (it cannot pass through itself); revisiting a space is legal and
  // only spends steps. One-way arrows are plain both-way edges for a LARGE body (the
  // official ruling, issue #164) and secret passages are absent (large figures cannot
  // use them) — both already baked in here.
  edges: [[SpaceId, SpaceId], [SpaceId, SpaceId]][];
}

// Accumulate the LEADING END's path as you step — `[firstLead, next, next, ...]` —
// and commit it as `MOVE_FIGHTER.path` (maneuver) or `RESPOND_PROMPT.path` (effect
// move), exactly as for a NORMAL mover. The landing pose is `(path[n], path[n-1])`.
// On an effect move the `optionId` you answer with is the destination's POSE KEY:
// the two final spaces sorted ascending and joined with "|" (e.g. "a4|a5") — the id
// the prompt already offers today.

export interface ViewSelf {
  id: PlayerId;
  heroId: string;
  // #344: this seat's claimed display name, sanitized server-side; absent when
  // the seat claimed none. Public (both seats see it), cosmetic, UNVERIFIED.
  displayName?: string;
  // #347: this seat's claimed badge id, sanitized server-side; absent when the
  // seat claimed none. Opaque — the server never interprets it; a client maps
  // it to art and renders nothing for an unknown id. Public, cosmetic,
  // UNVERIFIED, and never sent to telemetry.
  badge?: string;
  hand: CardInstanceId[];
  deckCount: number;
  discard: CardInstanceId[];
  ongoingScheme?: CardInstanceId | null; // public face-up ongoing scheme, if any (older views may omit)
  piles?: Record<string, PileEntry[]>; // v25: named public set-aside piles ("tucked under the hero card"), card identities visible to EVERY viewer; absent when nothing is tucked. v33: each entry is a bare id (this seat controls it) or `{card, controller}` (an opponent tucked it here and still owns it) — see PileEntry
  committedCard: CardInstanceId | null; // own face-down commit (visible to self)
  counters: Record<string, number>;
  // v16: active named flags (setFlag op), keyed by flag name -> true. Generic
  // public-state primitive (tide today; stances/charges/forms in future decks) —
  // presence = currently active, mirroring engine PlayerState.flags. Public,
  // same for every viewer, no per-flag special-casing.
  //
  // RESERVED NAMESPACE (engine v0.51.0, #462 — NO protocol version change, since this
  // map's shape and semantics are unchanged): a key prefixed `DENY:` is an ACTION
  // DENIAL, not a hero state. `DENY:DRAW` / `DENY:MANEUVER` / `DENY:SCHEME` /
  // `DENY:ATTACK` mean that player currently may not do that thing (the engine enforces
  // it in the draw path and in the legal-action enumeration, so the client never has to);
  // `DENY:TURN` means that player's NEXT turn is skipped (it is consumed when that turn
  // opens, and the skipped turn arrives as an ordinary TURN_STARTED followed by
  // TURN_END_FORCED); any other `DENY:<X>` means that player may not ENTER the flag
  // `<X>`. NOTE the map collapses duplicates — denials APPEND in the engine, so two
  // overlapping ones show as a single key; presence, not count, is what a client renders.
  // A client that ignores the prefix keeps working — it just renders a flag chip with an
  // odd name. Worth a HUD affordance: a denied seat's missing action, or a turn that
  // opens and immediately ends, is otherwise unexplained.
  flags: Record<string, boolean>;
  // Won >=1 combat this turn (engine combatsWonThisTurn membership; also set by
  // markCombatWon off a loss). Public, turn-scoped — see the 2026-07-13 additive note.
  wonCombatThisTurn: boolean;
  // Turn-scoped event flags (v0.22.0 additive family, see the note below). All public,
  // identical for every viewer, clear at turn start.
  lostCombatThisTurn: boolean; // lost >=1 combat this turn (engine combatsLostThisTurn)
  firstAttackThisTurn: boolean; // has NOT yet resolved an attack this turn (next attack is the first)
  playedACardThisTurn: boolean; // played (revealed/schemed) >=1 card this turn
  tookDamageThisTurn: boolean; // an owned fighter took >=1 damage this turn
}

export interface ViewOpponent {
  id: PlayerId;
  heroId: string;
  // #344: this seat's claimed display name, sanitized server-side; absent when
  // the seat claimed none. Public (both seats see it), cosmetic, UNVERIFIED.
  displayName?: string;
  // #347: this seat's claimed badge id, sanitized server-side; absent when the
  // seat claimed none. Opaque — the server never interprets it; a client maps
  // it to art and renders nothing for an unknown id. Public, cosmetic,
  // UNVERIFIED, and never sent to telemetry.
  badge?: string;
  handCount: number;
  deckCount: number;
  discard: CardInstanceId[]; // discard is public
  ongoingScheme?: CardInstanceId | null; // public face-up ongoing scheme, if any (older views may omit)
  piles?: Record<string, PileEntry[]>; // v25: named public set-aside piles ("tucked under the hero card"), card identities visible to EVERY viewer; absent when nothing is tucked. v33: each entry is a bare id (this seat controls it) or `{card, controller}` (an opponent tucked it here and still owns it) — see PileEntry
  hasCommitted: boolean; // face-down commit exists, identity hidden
  counters: Record<string, number>; // counters are public
  flags: Record<string, boolean>; // v16: active named flags, public (see ViewSelf.flags)
  wonCombatThisTurn: boolean; // public, turn-scoped (see ViewSelf.wonCombatThisTurn)
  lostCombatThisTurn: boolean; // v0.22.0, public, turn-scoped (see ViewSelf)
  firstAttackThisTurn: boolean; // v0.22.0, public, turn-scoped (see ViewSelf)
  playedACardThisTurn: boolean; // v0.22.0, public, turn-scoped (see ViewSelf)
  tookDamageThisTurn: boolean; // v0.22.0, public, turn-scoped (see ViewSelf)
}

export interface ViewPlayer {
  id: PlayerId;
  heroId: string;
  you: boolean;
  // #344: this seat's claimed display name, sanitized server-side; absent when
  // the seat claimed none. Public (both seats see it), cosmetic, UNVERIFIED.
  displayName?: string;
  // #347: this seat's claimed badge id, sanitized server-side; absent when the
  // seat claimed none. Opaque — the server never interprets it; a client maps
  // it to art and renders nothing for an unknown id. Public, cosmetic,
  // UNVERIFIED, and never sent to telemetry.
  badge?: string;
  // #392: this seat's claimed cosmetics blob, echoed VERBATIM. Opaque — the
  // server never parses it, only caps it at 512 bytes on join; a client
  // resolves the ids inside against a runtime cosmetics manifest and renders
  // base art for anything it does not recognize. Public (the opponent is meant
  // to see your upgrades), cosmetic, UNVERIFIED, never sent to telemetry, and
  // absent when the seat claimed none. See THE INVARIANT in the header note.
  cosmetics?: string;
  // Format-defined team id (duel/ffa: each seat is its own team). Public info —
  // identical for every viewer, never redacted (issue #98).
  team?: TeamId;
  hand?: CardInstanceId[]; // present only for the receiving player's own seat
  handCount: number;
  deckCount: number;
  discard: CardInstanceId[];
  ongoingScheme?: CardInstanceId | null; // public face-up ongoing scheme, if any (older views may omit)
  piles?: Record<string, PileEntry[]>; // v25: named public set-aside piles ("tucked under the hero card"), card identities visible to EVERY viewer; absent when nothing is tucked. v33: each entry is a bare id (this seat controls it) or `{card, controller}` (an opponent tucked it here and still owns it) — see PileEntry
  committedCard?: CardInstanceId | null; // own face-down commit, present only for self
  hasCommitted: boolean;
  counters: Record<string, number>;
  flags: Record<string, boolean>; // v16: active named flags, public (see ViewSelf.flags)
  wonCombatThisTurn: boolean; // public, turn-scoped (see ViewSelf.wonCombatThisTurn)
  lostCombatThisTurn: boolean; // v0.22.0, public, turn-scoped (see ViewSelf)
  firstAttackThisTurn: boolean; // v0.22.0, public, turn-scoped (see ViewSelf)
  playedACardThisTurn: boolean; // v0.22.0, public, turn-scoped (see ViewSelf)
  tookDamageThisTurn: boolean; // v0.22.0, public, turn-scoped (see ViewSelf)
}

export interface ViewCombatCard {
  instance: CardInstanceId;
  role: "ATTACK" | "DEFENSE";
  boosts: CardInstanceId[]; // attached boost cards (public once attached)
  effectiveValue: number; // server-computed running value (printed ± effects + boosts)
}

export interface ViewCombat {
  attackerPlayer: PlayerId;
  defenderPlayer: PlayerId;
  attacker: FighterId;
  target: FighterId;
  stage:
    | "COMMIT_ATTACK"
    | "COMMIT_DEFENSE"
    | "IMMEDIATELY"
    | "DURING"
    | "DAMAGE"
    | "AFTER"
    | "HERO_POST"
    | "CLEANUP";
  // Revealed cards only — null before reveal / if defender declined.
  attackerCard: ViewCombatCard | null;
  defenderCard: ViewCombatCard | null;
  additionalDefenseCard: ViewCombatCard | null;
  outcome: CombatOutcome | null;
  attackDamageDealt: number | null;
}

export interface PlayerView {
  you: PlayerId;
  phase: "SETUP" | "PLAY" | "GAME_OVER";
  turnNumber: number;
  activePlayer: PlayerId;
  actionsRemaining: number;
  turnPhase: "ACTION_SELECT" | "MANEUVER_MOVE" | "DISCARD_TO_LIMIT" | null;
  // Non-null only during MANEUVER_MOVE (which fighters already moved, boost applied).
  maneuver: { boostApplied: number; boosted: boolean; moved: FighterId[] } | null;
  // issue #55: per-fighter incremental-movement graphs, present ONLY for the active
  // player during MANEUVER_MOVE (absent for the opponent and in every other phase).
  // Lets the client step a maneuver hop-by-hop locally and commit ONE MOVE_FIGHTER
  // with the accumulated path (the server accepts any legal path to a reachable
  // destination). A client that ignores this keeps today's one-click-to-destination
  // behavior. LARGE fighters are omitted here — they get `largeMoveGraphs` below.
  // See MoveGraph.
  moveGraphs?: MoveGraph[];
  // issue #415: the same, for this seat's LARGE (two-space) bodies — ordered
  // (lead, trail) poses instead of spaces, because a snake step drags the tail.
  // Same phase and same seat as `moveGraphs`, but ABSENT entirely when the seat has
  // no LARGE fighter on the board. See LargeMoveGraph.
  largeMoveGraphs?: LargeMoveGraph[];
  map: ProMapDef;
  catalog: Record<CardDefId, CardMeta>;
  fighters: ViewFighter[];
  tokens: ViewToken[]; // neutral board tokens (totems); public to both players
  self: ViewSelf;
  // Duel compatibility alias: the first non-self player in runtime order, or null
  // in malformed/spectator-free states. New multiplayer clients should use players[].
  opponent: ViewOpponent | null;
  players: ViewPlayer[];
  combat: ViewCombat | null;
  prompt: ViewPrompt | null;
  // Regions currently OUT OF PLAY (v0.12.0 — a closed Hut). Public info (no
  // redaction); the client greys out the region's inset panel. Absent/[] = none.
  closedRegions?: string[];
  // v17: battlefield item tokens still ON the board, keyed by space → item id
  // (look the id up in map.items). Public — "the effects aren't secret". Absent on
  // maps with no items; an id disappears from here the instant its token is
  // consumed. The client renders/clears item badges from this map.
  itemTokens?: Record<SpaceId, string>;
  // v11: true iff THIS viewer has an eligible last discrete move to undo right now
  // (there is a clean cut boundary the server would rewind to). Recomputed on every
  // STATE broadcast per-viewer; the client gates its Undo button entirely on this.
  // Absent/false = nothing to undo (not this viewer's move, mid-combat, no prior
  // action, or the game is over).
  canUndo?: boolean;
  winner: PlayerId | null;
}

// ---------------------------------------------------------------------------
// Replay bundles (v7) — a portable, self-contained artifact for the /pro/replays
// scrubber. Because the engine is deterministic, storing DECISIONS (config +
// actionLog) re-derives every board state; we never ship board snapshots.
//
// `config.players[pid].hero`/`cards` are the engine's HeroDef/CardDef, opaque to
// the client (typed `Json` so protocol.ts stays import-free) — the client stores
// and forwards them verbatim; only the server (which owns the engine) reads them.
// ---------------------------------------------------------------------------

export interface ReplayPlayerSetup {
  heroId: string;
  hero: Json; // engine HeroDef — opaque to the client
  cards: Json; // engine CardDef[] — opaque to the client
  // #392: the seat's cosmetics blob at the time the match was played, frozen in
  // so an old replay re-renders with the skins it was actually played with
  // rather than today's. RENDER-ONLY: `expandReplay` strips this key off before
  // the setup reaches the engine, so the field can never influence a replayed
  // game. Absent on pre-#392 bundles and on seats that claimed nothing.
  cosmetics?: string;
}

// A complete engine InitConfig plus the resolved board graph, so a bundle
// reproduces anywhere without a server-side content lookup.
export interface ReplayConfig {
  seed: number;
  mapId?: string;
  // `mulligan` (v30, engine #395): the game was played with the opening-hand
  // mulligan window open, so its action log carries the window's own prompt
  // answers. Absent = the pre-v30 flow; every bundle from a mulligan-free game is
  // byte-identical to a pre-v30 one.
  options?: { allowNonstandardDeck?: boolean; startingHandSize?: number; mulligan?: boolean };
  players: { p1: ReplayPlayerSetup; p2: ReplayPlayerSetup } & Partial<Record<PlayerId, ReplayPlayerSetup>>;
  formatId?: string;
  map: ProMapDef;
}

// Denormalized summary for the list UI + a Discord preview — readable without
// expanding the whole log.
export interface ReplayMeta {
  winner: PlayerId | null;
  heroes: Partial<Record<PlayerId, string>>; // hero id by runtime player id
  turns: number;
  endedAt: number; // epoch ms
  mapTitle: string;
}

export interface ReplayBundle {
  v: 1;
  engine: { schemaVersion: number; dslVersion: string };
  config: ReplayConfig;
  actionLog: Action[];
  meta: ReplayMeta;
}

// One player's full (unredacted) per-step state in a God-view replay.
export interface ReplayStepPlayer {
  heroId: string;
  // Format-defined team id — see ViewPlayer.team (issue #98).
  team?: TeamId;
  hand: CardInstanceId[];
  deckCount: number;
  discard: CardInstanceId[];
  ongoingScheme?: CardInstanceId | null; // public face-up ongoing scheme, if any (older views may omit)
  piles?: Record<string, PileEntry[]>; // v25: named public set-aside piles ("tucked under the hero card"), card identities visible to EVERY viewer; absent when nothing is tucked. v33: each entry is a bare id (this seat controls it) or `{card, controller}` (an opponent tucked it here and still owns it) — see PileEntry
  committedCard: CardInstanceId | null;
  counters: Record<string, number>;
}

// One scrubber frame: the board plus BOTH players face-up. `index` 0 is the
// initial state (post-startGame, before any action); index k is the state after
// applying actionLog[k-1], so steps.length === actionLog.length + 1.
export interface ReplayStep {
  index: number;
  phase: "SETUP" | "PLAY" | "GAME_OVER";
  turnNumber: number;
  activePlayer: PlayerId;
  actionsRemaining: number;
  turnPhase: "ACTION_SELECT" | "MANEUVER_MOVE" | "DISCARD_TO_LIMIT" | null;
  maneuver: { boostApplied: number; boosted: boolean; moved: FighterId[] } | null;
  fighters: ViewFighter[];
  tokens: ViewToken[];
  combat: ViewCombat | null;
  // The choosing player's full option set (God-view sees every option); null when
  // no prompt is open.
  prompt: ViewPrompt | null;
  winner: PlayerId | null;
  players: { p1: ReplayStepPlayer; p2: ReplayStepPlayer } & Partial<Record<PlayerId, ReplayStepPlayer>>;
}

// `POST /replay` success — map + catalog + heroes are hoisted (static across the
// match) so the per-step frames stay small.
export interface ReplayExpansion {
  ok: true;
  engine: { schemaVersion: number; dslVersion: string };
  meta: ReplayMeta;
  map: ProMapDef;
  catalog: Record<CardDefId, CardMeta>;
  heroes: Partial<Record<PlayerId, string>>;
  steps: ReplayStep[];
  finalHash: string; // FNV-1a of the final state — pins the exact game
}

export type ReplayErrorCode =
  | "BAD_BUNDLE" // malformed JSON / missing required fields
  | "TOO_LARGE" // actionLog exceeds the server cap
  | "VERSION_MISMATCH" // schemaVersion/dslVersion differs from this engine
  | "ILLEGAL_ACTION"; // the reducer rejected an action in the log

export interface ReplayError {
  ok: false;
  code: ReplayErrorCode;
  message: string;
}

export type ReplayResponse = ReplayExpansion | ReplayError;

// ---------------------------------------------------------------------------
// Wire envelope. Every message carries `v`; on mismatch the server answers
// ERROR{code:'VERSION'} and the client shows "refresh".
// ---------------------------------------------------------------------------

// A hero's visibility/support class (#107 Phase 1, v18). `reflavored` decks are
// hidden from the public roster and random bot rotation unless the request carries
// `debug: true`; `lab` decks are public playtest decks but excluded from random bot
// rotation by default. `spice` are public replacements; `community` heroes are public by default.
export type HeroTier = "reflavored" | "spice" | "community" | "lab";

// Roster grouping for the Start a Match page (v19). This is presentation
// metadata, not a visibility gate. `recommended` decks are the maintained default
// suggestions; `community` decks are playable but carry lower balance/support
// expectations and should render under Search Community Decks.
export type HeroDeckSection = "recommended" | "community";

export interface HeroListing {
  heroId: string;
  name: string;
  hp: number;
  move: number;
  reach: "MELEE" | "RANGED" | "LUNGE"; // LUNGE v0.15.0 (General Grievous) — client renders the lunge reach icon
  tier: HeroTier;
  deckSection: HeroDeckSection;
  // Bot tiers this server will accept for a seat piloting this hero (v23).
  // ABSENT = this server doesn't advertise per-hero tiers; fall back to the v22
  // set (easy|medium|hard). A server with the expert tier dormant omits it
  // entirely, so absence is the normal case, not an error. When PRESENT it is
  // authoritative and must not be assumed equal across heroes — though since
  // #283 every served hero does list the same set, `expert` included. The lobby
  // should grey out (not hide) a missing tier; asking for one anyway is refused
  // with BAD_MESSAGE.
  botTiers?: BotDifficulty[];
}

// A public room waiting for a second player (LIST_LOBBIES result row).
export interface LobbyListing {
  roomId: string;
  heroId: string;
  heroName: string;
  ageMs: number; // time the lobby has been waiting (now − room creation); NOT reset by a visibility toggle
}

// One slot of a room's live fill state (ROOM_STATUS, issue #121). Public info
// only: hero picks are public pre-game, bot-ness is public, connectedness is
// public. Bot seats (materialized or still planned) always report
// `connected: true` — they have no socket to lose.
export interface RoomStatusSeat {
  player: PlayerId;
  heroId: string;
  connected: boolean;
  bot: BotDifficulty | null;
  // #344: the seat's claimed display name, sanitized server-side. Absent when
  // the seat claimed none (and always absent for bot seats). Cosmetic and
  // UNVERIFIED — never key anything off it.
  displayName?: string;
  // #347: the seat's claimed badge id, same treatment and same caveats as
  // `displayName`. Opaque to the server; unknown ids render as nothing.
  badge?: string;
}

// A single rewound action, summarized for the UNDO_REQUESTED prompt (v11). Only
// the acting player + the action TYPE are exposed — never card ids — so surfacing
// the rewind list to the opponent BEFORE they consent leaks no hidden identity.
export interface UndoActionSummary {
  player: PlayerId;
  action: Action["type"];
}

export type ClientMsg =
  // `debug` (v15/v18): true includes debug-only heroes in the HEROES listing.
  // Absent/false = hidden. See the v15 and v18 notes above.
  | { v: number; type: "LIST_HEROES"; debug?: boolean }
  | { v: number; type: "LIST_LOBBIES" }
  // `customMap` (v4): playtest an unpublished board — the server validates it
  // and uses it for this room only. Composes with `bot`. Omit for the default map.
  // `seed` (dev-only): overrides the server-picked game seed so a whole match —
  // hands included — reproduces from {seed, actionLog}. HONORED ONLY when the
  // server enables it (PRO_ALLOW_DEV_SEED=1); production ignores it. Additive and
  // never sent by the real client, so it needs no client-side protocol sync.
  // `debug` (v15/v18): true includes debug-only heroes in the random pool a
  // server-picked `bot.heroId`/`botSeats[].heroId` draws from. Absent/false =
  // excluded. Never gates an explicitly named heroId. See the v15 and v18 notes.
  // `turnTimerSeconds` (issue #122): per-decision move timer, integer 10–300;
  // absent or 0 = no timer. See the 2026-07-13 move-timer header note.
  // `mulligan` (v30, engine #395): opening-hand mulligan for this room. ABSENT = ON —
  // the room creator opts OUT with `false`, and an older client that never sends the
  // field gets the same game a new one does. Anything but a boolean (or absent)
  // answers ERROR{BAD_MESSAGE}. See the v30 header note.
  // `pilot`: telemetry label for socket-driven seats. Omit/empty = human;
  // LLM agents should send llm:<model>.
  // `displayName`/`playerId` (issue #344): optional, client-claimed, UNVERIFIED
  // seat identity — the name is sanitized + broadcast, the id goes to telemetry
  // only. See the 2026-08-05 header note.
  // `badge` (issue #347): optional, client-claimed, UNVERIFIED opaque badge id
  // — sanitized + broadcast beside the name, never sent to telemetry. See the
  // 2026-08-06 header note.
  // `cosmetics` (issue #392): optional, client-claimed, UNVERIFIED OPAQUE blob
  // of cosmetic ids, max 512 BYTES — over the cap REJECTS the message with
  // BAD_MESSAGE (it is not truncated). Echoed verbatim into `ViewPlayer` and
  // frozen into replay bundles; never parsed, never logged, never sent to
  // telemetry, never visible to a bot. See the 2026-08-18 header note.
  | { v: number; type: "CREATE_ROOM"; heroId: string; formatId?: string; seed?: number; bot?: { difficulty: BotDifficulty; heroId?: string }; botSeats?: BotSeatFill[]; customMap?: ProMapDef; debug?: boolean; turnTimerSeconds?: number; mulligan?: boolean; pilot?: string; displayName?: string; badge?: string; playerId?: string; cosmetics?: string }
  | { v: number; type: "JOIN_ROOM"; roomId: string; heroId: string; pilot?: string; displayName?: string; badge?: string; playerId?: string; cosmetics?: string }
  | { v: number; type: "SET_VISIBILITY"; roomId: string; public: boolean }
  | { v: number; type: "RECONNECT"; roomId: string; token: string }
  // v7: revive an in-memory room lost to a redeploy/crash. `token` is the opaque
  // encrypted blob the server last pushed via RESUME_TOKEN (client localStorage).
  | { v: number; type: "RESUME_ROOM"; token: string }
  // v11: pro undo. UNDO_REQUEST asks to undo your OWN last discrete move; the server
  // pushes UNDO_REQUESTED to the opponent. UNDO_RESPONSE carries the opponent's
  // accept/reject. Neither is an `Action` — undo never enters the replay log.
  | { v: number; type: "UNDO_REQUEST"; roomId: string }
  | { v: number; type: "UNDO_RESPONSE"; roomId: string; accept: boolean }
  | { v: number; type: "ACTION"; roomId: string; action: Action };

export type ServerMsg =
  | { v: number; type: "HEROES"; heroes: HeroListing[] }
  | { v: number; type: "LOBBIES"; lobbies: LobbyListing[] }
  // `turnTimerSeconds` (issue #122): the room's per-decision timer setting,
  // present only when the timer is on. Absent = untimed room.
  | { v: number; type: "ROOM_CREATED"; roomId: string; token: string; you: PlayerId; formatId?: string; seats?: PlayerId[]; requiredPlayers?: number; turnTimerSeconds?: number }
  | { v: number; type: "ROOM_JOINED"; roomId: string; token: string; you: PlayerId; formatId?: string; seats?: PlayerId[]; requiredPlayers?: number; turnTimerSeconds?: number }
  | { v: number; type: "VISIBILITY"; roomId: string; public: boolean } // ack to SET_VISIBILITY
  | {
      v: number;
      type: "STATE";
      view: PlayerView;
      legalActions: Action[];
      /**
       * Events produced by the action that triggered THIS broadcast, redacted
       * for the receiving player. Omitted on join/reconnect/resume broadcasts
       * (never replayed) — clients append these to their activity feed. A client
       * that ignores this field is unaffected.
       */
      events?: GameEvent[];
    }
  // Sent to BOTH seats once the game reaches GAME_OVER (v7). Unredacted +
  // self-contained; the client saves it for the /pro/replays scrubber.
  | { v: number; type: "REPLAY_BUNDLE"; bundle: ReplayBundle }
  // Live waiting-room fill (issue #121): broadcast to every connected seat on
  // join, pre-game seat release, and reconnect/disconnect while waiting. The
  // one live channel for "who is in this room right now" — ROOM_CREATED/
  // ROOM_JOINED's `seats: PlayerId[]` stays a point-in-time snapshot.
  | { v: number; type: "ROOM_STATUS"; roomId: string; formatId: string; requiredPlayers: number; seats: RoomStatusSeat[]; turnTimerSeconds?: number }
  // Per-decision move timer (issue #122; timed rooms ONLY — an untimed room
  // never sends this). Broadcast on every clock change: `deadline` (epoch ms)
  // while the clock runs for `player`; `deadline: null` when `player` is on
  // the engine clock but their timer is paused/not running (bot seat, or a
  // disconnected seat — presence rules own absence). At the deadline the
  // server injects one uniformly-random legal action for the seat.
  | { v: number; type: "TURN_TIMER"; player: PlayerId; deadline: number | null }
  // `player` (issue #121, additive): WHICH seat this is about — required for
  // 3–4p rooms, ignorable by duel clients. `autoForfeitAt` (epoch ms) is set
  // only while a mid-game abandonment clock runs for that seat (multiplayer
  // formats): at that deadline the server auto-forfeits the seat. A reconnect
  // broadcast (`connected: true`) never carries it — that IS the all-clear.
  | { v: number; type: "OPPONENT_STATUS"; connected: boolean; player?: PlayerId; autoForfeitAt?: number }
  // v7: the old instance is about to stop (SIGTERM). Show "server updating" and
  // let the reconnect loop take over — a valid RESUME_TOKEN revives the game.
  | { v: number; type: "SERVER_RESTARTING" }
  // v7: opaque, encrypted+authenticated resume blob for THIS seat. Store it
  // (localStorage) and send it back in RESUME_ROOM to revive after a redeploy.
  | { v: number; type: "RESUME_TOKEN"; roomId: string; token: string }
  // v11: pushed to the OPPONENT when a player requests an undo. `requester` is who
  // asked (so the prompt can name them); `rewindActions` summarizes every action the
  // accepted rewind would remove (including the opponent's own), so consent is
  // informed. The opponent answers UNDO_RESPONSE.
  | { v: number; type: "UNDO_REQUESTED"; requester: PlayerId; rewindActions: UndoActionSummary[] }
  // v11: pushed to the REQUESTER when their undo is declined, superseded, or stale.
  | { v: number; type: "UNDO_REJECTED" }
  | { v: number; type: "ERROR"; code: ErrorCode; message: string };

export type ErrorCode =
  | "VERSION" // protocol mismatch — client should refresh
  | "BAD_MESSAGE" // unparseable / unknown type
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "BAD_TOKEN"
  | "NOT_YOUR_SEAT" // action.player !== your seat
  | "ILLEGAL_ACTION" // reducer rejected it (client bug or stale view)
  | "UNKNOWN_HERO"
  | "BAD_MAP" // CREATE_ROOM.customMap failed validation (message lists violations)
  | "RESUME_FAILED" // RESUME_ROOM replay diverged / resume disabled (see message)
  // Pushed instead of RESUME_TOKEN (issue #114) when a game has grown long enough
  // that sealing its resume blob would exceed the ws inbound frame cap
  // (PRO_MAX_WS_PAYLOAD_BYTES) — the client would never be able to send that
  // blob back via RESUME_ROOM, so the server never mints it. Not a request
  // response: pushed proactively wherever RESUME_TOKEN normally would be.
  | "RESUME_TOO_LARGE"
  | "UNDO_UNAVAILABLE" // UNDO_REQUEST with nothing to undo, or one already pending
  | "ROOM_LIMIT" // CREATE_ROOM refused — server is at its global room cap (PRO_MAX_ROOMS)
  | "RATE_LIMITED" // this connection is sending messages too fast (see server rate-limit env vars)
  | "SERVER_ERROR";
