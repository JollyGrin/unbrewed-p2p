# Scripted Maps: Encoding Unmatched Boards as Machine-Readable Data

Research + schema design for turning a printed Unmatched board into structured data
that (a) a server-side rules engine can query for movement/range validation and
(b) a Next.js client can render as an image with clickable, scalable space overlays.

Status: research/design (no code yet). Author: investigation agent, 2026-07.

---

## 1. Map anatomy (verified against official sources)

An Unmatched battlefield is a printed board. Its logical structure has four primitives:

| Primitive | Printed form | Data form |
|---|---|---|
| **Space** | A circle you place a fighter on | Node with an id + coordinate |
| **Adjacency** | A **line** drawn between two circles | Edge between two nodes |
| **Zone** | A **color/pattern** filling a space | A label a space belongs to (a **set** — see below) |
| **Starting space** | A circle printed with a number (**1**, **2**, and **3**/**4** on 4-player boards) | A per-player-slot hero start |

Verified rules (quotes/paraphrase from sources cited):

- **Adjacency = a line.** "Two spaces connected by a line are adjacent." Movement and melee
  targeting both key off this.
  ([Round2Gaming guide](https://round2gaming.com/2025/01/how-to-play-unmatched-a-comprehensive-guide-to-the-epic-skirmish-board-game/))
- **Zones are colored regions.** "The map is divided into color-coded zones, which determine
  whether a ranged attacker has line of sight to an enemy." Each space carries one **or more**
  colors.
  ([Round2Gaming](https://round2gaming.com/2025/01/how-to-play-unmatched-a-comprehensive-guide-to-the-epic-skirmish-board-game/))
- **A space can belong to multiple zones (split spaces).** These are printed half-one-color,
  half-another. A fighter on a multi-zone space is treated as being in **all** of those zones,
  simultaneously, for **both** attacking and being attacked: "Ranged characters in zones with
  multiple colors can attack characters in any zones of any of the colors, but can also be
  attacked by characters in any zones of any of the colors of the space they are in."
  This is why zone membership must be modeled as a **set**, not a scalar.
  ([Round2Gaming](https://round2gaming.com/2025/01/how-to-play-unmatched-a-comprehensive-guide-to-the-epic-skirmish-board-game/))
- **Melee vs. ranged range.**
  - Melee: may attack only an **adjacent** fighter.
  - Ranged: may attack any fighter in the **same zone** (any shared color) **or** adjacent.
  ([Round2Gaming](https://round2gaming.com/2025/01/how-to-play-unmatched-a-comprehensive-guide-to-the-epic-skirmish-board-game/),
   [Wikipedia](https://en.wikipedia.org/wiki/Unmatched_(board_game)))
- **Movement.** Move a fighter up to its movement value. "Each space they move into must be
  adjacent to their previous space. You may move a fighter through spaces occupied by other
  **friendly** fighters, but they must end their movement in an **empty** space."
  ([Round2Gaming](https://round2gaming.com/2025/01/how-to-play-unmatched-a-comprehensive-guide-to-the-epic-skirmish-board-game/))
- **Opposing fighters BLOCK movement-through.** "You may not move a fighter through spaces
  occupied by opposing fighters ... unless otherwise specified by a card effect." (Card effects
  can override, e.g. Ghost Rider's Hell Cycle moves through enemies for 1 damage each.) This is
  the single load-bearing rule for the movement BFS: **allies are pass-through, enemies are walls.**
  ([Rules search / Special Rules Reference v7](https://www.scribd.com/document/798271558/Unmatched-Special-Rules-v7-0-1))
- **Setup / starting spaces.** "The first player should place their Hero on the **1** space, and
  the second player should place their Hero on the **2** space. Sidekicks should be placed such
  that they are in the same **zone** (color/design of space) as your Hero." So starting hero
  spaces are printed and fixed per slot; sidekick placement is *derived* (any space sharing the
  hero's zone), not a fixed printed space.
  ([Board-game-rules](https://board-game-rules.com/boardgames/unmatched-game-system/),
   [WhatsEricPlaying #581](https://whatsericplaying.com/2020/01/13/unmatched/))

### Maps with SPECIAL printed rules — avoid these for v1

Some boards carry unique printed rules that the base schema does **not** cover. Flagging so v1
picks a vanilla board:

- **Jurassic Park: InGen vs. Raptors (Raptor Paddock).** One-way arrows: fighters may only move
  in the arrow's direction (though they can still *attack* across those spaces), and the paddock
  has a single exit. This makes adjacency **directional** for movement but **undirected** for
  attacks — our v1 undirected-edge model can't express it.
  ([Gridbeast: InGen vs. Raptors](https://gridbeast.gg/unmatched-jurassic-park-ingen-vs-raptors/))
- **Cobble & Fog (Baker Street / Soho + fog).** Fog tokens: the Invisible Man moves between fog
  spaces as if adjacent, and fog raises his defense. Introduces dynamic, fighter-specific
  adjacency.
  ([Daily Worker Placement: Cobble & Fog](https://dailyworkerplacement.com/2020/07/08/unmatched-cobble-and-fog/))

Vanilla boards with no special printed rules include **Marmoreal**, **Sarpedon**, **Soho**
(the plain side), and most Battle-of-Legends-era boards. These are pure space/adjacency/zone graphs.

---

## 2. Prior art — what already exists

TL;DR: **the-unmatched.club** already publishes coordinates + zone membership + images for most
official maps, which is a big head start, but **nobody publishes the adjacency graph** — that's
the piece we must author.

### 2a. the-unmatched.club maps database — the goldmine (partial)

The site is a SvelteKit app; its maps route exposes a `devalue`-encoded data blob:

```
GET https://the-unmatched.club/maps/__data.json   (308-redirects; server-side curl works;
                                                     browser fetch is CORS-blocked — needs a proxy)
```

Decoded, each map record contains:

- `name`, `key`, `size` (`sm`/`md`/`lg`), `minPlayers`, `maxPlayers`, `width`, `height`
- `image` — a hosted `.webp` render (Supabase storage, e.g.
  `https://yptpnirqgfmxphjvsdjz.supabase.co/storage/v1/object/public/maps/…webp`)
- `zones[]` — each zone has `key` (color name), `color` (hex, e.g. `#C5D1D3`), and an
  **`svgGroup`** string: inline SVG containing `<circle cx cy r>` (the spaces) and `<path>`
  (split-space half-shapes + zone decoration), grouped by zone.
- `zonesCount`, `spacesCount`

Maps present include official boards: **Marmoreal, Sarpedon, Soho, Baskerville Manor, Azuchi
Castle, Sunnydale High, The Bronze, Raptor Paddock, Helicarrier, Sanctum Sanctorum, Streets of
Novigrad, Kaer Morhen, Globe Theatre, Hanging Gardens, Yukon, Venice, Navy Pier, Redemption Row**,
plus community maps — ~28 maps, 520 `<circle>` elements total.

**What it gives us:** space coordinates (as SVG circles) + which zone each circle sits in +
zone colors + player counts + a usable image.

**What it does NOT give us, and the caveats:**
1. **No adjacency.** There are no edges/lines/neighbor lists anywhere in the blob. `spacesCount`
   is only an integer count.
2. **No starting-space numbers.** The printed 1/2/3/4 markers aren't encoded.
3. **Coordinates are in an internal SVG viewBox**, not the display `width`/`height`, and split
   spaces are `<path>` shapes not circles — so extraction needs interpretation, not a straight read.
   (Worked example: Marmoreal reports `spacesCount: 31` but only 13 `<circle>`s resolve; the rest
   are path-based split spaces.)
4. **These are community re-renders**, not pixel-accurate official scans — good enough to seed, but
   verify against a real board image.

Verdict: use it as a **seed** for spaces + zone membership, then hand-author adjacency and starts.

### 2b. Tabletop Simulator "Unmatched Official" mod

Exists on the Steam Workshop ([id 2132611236](https://steamcommunity.com/sharedfiles/filedetails/?id=2132611236),
bundles Robin Hood vs. Bigfoot, Cobble & Fog, Battle of Legends Vol. 1). TTS save JSON can encode
**snap points** (position + rotation + tags) for where fighter tokens land — i.e. approximate
**space coordinates**. But snap points carry **no adjacency and no zone membership**
([TTS snap-point tool docs](https://kb.tabletopsimulator.com/game-tools/snap-point-tool/)).
So TTS is, at best, a second/worse coordinate source than the-unmatched.club and contributes
nothing to the graph structure. Not worth mining.

### 2c. Official digital + GitHub

- There is an official **Unmatched: Digital Edition** (Restoration Games / Level 99). Its internal
  data is not publicly documented and I found no datamined map graphs.
- **No GitHub project** publishes official Unmatched maps as adjacency/zone graphs. Searches for
  Unmatched rules engines / simulators / map JSON turned up only generic board-game frameworks
  (boardgame.io, Anyboard), nothing Unmatched-specific
  ([GitHub board-game topic](https://github.com/topics/board-game)).

So the adjacency graph is **greenfield** — no license-encumbered source to copy, and nothing to
reuse beyond the-unmatched.club geometry seed.

### 2d. Licensing posture

Unmatched board art is © Restoration Games / Mondo / Level 99. This repo already displays map
images in the sandbox (community maps from imgur/arweave/Supabase in
`components/Bag/Map/MapModal/defaultMaps.json`). Same fan/non-commercial posture applies here:
either reuse a community render (the-unmatched.club Supabase webp) or self-redraw the board. The
**graph data itself** (our spaces/edges/zones JSON) is our own authored work — facts about a game,
freely encodable.

---

## 3. Proposed JSON schema

One file per map. Coordinates are **normalized 0–1 relative to the image**, so overlays scale
correctly under pan/zoom rendering regardless of the rendered pixel size.

```jsonc
{
  "schemaVersion": "1.0",
  "id": "marmoreal",                     // stable slug, matches filename
  "meta": {
    "title": "Marmoreal",
    "set": "Battle of Legends, Vol. 1",
    "imageUrl": "/maps/marmoreal.webp",  // or remote render
    "imageWidth": 1400,                  // native px of imageUrl (for authoring/aspect only)
    "imageHeight": 917,
    "minPlayers": 2,
    "maxPlayers": 4,
    "specialRules": false,               // true => engine must special-case; keep v1 false
    "source": "https://the-unmatched.club/maps (geometry seed)",
    "license": "fan/non-commercial; art © Restoration Games"
  },

  "zones": [                             // display metadata for each colored zone
    { "id": "gray",   "color": "#C5D1D3", "label": "Gray" },
    { "id": "green",  "color": "#C3D5C4", "label": "Green" },
    { "id": "blue",   "color": "#C4CDD4", "label": "Blue" }
    // ...
  ],

  "spaces": [
    {
      "id": "g1",                        // stable, unique within map
      "x": 0.254, "y": 0.081,            // normalized center, 0..1
      "zones": ["gray"],                 // SET — multi-zone spaces list every color
      "adjacentTo": ["g2", "gr1"],       // undirected; both endpoints list each other
      "start": { "slot": 1 }             // OPTIONAL: printed hero start for player slot 1
    },
    {
      "id": "gr1",
      "x": 0.372, "y": 0.190,
      "zones": ["gray", "green"],        // split space — belongs to two zones
      "adjacentTo": ["g1", "b1"]
    }
    // ...
  ]
}
```

Design notes / invariants (enforce with a validator, see §5):

- **Adjacency is stored symmetrically** — if `a.adjacentTo` includes `b`, then `b.adjacentTo`
  must include `a`. (An undirected edge listed on both nodes. The authoring tool guarantees this;
  the validator checks it.) Undirected is correct for vanilla maps; the Jurassic Park directional
  case is explicitly out of scope for v1.
- **`zones` is a set** — order-independent, deduped, every id must exist in top-level `zones[]`.
- **Starting spaces** are encoded inline via `space.start.slot` (slot 1 = first player's hero,
  2 = second, 3/4 for 4-player boards). Sidekick starts are **not** stored — the engine derives
  legal sidekick spaces as "empty spaces sharing a zone with the hero's start" (§4), matching the
  printed rule.
- **No pixel coordinates in the shipped file** beyond `imageWidth/Height` (authoring aid). The
  renderer multiplies normalized `x,y` by the on-screen image box.

---

## 4. Engine queries (pseudocode)

The engine loads a map into `spaces: Map<id, Space>`. Fighter positions come from game state:
`occupant(spaceId) -> {fighterId, owner} | null`.

```ts
// --- adjacency ---
function areAdjacent(a: SpaceId, b: SpaceId): boolean {
  return spaces.get(a).adjacentTo.includes(b);   // symmetric by invariant
}

// --- shared zone (ranged line of sight) ---
function sharesZone(a: SpaceId, b: SpaceId): boolean {
  const za = spaces.get(a).zones, zb = spaces.get(b).zones;
  return za.some(z => zb.includes(z));           // set intersection non-empty
}

// --- can `attacker` (in space `from`) target a fighter in space `to`? ---
function inAttackRange(from: SpaceId, to: SpaceId, style: "melee" | "ranged"): boolean {
  if (from === to) return false;
  if (areAdjacent(from, to)) return true;        // both styles can hit adjacent
  return style === "ranged" && sharesZone(from, to);
}

// --- movement: all spaces reachable in <= maxSteps ---
// Rule: each step must be to an adjacent space; may PASS THROUGH friendly-occupied spaces;
// may NOT pass through enemy-occupied spaces; must END on an empty space.
function movementRange(start: SpaceId, mover: Owner, maxSteps: number): Set<SpaceId> {
  const reachable = new Set<SpaceId>();
  // BFS over step count. dist[s] = fewest steps to enter s.
  const dist = new Map<SpaceId, number>([[start, 0]]);
  const queue: SpaceId[] = [start];

  while (queue.length) {
    const cur = queue.shift()!;
    if (dist.get(cur)! >= maxSteps) continue;    // no budget to step further

    for (const next of spaces.get(cur).adjacentTo) {
      const occ = occupant(next);
      // ENEMY on `next` => wall: cannot enter or pass through it.
      if (occ && occ.owner !== mover) continue;
      // otherwise we may traverse into `next` (empty, or friendly = pass-through)
      const nd = dist.get(cur)! + 1;
      if (!dist.has(next) || nd < dist.get(next)!) {
        dist.set(next, nd);
        queue.push(next);
        // A space is a valid DESTINATION only if it is empty.
        if (!occ) reachable.add(next);           // friendly-occupied: pass-through only
      }
    }
  }
  reachable.delete(start);
  return reachable;
}

// --- validate an explicit path the player clicked (e.g. "move exactly along g1->gr1->b1") ---
function isLegalPath(path: SpaceId[], mover: Owner, maxSteps: number): boolean {
  if (path.length < 2 || path.length - 1 > maxSteps) return false;
  for (let i = 1; i < path.length; i++) {
    if (!areAdjacent(path[i - 1], path[i])) return false;
    const occ = occupant(path[i]);
    const isLast = i === path.length - 1;
    if (occ && occ.owner !== mover) return false;         // never enter an enemy space
    if (isLast && occ) return false;                      // must END empty
  }
  return true;
}

// --- legal sidekick starting spaces (setup): empty spaces sharing the hero-start's zone ---
function legalSidekickStarts(heroStart: SpaceId): SpaceId[] {
  return [...spaces.keys()].filter(s =>
    s !== heroStart && !occupant(s) && sharesZone(s, heroStart));
}
```

Notes:
- The BFS treats **cost = number of spaces entered** (unweighted edges), which matches "move up to
  N spaces." Boosts just raise `maxSteps`.
- Card overrides (Ghost Rider through enemies, Invisible Man fog adjacency) are **not** modeled in
  v1; they'd be per-fighter hooks that mutate the traversal predicate or inject virtual edges.
- `movementRange` is for highlighting reachable spaces; `isLegalPath` is for validating a specific
  chosen route when a card cares about *which* spaces were passed.

---

## 5. Authoring pipeline — comparison + recommendation

We need ~1 map now and a handful more over time. The hard, human-judgment part is **adjacency**
(reading the printed lines) and **which zone(s)** each space is — everything else can be seeded.

| Option | Effort to build | Effort per map | Correctness | Notes |
|---|---|---|---|---|
| **(a) In-browser annotation tool** (dev-only Next.js page) | Medium (a few hours) | Low, visual | High — you see the board while drawing edges | Reusable; produces exactly the normalized schema |
| (b) Offline script + hand-written JSON | Low | High, error-prone | Low — typing coordinates/edge lists by hand invites mistakes | No visual feedback on adjacency |
| (c) LLM-vision extraction from board photo + human fix | Medium | Medium | Medium — vision misreads faint lines/split zones; still needs human verify | Good as a *seed* generator, not a finisher |

**Recommendation: (a), a dev-only in-browser annotation page, seeded by the-unmatched.club
extraction.** Concretely:

1. **Seed** (script, one-time per map): fetch `__data.json` server-side, decode the target map's
   `svgGroup`s, emit candidate spaces (circle centers -> normalized `x,y`) tagged with their zone,
   and the zone color palette. This front-loads the tedious geometry so the human only fixes/adds.
2. **Annotate** (Next.js dev page at e.g. `/dev/map-editor`, gated to dev):
   - Render the board image; overlay the seeded candidate spaces as draggable dots.
   - Add/remove/nudge spaces; the tool writes normalized coords.
   - **Draw adjacency** by click-dragging one space to another (auto-creates the symmetric edge).
   - Assign zone(s) per space from a palette (multi-select for split spaces).
   - Mark starting spaces (click a space -> assign slot 1/2/3/4).
   - **Export** the §3 JSON; a **validator** runs on export (symmetric edges, zone ids exist,
     coords in 0–1, exactly one hero start per declared player slot, no orphan spaces).
3. **Store** the resulting `*.json` alongside the image (e.g. `public/maps/<id>.json` +
   `<id>.webp`), loaded by both the client renderer and the server engine.

This beats hand-JSON because adjacency correctness is *visual* — you draw the line you see on the
board — and it beats a pure LLM-vision pipeline because faint printed lines and split-zone shading
are exactly what vision models get wrong; better to have the human draw edges with the seed doing
the boring coordinate work. The tool amortizes across future maps.

(Option (c) is worth keeping as an *optional* seed step for boards the-unmatched.club doesn't have:
feed a board photo to a vision model to propose spaces/zones, then correct in the same tool.)

---

## 6. v1 map recommendation: **Marmoreal**

Pick **Marmoreal** (from *Unmatched: Battle of Legends, Vol. 1*).

Why:
- **Mechanically vanilla** — no special printed rules (unlike Jurassic Park's one-way arrows or
  Cobble & Fog's fog tokens). Pure space/adjacency/zone graph, exactly what the v1 schema + engine
  model.
- **Iconic and commonly played** — it's the flagship board of the base set, the first map most
  players ever touch. Good recognizability for a demo.
- **2–4 players** — exercises multi-slot starting spaces (`slot` 1–4) in the schema.
- **Geometry already seedable** — the-unmatched.club has Marmoreal with 8 zones (real colors:
  gray `#C5D1D3`, green `#C3D5C4`, blue `#C4CDD4`, violet, purple, red, brown, yellow) and circle
  coordinates, cutting most of the authoring effort to just adjacency + start numbers.
- **Displayable** under the same fan posture the sandbox already uses for map images.

Fallback: **Sarpedon** (the reverse side of the same physical board) is equally vanilla if a
different look is wanted. Avoid Raptor Paddock / any Cobble & Fog board for v1.

Note: neither Marmoreal nor any official board is currently in this repo — `defaultMaps.json`
holds only community/custom maps (Reddit/arweave sources), and `public/maps/` is empty in this
worktree. So v1 needs its image sourced (the-unmatched.club render or a scan) and its graph
authored fresh via the tool in §5.

---

## Appendix A — worked example: a real region of Marmoreal

Six spaces from Marmoreal's top-left (gray zone) into the gray/green split and blue, hand-encoded
to prove the schema against a real board. Coordinates are normalized from the-unmatched.club's
Marmoreal geometry (approximate — to be tightened against the board image in the authoring tool).
`g2` is a **split space** (gray + green) demonstrating the multi-zone set; `g1` is player 1's
printed hero start.

```jsonc
{
  "schemaVersion": "1.0",
  "id": "marmoreal",
  "meta": {
    "title": "Marmoreal", "set": "Battle of Legends, Vol. 1",
    "imageUrl": "/maps/marmoreal.webp", "imageWidth": 1400, "imageHeight": 917,
    "minPlayers": 2, "maxPlayers": 4, "specialRules": false,
    "source": "https://the-unmatched.club/maps (geometry seed)",
    "license": "fan/non-commercial; art © Restoration Games"
  },
  "zones": [
    { "id": "gray",  "color": "#C5D1D3", "label": "Gray" },
    { "id": "green", "color": "#C3D5C4", "label": "Green" },
    { "id": "blue",  "color": "#C4CDD4", "label": "Blue" }
  ],
  "spaces": [
    { "id": "g1", "x": 0.254, "y": 0.081, "zones": ["gray"],
      "adjacentTo": ["g2", "g3"], "start": { "slot": 1 } },
    { "id": "g2", "x": 0.369, "y": 0.079, "zones": ["gray", "green"],
      "adjacentTo": ["g1", "g3", "b1"] },
    { "id": "g3", "x": 0.372, "y": 0.204, "zones": ["gray"],
      "adjacentTo": ["g1", "g2", "b1"] },
    { "id": "b1", "x": 0.843, "y": 0.204, "zones": ["blue"],
      "adjacentTo": ["g2", "g3", "b2"] },
    { "id": "b2", "x": 0.843, "y": 0.080, "zones": ["blue"],
      "adjacentTo": ["b1"], "start": { "slot": 2 } },
    { "id": "gr1", "x": 0.723, "y": 0.204, "zones": ["green"],
      "adjacentTo": ["b1"] }
  ]
}
```

Sanity checks against the rules:
- A **ranged** fighter on `g2` (zones gray+green) can hit a fighter on `gr1` (green) even though
  they're not adjacent — `sharesZone` is true via green. A **melee** fighter on `g2` cannot.
- A **melee** fighter on `g2` can hit `b1` (adjacent) even though blue ≠ gray/green.
- Movement from `g1` with 2 steps, if an **enemy** sits on `g3`: reachable = `{g2, b1}` — `g3` is a
  wall, but `g1->g2->b1` routes around it. If instead a **friendly** sits on `g3`: reachable adds
  pass-through routes but `g3` itself is not a legal destination (occupied).

---

## Appendix B — sources

- Round2Gaming, *How to Play Unmatched* — zones, melee/ranged, movement, multi-zone spaces:
  https://round2gaming.com/2025/01/how-to-play-unmatched-a-comprehensive-guide-to-the-epic-skirmish-board-game/
- Wikipedia, *Unmatched (board game)*: https://en.wikipedia.org/wiki/Unmatched_(board_game)
- Board-game-rules, *Unmatched game system* — setup/starting spaces:
  https://board-game-rules.com/boardgames/unmatched-game-system/
- WhatsEricPlaying #581 — setup: https://whatsericplaying.com/2020/01/13/unmatched/
- Unmatched Special Rules Reference v7 — "may not move through opposing fighters":
  https://www.scribd.com/document/798271558/Unmatched-Special-Rules-v7-0-1
- Gridbeast: InGen vs. Raptors (one-way arrows):
  https://gridbeast.gg/unmatched-jurassic-park-ingen-vs-raptors/
- Daily Worker Placement: Cobble & Fog (fog tokens):
  https://dailyworkerplacement.com/2020/07/08/unmatched-cobble-and-fog/
- the-unmatched.club maps data blob (server-side): https://the-unmatched.club/maps/__data.json
- TTS Unmatched Official mod: https://steamcommunity.com/sharedfiles/filedetails/?id=2132611236
- TTS snap-point tool: https://kb.tabletopsimulator.com/game-tools/snap-point-tool/
- Official BoL Vol. 1 rulebook (PDF):
  https://cdn.1j1ju.com/medias/c8/82/19-unmatched-battle-of-legends-volume-one-rulebook.pdf
```
