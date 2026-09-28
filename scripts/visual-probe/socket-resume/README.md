# Socket resume probes (p2p #869)

Live checks for the tab-return resync in `lib/pro/useProSocket.ts`, run against
the **prod engine** (`wss://engine.unbrewed.xyz`). They use raw CDP over Node
22's built-in `WebSocket`, with no Playwright or puppeteer. Playwright's attach
turns on focus emulation, so its tabs never become `document.hidden`. A real
tab switch here opens a second tab in the same **headful** Chrome window, which
genuinely hides the game tab.

`hook.js` is injected before the page loads. It logs every engine frame (in and
out), every `visibilitychange`, and every "Board out of date" / "Board
refreshed" toast.

```sh
yarn dev -p 3869                                   # your worktree, a spare port
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --remote-debugging-port=9869 --user-data-dir=/tmp/probe-a --no-first-run &
"$CHROME" --remote-debugging-port=9870 --user-data-dir=/tmp/probe-b --no-first-run &   # pvp only

cd scripts/visual-probe/socket-resume
BASE=http://localhost:3869 OUT=/tmp/refocus node refocus.mjs   # vs Bot·E, King Kong, Secluded Temple, Tabletop
BASE=http://localhost:3869 OUT=/tmp/pvp node pvp.mjs           # two players, one PvP room
```

- `refocus.mjs`: a bare `focus`, a 2s tab switch and an 8s tab switch, each
  checked separately (the #848 cooldown has lapsed between them). Expect
  RECONNECT counts `0 / 0 / 1` and no toasts.
- `pvp.mjs`: mints a room plus both seat tokens over the wire, then seats one
  Chrome profile per player. It checks that both connect, that moves sync both
  ways (each move is sent on the page's own socket), and that an 8s tab switch
  on seat A sends one RECONNECT and play still flows afterwards.
