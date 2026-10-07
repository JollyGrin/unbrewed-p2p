/** The create page (p2p #1269): submit, 401 copy with a way back in, navigation, double-submit. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

import { CreateView } from "./CreateView";

const push = jest.fn();
jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

let posts: { url: string; body: any }[];
let createReply: () => Promise<Response>;

beforeEach(() => {
  __resetAccountStoreForTests();
  push.mockClear();
  posts = [];
  createReply = async () => reply(201, { tournament: { slug: "autumn-skirmish" } });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === `${API_URL}/me`) return reply(200, { user: { id: "org", username: "cecil", avatarUrl: null } });
    if (url === `${API_URL}/tournaments` && init?.method === "POST") {
      posts.push({ url, body: JSON.parse(init.body as string) });
      return createReply();
    }
    return reply(404, {});
  }) as unknown as typeof fetch;
});

const mount = async () => {
  render(<ChakraProvider><CreateView /></ChakraProvider>);
  const name = await screen.findByLabelText("Tournament name");
  fireEvent.change(name, { target: { value: "Autumn Skirmish" } });
};
const openSignup = () => screen.getByRole("button", { name: /Open signup|Opening…/ });

it("submits one create with the form's name and opens signup", async () => {
  await mount();
  fireEvent.click(openSignup());
  await waitFor(() => expect(push).toHaveBeenCalledWith("/tournaments?t=autumn-skirmish&share=1"));
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toMatchObject({ name: "Autumn Skirmish", status: "signup" });
});

it("a 401 says the session ended and offers the Discord sign-in back to this page", async () => {
  createReply = async () => reply(401, { error: "unauthorized" });
  await mount();
  fireEvent.click(openSignup());
  expect(await screen.findByRole("alert")).toHaveTextContent("Your session ended. Sign in with Discord again");
  const link = screen.getByRole("link", { name: "Sign in with Discord" });
  expect(link.getAttribute("href")).toContain(encodeURIComponent("/tournaments?new=1"));
  expect(push).not.toHaveBeenCalled();
});

it("double-clicking Open signup sends exactly one create", async () => {
  let release: (r: Response) => void = () => {};
  createReply = () => new Promise((r) => (release = r));
  await mount();
  fireEvent.click(openSignup());
  fireEvent.click(openSignup());
  await act(async () => {});
  expect(posts).toHaveLength(1);
  await act(async () => release(reply(201, { tournament: { slug: "autumn-skirmish" } })));
  expect(posts).toHaveLength(1);
});

it("two submits before the button re-renders (Enter, Enter) are still one create", async () => {
  createReply = () => new Promise(() => {});
  await mount();
  const form = openSignup().closest("form")!;
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await act(async () => {});
  expect(posts).toHaveLength(1);
});

it("says 'one game per match', never 'First to 1' (p2p #1279, UX P6)", async () => {
  await mount();
  expect(document.body).not.toHaveTextContent(/first to 1/i);
  expect(screen.getAllByText(/one game per match/i).length).toBeGreaterThan(0);
});
