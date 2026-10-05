import {
  PRESETS,
  initialForm,
  latestFinal,
  mapSlots,
  matchupToWire,
  toCreateBody,
  withFormat,
  validateForm,
  type CreateFormState,
} from "./createForm";
import { assignment, unsupportedModeMessage } from "./matchup";

const NOW = new Date("2026-10-05T12:00:00Z");
const base = (over: Partial<CreateFormState> = {}): CreateFormState => ({
  ...initialForm(NOW),
  name: "Lab Rats Open",
  signupCloses: "2026-10-10T18:00",
  ...over,
});
const MAP = { kind: "catalog" as const, id: "weathertop" };

describe("create form → api payload", () => {
  it("weekend preset: 8 seats, 48h, players choose, opens signup", () => {
    const weekend = PRESETS.find((p) => p.id === "weekend")!;
    const body = toCreateBody({ ...base(), ...weekend.patch });
    expect(body).toMatchObject({
      name: "Lab Rats Open",
      format: "single_elim",
      size: 8,
      matchWindowHours: 48,
      status: "signup",
      matchupRule: { mode: "free" },
    });
    expect(body).not.toHaveProperty("firstTo");
    expect(body).not.toHaveProperty("webhook");
    expect(body.roundMaps).toBeUndefined();
    expect(new Date(body.signupClosesAt).toString()).not.toBe("Invalid Date");
  });

  it("league night is a round robin with a top-2 final", () => {
    const league = PRESETS.find((p) => p.id === "league")!;
    expect(league.patch).toMatchObject({ format: "round_robin", size: 6, top2Final: true });
    const f = { ...initialForm(NOW), ...league.patch, name: "Labs League", map: MAP };
    expect(validateForm(f, NOW)).toEqual([]);
    expect(toCreateBody(f)).toMatchObject({
      format: "round_robin",
      size: 6,
      settings: { top2Final: true },
    });
  });

  it("switching format keeps the size valid and clears per-round maps", () => {
    const rr = withFormat(base({ size: 16, roundMaps: { "1": MAP } }), "round_robin");
    expect(rr).toMatchObject({ format: "round_robin", size: 6, roundMaps: {} });
    expect(withFormat(rr, "single_elim")).toMatchObject({ size: 8, top2Final: false });
    expect(withFormat(base({ format: "round_robin", size: 5 }), "round_robin").size).toBe(5);
  });

  it("round robin map slots: n−1 rounds (n when odd) plus the final", () => {
    const keys = (over: Partial<CreateFormState>) => mapSlots(base(over)).map((s) => s.key);
    expect(keys({ format: "round_robin", size: 4 })).toEqual(["1", "2", "3"]);
    expect(keys({ format: "round_robin", size: 5, top2Final: true })).toEqual(["1", "2", "3", "4", "5", "final"]);
    expect(keys({ size: 8 })).toEqual(["1", "2", "3"]);
  });

  it("round robin per-round maps go out as roundMaps incl. final", () => {
    const f = base({
      format: "round_robin",
      size: 4,
      top2Final: true,
      matchup: "map",
      mapScope: "round",
      roundMaps: { "1": MAP, "2": MAP, "3": MAP, final: MAP },
    });
    expect(validateForm(f, NOW)).toEqual([]);
    expect(toCreateBody(f).roundMaps).toEqual({ "1": MAP, "2": MAP, "3": MAP, final: MAP });
    expect(validateForm({ ...f, roundMaps: { "1": MAP } }, NOW).map((p) => p.field)).toEqual(["map"]);
  });

  it("only round robin sends top2Final, and rejects sizes it doesn't take", () => {
    expect(toCreateBody(base({ top2Final: true })).settings).toBeUndefined();
    expect(validateForm(base({ format: "round_robin", size: 8 }), NOW).map((p) => p.field)).toEqual(["format"]);
  });

  it("round robin's latest finish is one window, plus a grace day and a window for the final", () => {
    const f = base({ format: "round_robin", size: 6, matchWindowHours: 168, signupCloses: "2026-10-10T18:00" });
    const closes = new Date(f.signupCloses).getTime();
    expect(latestFinal(f)!.getTime() - closes).toBe(168 * 3_600_000);
    expect(latestFinal({ ...f, top2Final: true })!.getTime() - closes).toBe((168 + 24 + 168) * 3_600_000);
  });

  it("single elim's latest final is rounds x (window + 24h), final's own grace day included (rule 7)", () => {
    const f = base({ format: "single_elim", size: 8, matchWindowHours: 72, signupCloses: "2026-10-10T18:00" });
    const closes = new Date(f.signupCloses).getTime();
    expect(latestFinal(f)!.getTime() - closes).toBe(3 * (72 + 24) * 3_600_000);
  });

  it("players choose → {mode:'free'} with no heroes or map", () => {
    expect(matchupToWire(base({ matchup: "free" }))).toEqual({
      matchupRule: { mode: "free" },
    });
  });

  it("same map, whole event → {mode:'map', map}", () => {
    expect(
      matchupToWire(base({ matchup: "map", mapScope: "event", map: MAP })),
    ).toEqual({ matchupRule: { mode: "map", map: MAP } });
  });

  it("same map, per round → free rule + roundMaps keyed by round", () => {
    const wire = matchupToWire(
      base({
        size: 4,
        matchup: "map",
        mapScope: "round",
        roundMaps: { "1": MAP, "2": { kind: "catalog", id: "castle" } },
      }),
    );
    expect(wire.matchupRule).toEqual({ mode: "free" });
    expect(wire.roundMaps).toEqual({
      "1": MAP,
      "2": { kind: "catalog", id: "castle" },
    });
  });

  it("organizer sets each match → free default + settings.matchupSetBy", () => {
    expect(matchupToWire(base({ matchup: "organizer" }))).toEqual({
      matchupRule: { mode: "free" },
      settings: { matchupSetBy: "organizer" },
    });
  });

  it("never emits pool/draft or swapEachGame", () => {
    for (const matchup of ["free", "map", "organizer"] as const) {
      const wire = matchupToWire(base({ matchup, map: MAP }));
      expect(["free", "fixed", "map"]).toContain(wire.matchupRule.mode);
      expect(wire.matchupRule).not.toHaveProperty("swapEachGame");
    }
  });

  it("draft status is passed through", () => {
    expect(toCreateBody(base(), "draft").status).toBe("draft");
  });

  it("validates name, future close, and missing maps", () => {
    expect(validateForm(base({ name: " " }), NOW).map((p) => p.field)).toContain("name");
    expect(validateForm(base({ signupCloses: "2026-10-01T10:00" }), NOW).map((p) => p.field)).toContain("signupCloses");
    expect(validateForm(base({ matchup: "map", mapScope: "event", map: null }), NOW).map((p) => p.field)).toContain("map");
    expect(validateForm(base({ size: 4, matchup: "map", mapScope: "round", roundMaps: { "1": MAP } }), NOW).map((p) => p.field)).toContain("map");
    expect(validateForm(base(), NOW)).toEqual([]);
  });
});

