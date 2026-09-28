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
- **`npm run changelog:poster -- <slug>`** — takes
  `<promos>/<slug>-discord.mp4` (falling back to `<promos>/<slug>.mp4`) and
  writes `<out>/<slug>.mp4` (copied, or re-encoded to 720p H.264 + faststart
  if the source is over 8MB) and `<out>/<slug>-poster.webp` (a frame at 1s,
  1280 wide) into a git-ignored `.changelog-media/changelog/` by default. It
  does not upload anywhere — the changelog CDN isn't set up — it just prints
  the two file paths and the URLs they'll have. Requires `ffmpeg`.

## Media URL convention

`lib/changelog/media.ts` builds media URLs from
`NEXT_PUBLIC_CHANGELOG_MEDIA_URL`:

```
${NEXT_PUBLIC_CHANGELOG_MEDIA_URL}/changelog/<slug>.mp4
${NEXT_PUBLIC_CHANGELOG_MEDIA_URL}/changelog/<slug>-poster.webp
```

With the env var unset, both helpers return `null` and the UI renders the
entry as text only — never invent a default URL. Once the CDN exists, upload
`poster.mjs`'s two output files there under those paths.
