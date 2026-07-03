#!/usr/bin/env node
/**
 * snapshot-maps.mjs — evergreen map catalog builder (issue #65).
 *
 * Fetches maps from the-unmatched.club (official board maps + community "Fan
 * Battlefields"), plus legacy curated maps, downloads every image, compresses
 * them with sharp, and writes:
 *   - public/maps/<slug>.webp        (full image, used on the board)
 *   - public/maps/thumb/<slug>.webp  (thumbnail, used on the bag grid)
 *   - components/Bag/Map/MapModal/defaultMaps.json  (the catalog the app imports)
 *
 * There is NO runtime API — the app only ever reads the committed snapshots.
 * Re-run this script to refresh the catalog from the live sources.
 *
 * Usage:
 *   node scripts/snapshot-maps.mjs                       # all sources
 *   node scripts/snapshot-maps.mjs --sources=community   # subset
 *   node scripts/snapshot-maps.mjs --dry                 # fetch + report, no writes
 *   COMMUNITY_COUNT=48 node scripts/snapshot-maps.mjs
 */
import sharp from "sharp";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC_MAPS = join(ROOT, "public", "maps");
const THUMB_DIR = join(PUBLIC_MAPS, "thumb");
const CATALOG_OUT = join(ROOT, "components", "Bag", "Map", "MapModal", "defaultMaps.json");

const SUPA = "https://yptpnirqgfmxphjvsdjz.supabase.co";
// Public anon key (re-grab from the-unmatched.club _app chunks if it ever rotates).
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwdHBuaXJxZ2ZteHBoanZzZGp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDU2MDA0NjQsImV4cCI6MjAyMTE3NjQ2NH0.U_SyLPq9G1GUzdQ16f8uwLkE4tcrnbHd1BM_gjEDWFg";
const SUPA_H = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" };

// --- image sizing knobs -----------------------------------------------------
const FULL_WIDTH = 1280; // board render
const FULL_QUALITY = 78;
const THUMB_WIDTH = 480; // bag grid card
const THUMB_QUALITY = 66;

// --- CLI --------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const sourcesArg = args.find((a) => a.startsWith("--sources="));
const SOURCES = sourcesArg ? sourcesArg.split("=")[1].split(",") : ["legacy", "official", "community"];
const COMMUNITY_COUNT = Number(process.env.COMMUNITY_COUNT ?? 36);

const log = (...a) => console.error(...a);
const slugify = (s) =>
  String(s || "map")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "map";

// =====================================================================
// devalue unflatten — decodes SvelteKit __data.json's flattened array.
// =====================================================================
function devalueUnflatten(parsed) {
  if (typeof parsed === "number") return parsed;
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("bad devalue payload");
  const values = parsed;
  const hydrated = new Array(values.length);
  const seen = new Array(values.length).fill(false);
  function hydrate(index) {
    if (index === -1) return undefined;
    if (index === -2) return undefined; // hole
    if (index === -3) return NaN;
    if (index === -4) return Infinity;
    if (index === -5) return -Infinity;
    if (index === -6) return -0;
    if (seen[index]) return hydrated[index];
    const value = values[index];
    if (!value || typeof value !== "object") {
      seen[index] = true;
      hydrated[index] = value;
    } else if (Array.isArray(value)) {
      if (typeof value[0] === "string") {
        // type-tagged special (Date/Set/Map/...) — only Date matters to us
        seen[index] = true;
        hydrated[index] = value[0] === "Date" ? new Date(value[1]) : value.slice(1).map(hydrate);
      } else {
        const arr = [];
        seen[index] = true;
        hydrated[index] = arr;
        for (const i of value) arr.push(hydrate(i));
      }
    } else {
      const obj = {};
      seen[index] = true;
      hydrated[index] = obj;
      for (const k in value) obj[k] = hydrate(value[k]);
    }
    return hydrated[index];
  }
  return hydrate(0);
}

