import {
  buildPoseIndex,
  parsePoseOptions,
  poseHighlights,
  resolvePoseClick,
} from "./moveChoice";
import type { ViewPrompt } from "./protocol";

// The exact option set from the issue #132 repro screenshot: playing DASH with a
// LARGE Triceratops emits a CHOOSE_SPACE prompt whose options are "head|tail"
// space pairs. mapSpaceIds are the plain "sNN" ids the same board uses.
const MAP_SPACES = new Set(
  Array.from({ length: 30 }, (_, i) => `s${i}`),
);

const posePrompt = (pairs: string[]): ViewPrompt => ({
  promptId: "p1",
  player: "p1",
  kind: "CHOOSE_SPACE",
  options: pairs.map((label) => ({ id: label, label })),
});

const REPRO_PAIRS = [
  "s12|s13",
  "s13|s15",
  "s13|s17",
  "s14|s15",
  "s14|s16",
  "s14|s4",
];

describe("parsePoseOptions", () => {
  it("parses head|tail space pairs from a CHOOSE_SPACE prompt", () => {
    const poses = parsePoseOptions(posePrompt(REPRO_PAIRS), MAP_SPACES);
    expect(poses).toHaveLength(REPRO_PAIRS.length);
    expect(poses[0]).toEqual({ optionId: "s12|s13", spaces: ["s12", "s13"] });
    expect(poses[5]).toEqual({ optionId: "s14|s4", spaces: ["s14", "s4"] });
  });

  it("reads the pair from the id when the label is not the pair", () => {
    const prompt: ViewPrompt = {
      promptId: "p1",
      player: "p1",
      kind: "CHOOSE_SPACE",
      options: [{ id: "s12|s13", label: "Move here" }],
    };
    expect(parsePoseOptions(prompt, MAP_SPACES)).toEqual([
      { optionId: "s12|s13", spaces: ["s12", "s13"] },
    ]);
  });

  it("ignores prompts that are not CHOOSE_SPACE", () => {
    const prompt: ViewPrompt = {
      promptId: "p1",
      player: "p1",
      kind: "CHOOSE_OPTION",
      options: [{ id: "s12|s13", label: "s12|s13" }],
    };
    expect(parsePoseOptions(prompt, MAP_SPACES)).toEqual([]);
  });

  it("leaves single-space options to the existing resolver (no false pairs)", () => {
    const prompt = posePrompt([]);
    prompt.options = [{ id: "s5", label: "s5" }];
    expect(parsePoseOptions(prompt, MAP_SPACES)).toEqual([]);
  });

  it("rejects pairs naming spaces that aren't on the map", () => {
    expect(parsePoseOptions(posePrompt(["s12|s999"]), MAP_SPACES)).toEqual([]);
  });

  it("returns [] for a null prompt", () => {
    expect(parsePoseOptions(null, MAP_SPACES)).toEqual([]);
  });
});

describe("buildPoseIndex", () => {
  const index = buildPoseIndex(parsePoseOptions(posePrompt(REPRO_PAIRS), MAP_SPACES));

  it("highlights every space that is part of a pose", () => {
    expect([...index.spaces].sort()).toEqual(
      ["s12", "s13", "s14", "s15", "s16", "s17", "s4"].sort(),
    );
  });

  it("lists partners order-independently (either end may be tapped first)", () => {
    // s13 is a head in s13|s15 / s13|s17 and a tail in s12|s13.
    expect(index.partnersOf("s13").sort()).toEqual(["s12", "s15", "s17"]);
  });

  it("resolves a pair back to its option id regardless of order", () => {
    expect(index.optionFor("s13", "s12")).toBe("s12|s13");
    expect(index.optionFor("s12", "s13")).toBe("s12|s13");
    expect(index.optionFor("s12", "s99")).toBeNull();
  });
});

describe("resolvePoseClick + poseHighlights", () => {
  const index = buildPoseIndex(parsePoseOptions(posePrompt(REPRO_PAIRS), MAP_SPACES));

  it("commits immediately when a space belongs to exactly one pose", () => {
    // s16 appears only in s14|s16.
    expect(resolvePoseClick(index, null, "s16")).toEqual({
      type: "commit",
      optionId: "s14|s16",
    });
  });

  it("anchors when the first tap is ambiguous, then completes on the partner", () => {
    // s14 is in three poses -> anchor, then tap a partner to commit.
    expect(resolvePoseClick(index, null, "s14")).toEqual({ type: "anchor", space: "s14" });
    expect(resolvePoseClick(index, "s14", "s15")).toEqual({
      type: "commit",
      optionId: "s14|s15",
    });
  });

  it("re-anchors when a non-partner pose space is tapped mid-selection", () => {
    // Anchored on s14, tapping s13 (not a partner of s14) re-anchors on s13.
    expect(resolvePoseClick(index, "s14", "s13")).toEqual({ type: "anchor", space: "s13" });
  });

  it("cancels when the anchor space is tapped again", () => {
    expect(resolvePoseClick(index, "s14", "s14")).toEqual({ type: "cancel" });
  });

  it("ignores taps on non-pose spaces", () => {
    expect(resolvePoseClick(index, null, "s0")).toEqual({ type: "ignore" });
  });

  it("highlights all pose spaces when unanchored, anchor+partners once anchored", () => {
    expect(poseHighlights(index, null).sort()).toEqual([...index.spaces].sort());
    expect(poseHighlights(index, "s14").sort()).toEqual(["s14", "s15", "s16", "s4"].sort());
  });
});

// The same glitch was reported on King Kong — also a LARGE two-space fighter, so
// its scheme move emits the identical "head|tail" CHOOSE_SPACE shape (30 poses
// from the repro screenshot on The Mended Drum). The resolver keys on that shape,
// not on the fighter, so it must behave identically — this locks that in.
describe("King Kong scheme move (issue #132, fighter-agnostic)", () => {
  const KONG_PAIRS = [
    "s12|s13", "s13|s15", "s13|s17", "s14|s15", "s14|s16", "s14|s4",
    "s15|s16", "s15|s21", "s16|s26", "s1|s2", "s1|s29", "s21|s23",
    "s21|s26", "s22|s23", "s22|s24", "s23|s24", "s24|s25", "s24|s26",
    "s25|s26", "s25|s27", "s26|s27", "s27|s28", "s27|s29", "s28|s29",
    "s2|s3", "s3|s4", "s4|s5", "s5|s6", "s6|s7", "s6|s8",
  ];
  const index = buildPoseIndex(parsePoseOptions(posePrompt(KONG_PAIRS), MAP_SPACES));

  it("lights up every distinct pose space (23 across 30 poses)", () => {
    expect(index.size).toBe(30);
    expect(index.spaces.size).toBe(23);
  });

  it("commits on the first tap when a space is in exactly one pose (s8 -> s6|s8)", () => {
    expect(resolvePoseClick(index, null, "s8")).toEqual({ type: "commit", optionId: "s6|s8" });
  });

  it("anchors an ambiguous tap then completes on the partner (s6 -> s7 = s6|s7)", () => {
    expect(resolvePoseClick(index, null, "s6")).toEqual({ type: "anchor", space: "s6" });
    expect(poseHighlights(index, "s6").sort()).toEqual(["s5", "s6", "s7", "s8"].sort());
    expect(resolvePoseClick(index, "s6", "s7")).toEqual({ type: "commit", optionId: "s6|s7" });
  });
});
