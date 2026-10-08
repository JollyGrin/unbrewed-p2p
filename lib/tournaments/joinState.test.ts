import { joinState } from "./joinState";
import { statusChip } from "./browse";
import type { Entry, Tournament } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const t = (o: Partial<Tournament> = {}): Tournament =>
  ({ id: "t", status: "signup", size: 4, entryCount: 4, signupOpen: false, signupClosesAt: "2026-10-06T12:00:00Z", ...o }) as Tournament;
const mine = [{ id: "e1", userId: "u1", joinedAt: "2026-10-01T00:00:00Z", leftAt: null }] as Entry[];

describe("full roster before the close time (#1231)", () => {
  beforeEach(() => jest.spyOn(Date, "now").mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it("can still leave (api: only status + signupClosesAt lock it)", () => {
    expect(joinState(t(), mine, "u1").kind).toBe("joined");
  });
  it("is locked in once signup closes or the status moves on", () => {
    expect(joinState(t({ signupClosesAt: "2026-10-05T11:00:00Z" }), mine, "u1").kind).toBe("locked_in");
    expect(joinState(t({ status: "running" }), mine, "u1").kind).toBe("locked_in");
  });
  it("browse chip says Full · ready to start, not Signup closed", () => {
    expect(statusChip(t()).label).toBe("Full · ready to start");
    expect(statusChip(t({ signupClosesAt: "2026-10-05T11:00:00Z" })).label).toBe("Signup closed");
    expect(statusChip(t({ signupOpen: true })).label).toBe("Signup open");
  });
});

describe("cancelled during signup (p2p #1253)", () => {
  it("reads closed for an entrant as for everyone", () => {
    expect(joinState(t({ status: "cancelled" }), mine, "u1").kind).toBe("closed");
    expect(joinState(t({ status: "cancelled" }), [], "u2").kind).toBe("closed");
  });
});