// =====================================================================
// Source fetchers → normalized { imgSrc, meta{title,author,url}, extra }
// =====================================================================
async function fetchOfficial() {
  const res = await fetch("https://www.the-unmatched.club/maps/__data.json", {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 unbrewed-snapshot" },
  });
  if (!res.ok) throw new Error(`official __data.json ${res.status}`);
  const json = await res.json();
  // The maps live in the node whose hydrated root has a `maps` array.
  let root;
  for (const node of json.nodes || []) {
    if (node?.type !== "data" || !Array.isArray(node.data)) continue;
    const r = devalueUnflatten(node.data);
    if (r && Array.isArray(r.maps)) {
      root = r;
      break;
    }
  }
  if (!root) throw new Error("could not locate maps node in official payload");
  return root.maps
    .filter((m) => m?.image && m?.name)
    .map((m) => ({
      source: "official",
      slug: `official-${slugify(m.key || m.name)}`,
      imgSrc: m.image,
      meta: {
        title: m.name,
        author: m.set?.name ? `Unmatched · ${m.set.name}` : "Unmatched (official)",
        url: `https://www.the-unmatched.club/maps`,
      },
      size: m.size,
      minPlayers: m.minPlayers,
      maxPlayers: m.maxPlayers,
    }));
}

const RPC = { hot: "fan_maps_sort_by_hot", new: "fan_maps_sort_by_new", top: "fan_maps_sort_by_top" };
function communityBody(sort, last, limit = 12) {
  const base = { p_last_map_id: last?.id ?? null, p_limit: limit, p_lang: null };
  if (sort === "hot") return { p_last_hot_score: last?.hot_score ?? null, ...base };
  if (sort === "new") return { p_last_created: last?.created_at ?? null, ...base };
  if (sort === "top") return { p_sort_time: "allTime", p_last_total_upvotes: last?.total_upvotes ?? null, ...base };
  throw new Error("bad sort " + sort);
}
async function fetchCommunity(sort = "hot", want = COMMUNITY_COUNT) {
  const rows = [];
  let last = null;
  while (rows.length < want) {
    const r = await fetch(`${SUPA}/rest/v1/rpc/${RPC[sort]}`, {
      method: "POST",
      headers: SUPA_H,
      body: JSON.stringify(communityBody(sort, last)),
    });
    if (!r.ok) throw new Error(`community rpc ${sort} ${r.status}`);
    const page = await r.json();
    if (!page.length) break;
    rows.push(...page);
    last = page[page.length - 1];
  }
  const maps = rows.slice(0, want);
  // Second call: resolve user_id per map (needed to build the storage path).
  const ids = maps.map((m) => m.id).join(",");
  const u = await fetch(`${SUPA}/rest/v1/fan_maps?select=id,user_id&id=in.(${ids})`, { headers: SUPA_H });
  if (!u.ok) throw new Error(`community user_id lookup ${u.status}`);
  const userById = new Map((await u.json()).map((x) => [x.id, x.user_id]));
  return maps
    .filter((m) => userById.get(m.id))
    .map((m) => {
      const uid = userById.get(m.id);
      const v = encodeURIComponent(m.updated_at);
      return {
        source: "community",
        slug: `community-${slugify(m.key)}-${m.id}`,
        imgSrc: `${SUPA}/storage/v1/object/public/fan_maps/${uid}/${m.id}.webp?v=${v}`,
        meta: {
          title: m.title,
          author: m.author?.nickname || "Unknown",
          url: `https://www.the-unmatched.club/c/maps/${m.key}.${m.id}`,
        },
        size: m.size,
        upvotes: m.total_upvotes ?? 0,
      };
    });
}

async function fetchLegacy() {
  const seedPath = join(__dirname, "legacy-maps.seed.json");
  if (!existsSync(seedPath)) return [];
  const seed = JSON.parse(await readFile(seedPath, "utf8"));
  return seed
    .filter((m) => m?.imgUrl && m?.meta?.title)
    .map((m) => ({
      source: "legacy",
      slug: `legacy-${slugify(m.meta.title)}`,
      imgSrc: m.imgUrl,
      meta: { title: m.meta.title, author: m.meta.author, url: m.meta.url },
    }));
}

