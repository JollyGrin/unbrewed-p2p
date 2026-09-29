# Review: tableplace-table (#1040)

An independent review of the whole feature as merged in #1043, plus #1046 and #1048, run against the live page at https://unbrewed.xyz/table on 2026-09-29.

**MEASURED** means I ran it. **INFERRED** means I read the code but didn't reproduce it.

## How I tested it

- Read every file in `git diff 8c5eefd^1 8c5eefd` (26 files), then the later #1046/#1048 changes.
- Drove the live `/table` page with headless Chromium (Playwright). Your deck was `?deckId=labs:char_ce316d14…` (Marouine). Their deck was `labs:char_0848bf26…` (Elliot Becker: 5 sidekicks, a rules card, 2 image tokens). I also used `unmatched.cards/decks/5jGPM` (balanced, 4 sidekicks plus an extra character) to see the refusal.
- Created **2 real lobbies**. `gentle-delta` used The Mended Drum, which has a ProMapDef. `swift-garden` used T. Rex Paddock, which has none. Each seat was opened once in one long-lived process. Both seats claimed correctly. I drew a card on seat 0, and seat 1's Players list showed `hand 1 · deck 29`. I then played it on seat 0's attack snap, and it appeared on seat 1's table.
- Mocked the error paths with `page.route` on `api.table.place`: 429 (header only, and with `details`), 400, 502 with an HTML body, network down, a hang, and a malformed 201.
- Ran a local sweep of `composeTable` over all 76 default maps × 4 deck pairings, checking bounds, caps and skipped content.
- Ran `next build` and read `build-manifest.json`, plus `jest lib/tableplace` (130 pass) and `next lint` (passes).

## Findings, most severe first

### 1. MEDIUM · No request timeout: a slow or hung table.place leaves "Checking the table…" spinning forever (MEASURED)
- **Where:** `lib/tableplace/api.ts:58-64` (`fetchImpl` with no `signal`), `components/TablePlace/TablePage.tsx:155-166`.
- **Repro:** route `https://api.table.place/**` to never respond, then click Create. After 45 s the button is still disabled on "Checking the table…". There is no error and no way to cancel short of reloading.
- **Fix:** add an `AbortController` with a timeout of about 15 s in `post()`. Map the abort to a retryable `{ status: 0, code: "timeout", message: "table.place didn't answer." }`. Add a test.

### 2. MEDIUM · A 2xx with an unexpected body crashes the whole page (MEASURED)
- **Where:** `lib/tableplace/api.ts:76-77` casts `json as T` with no check. `components/TablePlace/InviteScreen.tsx:17-18` then calls `lobby.seats.find`.
- **Repro:** mock `/validate` → `200 {}` and `/v1/lobbies` → `201 {}`, then click Create. The page is replaced by Next's "Application error: a client-side exception has occurred". If a 2xx body isn't JSON, `data` is `null`, `setLobby(null)` runs, and nothing happens at all: no invite and no error.
- **Fix:** check the shape of the create response (`seats` is an array of `{seat, url: string}`) in `createLobby`. If it's wrong, return `{ ok: false, code: "bad_response" }` so the error box shows.

### 3. MEDIUM · The camera opens zoomed in on the map, so your cards, dials and tokens start off-screen (MEASURED)
- **Where:** table.place's default camera, not our code. It shows up in how our layout feels.
- **Repro:** open either seat link at 1440×900. Seat 0 of `gentle-delta` and seat 1 of `swift-garden` both opened on a close-up of the board. The front row (deck, discard, hero) and the side column only appeared after scrolling out about 15 wheel notches.
- **Fix:** on our side, add one line to the InviteScreen, such as "Scroll to zoom out: your cards are along the table edge nearest you." Separately, ask table.place for a way to set the initial camera, or to fit the camera to the scene, per seat.

