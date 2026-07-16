/**
 * Scenario catalogue client: the public app fetches fixed vectors from the Pro
 * server, while the server expands each vector through current rules.
 */
import { fetchScenarioCatalogue, fetchScenarioReplay, type ScenarioSummary } from "./scenariosApi";

const scenario: ScenarioSummary = {
  id: "malfurion-innervate-moonkin-hurricane-2v2",
  deckId: "malfurion-stormrage",
  deckName: "Malfurion Stormrage",
  title: "Innervate + Moonkin Hurricane hits enemies across both zones",
  description: "A small example vector for visually checking a deck scenario.",
  tags: ["scheme", "moonkin"],
  actionCount: 3,
  expectedFinalHash: "623680e0fe6e73b8",
};

const mockFetch = (body: unknown, opts: { ok?: boolean; status?: number } = {}) => {
  const fn = jest.fn().mockResolvedValue({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: jest.fn().mockResolvedValue(body),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
};

describe("fetchScenarioCatalogue", () => {
  it("loads the server catalogue with no-store caching", async () => {
    const fetchMock = mockFetch({ ok: true, scenarios: [scenario] });

    const res = await fetchScenarioCatalogue({ wsUrl: "wss://pro.example.test" });

    expect(res).toEqual({ ok: true, scenarios: [scenario] });
    expect(fetchMock).toHaveBeenCalledWith("https://pro.example.test/scenarios.json", { signal: undefined, cache: "no-store" });
  });

  it("surfaces server catalogue errors", async () => {
    mockFetch({ ok: false, message: "not ready" }, { ok: false, status: 503 });

    const res = await fetchScenarioCatalogue({ wsUrl: "ws://localhost:8787" });

    expect(res).toEqual({ ok: false, message: "not ready" });
  });
});

describe("fetchScenarioReplay", () => {
  it("fetches an expanded scenario replay by id", async () => {
    const expansion = { ok: true, steps: [], catalog: {}, map: {}, meta: {}, heroes: {}, engine: {}, finalHash: scenario.expectedFinalHash };
    const fetchMock = mockFetch(expansion);

    const res = await fetchScenarioReplay("king kong/opening", { wsUrl: "ws://localhost:8787" });

    expect(res).toEqual({ ok: true, expansion });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8787/scenarios/king%20kong%2Fopening/replay.json", { signal: undefined, cache: "no-store" });
  });

  it("surfaces scenario replay rejections", async () => {
    mockFetch({ ok: false, code: "NOT_FOUND", message: "Unknown scenario" }, { ok: false, status: 404 });

    const res = await fetchScenarioReplay("missing", { wsUrl: "ws://localhost:8787" });

    expect(res).toEqual({ ok: false, message: "Unknown scenario" });
  });
});
