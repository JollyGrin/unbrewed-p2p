import {
  PRESETS,
  initialForm,
  latestFinal,
  mapSlots,
  matchupToWire,
  toCreateBody,
  toCreateBodyWithMapHash,
  withFormat,
  validateForm,
  type CreateFormState,
} from "./createForm";
import { webcrypto } from "node:crypto";

import { assignment, unsupportedModeMessage } from "./matchup";
import { mapLockHash } from "./mapHash";

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

  it.each([
    // [format, size, window, top2Final, expected hours] — api latestPossibleFinal: rounds x (window + 24h)
    ["round_robin", 4, 24, false, 48],
    ["round_robin", 4, 24, true, 96],
    ["round_robin", 6, 168, false, 192],
    ["round_robin", 6, 168, true, 384],
    ["round_robin", 3, 48, true, 144],
    ["single_elim", 4, 24, false, 96],
    ["single_elim", 8, 72, false, 288],
    ["single_elim", 16, 48, false, 288],
  ] as const)("latest final matches the api: %s size %i, %ih window, final %s -> %ih", (format, size, matchWindowHours, top2Final, hours) => {
    const f = base({ format, size, matchWindowHours, top2Final, signupCloses: "2026-10-10T18:00" });
    expect(latestFinal(f)!.getTime() - new Date(f.signupCloses).getTime()).toBe(hours * 3_600_000);
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

describe("the event map lock's content hash (#1268)", () => {
  const jsdomCrypto = globalThis.crypto;
  afterEach(() => Object.defineProperty(globalThis, "crypto", { configurable: true, value: jsdomCrypto }));
  const mapForm = () => base({ matchup: "map", mapScope: "event", map: { kind: "catalog", id: "weathertop" } });

  it("a fixed board's lock carries sha256(canonicalJson(the CREATE_ROOM customMap))", async () => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    const body = await toCreateBodyWithMapHash(mapForm(), "draft");
    const hash = await mapLockHash({ kind: "catalog", id: "weathertop" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body).toEqual({ ...toCreateBody(mapForm(), "draft"), matchupRule: { mode: "map", map: { kind: "catalog", id: "weathertop", hash } } });
  });

  it("no WebCrypto: the same body as before, no hash key — creating never blocks on it", async () => {
    expect(await toCreateBodyWithMapHash(mapForm())).toEqual(toCreateBody(mapForm()));
  });

  it("no fixed board: untouched", async () => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    expect(await toCreateBodyWithMapHash(base())).toEqual(toCreateBody(base()));
  });
});
