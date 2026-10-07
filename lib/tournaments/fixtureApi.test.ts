/**
 * @jest-environment node
 *
 * scripts/tournaments/fixture-api.mts answers the routes the client now calls
 * (p2p #1269): `POST …/ticket` and `POST …/room-gone` (`{cleared: true}`).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const PORT = 18000 + Math.floor(Math.random() * 1000);
let server: ChildProcess;

beforeAll(async () => {
  server = spawn(join(ROOT, "node_modules", ".bin", "tsx"), ["scripts/tournaments/fixture-api.mts", String(PORT), "--as=u2"], { cwd: ROOT });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("fixture api did not start")), 30_000);
    server.stdout?.on("data", (b) => {
      if (String(b).includes("fixture tournaments api")) {
        clearTimeout(t);
        resolve();
      }
    });
  });
}, 40_000);
afterAll(() => {
  server?.kill();
});

const post = async (path: string, body?: unknown) => {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

it("POST …/room-gone answers {cleared: true}", async () => {
  expect(await post("/tournaments/fixture-match-waiting/matches/m2-1/room-gone", { roomId: "GONE" })).toEqual({
    status: 200,
    body: { cleared: true },
  });
});

it("POST …/ticket grants a dummy ticket", async () => {
  const r = await post("/tournaments/fixture-match-waiting/matches/m2-1/ticket");
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ action: "create", ticket: "fixture.ticket" });
});
