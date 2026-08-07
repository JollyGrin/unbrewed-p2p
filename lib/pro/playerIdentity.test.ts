/**
 * Optional player identity (issue #568). Two things are pinned here, because
 * both are load-bearing for the epic's "invisible until claimed" promise:
 *
 * - `identityFields` sends NOTHING for anyone who isn't signed in, so a guest
 *   client's CREATE_ROOM/JOIN_ROOM is byte-identical to today's.
 * - `seatNameplate` falls back to exactly today's labels when a seat carries no
 *   name, so a mixed room (one signed-in, one guest) reads correctly on both
 *   sides rather than showing a blank plate.
 */
import type { AccountState } from "@/lib/account/useAccount";
import {
  identityFields,
  MAX_BADGE_ID,
  MAX_DISPLAY_NAME,
  sanitizeBadgeId,
  sanitizeDisplayName,
  seatNameplate,
} from "./playerIdentity";

const signedIn = (
  username: string,
  id = "discord-user-1",
): AccountState => ({
  status: "signed-in",
  account: { id, username, avatarUrl: null },
});

describe("sanitizeDisplayName", () => {
  it("keeps an ordinary name untouched", () => {
    expect(sanitizeDisplayName("JollyGrin")).toBe("JollyGrin");
  });

  it("trims and strips control characters (mirroring the engine sanitizer)", () => {
    expect(sanitizeDisplayName("  Jolly\u0007Grin\n  ")).toBe("JollyGrin");
  });

  it("truncates rather than rejecting an over-long name", () => {
    const long = "x".repeat(MAX_DISPLAY_NAME + 20);
    expect(sanitizeDisplayName(long)).toBe("x".repeat(MAX_DISPLAY_NAME));
  });

  it("re-trims after truncation so no trailing space survives", () => {
    // 31 chars, a space at 32, then more — the naive slice would end in a space.
    const raw = `${"y".repeat(MAX_DISPLAY_NAME - 1)} tail`;
    expect(sanitizeDisplayName(raw)).toBe("y".repeat(MAX_DISPLAY_NAME - 1));
  });

  it("treats a name that sanitizes to empty as absent", () => {
    expect(sanitizeDisplayName("   ")).toBeUndefined();
    expect(sanitizeDisplayName("\u0000\u0007 \t")).toBeUndefined();
  });
});

describe("identityFields (join-payload construction)", () => {
  it("sends name and id for a signed-in player", () => {
    expect(identityFields(signedIn("JollyGrin", "u-42"))).toEqual({
      displayName: "JollyGrin",
      playerId: "u-42",
    });
  });

  it("sends NOTHING for a guest — the payload stays byte-identical to today", () => {
    expect(identityFields({ status: "guest", account: null })).toEqual({});
  });

  it("sends nothing while the probe is still in flight", () => {
    expect(identityFields({ status: "loading", account: null })).toEqual({});
  });

  it("sends nothing when the accounts API is unreachable", () => {
    expect(identityFields({ status: "offline", account: null })).toEqual({});
  });

  it("truncates an over-long username to the protocol's 32", () => {
    const fields = identityFields(signedIn("z".repeat(64)));
    expect(fields.displayName).toHaveLength(MAX_DISPLAY_NAME);
  });

  it("omits a name that sanitizes to empty but keeps the player id", () => {
    expect(identityFields(signedIn("   ", "u-9"))).toEqual({ playerId: "u-9" });
  });

  it("DROPS an over-long player id rather than truncating it", () => {
    // A truncated pseudonymous token would attribute telemetry to the wrong
    // player, so the field goes away entirely — the name still rides along.
    const fields = identityFields(signedIn("Dean", "i".repeat(65)));
    expect(fields).toEqual({ displayName: "Dean" });
  });

  it("drops a player id carrying control characters", () => {
    expect(identityFields(signedIn("Dean", "u\u0001"))).toEqual({
      displayName: "Dean",
    });
  });
});

