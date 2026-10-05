/** Organizer recourse (#1242): draft page, edit, extend, cancel — and the event page around them. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { fixtureSignup8 } from "@/lib/tournaments/fixtures";
import type { Tournament } from "@/lib/tournaments/types";

import { EventView } from "./EventView";
import { LifecyclePanel } from "./LifecyclePanel";
import { TournamentsPage } from "./TournamentsPage";

let query: Record<string, string> = {};
jest.mock("next/router", () => ({ useRouter: () => ({ query, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const f = fixtureSignup8();
const T = (p: Partial<Tournament> = {}): Tournament => ({ ...f.tournament, signupClosesAt: "2030-01-01T00:00:00Z", ...p });
let calls: { url: string; method: string; body: any }[];
let patchReply: Response;
const reload = jest.fn();

beforeEach(() => {
  __resetAccountStoreForTests();
  calls = [];
  reload.mockClear();
  patchReply = reply(200, { tournament: {} });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : null });
    if (init?.method === "PATCH") return patchReply;
    return reply(404, {});
  }) as unknown as typeof fetch;
});

const mount = (t: Tournament, onCancelled?: () => void) =>
  render(
    <ChakraProvider>
      <LifecyclePanel t={t} entries={f.entries.slice(0, 3)} reload={reload} onCancelled={onCancelled} />
    </ChakraProvider>,
  );
const patches = () => calls.filter((c) => c.method === "PATCH");

describe("draft", () => {
  it("is 'Draft: not public yet' with Open signup, Edit and Delete", () => {
    mount(T({ status: "draft" }));
    expect(screen.getByRole("heading", { name: "Draft: not public yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("open-signup"));
    expect(screen.getByTestId("edit-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-toggle")).toHaveTextContent("Delete draft");
    return waitFor(() => expect(patches()[0].body).toEqual({ status: "signup" }));
  });

  it("Delete asks first, then PATCHes status cancelled", async () => {
    mount(T({ status: "draft" }));
    fireEvent.click(screen.getByTestId("cancel-toggle"));
    expect(screen.getByTestId("cancel-confirm")).toHaveTextContent("Delete this draft?");
    expect(patches()).toHaveLength(0);
    fireEvent.click(screen.getByText("Yes, delete it"));
    await waitFor(() => expect(patches()[0].body).toEqual({ status: "cancelled" }));
    expect(patches()[0].url).toBe(`${API_URL}/tournaments/${f.tournament.slug}`);
  });
});

describe("edit", () => {
  it("saves only the changed fields", async () => {
    mount(T());
    fireEvent.click(screen.getByTestId("edit-toggle"));
    fireEvent.change(screen.getByLabelText("Tournament name"), { target: { value: "Renamed Cup" } });
    fireEvent.click(screen.getByText("Save changes"));
    await waitFor(() => expect(patches()[0].body).toEqual({ name: "Renamed Cup" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("blocks an empty name, before any request", () => {
    mount(T());
    fireEvent.click(screen.getByTestId("edit-toggle"));
    fireEvent.change(screen.getByLabelText("Tournament name"), { target: { value: " " } });
    fireEvent.click(screen.getByText("Save changes"));
    expect(screen.getByRole("alert")).toHaveTextContent("Give it a name.");
    expect(patches()).toHaveLength(0);
  });
});

describe("cancel + extend", () => {
  it("cancel states the consequence, and shows the api's refusal for a running event (api #91)", async () => {
    patchReply = reply(409, { error: "invalid_status_transition" });
    mount(T({ status: "running" }));
    expect(screen.queryByTestId("edit-toggle")).toBeNull();
    expect(screen.queryByTestId("extend-toggle")).toBeNull();
    fireEvent.click(screen.getByTestId("cancel-toggle"));
    expect(screen.getByTestId("cancel-confirm")).toHaveTextContent(/Matches still to play are called off/);
    fireEvent.click(screen.getByText("Yes, cancel it"));
    expect(await screen.findByTestId("organizer-error")).toHaveTextContent("can't be changed that way");
  });

  it("surfaces the api's own message for a refusal it has no copy for", async () => {
    patchReply = reply(409, { error: "something_new", message: "Cancel is not available yet." });
    mount(T({ status: "running" }));
    fireEvent.click(screen.getByTestId("cancel-toggle"));
    fireEvent.click(screen.getByText("Yes, cancel it"));
    expect(await screen.findByTestId("organizer-error")).toHaveTextContent("Cancel is not available yet.");
  });

  it("cancel success calls onCancelled", async () => {
    const onCancelled = jest.fn();
    mount(T(), onCancelled);
    fireEvent.click(screen.getByTestId("cancel-toggle"));
    fireEvent.click(screen.getByText("Yes, cancel it"));
    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
  });

  it("extend PATCHes signupClosesAt only; a past time is refused locally", async () => {
    mount(T());
    fireEvent.click(screen.getByTestId("extend-toggle"));
    fireEvent.change(screen.getByLabelText("New signup close"), { target: { value: "2020-01-01T10:00" } });
    fireEvent.click(screen.getAllByText("Extend signup")[1]);
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a time in the future.");
    expect(patches()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("New signup close"), { target: { value: "2031-02-03T10:00" } });
    fireEvent.click(screen.getAllByText("Extend signup")[1]);
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(Object.keys(patches()[0].body)).toEqual(["signupClosesAt"]);
  });

  it("a closed, under-filled event says what to do", () => {
    mount(T({ signupClosesAt: "2020-01-01T00:00:00Z", signupOpen: false }));
    expect(screen.getByTestId("lifecycle-note")).toHaveTextContent("Not enough players to start. Extend signup, or cancel.");
  });
});

describe("event page", () => {
  const load = (t: Tournament, me: { id: string } | null) => {
    global.fetch = jest.fn(async (url: string) => {
      if (url === `${API_URL}/me`) return me ? reply(200, { user: { id: me.id, username: "o", avatarUrl: null } }) : reply(401, {});
      if (url.includes("/tournaments/")) return reply(200, { tournament: t, entries: [], matches: [] });
      return reply(404, {});
    }) as unknown as typeof fetch;
  };

  it("the organizer of a draft sees the draft page, not 'This tournament is over'", async () => {
    load(T({ status: "draft", signupOpen: false }), { id: f.tournament.organizer.userId });
    render(<ChakraProvider><EventView slug="x" justCreated={false} /></ChakraProvider>);
    expect(await screen.findByRole("heading", { name: "Draft: not public yet" })).toBeInTheDocument();
    expect(screen.queryByText("This tournament is over.")).toBeNull();
  });

  it("anyone else on a draft gets the normal 'No tournament here' page", async () => {
    load(T({ status: "draft", signupOpen: false }), { id: "stranger" });
    render(<ChakraProvider><EventView slug="x" justCreated={false} /></ChakraProvider>);
    expect(await screen.findByText("No tournament here")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-panel")).toBeNull();
  });

  it("?t=UPPERCASE looks up the lowercase slug", async () => {
    query = { t: "LAB-RATS-OPEN" };
    load(T(), null);
    render(<ChakraProvider><TournamentsPage /></ChakraProvider>);
    await waitFor(() =>
      expect((global.fetch as jest.Mock).mock.calls.some(([u]) => u === `${API_URL}/tournaments/lab-rats-open`)).toBe(true),
    );
    query = {};
  });
});
