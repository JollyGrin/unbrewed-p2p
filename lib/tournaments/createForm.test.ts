import {
  PRESETS,
  initialForm,
  matchupToWire,
  toCreateBody,
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

  it("league night is disabled until round robin lands", () => {
    expect(PRESETS.find((p) => p.id === "league")!.disabled).toBeTruthy();
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
