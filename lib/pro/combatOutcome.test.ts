/**
 * Combat-outcome wording (issue #545 ↔ engine #303 "The Doppelgänger"). The
 * point of these tests is the UNKNOWN branch: the protocol has always been
 * ternary, but no shipped deck could reach the third outcome, so every surface
 * either suppressed it or leaked the raw enum. They also pin the two DECIDED
 * outcomes' text, because the log wording is load-bearing for existing
 * transcripts / CSV exports and must not drift while adding the third case.
 */
import {
  COMBAT_OUTCOME_LABEL,
  COMBAT_OUTCOME_LOG_TEXT,
  combatOutcomeBannerText,
  combatOutcomeLogText,
  combatZeroDamageCallout,
  isNoWinner,
} from "./combatOutcome";
import { CombatOutcome } from "./protocol";

const ALL: CombatOutcome[] = ["ATTACKER_WON", "DEFENDER_WON", "UNKNOWN"];

describe("outcome label tables", () => {
  it("covers every ternary outcome with human words, never the raw enum", () => {
    for (const o of ALL) {
      expect(COMBAT_OUTCOME_LABEL[o]).toBeTruthy();
      expect(COMBAT_OUTCOME_LOG_TEXT[o]).toBeTruthy();
      // No leaked SCREAMING_SNAKE enum on any surface.
      expect(COMBAT_OUTCOME_LABEL[o]).not.toMatch(/_/);
      expect(COMBAT_OUTCOME_LOG_TEXT[o]).not.toMatch(/_/);
      expect(COMBAT_OUTCOME_LABEL[o].toLowerCase()).not.toContain("unknown");
      expect(COMBAT_OUTCOME_LOG_TEXT[o]).not.toContain("unknown");
    }
  });

  it("names the no-winner branch explicitly", () => {
    expect(COMBAT_OUTCOME_LABEL.UNKNOWN).toBe("No winner");
    expect(COMBAT_OUTCOME_LOG_TEXT.UNKNOWN).toBe("no winner");
  });
});

describe("isNoWinner", () => {
  it("is true only for UNKNOWN", () => {
    expect(isNoWinner("UNKNOWN")).toBe(true);
    expect(isNoWinner("ATTACKER_WON")).toBe(false);
    expect(isNoWinner("DEFENDER_WON")).toBe(false);
    // An in-flight combat carries outcome null (engine/combat.ts) — not a resolve.
    expect(isNoWinner(null)).toBe(false);
    expect(isNoWinner(undefined)).toBe(false);
  });
});

describe("combatOutcomeLogText (the game-log line)", () => {
  it("keeps the historical wording for the two decided outcomes", () => {
    expect(combatOutcomeLogText("ATTACKER_WON", 3)).toBe("attacker won — 3 damage");
    expect(combatOutcomeLogText("ATTACKER_WON", 10)).toBe("attacker won — 10 damage");
    expect(combatOutcomeLogText("DEFENDER_WON", 0)).toBe("defender won — 0 damage");
  });

  it("omits the damage clause when the server reported no damage number", () => {
    expect(combatOutcomeLogText("ATTACKER_WON", null)).toBe("attacker won");
  });

  it("logs UNKNOWN as a no-winner stalemate, never the raw enum", () => {
    const line = combatOutcomeLogText("UNKNOWN", 0);
    expect(line).toBe("no winner — the values matched");
    expect(line).not.toContain("unknown");
    // …and specifically never reads as the defender holding (the audit's worry).
    expect(line).not.toContain("defender");
  });

  it("still reads as a stalemate if an UNKNOWN ever arrived with damage", () => {
    expect(combatOutcomeLogText("UNKNOWN", 2)).toBe("no winner — the values matched");
  });
});

describe("combatOutcomeBannerText (combat panel + replay scrubber)", () => {
  it("labels the decided outcomes with their damage", () => {
    expect(combatOutcomeBannerText("ATTACKER_WON", 2)).toBe("Attacker wins · 2 dmg");
    expect(combatOutcomeBannerText("DEFENDER_WON", 0)).toBe("Defender wins · 0 dmg");
    expect(combatOutcomeBannerText("DEFENDER_WON", null)).toBe("Defender wins");
  });

  it("shows a bare No winner for UNKNOWN (the 0-dmg suffix is noise there)", () => {
    expect(combatOutcomeBannerText("UNKNOWN", 0)).toBe("No winner");
    expect(combatOutcomeBannerText("UNKNOWN", null)).toBe("No winner");
  });
});

describe("combatZeroDamageCallout (board burst)", () => {
  it("splits a held defense from a no-winner resolve", () => {
    expect(combatZeroDamageCallout(false)).toBe("BLOCKED");
    expect(combatZeroDamageCallout(true)).toBe("NO WINNER");
  });
});
