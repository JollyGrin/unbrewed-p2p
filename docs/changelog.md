# Changelog

Player-facing "what's new" content, shown on `/changelog`, in the navbar's
"What's new" pill, and in the update dialog. See `lib/changelog/` for the
loader and `lib/changelog/useChangelogSeen.ts` for the unseen-badge logic.

## Entry format

One JSON file per entry under `content/changelog/<id>.json`, where `<id>` is
`<yyyy-mm-dd>-<kebab-slug>` (e.g. `2026-09-27-tabletop-view.json`). Adding an
entry means adding exactly one file — there's no index to hand-edit
(`lib/buildTools/generateChangelogIndex.js` regenerates
`lib/changelog/generatedEntries.ts` from the directory on every `next dev` /
`next build` / jest run).

```json
{
  "id": "2026-09-27-tabletop-view",
  "date": "2026-09-27",
  "title": "Pull up a chair: the tabletop view is here",
  "summary": "Pro games can now be played on a 3D table. Switch between sculpted minis, sprites and flat tokens from the figure menu at any point in a game.",
  "tags": ["feature"],
  "pro": true,
  "highlight": true,
  "video": { "slug": "tabletop" },
  "cta": { "label": "Try it in a Pro game", "href": "/pro" }
}
```

See `lib/changelog/types.ts` for every field. `tags` is `deck | feature |
fix`; `highlight: true` is what lets an entry open the update dialog;
`video.slug` opts into media (see below); `body` (an array of extra
paragraphs) only shows on `/changelog`, not the card or dialog.

**Copy rules** (enforced by `changelog:validate`, see below): player-facing,
no issue/PR numbers, no internal jargon (`jevx`, `DSL`, `protocol`, `engine`),
say "balanced decks" not "official decks", no emoji.

## Adding an entry by hand

1. Write `content/changelog/<yyyy-mm-dd>-<slug>.json` following the format
   above.
2. If it has a promo video, run `npm run changelog:poster -- <slug>` to
   produce the two media files (see below), then set `"video": { "slug":
   "<slug>" }`.
3. Run `npm run changelog:validate` (or just `npm test`, which runs it
   first).

## The pipeline scripts

- **`npm run changelog:collect`** — prints JSON on stdout listing everything
  merged since the newest entry's date (or `--since yyyy-mm-dd`) across
  `unbrewed-p2p`, `unbrewed-engine`, and `unbrewed-api`, plus candidate promo
  media from the deck-promos folder. Read-only; feeds the raw material for
  writing a new entry's copy. Requires the `gh` CLI. `--help` for all flags.
- **`npm run changelog:validate`** — validates every entry's shape (same
  rules as the runtime loader in `lib/changelog/entries.ts`) plus the copy
  rules above. Exits 1 on any failure; runs first in `npm test`.
- **`npm run changelog:poster -- <slug> [--upload] [--force]`** — reads the
  master `<promos>/<slug>.mp4` (falling back to `<slug>-discord.mp4` only if
  the master is missing) and always re-encodes it (720p max, libx264
  `-preset slow -crf 26`, aac 96k, faststart) to `<out>/<slug>.mp4`, plus
  `<out>/<slug>-poster.webp` (a frame at 1s, 1280 wide), into a git-ignored
  `.changelog-media/changelog/` by default. Prints sizes and warns above 6MB.
  With `--upload` it runs `aws --profile unbrewed-cdn s3 cp` for both files to
  `s3://unbrewed-cdn/changelog/` (immutable cache headers), refuses to
  overwrite an existing key unless `--force`, then curls the public URL and
  reports status + content-length. Credentials live in the local aws profile
  only — never in the repo, CI, or env files. Requires `ffmpeg` (and `aws`,
  `curl` for `--upload`).

## Media URL convention

`lib/changelog/media.ts` builds media URLs from
`NEXT_PUBLIC_CHANGELOG_MEDIA_URL`:

```
${NEXT_PUBLIC_CHANGELOG_MEDIA_URL}/changelog/<slug>.mp4
${NEXT_PUBLIC_CHANGELOG_MEDIA_URL}/changelog/<slug>-poster.webp
```

The CDN is the public R2 bucket at `https://cdn.unbrewed.xyz`, which is the
default base. `NEXT_PUBLIC_CHANGELOG_MEDIA_URL` is an optional override (e.g. to
point local dev at another bucket); unset or empty falls back to the default.
CI passes the repo variable of the same name through
(`.github/workflows/nextjs.yml`); an empty value also uses the default.

Both helpers return `null` only for an empty slug, in which case the UI renders
the entry as text only. If a poster or video fails to load, the card falls back
to text only as well.
