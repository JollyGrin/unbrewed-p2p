/** The browse page's failure states (p2p #1269): a non-JSON 200 is an error, never "No brackets here". */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

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