// =====================================================================
// Image snapshot: download -> sharp -> full + thumb webp
// =====================================================================
async function snapshotImage(entry) {
  const res = await fetch(entry.imgSrc, { headers: { "User-Agent": "Mozilla/5.0 unbrewed-snapshot" } });
  if (!res.ok) throw new Error(`img ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const base = sharp(input, { failOn: "none" }).rotate();
  const full = await base
    .clone()
    .resize({ width: FULL_WIDTH, withoutEnlargement: true })
    .webp({ quality: FULL_QUALITY })
    .toBuffer();
  const thumb = await base
    .clone()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();
  await writeFile(join(PUBLIC_MAPS, `${entry.slug}.webp`), full);
  await writeFile(join(THUMB_DIR, `${entry.slug}.webp`), thumb);
  return { fullBytes: full.length, thumbBytes: thumb.length };
}

// =====================================================================
// Main
// =====================================================================
async function main() {
  log(`\n▶ snapshot-maps  sources=[${SOURCES}]  community=${COMMUNITY_COUNT}  ${DRY ? "(dry run)" : ""}\n`);

  const collected = [];
  if (SOURCES.includes("legacy")) {
    const l = await fetchLegacy();
    log(`  legacy:    ${l.length}`);
    collected.push(...l);
  }
  if (SOURCES.includes("official")) {
    const o = await fetchOfficial();
    log(`  official:  ${o.length}`);
    collected.push(...o);
  }
  if (SOURCES.includes("community")) {
    const c = await fetchCommunity("hot");
    log(`  community: ${c.length} (hot)`);
    collected.push(...c);
  }

  // de-dupe by slug
  const bySlug = new Map();
  for (const e of collected) if (!bySlug.has(e.slug)) bySlug.set(e.slug, e);
  const entries = [...bySlug.values()];
  log(`\n  total unique: ${entries.length}\n`);

  if (DRY) {
    for (const e of entries) log(`   · [${e.source}] ${e.meta.title} — ${e.meta.author ?? "?"}`);
    log(`\n(dry run — no images or catalog written)\n`);
    return;
  }

  await mkdir(THUMB_DIR, { recursive: true });

  const catalog = [];
  let ok = 0,
    failed = 0,
    fullTotal = 0,
    thumbTotal = 0;
  // modest concurrency so we don't hammer the hosts
  const CONCURRENCY = 6;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (e) => {
        try {
          const { fullBytes, thumbBytes } = await snapshotImage(e);
          fullTotal += fullBytes;
          thumbTotal += thumbBytes;
          ok++;
          catalog.push({
            imgUrl: `/maps/${e.slug}.webp`,
            thumbUrl: `/maps/thumb/${e.slug}.webp`,
            meta: e.meta,
            source: e.source,
            ...(e.size ? { size: e.size } : {}),
            ...(e.minPlayers ? { minPlayers: e.minPlayers, maxPlayers: e.maxPlayers } : {}),
            ...(e.upvotes != null ? { upvotes: e.upvotes } : {}),
          });
        } catch (err) {
          failed++;
          // Evergreen: if we can't snapshot it locally, drop it rather than
          // ship a remote URL that would break offline/posterity guarantees.
          log(`   ✗ ${e.meta.title} (${e.source}): ${err.message} — dropped`);
        }
      }),
    );
    log(`  …${Math.min(i + CONCURRENCY, entries.length)}/${entries.length}`);
  }

  // keep a stable, source-grouped order: legacy, official, community
  const rank = { legacy: 0, official: 1, community: 2 };
  catalog.sort((a, b) => (rank[a.source] ?? 9) - (rank[b.source] ?? 9));

  await writeFile(CATALOG_OUT, JSON.stringify(catalog, null, 2) + "\n");

  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  log(`\n✔ ${ok} snapshotted, ${failed} fallback`);
  log(`  full: ${mb(fullTotal)}MB  thumb: ${mb(thumbTotal)}MB  total: ${mb(fullTotal + thumbTotal)}MB`);
  log(`  catalog → ${CATALOG_OUT} (${catalog.length} maps)\n`);
}

main().catch((e) => {
  console.error("\n✗ snapshot failed:", e);
  process.exit(1);
});
