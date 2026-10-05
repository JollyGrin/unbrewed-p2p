/**
 * A stand-in tournaments API serving lib/tournaments/fixtures over HTTP, so the
 * real /tournaments page can be driven and screenshotted with no unbrewed-api
 * (#1217). Never touches a real service.
 *
 *   npx tsx scripts/tournaments/fixture-api.mts [port=8799] [--signed-in] [--as=<userId>]
 *   NEXT_PUBLIC_API_URL=http://localhost:8799 npm run dev
 *   open http://localhost:3000/tournaments?t=fixture-8   (fixture-4, -16, -signup)
 *
 * `--signed-in` answers `/me` as the fixtures' organizer (seeding + Start);
 * `--as=u2` answers as that fixture user instead (u2 = hokuto_shin, the match
 * page's "you"). Writes (seeds, start) answer 200 and change nothing.
 *
 * `/attention` serves FIXTURE_ATTENTION (fixture-8) to the organizer; override / matchup /
 * confirm answer 200 and change nothing.
 *
 * Match page (#1218): `/tournaments?t=fixture-match-<state>&m=m2-1`, one slug
 * per state — waiting, opponent-ready, you-ready, in-play, decided,
 * decided-by-rule. `POST …/ready` and `GET …/ticket` grant a dummy ticket
 * (create, or join SF2ROOM when the opponent's room is open).
 */
import { createServer } from "node:http";

import { FIXTURES, FIXTURE_ATTENTION, FIXTURE_ORGANIZER, fixtureEntries, fixtureMatch, MATCH_FIXTURE_STATES } from "../../lib/tournaments/fixtures";

const port = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 8799);
const asUser = process.argv.find((a) => a.startsWith("--as="))?.slice(5) ?? (process.argv.includes("--signed-in") ? FIXTURE_ORGANIZER.userId : null);
const me = asUser ? fixtureEntries(16, true).find((e) => e.userId === asUser) : null;

const matchFixture = (slug: string) => {
  const st = MATCH_FIXTURE_STATES.find((s) => `fixture-match-${s.replace(/_/g, "-")}` === slug);
  return st ? fixtureMatch(st, new Date().toISOString()) : null;
};

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
    return me
      ? send(200, { user: { id: me.userId, username: me.username, avatarUrl: null } })
      : send(401, { error: "unauthorized" });
  if (url.pathname === "/tournaments")
    return send(200, { tournaments: Object.values(FIXTURES).map((f) => f().tournament) });
  const m = url.pathname.match(/^\/tournaments\/([^/]+)(\/.*)?$/);
  const slug = m ? decodeURIComponent(m[1]) : "";
  const fixture = m && FIXTURES[slug];
  if (!fixture) return send(404, { error: "not_found" });
  const rest0 = m![2] ?? "";
  if (rest0 === "/attention")
    return me?.userId === FIXTURE_ORGANIZER.userId
      ? send(200, { items: FIXTURE_ATTENTION[slug] ?? [] })
      : send(me ? 403 : 401, { error: me ? "forbidden" : "unauthorized" });
  const payload = matchFixture(slug) ?? fixture();
  const rest = m[2] ?? "";
  const mm = rest.match(/^\/matches\/([^/]+)(\/ready|\/ticket)?$/);
  if (mm) {
    const match = payload.matches.find((x) => x.id === decodeURIComponent(mm[1]));
    if (!match) return send(404, { error: "not_found" });
    const detail =
      "detail" in payload && payload.detail.match.id === match.id
        ? payload.detail
        : {
            match,
            tournament: { id: payload.tournament.id, slug, name: payload.tournament.name, status: payload.tournament.status },
            players: {
              a: payload.entries.find((e) => e.id === match.slotA) ?? null,
              b: payload.entries.find((e) => e.id === match.slotB) ?? null,
            },
            readyChecks: [],
            liveRoom: null,
          };
    if (!mm[2]) return send(200, detail);
    if (!me) return send(401, { error: "unauthorized" });
    const slot = detail.players.a?.userId === me.userId ? "a" : detail.players.b?.userId === me.userId ? "b" : null;
    if (!slot) return send(403, { error: "not_in_match", message: "only the match's players can play it" });
    if (match.status !== "open") return send(409, { error: match.inPlay ? "match_in_play" : "match_not_open" });
    const join = !!detail.liveRoom;
    return send(200, {
      action: join ? "join" : "create",
      ticket: "fixture.ticket",
      gameIndex: 0,
      slot,
      heroId: match.matchup.heroes[slot],
      map: match.matchup.map,
      ticketExpiresAt: new Date(Date.now() + 900_000).toISOString(),
      roomId: join ? detail.liveRoom!.roomId : null,
      readyCheck: { id: "rc-new", expiresAt: new Date(Date.now() + 900_000).toISOString() },
    });
  }
  const { detail: _detail, ...body } = payload as typeof payload & { detail?: unknown };
  if (req.method !== "GET") return send(200, { ...body, ok: true });
  return send(200, body);
}).listen(port, () => console.log(`fixture tournaments api on http://localhost:${port}${me ? ` (signed in as ${me.username})` : ""}`));
