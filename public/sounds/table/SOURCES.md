# Table sounds: sources and licence

`table-sounds.mp3` (92,448 bytes) is the only audio asset the sandbox table
ships. Every sound in it comes from one pack:

- **Pack:** Casino Audio 1.1, by Kenney Vleugels (Kenney.nl)
- **Licence:** Creative Commons Zero, CC0 1.0
  (<http://creativecommons.org/publicdomain/zero/1.0/>). The pack's
  `License.txt`: "You may use these assets in personal and commercial
  projects. Credit (Kenney or www.kenney.nl) would be nice but is not
  mandatory."
- **Obligations:** none. No attribution is required; none is shown in the app.
- **Downloaded:** 2026-11-13 from
  <https://opengameart.org/sites/default/files/kenney_casino-audio.zip>
  (Kenney's own upload, listed as CC0 at
  <https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips>;
  the pack's home page is <https://kenney.nl/assets/casino-audio>, also CC0).
- **Encoder:** the takes were re-encoded to MP3 with the LAME port
  `@breezystack/lamejs` at build time. It is not shipped, and an encoder's
  licence does not attach to the files it writes.

Nothing was synthesised and no other source was used.

## What is in the file

40 takes, each a trimmed excerpt of one file of the pack: cut to the sound's
onset, faded out, levelled so the loudest 50 ms of every take sits at
-22 dBFS RMS (peaks capped at -3 dBFS), resampled to 32 kHz mono and encoded
at 48 kbit/s. The takes are stored back to back, so the file also plays from
start to end in any audio player. `lib/sound/manifest.ts` holds each take's
byte range; `lib/sound/events.ts` says which event plays which group.

| Group (event) | Takes | Source files in the pack (`Audio/*.ogg`) |
| --- | --- | --- |
| `draw` (also `cardUp`) | 6 | `card-slide-1` to `card-slide-6` |
| `place` | 4 | `card-place-1` to `card-place-4` |
| `discard` | 4 | `card-shove-1` to `card-shove-4` |
| `flip` | 3 | `card-slide-7`, `card-slide-8`, `cards-pack-open-2` |
| `shuffle` | 4 | `card-shuffle` (three excerpts: 0–0.90 s, 0.92–1.95 s, 2.02 s–end), `card-fan-1` |
| `tokenDown` | 4 | `chip-lay-1`, `chip-lay-2`, `chip-lay-3`, `chips-stack-3` |
| `tokenUp` | 3 | `chips-handle-3`, `chips-handle-4`, `chips-collide-2` |
| `hp` | 5 | `chips-stack-1`, `chips-stack-2`, `chips-stack-4`, `chips-stack-5`, `chips-stack-6` |
| `die` | 4 | `die-throw-1` to `die-throw-4` |
| `dice` | 3 | `dice-throw-1` to `dice-throw-3` |

## Rebuilding or changing the pack

The three build steps (decode, trim and level, encode) and a copy of the
original zip are kept outside the repo, in
`research/sandbox-polish-2026-11-13/sounds/build/`. To add or swap a take:
edit the selection table in `2-process.py`, rerun the three steps, copy the
new `table-sounds.mp3` here and the new byte ranges into
`lib/sound/manifest.ts`, and update the table above. Any new source must be
CC0 or equivalent and must be recorded in this file.
