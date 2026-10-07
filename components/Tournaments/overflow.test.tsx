/**
 * No horizontal scroll at 390px with long unbroken names (#1242 / L10). jsdom
 * has no layout, so each test renders the component with a 32-char Discord
 * handle and a 60-char event name and asserts the CSS that stops the overflow
 * (min-width:0 on grid/flex children, break-anywhere on text) is on the right
 * element. Verified visually in a browser too (see the PR).
 *
 * A real 375px layout assertion is NOT expressible here (p2p #1269): jsdom does
 * no layout, so scrollWidth/getBoundingClientRect are always 0 whatever the
 * viewport, and window.innerWidth changes nothing. Overflow at phone width is
 * only testable in a real browser (scripts/visual-probe + headless Chrome).
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen, within } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch, fixtureRunning8, fixtureSignup8 } from "@/lib/tournaments/fixtures";

import { BracketEventView } from "./BracketEventView";
import { BrowseView } from "./BrowseView";
import { MatchBody } from "./MatchView";
import { Page } from "./ui";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div /> }));

const LONG_USER = "x".repeat(32);
const LONG_NAME = "Z".repeat(60);

/** The CSS Emotion generated for an element's classes (base + media-query rules). */
const css = (el: Element): string => {
  const all = [...document.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
  return [...el.classList]
    .filter((c) => c.startsWith("css-"))
    .map((c) => [...all.matchAll(new RegExp(`\\.${c}\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join(";"))
    .join(";");
};

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

it("the H1 breaks an unbroken event name", () => {
  render(
    <ChakraProvider>
      <Page title="t" path="/tournaments" heading={LONG_NAME}>x</Page>
    </ChakraProvider>,
  );
  const h1 = screen.getByRole("heading", { level: 1 });
  expect(css(h1)).toMatch(/overflow-wrap:\s*anywhere/);
});

it("entrants rows shrink: 1-column grid is minmax(0, 1fr), row min-width 0, name truncates with a title", () => {
  const p = fixtureRunning8();
  const entries = p.entries.map((e, i) => (i === 0 ? { ...e, username: LONG_USER } : e));
  render(
    <ChakraProvider>
      <BracketEventView t={{ ...p.tournament, name: LONG_NAME }} entries={entries} matches={p.matches} />
    </ChakraProvider>,
  );
  const box = screen.getByTestId("entrants");
  const row = within(box).getAllByTestId("entrant-row")[0];
  const grid = row.parentElement!;
  expect(css(grid)).toMatch(/minmax\(0,\s*1fr\)/);
  expect(css(row)).toMatch(/min-width:\s*0/);
  const name = within(row).getByText(LONG_USER);
  expect(css(name)).toMatch(/text-overflow:\s*ellipsis/);
  expect(css(name)).toMatch(/min-width:\s*0/);
  expect(name).toHaveAttribute("title", LONG_USER);
});

it("browse cards shrink and wrap a long name and handle", async () => {
  __resetAccountStoreForTests();
  const t = { ...fixtureSignup8().tournament, name: LONG_NAME, organizer: { userId: "o", username: LONG_USER, avatarUrl: "" } };
  global.fetch = jest.fn(async (url: string) =>
    url.startsWith(`${API_URL}/tournaments`) ? reply(200, { tournaments: [t] }) : reply(401, {}),
  ) as unknown as typeof fetch;
  render(<ChakraProvider><BrowseView /></ChakraProvider>);
  const card = await screen.findByTestId("tournament-card");
  expect(css(card)).toMatch(/min-width:\s*0/);
  expect(css(card.parentElement!)).toMatch(/minmax\(0,\s*1fr\)/);
  expect(css(within(card).getByTestId("card-title"))).toMatch(/overflow-wrap:\s*anywhere/);
});

it("the match header's player columns can shrink and wrap a 32-char handle", () => {
  const f = fixtureMatch("waiting");
  const detail = { ...f.detail, players: { a: { ...f.detail.players.a!, username: LONG_USER }, b: f.detail.players.b } };
  render(
    <ChakraProvider>
      <MatchBody d={detail} t={{ ...f.tournament, name: LONG_NAME }} myUserId={FIXTURE_MATCH_YOU} signedOut={false} now={Date.parse(FIXTURE_NOW)} phase={{ kind: "idle" }} onPlay={() => {}} />
    </ChakraProvider>,
  );
  const h3 = screen.getByRole("heading", { level: 3, name: new RegExp(LONG_USER) });
  expect(css(h3)).toMatch(/overflow-wrap:\s*anywhere/);
  expect(css(h3.closest("div")!.parentElement!)).toMatch(/minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/);
});
