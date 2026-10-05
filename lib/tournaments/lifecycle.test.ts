/** Organizer recourse model (#1242). */
import { fixtureSignup8 } from "./fixtures";
import {
  UNDER_FILLED_COPY,
  cancelConsequence,
  cancelKind,
  canStartWith,
  closeProblem,
  editFormOf,
  editPatch,
  editWithShape,
  signupCloseText,
  toLocalInput,
  underFilledClosed,
} from "./lifecycle";
import { withMyDrafts, matchesFilter } from "./browse";
import type { Tournament } from "./types";

const base = fixtureSignup8().tournament;
const NOW = Date.parse("2026-10-05T12:00:00Z");
const T = (p: Partial<Tournament> = {}): Tournament => ({ ...base, status: "signup", size: 8, format: "single_elim", settings: {}, ...p });

describe("signupCloseText", () => {
  it("says closes ahead of the time and closed after it", () => {
    expect(signupCloseText({ signupClosesAt: "2026-10-06T12:00:00Z" }, NOW)).toMatch(/^closes /);
    expect(signupCloseText({ signupClosesAt: "2026-10-04T12:00:00Z" }, NOW)).toMatch(/^closed /);
    expect(signupCloseText({ signupClosesAt: null }, NOW)).toBe("");
  });
});

describe("under-filled after close", () => {
  const closed = T({ signupClosesAt: "2026-10-04T12:00:00Z" });
  it("start rule matches the api", () => {
    expect(canStartWith({ size: 8, format: "single_elim" }, 4)).toBe(false);
    expect(canStartWith({ size: 8, format: "single_elim" }, 5)).toBe(true);
    expect(canStartWith({ size: 6, format: "round_robin" }, 3)).toBe(false);
  });
  it("is stuck only once closed and under half", () => {
    expect(underFilledClosed(closed, 3, NOW)).toBe(true);
    expect(underFilledClosed(closed, 6, NOW)).toBe(false);
    expect(underFilledClosed(T({ signupClosesAt: "2026-10-09T12:00:00Z" }), 3, NOW)).toBe(false);
    expect(UNDER_FILLED_COPY).toBe("Not enough players to start. Extend signup, or cancel.");
  });
});

