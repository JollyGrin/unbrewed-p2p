/**
 * The /pro next-match banner and the account-menu card (#1220): every banner
 * state from fixtures, and nothing at all for guests, no open match, or an
 * api failure.
 */
import "@testing-library/jest-dom";
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { AccountChip } from "@/components/Account/AccountChip";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { fixtureMatch, fixtureMyTournaments } from "@/lib/tournaments/fixtures";
import { __resetNextMatchForTests } from "@/lib/tournaments/useNextMatch";

import { NextMatchBanner } from "./NextMatchBanner";

const push = jest.fn();
jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/pro", push }),
}));

const USER = { id: "u2", username: "hokuto_shin", avatarUrl: null };
const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

type State = "waiting" | "opponent_ready" | "you_ready" | "in_play" | "deadline_passed";

/** Routes the account probe, /me/tournaments and the match detail. */
const serve = (opts: { me?: "user" | "guest"; mine?: "none" | "down" | State }) => {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(API_URL, "");
    if (path === "/me") return opts.me === "guest" ? reply(401, { user: null }) : reply(200, { user: USER });
    if (path === "/me/tournaments") {
      if (opts.mine === "down") return reply(500, { error: "internal" });
      if (!opts.mine || opts.mine === "none") return reply(200, { tournaments: [], nextMatch: null });
      return reply(200, fixtureMyTournaments(opts.mine, new Date().toISOString()));
    }
    const m = path.match(/^\/tournaments\/fixture-match-([a-z-]+)\/matches\/m2-1(\/ready)?$/);
    if (m && opts.mine && opts.mine !== "none" && opts.mine !== "down") {
      const d = fixtureMatch(opts.mine, new Date().toISOString()).detail;
      if (m[2])
        return reply(200, { action: "create", ticket: "t", gameIndex: 0, slot: "a", heroId: null, map: null, ticketExpiresAt: "", roomId: null, init });
      return reply(200, d);
    }
    return reply(404, { error: "not_found" });
  }) as unknown as typeof fetch;
};

const wrap = (ui: React.ReactNode) => render(<ChakraProvider>{ui}</ChakraProvider>);

beforeEach(() => {
  __resetAccountStoreForTests();
  __resetNextMatchForTests();
  push.mockReset();
});

describe("NextMatchBanner", () => {
  it("your turn → I'm ready to play, with the matchup lines", async () => {
    serve({ mine: "waiting" });
    wrap(<NextMatchBanner />);
    const b = await screen.findByTestId("next-match-banner");
    expect(b).toHaveAttribute("data-state", "open");
    expect(b).toHaveTextContent("Semifinal 2 vs bountyhuntr");
    expect(b).toHaveTextContent("You play Kenshiro");
    expect(b).toHaveTextContent("Autumn Skirmish #3");
    expect(screen.getByRole("link", { name: "Match page" })).toHaveAttribute(
      "href",
      "/tournaments?t=fixture-match-waiting&m=m2-1",
    );
    fireEvent.click(screen.getByRole("button", { name: "I'm ready to play" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("I'm ready navigates under StrictMode too (dev double mount, #1230)", async () => {
    serve({ mine: "waiting" });
    render(
      <StrictMode>
        <ChakraProvider>
          <NextMatchBanner />
        </ChakraProvider>
      </StrictMode>,
    );
    await screen.findByTestId("next-match-banner");
    fireEvent.click(screen.getByRole("button", { name: "I'm ready to play" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/pro\/game\?(?!.*[?&]ticket=).*#ticket=t$/)));
  });

  it("deadline passed → the organizer is deciding, no ready button (#1230)", async () => {
    serve({ mine: "deadline_passed" });
    wrap(<NextMatchBanner />);
    const b = await screen.findByTestId("next-match-banner");
    expect(b).toHaveAttribute("data-state", "deadline_passed");
    expect(b).toHaveTextContent("The deadline has passed. The organizer is deciding this match.");
    expect(b).toHaveTextContent("within 24h, the higher seed advances");
    expect(screen.queryByRole("button", { name: "I'm ready to play" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View match" })).toBeInTheDocument();
  });

  it("opponent ready → Join now with the seat clock", async () => {
    serve({ mine: "opponent_ready" });
    wrap(<NextMatchBanner />);
    const b = await screen.findByTestId("next-match-banner");
    expect(b).toHaveAttribute("data-state", "opponent_ready");
    expect(b).toHaveTextContent(/bountyhuntr is ready · seat held \d+:\d\d/);
    expect(screen.getByRole("button", { name: "Join now" })).toBeEnabled();
  });

  it("you're ready → View match", async () => {
    serve({ mine: "you_ready" });
    wrap(<NextMatchBanner />);
    const b = await screen.findByTestId("next-match-banner");
    expect(b).toHaveTextContent("You're ready");
    expect(screen.getByRole("link", { name: "View match" })).toBeInTheDocument();
  });

  it("in play now → View match, no ready button", async () => {
    serve({ mine: "in_play" });
    wrap(<NextMatchBanner />);
    const b = await screen.findByTestId("next-match-banner");
    expect(b).toHaveAttribute("data-state", "in_play");
    expect(b).toHaveTextContent("In play now");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    ["a guest", { me: "guest" as const }],
    ["no open match", { mine: "none" as const }],
    ["the api down", { mine: "down" as const }],
  ])("renders nothing for %s", async (_n, opts) => {
    serve(opts);
    wrap(<NextMatchBanner />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.queryByTestId("next-match-banner")).toBeNull();
    expect(document.body.textContent).toBe("");
  });
});

describe("AccountChip menu", () => {
  it("adds My tournaments and the next match", async () => {
    serve({ mine: "opponent_ready" });
    wrap(<AccountChip />);
    fireEvent.click(await screen.findByLabelText("Account: hokuto_shin"));
    const next = await screen.findByTestId("menu-next-match");
    expect(next).toHaveTextContent("Semifinal 2 is waiting for you");
    expect(next).toHaveAttribute("href", "/tournaments?t=fixture-match-opponent-ready&m=m2-1");
    expect(screen.getByText("My tournaments")).toHaveAttribute("href", "/tournaments");
  });

  it("deadline passed: the card says the organizer is deciding (#1230)", async () => {
    serve({ mine: "deadline_passed" });
    wrap(<AccountChip />);
    fireEvent.click(await screen.findByLabelText("Account: hokuto_shin"));
    const next = await screen.findByTestId("menu-next-match");
    expect(next).toHaveTextContent("The deadline has passed. The organizer is deciding this match.");
    expect(next).not.toHaveTextContent("left");
  });

  it("shows no tournament items when the api is down", async () => {
    serve({ mine: "down" });
    wrap(<AccountChip />);
    fireEvent.click(await screen.findByLabelText("Account: hokuto_shin"));
    await screen.findByText("Collection");
    expect(screen.queryByText("My tournaments")).toBeNull();
    expect(screen.queryByTestId("menu-next-match")).toBeNull();
  });
});