describe("seatNameplate (fallback logic)", () => {
  const you = { id: "p1", you: true };
  const them = { id: "p2", you: false };

  it("shows a claimed name for the opponent seat", () => {
    expect(seatNameplate({ ...them, displayName: "JollyGrin" }, 2)).toBe("JollyGrin");
  });

  it("shows YOUR claimed name too — confirmation the other seat sees it", () => {
    expect(seatNameplate({ ...you, displayName: "Dean" }, 2)).toBe("Dean");
  });

  it("falls back to today's labels when no seat claimed a name", () => {
    expect(seatNameplate(you, 2)).toBe("You");
    expect(seatNameplate(them, 2)).toBe("Opponent");
  });

  it("renders a mixed room as one name and one fallback", () => {
    const seats = [
      { id: "p1", you: true, displayName: "Dean" },
      { id: "p2", you: false }, // guest opponent
    ];
    expect(seats.map((s) => seatNameplate(s, seats.length))).toEqual([
      "Dean",
      "Opponent",
    ]);
  });

  it("uses the seat id in multiplayer, where 'Opponent' would be ambiguous", () => {
    expect(seatNameplate({ id: "p3", you: false }, 4)).toBe("P3");
    expect(seatNameplate({ id: "p3", you: false, displayName: "Ana" }, 4)).toBe("Ana");
  });

  it("falls back when a claimed name sanitizes to empty", () => {
    // A hostile/broken peer could put whitespace or control chars on the wire;
    // the plate must never render blank.
    expect(seatNameplate({ ...them, displayName: "   " }, 2)).toBe("Opponent");
    expect(seatNameplate({ ...you, displayName: "\u0007\n" }, 2)).toBe("You");
  });

  it("truncates an over-long broadcast name to the protocol bound", () => {
    const label = seatNameplate({ ...them, displayName: "q".repeat(80) }, 2);
    expect(label).toHaveLength(MAX_DISPLAY_NAME);
  });
});

/**
 * The worn badge (issue #577, engine #347). It rides beside the name under the
 * SAME gate — signed-in only — so a room with nobody wearing anything is still
 * byte-identical to a pre-#347 one.
 */
describe("identityFields — the worn badge", () => {
  it("sends the badge beside the name for a signed-in wearer", () => {
    expect(identityFields(signedIn("JollyGrin"), "bot-slayer")).toEqual({
      displayName: "JollyGrin",
      badge: "bot-slayer",
      playerId: "discord-user-1",
    });
  });

  it("sends no badge key when the player is wearing nothing", () => {
    for (const nothing of [null, undefined, ""]) {
      const fields = identityFields(signedIn("JollyGrin"), nothing);
      expect(fields).not.toHaveProperty("badge");
      expect(fields).toEqual({
        displayName: "JollyGrin",
        playerId: "discord-user-1",
      });
    }
  });

  it("sends nothing at all for a guest, badge in hand or not", () => {
    // The badge belongs to an account; it never travels without one. A stale id
    // left in memory after a sign-out must not reach the wire.
    for (const state of [
      { status: "guest", account: null },
      { status: "loading", account: null },
      { status: "offline", account: null },
    ] as const) {
      expect(identityFields(state, "veteran")).toEqual({});
    }
  });

  it("bounds a badge id the same way the engine does", () => {
    expect(sanitizeBadgeId("  streak-5  ")).toBe("streak-5");
    expect(sanitizeBadgeId("   ")).toBeUndefined();
    expect(sanitizeBadgeId("")).toBeUndefined();
    // Truncated, not dropped: unlike playerId, a badge is cosmetic — and the
    // engine truncates at the same 32, so what we send is what comes back.
    const long = "x".repeat(MAX_BADGE_ID + 10);
    expect(sanitizeBadgeId(long)).toHaveLength(MAX_BADGE_ID);
    expect(identityFields(signedIn("JollyGrin"), long).badge).toHaveLength(
      MAX_BADGE_ID,
    );
  });

  it("sends an id it has no art for — the catalog is not ours", () => {
    // A badge added API-side must still reach the other seat; whether THAT
    // client can draw it is its own business.
    expect(identityFields(signedIn("JollyGrin"), "moon-walker")).toMatchObject({
      badge: "moon-walker",
    });
  });
});
