/**
 * Adventure analytics (unbrewed-p2p#1097): the emitter no-ops when disabled and
 * the funnel hook emits the engine-#660-keyed events when enabled.
 */
import "@testing-library/jest-dom";
import { renderHook } from "@testing-library/react";
import { setAnalyticsSink, track, type AnalyticsEvent } from "@/lib/analytics";
import { defeatKindOf, verdictOf } from "@/lib/analytics/adventure";
import { useAdventureAnalytics } from "@/lib/pro/useAdventureAnalytics";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";

const fighter = (id: string, extra: object = {}) => ({ id, defeated: false, ...extra });
const view = (extra: object = {}) =>
  ({
    you: "p1",
    winner: null,
    players: [{ id: "p1", heroId: "alice", displayName: "Secret Name" }, { id: "p2", heroId: "bigfoot" }],
    fighters: [fighter("h1"), fighter("e1", { enemy: { role: "VILLAIN" } })],
    initiative: { round: 1 },
    scenario: { threat: { level: 2, overflows: 1, position: 3, positions: [] } },
    ...extra,
  }) as unknown as PlayerView;

const ORIGINAL = process.env.NEXT_PUBLIC_ANALYTICS;
let got: AnalyticsEvent[];
beforeEach(() => {
  got = [];
  setAnalyticsSink((e) => got.push(e));
});
afterEach(() => {
  setAnalyticsSink(null);
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_ANALYTICS;
  else process.env.NEXT_PUBLIC_ANALYTICS = ORIGINAL;
});

describe("disabled (default)", () => {
  it("track never reaches the sink nor builds props", () => {
    delete process.env.NEXT_PUBLIC_ANALYTICS;
    const props = jest.fn(() => ({}));
    track("x", props);
    expect(got).toEqual([]);
    expect(props).not.toHaveBeenCalled();
  });

  it("the funnel hook emits nothing and adds no listeners", () => {
    delete process.env.NEXT_PUBLIC_ANALYTICS;
    const add = jest.spyOn(document, "addEventListener");
    const { unmount } = renderHook(() => useAdventureAnalytics(view(), [{ type: "THREAT_CHANGED", position: 3, level: 2 } as GameEvent]));
    unmount();
    expect(got).toEqual([]);
    expect(add).not.toHaveBeenCalledWith("click", expect.anything(), true);
    add.mockRestore();
  });

  it("enabled but no sink installed is a no-op", () => {
    process.env.NEXT_PUBLIC_ANALYTICS = "1";
    setAnalyticsSink(null);
    expect(() => track("x")).not.toThrow();
  });
});

describe("enabled", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ANALYTICS = "1";
  });

  it("a throwing sink never breaks the caller", () => {
    setAnalyticsSink(() => {
      throw new Error("boom");
    });
    expect(() => track("x")).not.toThrow();
  });

  it("maps engine verdict + defeat kind", () => {
    expect(verdictOf("SCENARIO_VICTORY")).toBe("victory");
    expect(verdictOf("SCENARIO_DEFEAT")).toBe("defeat");
    expect(verdictOf("FORFEIT")).toBe("unknown");
    expect(defeatKindOf(view())).toBe("overflow");
    expect(defeatKindOf(view({ fighters: [fighter("h1", { defeated: true })] }))).toBe("wipe");
  });

  it("emits started, round, threat, verdict and exit(leave) with roster keys and no PII", () => {
    const events = [
      { type: "THREAT_CHANGED", position: 3, level: 2 },
      { type: "GAME_ENDED", winner: "p1", reason: "SCENARIO_DEFEAT" },
    ] as GameEvent[];
    const { unmount } = renderHook(() => useAdventureAnalytics(view(), events));
    unmount();
    expect(got.map((e) => e.name)).toEqual([
      "adventure_game_started",
      "adventure_round",
      "adventure_threat",
      "adventure_verdict",
      "adventure_exit",
    ]);
    expect(got[0].props).toEqual({ humans: 2, heroes: ["alice", "bigfoot"] });
    expect(got[3].props).toMatchObject({ verdict: "defeat", defeatKind: "overflow", overflows: 1, rounds: 1 });
    expect(got[4].props).toMatchObject({ exit: "leave", afterVerdict: true });
    expect(JSON.stringify(got)).not.toContain("Secret Name");
  });

  it("reports prompt latency for this seat's prompts only, and a rematch click as exit(rematch)", () => {
    const prompt = (player: string) => ({ promptId: "q1", player, kind: "YES_NO", options: [], onBehalfOf: "TEAM" });
    const { rerender, unmount } = renderHook(({ v }) => useAdventureAnalytics(v), {
      initialProps: { v: view({ prompt: prompt("p2") }) },
    });
    rerender({ v: view({ prompt: prompt("p1") }) });
    rerender({ v: view({ winner: "p1" }) });
    const a = document.createElement("a");
    a.href = "/pro/game?rematch=1";
    document.body.append(a);
    a.click();
    a.remove();
    unmount();
    const lat = got.find((e) => e.name === "adventure_prompt_latency");
    expect(lat?.props).toMatchObject({ kind: "YES_NO", team: true });
    expect(got.filter((e) => e.name === "adventure_prompt_latency")).toHaveLength(1);
    expect(got.at(-1)?.props).toMatchObject({ exit: "rematch" });
  });
});
