# Pro per-seat render fuzz (unbrewed-p2p-179)

Replay smoke-bot game logs through the **real** Pro client under jsdom and catch
any per-seat render throw — the "valid server state, throws in React"
(Hollow-Oak white-screen) class — before a human ever playtests.

The engine smoke bot (unbrewed-engine #80/#81) proves games *complete over the
wire*. This proves the client can *render* every seat's redacted view at every
step without throwing. It pairs with the error-boundary work (#178): the
boundary makes a missed crash recoverable, this makes it findable.

## Run it

```bash
# Sweep a run directory of per-seat view fixtures; exit 1 if any view throws.
npx tsx scripts/render-fuzz.mts --run test/replays/smokebot/sample
npm run pro:render-fuzz -- --run test/replays/smokebot/sample   # same thing

# Cheap CI slice vs full overnight sweep:
npx tsx scripts/render-fuzz.mts --run <dir> --games 20          # first 20 games
npx tsx scripts/render-fuzz.mts --run <dir> --steps 5           # every 5th step

# Re-render one saved finding in isolation — no run dir, no server:
npx tsx scripts/render-fuzz.mts --repro <dir>/render-fuzz-findings/<finding>.json
```

Exit code: **0** when every rendered view was clean, **1** when any view threw
(so it gates a merge alongside the engine smoke run). A one-line summary
(`N games, N seats, N views rendered, N throws`) prints on every run. Set
`RENDER_FUZZ_DEBUG=1` to surface jsdom's own console (normally muted).

## How a view is rendered

The harness mounts the **actual** `pages/pro/game.tsx` `LiveGame` under the same
providers `_app.tsx` wires (react-query + Chakra + Next router), then delivers
each view along the **same path as `lib/pro/useProSocket.ts`**: a `STATE` frame
on the WebSocket whose `msg.view` becomes the render snapshot. A jsdom
`WebSocket` stub stands in for the socket, so nothing touches the network or a
live dev server. Each view renders into a fresh mount and unmounts after, so a
crash on one step never poisons the next — and the bulk sweep and `--repro` run
byte-identical code.

A render throw is caught by an error boundary wrapping the page and written as a
deterministic, **self-contained** finding artifact:

```jsonc
{
  "gameRef": "...", "seat": "p1", "step": 7, "viewHash": "…",
  "error": { "message": "...", "stack": "...", "componentStack": "at LiveGame (…)" },
  "view": { /* the full PlayerView — repro needs no server */ },
  "legalActions": [], "events": []
}
```

Pure deterministic scripting: no network, no live dev server, no LLM (same rule
as unbrewed-engine#79).

## The bridge (engine → client) — note for @Emyrk

The client renders each seat's **redacted** view, which only the authoritative
reducer + `server/redact.ts redactFor()` can produce, and the engine is private
(never a dependency of this public repo). So the input to this harness is a
small **engine-side export step**: replay each `--save-all` game's `actionLog`
through the reducer and emit, per game, a `*.views.jsonl` file — one JSON object
per line, each the exact `msg.view` a client would receive:

```jsonc
{ "game": "<id>", "seat": "<PlayerId>", "step": 0,
  "view": <PlayerView>, "legalActions": [ /*…*/ ], "events": [ /*…*/ ] }
```

A **run directory** is any folder of these `*.views.jsonl` files (the sampling
knobs slice across games and steps). The reader (`runDir.ts`) is tolerant:
`game` defaults to the file basename, `seat` to `view.you`, `step` to the line
index.

**Why JSONL fixtures rather than importing the engine here:** it keeps the
private engine out of this repo's dependency graph — CI stays a plain `tsx` run
with no server and no secrets — and JSONL streams line-by-line for overnight
sweeps. The engine PR only needs to add the emitter (an `--export-views` step
alongside `--save-all`); this harness consumes its output unchanged. If you'd
rather have the p2p test invoke the engine package directly, the only piece that
changes is `runDir.ts` → swap the file reader for an engine call; everything
downstream (mount, sampling, findings, repro) stays put.

## Fixtures & the regression test

`test/replays/smokebot/sample/` and `test/replays/smokebot/known-bad/` are
committed, deterministic stand-ins for the engine export (hand-built from the
real protocol types + `MULTIPLAYER_PLAYTEST_MAP`, regenerate with
`npm run pro:render-fuzz:fixtures`). `sample/` must render with 0 throws;
`known-bad/` is one view with `fighters` nulled — a malformed/partially-redacted
payload that throws in render and **must be caught**. `renderFuzz.test.ts` drives
both through the real CLI (the harness's own regression test) plus unit-tests the
pure sampling/hashing/parsing logic.
