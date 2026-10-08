/** #1279: the event page's seat initial (S20) and the match page's replay chip height (S15). */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch, fixtureSignup8 } from "@/lib/tournaments/fixtures";

import { EventView } from "./EventView";
import { MatchBody } from "./MatchView";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div data-testid="replay-open" /> }));

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

it("an emoji name's seat initial is a whole character", async () => {
  __resetAccountStoreForTests();
  const p = fixtureSignup8();
  const entries = [{ ...p.entries[0], username: "🔥🔥 سلطان", avatarUrl: "" }];
  global.fetch = jest.fn(async (url: string) => {
    if (url === `${API_URL}/me`) return reply(401, {});
    if (url.includes("/tournaments/")) return reply(200, { tournament: p.tournament, entries, matches: [] });
    return reply(404, {});
  }) as unknown as typeof fetch;
  render(<ChakraProvider><EventView slug="x" justCreated={false} /></ChakraProvider>);
  const seat = await screen.findByTitle("🔥🔥 سلطان");
  expect(seat.textContent).toBe("🔥");
});

it("the replay chip is a 44 px tap target", () => {
  const f = fixtureMatch("decided");
  render(
    <ChakraProvider>
      <MatchBody d={f.detail} t={f.tournament} myUserId={FIXTURE_MATCH_YOU} signedOut={false} now={Date.parse(FIXTURE_NOW)} phase={{ kind: "idle" }} onPlay={() => {}} />
    </ChakraProvider>,
  );
  expect(parseFloat(window.getComputedStyle(screen.getByTestId("replay-chip")).minHeight)).toBeGreaterThanOrEqual(44);
});
