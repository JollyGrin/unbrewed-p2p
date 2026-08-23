# Pro match sound effects

All sounds are [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (public
domain, attribution appreciated but not required). The kenney.nl clips are by
Kenney Vleugels — [kenney.nl](https://kenney.nl) — converted to mono 96kbps MP3
(Safari can't decode the original Ogg Vorbis). `snuff.mp3` is synthesized in this
repo (see below), also released CC0 — as is `match-found.mp3`.

| file | source pack | original |
| --- | --- | --- |
| flip.mp3 | Casino Audio | card-place-2.ogg |
| commit.mp3 | Casino Audio | card-slide-5.ogg |
| draw.mp3 | Casino Audio | card-slide-1.ogg |
| hit.mp3 | Impact Sounds | impactSoft_medium_001.ogg |
| hit-heavy.mp3 | Impact Sounds | impactSoft_heavy_003.ogg |
| blocked.mp3 | Impact Sounds | impactMetal_light_002.ogg |
| defeat.mp3 | Impact Sounds | impactBell_heavy_002.ogg |
| heal.mp3 | Interface Sounds | glass_002.ogg |
| turn.mp3 | Interface Sounds | bong_001.ogg |
| victory.mp3 | Interface Sounds | confirmation_001.ogg |
| loss.mp3 | Interface Sounds | minimize_006.ogg |
| snuff.mp3 | synthesized (this repo) | "The Snuff" cancel-effects fizzle (#346) |
| match-found.mp3 | synthesized (this repo) | lobby "opponent joined" chime (#689) |

Packs: https://kenney.nl/assets/casino-audio ·
https://kenney.nl/assets/impact-sounds ·
https://kenney.nl/assets/interface-sounds

`snuff.mp3` — a candle-snuff / fuse-fizzle "pfft" for the cancel-effects callout,
generated with ffmpeg (a fast-decaying band-limited pink-noise burst):

```
ffmpeg -f lavfi -i "anoisesrc=d=0.30:c=pink:a=0.85:r=44100" \
  -af "highpass=f=550,lowpass=f=5200,afade=t=in:st=0:d=0.008,\
afade=t=out:st=0.05:d=0.24:curve=exp,volume=1.5" \
  -ac 1 -b:a 96k snuff.mp3
```

`match-found.mp3` — the lobby cue (#689). It plays into the headphones of someone
who has tabbed away, so it is a polite two-note bell (A5 → E6, each with a quiet
octave partial and an exponential decay) rather than anything strident:

```
ffmpeg -y \
  -f lavfi -i "sine=f=880:d=1.4:r=44100" \
  -f lavfi -i "sine=f=1760:d=1.4:r=44100" \
  -f lavfi -i "sine=f=1318.51:d=1.4:r=44100" \
  -f lavfi -i "sine=f=2637.02:d=1.4:r=44100" \
  -filter_complex "[0]volume=0.9,afade=t=out:st=0:d=1.25:curve=exp[n1];\
[1]volume=0.22,afade=t=out:st=0:d=0.5:curve=exp[n1h];\
[2]volume=0.9,afade=t=out:st=0:d=1.2:curve=exp,adelay=170[n2];\
[3]volume=0.22,afade=t=out:st=0:d=0.5:curve=exp,adelay=170[n2h];\
[n1][n1h][n2][n2h]amix=inputs=4:normalize=0,volume=6,\
afade=t=in:st=0:d=0.006,alimiter=limit=0.95" \
  -ac 1 -b:a 96k match-found.mp3
```

(`volume=6` is not arbitrary: ffmpeg's `sine` source peaks at −18 dBFS, and the
bank's other clips peak just under 0 dB.)
