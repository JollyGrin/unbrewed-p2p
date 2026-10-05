/**
 * A stand-in tournaments API serving lib/tournaments/fixtures over HTTP, so the
 * real /tournaments page can be driven and screenshotted with no unbrewed-api
 * (#1217). Never touches a real service.
 *
 *   npx tsx scripts/tournaments/fixture-api.mts [port=8799] [--signed-in]
 *   NEXT_PUBLIC_API_URL=http://localhost:8799 npm run dev
 *   open http://localhost:3000/tournaments?t=fixture-8   (fixture-4, -16, -signup)
 *
 * `--signed-in` answers `/me` as the fixtures' organizer (seeding + Start).
 * Writes (seeds, start) answer 200 and change nothing.
 */
import { createServer } from "node:http";

import { FIXTURES, FIXTURE_ORGANIZER } from "../../lib/tournaments/fixtures";

const port = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 8799);
const signedIn = process.argv.includes("--signed-in");

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": req.headers.origin ?? "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept",
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return send(204, {});
  if (url.pathname === "/me")
    return signedIn
      ? send(200, { user: { id: FIXTURE_ORGANIZER.userId, username: FIXTURE_ORGANIZER.username, avatarUrl: null } })
      : send(401, { error: "unauthorized" });
  if (url.pathname === "/tournaments")
    return send(200, { tournaments: Object.values(FIXTURES).map((f) => f().tournament) });
  const m = url.pathname.match(/^\/tournaments\/([^/]+)(\/.*)?$/);
  const fixture = m && FIXTURES[decodeURIComponent(m[1])];
  if (!fixture) return send(404, { error: "not_found" });
  const payload = fixture();
  if (req.method !== "GET") return send(200, { ...payload, ok: true });
  return send(200, payload);
}).listen(port, () => console.log(`fixture tournaments api on http://localhost:${port}${signedIn ? " (signed in)" : ""}`));