describe("cancel copy", () => {
  it("names the consequence per state", () => {
    expect(cancelKind({ status: "draft" })).toBe("draft");
    expect(cancelKind({ status: "running" })).toBe("running");
    expect(cancelKind({ status: "complete" })).toBeNull();
    expect(cancelConsequence("signup", 1)).toMatch(/the 1 player who joined lose their seat/);
    expect(cancelConsequence("running", 0)).toMatch(/can't be undone/);
  });
});

describe("editPatch", () => {
  const t = T({ signupClosesAt: "2026-10-09T12:00:00Z" });
  it("sends only what changed", () => {
    const f = { ...editFormOf(t), name: " New name ", matchWindowHours: 168 };
    expect(editPatch(t, f, 3, NOW)).toEqual({ patch: { name: "New name", matchWindowHours: 168 }, problems: [] });
    expect(editPatch(t, editFormOf(t), 3, NOW).patch).toEqual({});
  });
  it("refuses an empty name, a size below the joined count and a past close", () => {
    const f = { ...editFormOf(t), name: " ", size: 4, signupCloses: toLocalInput("2026-10-01T00:00:00Z") };
    const { problems } = editPatch(t, f, 5, NOW);
    expect(problems).toEqual(["Give it a name.", "5 players have already joined, so the size can't go below 5.", "Pick a time in the future."]);
  });
  it("carries top2Final for round robin inside the existing settings", () => {
    const rr = T({ format: "round_robin", size: 6, settings: { matchupSetBy: "organizer" } });
    const { patch } = editPatch(rr, { ...editFormOf(rr), top2Final: true }, 0, NOW);
    expect(patch.settings).toEqual({ matchupSetBy: "organizer", top2Final: true });
  });
  it("closeProblem", () => {
    expect(closeProblem("", NOW)).toBeTruthy();
    expect(closeProblem(toLocalInput("2030-01-01T00:00:00Z"), NOW)).toBeNull();
  });
});

describe("browse drafts", () => {
  const draft = T({ id: "d1", status: "draft" });
  const pub = T({ id: "p1" });
  it("lists the organizer's own drafts from mine=1, once", () => {
    expect(withMyDrafts([pub], [draft, pub]).map((t) => t.id)).toEqual(["p1", "d1"]);
    expect(withMyDrafts([pub], []).map((t) => t.id)).toEqual(["p1"]);
  });
  it("a draft shows only under My tournaments", () => {
    const mine = new Set(["d1"]);
    expect(matchesFilter(draft, "all", mine)).toBe(false);
    expect(matchesFilter(draft, "signup", mine)).toBe(false);
    expect(matchesFilter(draft, "mine", mine)).toBe(true);
  });
});

describe("edit with per-round maps (p2p #1253)", () => {
  const M = (id: string) => ({ kind: "catalog" as const, id });
  const seed = (t: Tournament, f: ReturnType<typeof editFormOf>) => editPatch(t, f, 0, NOW);

  it("single-elim 8 -> 4 keeps Semifinals and Final, re-keyed 1-2", () => {
    const t = T({ roundMaps: { "1": M("qf"), "2": M("sf"), "3": M("fin") } });
    const f = editWithShape(t, editFormOf(t), { size: 4 });
    expect(f.roundMaps).toEqual({ "1": M("sf"), "2": M("fin") });
    expect(seed(t, f).patch).toEqual({ size: 4, roundMaps: { "1": M("sf"), "2": M("fin") } });
  });
  it("single-elim 4 -> 8 keeps the Final as the Final and asks for the new round", () => {
    const t = T({ size: 4, roundMaps: { "1": M("sf"), "2": M("fin") } });
    const f = editWithShape(t, editFormOf(t), { size: 8 });
    expect(f.roundMaps).toEqual({ "2": M("sf"), "3": M("fin") });
    expect(seed(t, f).problems).toEqual(["Pick a map for every round."]);
    const filled = { ...f, roundMaps: { ...f.roundMaps, "1": M("qf") } };
    expect(seed(t, filled).patch.roundMaps).toEqual({ "1": M("qf"), "2": M("sf"), "3": M("fin") });
  });
  it("round robin 6 -> 4 drops the rounds that no longer exist", () => {
    const t = T({ format: "round_robin", size: 6, settings: {}, roundMaps: { "1": M("a"), "2": M("b"), "3": M("c"), "4": M("d"), "5": M("e") } });
    const f = editWithShape(t, editFormOf(t), { size: 4 });
    expect(f.roundMaps).toEqual({ "1": M("a"), "2": M("b"), "3": M("c") });
    expect(seed(t, f).patch).toEqual({ size: 4, roundMaps: { "1": M("a"), "2": M("b"), "3": M("c") } });
  });
  it("round robin top-2 off drops the final key", () => {
    const t = T({ format: "round_robin", size: 4, settings: { top2Final: true }, roundMaps: { "1": M("a"), "2": M("b"), "3": M("c"), final: M("z") } });
    const f = editWithShape(t, editFormOf(t), { top2Final: false });
    expect(f.roundMaps).toEqual({ "1": M("a"), "2": M("b"), "3": M("c") });
    const { patch } = seed(t, f);
    expect(patch.settings).toEqual({ top2Final: false });
    expect(patch.roundMaps).toEqual({ "1": M("a"), "2": M("b"), "3": M("c") });
  });
  it("sends no roundMaps for an event without any", () => {
    const t = T();
    expect(editWithShape(t, editFormOf(t), { size: 4 }).roundMaps).toBeNull();
    expect(seed(t, editWithShape(t, editFormOf(t), { size: 4 })).patch).toEqual({ size: 4 });
  });
});

describe("draft deletion memory (L2-5)", () => {
  it("only a draft deleted in this session reads as deleted", () => {
    const { markDraftDeleted, wasDraftDeleted } = require("./lifecycle");
    expect(wasDraftDeleted("never")).toBe(false);
    markDraftDeleted("gone");
    expect(wasDraftDeleted("gone")).toBe(true);
  });
});