### 4. MEDIUM · Accessibility: no headings, an unnamed map select, placeholder-only input label, silent errors (MEASURED, aria snapshot)
- **Where:** `TablePage.tsx:53` (the `Step` title is a `<p>`), `:205` (the page title is a `<p>`), `:230-238` (the input is named only by its placeholder), `:257-263` (the `<Select>` has no accessible name: the snapshot shows `combobox:` with no label), `:249-252`, `:279-283` and `:334-348` (errors have no `role="alert"` or live region), `InviteScreen.tsx:52,57,78` (headings are `<p>`), and `DeckPreviewCard.tsx:64-68` (the refusal isn't announced).
- **Repro:** run `page.locator("body").ariaSnapshot()` on `/table`. Every heading comes out as `paragraph`, the map comes out as `combobox:` with no name, and the error boxes are plain text.
- **Fix:** use `as="h1"` for the page title and `as="h2"` for the step titles. Wrap the input and select in `FormControl` with a `FormLabel`, or tie `aria-labelledby` to the step title. Put `role="alert"` on the error boxes. Keyboard use itself is fine: every control is a native input, select, button or link, Enter loads the opponent, and focus rings are Chakra's defaults.

### 5. LOW-MEDIUM · Each hero starts on the opponent's side of the board (MEASURED)
- **Where:** `lib/tableplace/composeTable.ts:58` hardcodes `START_SLOT = [1, 2]`. `layout.ts:122-135` puts the image's top edge toward seat 1.
- **Repro:** on The Mended Drum, slot 1 is at y = 0.31 and slot 2 at y = 0.83. Seat 0 sits at +z, but its hero lands at `[-4.46, -2.97]`, which is seat 1's half. Seat 1's hero and its 5 sidekicks land at `[6.41, 5.32]`, which is seat 0's half. The `gentle-delta` screenshots show exactly this. The same thing happens on every catalog board where slot 1 has a smaller y than slot 2.
- **Fix:** per board, give each seat the start slot, of 1 and 2, on its own half: slot 1 goes to the seat whose half contains it. Or turn the overlay 180° when slot 1 is at −z. Add a test that seat 0's hero has z > 0 when the two slots are on opposite halves.

### 6. LOW · Pieces in the side column stick out of the 40 × 25 view box on wide maps (MEASURED)
- **Where:** `lib/tableplace/layout.ts:70` (`COLUMN_X_MAX = 19.5`) and `:89`. The loop checks the piece's centre, not its footprint.
- **Repro:** the sweep found 192 cases across 12 of 76 default maps: every map with ratio ≥ 1.625, where the map is 26 wide and the column starts at x = 14. The 4th column sits at x = ±19.4. Adding a fighter's radius of 0.85 reaches 20.25, past `VIEW.halfX` = 20. It happened live in `swift-garden`: seat 1's `THE AUDIENCE 1..5` and `Elliot Becker` were at x = −19.4. `composeTable.test.ts:84-88` only checks centres, which is why it passes.
- **Fix:** use `x + OFF_BOARD_FIGHTER_RADIUS <= VIEW.halfX` in the loop (or `COLUMN_X_MAX = 19.15`). Extend the VIEW test to include each piece's `radius ?? TOKEN_RADIUS`.

### 7. LOW · Players see the API's raw diagnostic for errors they can't act on (MEASURED)
- **Where:** `TablePage.tsx:343` renders `apiError.message` word for word.
- **Repro:** mock a 400 `placement_out_of_bounds`. The player reads "Placement 12 (piece 3 of pack 'x') is at [31, 0]; the felt is x in [-30, 30]." A 4xx from us is our converter's bug, and the player can do nothing about it.
- **Fix:** for a non-retryable 4xx, show "We couldn't lay out this table. That's a bug on our side." and put the API message in a `<details>` element, with a link to Discord or GitHub.

### 8. LOW · The page never reads the `Retry-After` header, because table.place doesn't expose it cross-origin (MEASURED)
- **Where:** `lib/tableplace/api.ts:49`.
- **Repro:** a `POST` with an `Origin` header returns only `access-control-allow-origin: *`, with no `access-control-expose-headers`. So in a browser `res.headers.get("retry-after")` is always null. With a mocked 429 that has the header but no `details`, the page says "Try again in a minute", not 42 s. The unit test "falls back to the header" passes only because the mock `Response` isn't subject to CORS. The practical impact is small: llms.txt §8 says the real 429 also sends `details.retry_after_seconds`, which works (mocked 1800 s → "Try again in 30 minutes").
- **Fix:** remove the header fallback, or add a comment that it only works server-side.

### 9. LOW · A refused deck leaves Create disabled with no reason next to it; the refusal copy overpromises (MEASURED)
- **Where:** `TablePage.tsx:169-173, 325-329` and `lib/tableplace/preview.ts:29-30`.
- **Repro:** load `unmatched.cards/decks/5jGPM` as their deck. The preview card shows the red refusal line, but under the button there's nothing. "Still needed" disappears because both decks are present, so on a phone the disabled button has no visible reason. The copy says "Unmatched Labs and the-unmatched.club decks work today". But you can't paste a the-unmatched.club link (`opponentDeckLink` only knows unmatched.cards and Labs). Only the evergreen decks that carry `cardImage` renders work, and a player can't tell which those are.
- **Fix:** when `yours?.refused || theirs?.refused`, add "One deck can't go on the table yet (see above)." under the button. Change the copy to "Unmatched Labs decks work today." or name how to get one.

### 10. LOW · Map picker: bag maps on hosts without CORS pass the size probe but give a blank board (INFERRED)
- **Where:** `components/TablePlace/useImageSize.ts:10` (`new Image()` without `crossOrigin`) and `lib/tableplace/mapToPack.ts:20` (no `absoluteUrl`; only the caller does it).
- **Repro:** save a map from a host that doesn't send CORS headers into your bag and pick it. `naturalWidth` still loads, Create succeeds, and table.place draws a blank overlay (llms.txt §5). I checked that all default maps and the Labs art hosts are fine: 31 of 31 CORS-ok.
- **Fix:** set `probe.crossOrigin = "anonymous"` so those hosts fall into the existing "Couldn't load this map's image" message. Call `absoluteUrl` inside `mapToTablePack` as well, so the API can't be misused.

### 11. LOW · Map list: unsorted, test junk, and only 6 of 76 maps get spaces and start slots (MEASURED)
- **Where:** `TablePage.tsx:112-117, 264-268` and `composeTable.ts:60-61`.
- **Repro:** the select lists 76 maps in file order. They include "forrestofrandomtrashtotestthingsandotherstuff////…", "Untitled Battlefield" twice, and "gigs and shittles". Only Mended Drum, Counts Castle, Weathertop, Island of Despair, Polus and City Docks match a `MAP_CATALOG` ProMapDef. 8 catalog boards (Nostromo, The Bog, Wedding Crashers, Pyramids, Secluded Temple, Unseen University, River Cruise, The Altar) can't be picked at all. The picker's "Altar" is `community-altar-119.webp`, but the def is keyed on `community-the-altar.webp`, so it gets no spaces.
- **Fix:** sort by title, drop the junk entries, and add the `MAP_CATALOG` boards to the picker. Optionally mark boards that snap to spaces.

### 12. LOW · Pieces with no useful name, and HP dials away from their fighters (MEASURED)
- **Where:** `lib/tableplace/deckToPack.ts:374` and `composeTable.ts:150-157`.
- **Repro:** Labs image tokens arrive as "Token 1" and "Token 2". Elliot's side column is 6 identical `1/1` and `12/12` dials in a row. The names show only on hover, and each dial sits away from the fighter it tracks (the fighters are on the board).
- **Fix:** use the Labs token's own name when it has one. Order the dials so the hero's comes first and is set apart. Or, off the board, put each dial right beside its figure.

### 13. LOW · `/table` imports Pro code at runtime (MEASURED)
- **Where:** `lib/tableplace/composeTable.ts:2` does `import { MAP_CATALOG } from "@/lib/pro/mapCatalog"`, which pulls in `normalizeMap`, `multiplayerPlaytest` and 14 fixture JSONs. `layout.ts:20` also imports `ProMapDef`, but only as a type.
- **Build:** `/table` is 18.3 kB for the page itself and 3.07 MB on first load. That total is mostly the site-wide react-icons `Gi*` chunk (6.7 MB raw, loaded on every page, not new). The catalog adds chunk `6863` (80 KB raw, shared with `/pro`, `/heroes` and `/stats`). **No three.js** in any `/table` chunk. **`lib/tableplace` appears only in `/table`.** Both requirements pass.
- **Fix:** acceptable if intended. Otherwise, move an `imageUrl → ProMapDef` lookup over the fixtures into a module outside `lib/pro`.

### 14. LOW · Dead code (MEASURED)
- `components/CardFactory/character.card.tsx`: 333 lines with **no importers** since #1044 removed the face renderer. Delete it, or park it for #1045.
- `lib/tableplace/faceJobs.ts`, `FullFaceResolver` and `FaceMembers` in `types.ts` are used only by tests and fixtures. They're kept as the #1045 seam, which is fine, but `index.ts:6` re-exports `faceJobs` into the `/table` bundle.
- `deckToPack.ts:349`: `data.sidekick.name || "Sidekick"` can never take the fallback, because `hasSidekick` already requires a name.

### 15. LOW · Duplicated or divergent helpers in `lib/tableplace` (INFERRED)
- `slugify` (`deckToPack.ts:54`) and `slug` (`faceJobs.ts:30`) differ. `slug` strips diacritics and caps at 60 characters; `slugify` turns "é" into "e-". So card codes and face keys come out differently for the same title.
- `sidekickFielded` (`faceJobs.ts:76`: hp without a name counts) and `hasSidekick` (`PoolFns.ts:82`: a name is required) disagree. A nameless sidekick with hp gets a face job but no pile or fighter.
- **Fix:** use one helper for each.

### 16. LOW · A card with `quantity: 0` gets 1 copy on the table and 0 in the sandbox (INFERRED)
- **Where:** `deckToPack.ts:200` uses `Math.max(1, card.quantity)`. `PoolFns.ts:201` uses `Array(quantity)`, and Labs keeps 0 (`lib/labs/map.ts:184`).
- **Fix:** skip cards with `quantity <= 0`, and add a test.

### 17. NIT · Other things I noticed (INFERRED)
- `apiError` isn't cleared when the decks or map change (`TablePage.tsx:147`). A stale 429 or 400 stays under a table that's now different. Clear it when `composed` changes.
- Snap points are cut off at 200 without a `skipped[]` entry (`composeTable.ts:204`). This can't happen yet: the most is 76 spaces plus 4.
- `fitPlacementCap` (`composeTable.ts:76-104`) only drops tokens. If decks, HP dials and fighters alone go over 100, it gives up and sends the request, which gets a 413. This can't happen yet either: the most I measured was 31 placements.
- "Make another table" throws away the seat links with no way back (`InviteScreen.tsx:113`).
- The "＋" in "＋ Add more decks in your bag" shows as an empty box at 320 px. That's in `SelectedDeckContainer`, which is older than this feature.

## Checked and fine (MEASURED)
- **Seat mirroring and rotations:** seat 1 is exactly `(-x, -z)` at 180°. Both seat views show deck, discard and rules on the left and the hero on the right, and each seat's side column is to its right.
- **Faces:** all 31 face, back and token URLs (Supabase) and the map pass the CORS check with an `Origin` header. None are relative (`absoluteUrl` works). Labs token art renders on the table.
- **Caps:** the live body is 25 KB against the 2 MiB cap, with 24 placements (cap 100) and 33 snap points (cap 200). The worst case over the whole sweep was 31 placements and 27 KB.
- **Card codes:** unique within each deck, which is all the tbpp spec asks (§ 6.1 rule 5). Pack ids are unique per seat.
- **Both seats see their own cards.** Fighters stand on the start spaces (Mended Drum) or in the side column (T. Rex Paddock). A card drawn and played on seat 0 moves on seat 1.
- **Error copy:** a 429 with `details` says "Try again in 30 minutes" and a create-429 says "60 seconds". A 502 with an HTML body gives the generic message plus "problem on its side". Network down gives "Couldn't reach table.place". Validation runs before create, and a failure there spends no lobby.
- **Phone width:** at 320 px, `scrollWidth === clientWidth` and nothing sticks out.
- **Balanced and custom decks:** refused with one line, as designed. For the copy, see finding 9.
- **Sidekicks:** a Labs deck with a sidekick ×5 converts, with the quiet note "THE AUDIENCE has no separate card; its rules are on the hero card" (#1047).

## Behaviour with no test
1. There are no component tests for `TablePage`, `InviteScreen`, `DeckPreviewCard` or `useImageSize`. Untested: the create flow, the disabled states, the error box, the refusal, a failed map probe, and the invite screen's fallback to `lobby_url`.
2. `api.ts`: timeout or hang, a malformed 2xx body, a 2xx body that isn't JSON, and `Retry-After` that can't be read cross-origin.
3. The VIEW-bounds test ignores piece radius (finding 6).
4. The start slot per seat and the side of the board it's on (finding 5).
5. `mapToTablePack` given a relative URL.
6. `fitPlacementCap` when fighters and dials alone go over 100, and the silent cut-off of snap points at 200.
7. A column with no room that drops an **HP dial or fighter**. Only dropping tokens is tested.
8. A card with `quantity: 0`.
9. The import boundaries: nothing outside `/table` imports `lib/tableplace`, and `lib/tableplace` imports no runtime Pro code. There's no lint rule or test for either.
10. `plainSkipped` for the "no room" wording (`preview.ts:40`) with a non-token piece name that contains quotes.
