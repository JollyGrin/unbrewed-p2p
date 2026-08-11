# Audio assets — all CC0

Every file in this directory is **CC0 1.0 (public domain dedication)**: usable
in commercial work, no attribution required, no licence bookkeeping. The promo
videos are posted publicly and stay up forever, so this is a hard rule — see
`.claude/skills/deck-promo/SKILL.md` before adding anything here.

Files are renamed after the cue they serve and transcoded for the renderer
(SFX: Ogg Vorbis → 16-bit WAV; music: WAV → 128kbps MP3). No other edits — no
trimming, no level changes. CC0 permits both the renaming and the transcode.

## Sound effects — Kenney (kenney.nl)

Kenney Vleugels releases every asset pack as CC0
(<https://creativecommons.org/publicdomain/zero/1.0/>); each pack ships its own
`License.txt` saying so.

| File | Original | Pack | Source |
| --- | --- | --- | --- |
| `sfx/riser.wav` | `phaserUp3.ogg` | Digital Audio | <https://kenney.nl/assets/digital-audio> |
| `sfx/name-slam.wav` | `impactPunch_heavy_001.ogg` | Impact Sounds | <https://kenney.nl/assets/impact-sounds> |
| `sfx/slam-sub.wav` | `lowDown.ogg` | Digital Audio | <https://kenney.nl/assets/digital-audio> |
| `sfx/reveal-blip.wav` | `pepSound1.ogg` | Digital Audio | <https://kenney.nl/assets/digital-audio> |
| `sfx/reveal-blip-low.wav` | `twoTone1.ogg` | Digital Audio | <https://kenney.nl/assets/digital-audio> |
| `sfx/card-swish.wav` | `phaseJump1.ogg` | Digital Audio | <https://kenney.nl/assets/digital-audio> |
| `sfx/card-thock.wav` | `impactWood_medium_002.ogg` | Impact Sounds | <https://kenney.nl/assets/impact-sounds> |
| `sfx/boost-coin.wav` | `powerUp7.ogg` | Digital Audio | <https://kenney.nl/assets/digital-audio> |
| `sfx/stat-tick.wav` | `tick_002.ogg` | Interface Sounds | <https://kenney.nl/assets/interface-sounds> |
| `sfx/cta-confirm.wav` | `confirmation_002.ogg` | Interface Sounds | <https://kenney.nl/assets/interface-sounds> |
| `sfx/jingle-sting.wav` | `threeTone1.ogg` | Digital Audio | <https://kenney.nl/assets/digital-audio> |

## Music — Juhani Junkala, "5 Chiptunes (Action)"

Released CC0 on OpenGameArt: <https://opengameart.org/content/5-chiptunes-action>.
The pack's own `INFO.txt`: *"These music tracks have been released under CC0
creative commons license. You can do anything you want with these tunes."*

| File | Original | Length |
| --- | --- | --- |
| `music/junkala-level-1.mp3` | `Juhani Junkala [Retro Game Music Pack] Level 1.wav` | 74s |
| `music/junkala-level-2.mp3` | `Juhani Junkala [Retro Game Music Pack] Level 2.wav` | 73s |
| `music/junkala-level-3.mp3` | `Juhani Junkala [Retro Game Music Pack] Level 3.wav` | 82s |

`level-1` is the default (`DEFAULT_MUSIC_TRACK` in
`src/DeckAnnouncement/audio.tsx`); a props file picks another with
`"musicTrack": "level-2"`.

## Explicitly not used

- remotion.media stock SFX — meme-soundboard vibe, and not CC0 across the board.
- Anything labelled "free for personal use", "royalty-free with credit", or
  under a CC-BY licence. If it needs a credit line, it does not go in here.
