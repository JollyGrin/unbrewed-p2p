/**
 * Dry-run composed tables through table.place's lobby validator.
 *
 *   npx tsx scripts/tableplace/validate.mjs [--full] [--create]
 *
 * POST /v1/lobbies/validate composes the lobby exactly like /v1/lobbies but
 * creates nothing and does not count against the per-hour lobby cap. Each case
 * is a `composeTable` body: two decks on a map. The map cases span the
 * measured board ratios (1.23, 1.54, 1.80, plus the Mended Drum, which has a
 * ProMapDef); the fixture cases put each converter fixture on both seats.
 * Exits 1 on any non-2xx. The card `order` lists make the raw response long,
 * so they are elided unless you pass --full.
 *
 * --create POSTs the Mended Drum case to /v1/lobbies for real and prints the
 * seat URLs. That spends the service-wide lobby cap: once, deliberately.
 */
import { FIXTURES } from "../../lib/tableplace/fixtures/decks.ts";
import { composeTable } from "../../lib/tableplace/composeTable.ts";

const API = process.env.TABLEPLACE_API ?? "https://api.table.place";
const MAPS = {
  "mended-drum 1.34 (ProMapDef)": {
    imageUrl: "https://unbrewed.xyz/maps/legacy-the-mended-drum.webp",
    width: 1145,
    height: 857,
  },
  "commencement 1.23": {
    imageUrl: "https://unbrewed.xyz/maps/community-commencement-66.webp",
    width: 1024,
    height: 833,
  },
  "baskerville-manor 1.54": {
    imageUrl: "https://unbrewed.xyz/maps/official-baskerville-manor.webp",
    width: 1280,
    height: 829,
  },
  "t-rex-paddock 1.80": {
    imageUrl: "https://unbrewed.xyz/maps/official-t-rex-paddock.webp",
    width: 1280,
    height: 710,
  },
};
const DRUM = MAPS["mended-drum 1.34 (ProMapDef)"];

const FULL = process.argv.includes("--full");
const CREATE = process.argv.includes("--create");

const duel = (a, b, map) =>
  composeTable({
    seats: [FIXTURES[a].deck, FIXTURES[b].deck],
    faces: [FIXTURES[a].faces, FIXTURES[b].faces],
    map,
  });

const cases = CREATE
  ? {
      "hollow-oak vs larry on mended-drum": duel(
        "hollow-oak",
        "larry-extra-characters",
        DRUM,
      ),
    }
  : {
      ...Object.fromEntries(
        Object.entries(MAPS).map(([name, map]) => [
          `hollow-oak vs larry on ${name}`,
          duel("hollow-oak", "larry-extra-characters", map),
        ]),
      ),
      ...Object.fromEntries(
        Object.keys(FIXTURES).map((name) => [
          `${name} x2 on mended-drum`,
          duel(name, name, DRUM),
        ]),
      ),
    };

let failed = false;
for (const [name, { body, skipped }] of Object.entries(cases)) {
  console.log(`\n=== ${name} ===`);
  if (skipped.length) console.log("skipped:", skipped);
  if (!body) {
    console.log("refused before sending");
    failed = true;
    continue;
  }
  console.log(
    `placements ${body.placements.length}, snapPoints ${body.snapPoints.length}`,
  );
  const res = await fetch(`${API}/v1/lobbies${CREATE ? "" : "/validate"}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "unbrewed-p2p-validate/1.0",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  try {
    console.log(
      JSON.stringify(
        JSON.parse(text),
        (key, value) =>
          key === "order" && !FULL ? `[${value.length} codes]` : value,
        2,
      ),
    );
  } catch {
    console.log(text);
  }
  if (!res.ok) failed = true;
}
process.exit(failed ? 1 : 0);
