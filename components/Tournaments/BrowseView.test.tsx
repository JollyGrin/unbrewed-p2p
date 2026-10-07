/** The browse page's failure states (p2p #1269): a non-JSON 200 is an error, never "No brackets here". */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { fixtureTournament } from "@/lib/tournaments/fixtures";

import { BrowseView } from "./BrowseView";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

beforeEach(() => __resetAccountStoreForTests());

it("a 200 whose body is not JSON (a proxy page) shows the unavailable notice, not an empty list", async () => {
  global.fetch = jest.fn(async (url: string) =>
    url === `${API_URL}/me`
      ? ({ ok: false, status: 401, json: async () => ({}) } as Response)
      : ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } } as unknown as Response),
  ) as unknown as typeof fetch;
  render(<ChakraProvider><BrowseView /></ChakraProvider>);
  expect(await screen.findByText(/Tournaments are unavailable right now/)).toBeInTheDocument();
  expect(screen.queryByText(/No brackets here/)).toBeNull();
});

it("a real empty list is still 'No brackets here'", async () => {
  global.fetch = jest.fn(async (url: string) =>
    url === `${API_URL}/me`
      ? ({ ok: false, status: 401, json: async () => ({}) } as Response)
      : ({ ok: true, status: 200, json: async () => ({ tournaments: [] }) } as Response),
  ) as unknown as typeof fetch;
  render(<ChakraProvider><BrowseView /></ChakraProvider>);
  expect(await screen.findByText(/No brackets here/)).toBeInTheDocument();
});

it("cards say 'one game per match' and the filter tabs are 44 px tap targets (p2p #1279, P6/S15)", async () => {
  const t = fixtureTournament({ firstTo: 1, status: "running" });
  global.fetch = jest.fn(async (url: string) =>
    url === `${API_URL}/me`
      ? ({ ok: false, status: 401, json: async () => ({}) } as Response)
      : ({ ok: true, status: 200, json: async () => ({ tournaments: [t] }) } as Response),
  ) as unknown as typeof fetch;
  render(<ChakraProvider><BrowseView /></ChakraProvider>);
  expect(await screen.findByText(/one game per match/)).toBeInTheDocument();
  expect(screen.queryByText(/first to 1/)).toBeNull();
  for (const tab of screen.getAllByRole("tab")) expect(parseFloat(window.getComputedStyle(tab).minHeight)).toBeGreaterThanOrEqual(44);
});

it("My tournaments lists every event of mine, a cancelled one too, labelled Cancelled (and not under All)", async () => {
  const running = fixtureTournament({ id: "t-run", slug: "run", name: "Running Cup", status: "running" });
  const cancelled = fixtureTournament({ id: "t-can", slug: "can", name: "Called Off Cup", status: "cancelled" });
  global.fetch = jest.fn(async (url: string) =>
    url === `${API_URL}/me`
      ? ({ ok: true, status: 200, json: async () => ({ user: { id: "u-bob", username: "final-bob" } }) } as Response)
      : url.includes("mine=1")
        ? ({ ok: true, status: 200, json: async () => ({ tournaments: [running, cancelled] }) } as Response)
        : ({ ok: true, status: 200, json: async () => ({ tournaments: [running] }) } as Response),
  ) as unknown as typeof fetch;
  render(<ChakraProvider><BrowseView /></ChakraProvider>);
  expect(await screen.findByText("Running Cup")).toBeInTheDocument();
  expect(screen.queryByText("Called Off Cup")).toBeNull();
  fireEvent.click(await screen.findByRole("tab", { name: /My tournaments/ }));
  const card = (await screen.findByText("Called Off Cup")).closest("article")!;
  expect(card).toHaveTextContent("Cancelled");
  expect(screen.getAllByTestId("tournament-card")).toHaveLength(2);
});
