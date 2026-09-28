/**
 * Dry-run every converter fixture through table.place's lobby validator.
 *
 *   npx tsx scripts/tableplace/validate.mjs
 *
 * POST /v1/lobbies/validate composes the lobby exactly like /v1/lobbies but
 * creates nothing and does not count against the per-hour lobby cap. Each
 * fixture is sent as a 2-seat duel-2p request (the deck on both seats, plus a
 * table-scoped map pack) and the response is printed. Exits 1 on any non-2xx.
 * The card `order` lists make the raw response long, so they are elided
 * unless you pass --full.
 */
import { FIXTURES } from "../../lib/tableplace/fixtures/decks.ts";
import { deckToPlayerPack } from "../../lib/tableplace/deckToPack.ts";
import { mapToTablePack } from "../../lib/tableplace/mapToPack.ts";

const API = process.env.TABLEPLACE_API ?? "https://api.table.place";
const MAP = {
  imageUrl: "https://unbrewed.xyz/maps/legacy-the-mended-drum.webp",
  width: 1200,
  height: 1000,
};

const FULL = process.argv.includes("--full");
let failed = false;
for (const [name, { deck, faces }] of Object.entries(FIXTURES)) {
  const seats = [0, 1].map((seat) => deckToPlayerPack(deck, { faces, seat }));
  const skipped = seats.flatMap((s) => s.skipped);
  console.log(`\n=== ${name} ===`);
  if (skipped.length) {
    console.log("refused before sending; skipped:", skipped);
    failed = true;
    continue;
  }
  const body = {
    version: 1,
    layout: "duel-2p",
    packs: [...seats.map((s) => s.pack), mapToTablePack(MAP)],
    placements: seats.flatMap((s) => s.placements),
  };
  const res = await fetch(`${API}/v1/lobbies/validate`, {
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
