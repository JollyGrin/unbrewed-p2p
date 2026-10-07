/** Hardening contract items 1 + 2 (#1268): the ticket is a POST; the dead-room report. */
import { getMatchTicket, reportRoomGone } from "./api";

const realFetch = global.fetch;
let calls: { url: string; init: RequestInit }[] = [];
const answer = (status: number, body: unknown) => {
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
};
beforeEach(() => (calls = []));
afterEach(() => (global.fetch = realFetch));

it("the ticket is POST …/ticket with a JSON content type and no body", async () => {
  answer(200, { action: "join", ticket: "t", roomId: "R1" });
  const r = await getMatchTicket("s s", "m/1");
  expect(r.ok && r.value).toMatchObject({ action: "join", ticket: "t", roomId: "R1" });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toMatch(/\/tournaments\/s%20s\/matches\/m%2F1\/ticket$/);
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.body).toBeUndefined();
  expect(calls[0].init.headers).toMatchObject({ "Content-Type": "application/json", Accept: "application/json" });
  expect(calls[0].init.credentials).toBe("include");
});

it("room-gone posts {roomId} as JSON and reads `cleared`", async () => {
  answer(200, { cleared: true });
  expect(await reportRoomGone("s", "m", "GONE")).toEqual({ ok: true, value: { cleared: true } });
  expect(calls[0].url).toMatch(/\/tournaments\/s\/matches\/m\/room-gone$/);
  expect(calls[0].init.method).toBe("POST");
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ roomId: "GONE" });
  expect(calls[0].init.headers).toMatchObject({ "Content-Type": "application/json" });
  answer(200, { cleared: false });
  expect(await reportRoomGone("s", "m", "GONE")).toEqual({ ok: true, value: { cleared: false } });
});

it("an api without the route answers not_found", async () => {
  answer(404, { error: "not_found" });
  expect(await reportRoomGone("s", "m", "GONE")).toMatchObject({ ok: false, reason: "not_found" });
});