describe("assignment(matchupRule, gameIndex)", () => {
  it("free assigns nothing", () => {
    expect(assignment({ mode: "free" }, 0)).toEqual({ heroes: { a: null, b: null }, map: null });
  });
  it("map assigns only the map; fixed assigns heroes and map", () => {
    expect(assignment({ mode: "map", map: MAP }, 0)).toEqual({ heroes: { a: null, b: null }, map: MAP });
    expect(assignment({ mode: "fixed", heroes: { a: "x", b: "y" }, map: MAP }, 0)).toEqual({ heroes: { a: "x", b: "y" }, map: MAP });
  });
  it("v1 ignores gameIndex", () => {
    const rule = { mode: "fixed", heroes: { a: "x", b: "y" } } as const;
    expect(assignment(rule, 3)).toEqual(assignment(rule, 0));
  });
  it("pool and draft are flagged unsupported with a clear message", () => {
    expect(unsupportedModeMessage("pool")).toMatch(/coming later/);
    expect(unsupportedModeMessage("draft")).toMatch(/coming later/);
    expect(unsupportedModeMessage("fixed")).toBeNull();
  });
});

describe("League night preset copy", () => {
  it("says per match, like the chip", () => {
    const league = PRESETS.find((x) => x.id === "league")!;
    expect(league.bullets.join(" ")).toMatch(/1 week per match/);
    expect(league.bullets.join(" ")).not.toMatch(/per round/);
  });
});
