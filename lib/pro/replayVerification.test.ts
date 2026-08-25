/**
 * The three verification states an expansion can come back in (#701 ↔ engine
 * #509), and the one that isn't a state at all: a response from a server that
 * predates the field.
 *
 * The important invariant is that BACK-COMPAT IS SILENT. An expansion with no
 * `verification` must produce no badge, no banner and no truncation — otherwise
 * every replay in existence starts explaining itself the day this ships.
 */
import { actionsForSteps, replayVerificationNotice } from "./replayVerification";
import type { ReplayExpansion, ReplayStep } from "./protocol";

const step = (index: number, turnNumber: number) =>
  ({ index, turnNumber }) as unknown as ReplayStep;

const expansion = (
  over: Partial<ReplayExpansion> & { steps?: ReplayStep[] } = {},
): Parameters<typeof replayVerificationNotice>[0] => ({
  steps: [step(0, 1), step(1, 1), step(2, 2)],
  engine: { schemaVersion: 5, dslVersion: "0.64.0" },
  ...over,
});

describe("replayVerificationNotice", () => {
  it("says nothing at all for an older engine that omits the field", () => {
    const notice = replayVerificationNotice(expansion());

    expect(notice).toMatchObject({
      verification: "exact",
      badge: null,
      banner: null,
      divergedAtTurn: null,
      lastVerifiedTurn: null,
      unplayable: false,
    });
  });

  it("says nothing for an explicit same-engine expansion either", () => {
    expect(replayVerificationNotice(expansion({ verification: "exact" })).banner).toBeNull();
    expect(replayVerificationNotice(expansion({ verification: "exact" })).badge).toBeNull();
  });

  it("treats an unrecognized verification value as exact rather than guessing", () => {
    const notice = replayVerificationNotice(
      expansion({ verification: "sort-of" as ReplayExpansion["verification"] }),
    );

    expect(notice.verification).toBe("exact");
    expect(notice.banner).toBeNull();
  });

  it("badges a digest-verified replay, naming the engine it was recorded on", () => {
    const notice = replayVerificationNotice(
      expansion({
        verification: "digest-verified",
        recordedEngine: { schemaVersion: 2, dslVersion: "0.17.0" },
      }),
    );

    expect(notice.badge).toBe("verified across engine versions");
    expect(notice.badgeDetail).toContain("schema 2 / dsl 0.17.0");
    // Nothing was truncated — a verified replay is a whole replay.
    expect(notice.banner).toBeNull();
    expect(notice.divergedAtTurn).toBeNull();
  });

  it("explains a divergence: which turn broke it and which turns survive", () => {
    const notice = replayVerificationNotice(
      expansion({
        verification: "diverged",
        divergedAtTurn: 14,
        recordedEngine: { schemaVersion: 2, dslVersion: "0.17.0" },
      }),
    );

    expect(notice.divergedAtTurn).toBe(14);
    expect(notice.lastVerifiedTurn).toBe(13);
    expect(notice.banner?.body).toContain("from turn 14");
    expect(notice.banner?.body).toContain("Showing turns 1 to 13");
    expect(notice.banner?.body).toContain("schema 2 / dsl 0.17.0");
  });

  it("still explains a divergence whose turn number never arrived", () => {
    const notice = replayVerificationNotice(expansion({ verification: "diverged" }));

    expect(notice.divergedAtTurn).toBeNull();
    expect(notice.banner?.body).toContain("partway through");
  });

  it("marks a divergence with no verified frames as unplayable", () => {
    const notice = replayVerificationNotice(
      expansion({ verification: "diverged", divergedAtTurn: 1, steps: [] }),
    );

    expect(notice.unplayable).toBe(true);
    expect(notice.banner?.body).toContain("no turns left");
  });
});

describe("actionsForSteps", () => {
  // steps[k] is the state AFTER actionLog[k-1], so a whole game has one more
  // step than action.
  it("lists every action of a complete expansion", () => {
    expect(actionsForSteps(["a", "b", "c"], 4)).toEqual(["a", "b", "c"]);
  });

  it("drops the actions a truncated expansion has no frame for", () => {
    // The bundle still carries all six actions; only three steps came back.
    expect(actionsForSteps(["a", "b", "c", "d", "e", "f"], 3)).toEqual(["a", "b"]);
  });

  it("lists nothing when there are no frames", () => {
    expect(actionsForSteps(["a", "b"], 0)).toEqual([]);
  });
});
