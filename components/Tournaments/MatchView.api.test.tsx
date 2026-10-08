/** The match page through the REAL getMatch mapping (#1260): an api body in, the rendered line out. */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { MatchBody } from "./MatchView";
import { getMatch } from "@/lib/tournaments/api";
import { FIXTURE_NOW, fixtureMatch } from "@/lib/tournaments/fixtures";
import { myTournamentCount } from "@/lib/tournaments/browse";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div data-testid="replay-open" /> }));

const NOW = Date.parse(FIXTURE_NOW);

/** An api response body: the fixture round-tripped through JSON, plus what the case sets. */
const apiBody = (patch: { decision?: unknown; decidedBy?: string; tournamentStatus?: string }) => {
  const f = fixtureMatch("decided");
  const body = JSON.parse(JSON.stringify({ match: f.detail.match, tournament: f.detail.tournament, players: f.detail.players, readyChecks: [], liveRoom: null }));
  body.match.decidedBy = patch.decidedBy ?? null;
  if (patch.tournamentStatus) body.tournament.status = patch.tournamentStatus;
  if ("decision" in patch) body.decision = patch.decision;
  return { body, t: f.tournament };
};

const renderFromApi = async (patch: Parameters<typeof apiBody>[0]) => {
  const { body, t } = apiBody(patch);
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
  const r = await getMatch("slug", "m1");
  if (!r.ok) throw new Error("getMatch failed");
  return render(
    <ChakraProvider>
      <MatchBody d={r.value} t={t} myUserId={null} signedOut={false} now={NOW} phase={{ kind: "idle" }} onPlay={() => {}} />
    </ChakraProvider>,
  );
};

describe("getMatch keeps `decision`", () => {
  it("an organizer override shows its note", async () => {
    await renderFromApi({
      decidedBy: "organizer",
      decision: { by: "organizer", note: "QA: dave no-show", at: "2026-10-06T10:00:00Z" },
    });
    expect(screen.getByTestId("decision-note")).toHaveTextContent("Decided by the organizer: QA: dave no-show");
  });

  it("an auto-confirm shows its line", async () => {
    await renderFromApi({ decidedBy: "unverified_confirmed", decision: { by: "rules", note: null, at: null } });
    expect(screen.getByTestId("decision-note")).toHaveTextContent("Result confirmed automatically, 24h after it was found.");
  });

  it("a deadline decision adds no note line", async () => {
    await renderFromApi({ decidedBy: "deadline_higher_seed", decision: { by: "rules", note: null, at: null } });
    expect(screen.queryByTestId("decision-note")).not.toBeInTheDocument();
  });

  it("no decision at all adds no note line", async () => {
    await renderFromApi({ decidedBy: "organizer" });
    expect(screen.queryByTestId("decision-note")).not.toBeInTheDocument();
  });
});

describe("a cancelled tournament (#1260)", () => {
  it("a decided semi keeps the winner but drops 'advances to the Final'", async () => {
    await renderFromApi({ decidedBy: "organizer", tournamentStatus: "cancelled" });
    const banner = screen.getByTestId("match-banner");
    expect(banner).toHaveTextContent(/Decided\. .+ won the match\./);
    expect(banner).not.toHaveTextContent("advances to");
  });
});

describe("account menu count (#1260)", () => {
  it("counts the events the account plays in or runs, never cancelled ones", () => {
    const t = (status: string, extra: object) => ({ id: status + Math.random(), status, ...extra }) as any;
    expect(
      myTournamentCount([
        t("running", { myEntryId: "e1" }),
        t("draft", { isOrganizer: true }),
        t("cancelled", { myEntryId: "e2" }),
        t("cancelled", { isOrganizer: true }),
        t("complete", {}),
      ]),
    ).toBe(2);
  });
});
