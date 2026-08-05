/**
 * Cloud upload + share links on the replays browser (#567).
 *
 * The invariants worth pinning are the failure ones: a signed-out visitor and a
 * dead accounts API both leave this page exactly as it was before accounts
 * existed (no cloud section, no upload button), and the two server refusals a
 * user can actually hit — the 50-replay cap and the 2 MB size limit — surface
 * as readable toasts rather than a silent no-op.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ReplaysBrowser } from "./ReplaysBrowser";
import type { ReplayBundle } from "@/lib/pro/protocol";
import { API_URL } from "@/lib/account/apiUrl";
import { CLOUD_REPLAY_CAP } from "@/lib/pro/replayCloud";
import { saveReplay } from "@/lib/pro/replayStore";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

jest.mock("next/router", () => ({
  useRouter: () => ({ isReady: true, query: {} }),
}));

jest.mock("../../components/Pro/ReplayScrubber", () => ({
  ReplayScrubber: () => <div>scrubber</div>,
}));

const bundle: ReplayBundle = {
  v: 1,
  engine: { schemaVersion: 1, dslVersion: "0.11.0" },
  config: {
    seed: 1,
    players: { p1: { heroId: "king-kong", hero: {}, cards: [] }, p2: { heroId: "thrall", hero: {}, cards: [] } },
    map: { schemaVersion: "1.0", id: "mended-drum", meta: { title: "The Mended Drum", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  },
  actionLog: [],
  meta: { winner: "p2", heroes: { p1: "king-kong", p2: "thrall" }, turns: 5, endedAt: 1_720_000_000_000, mapTitle: "The Mended Drum" },
};

const USER = { id: "u1", username: "JollyGrin", avatarUrl: null };

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

type Routes = {
  me?: Response;
  list?: Response;
  upload?: Response;
};

let routes: Routes;
let posted: unknown[];
let deleted: string[];
let copied: string[];

/** Route the endpoints this component touches; anything else 404s. */
const wireFetch = () => {
  posted = [];
  deleted = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const href = String(url);
    if (href.endsWith("/me")) return routes.me ?? reply(401, { user: null });
    if (href.endsWith("/replays") && init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)));
      return routes.upload ?? reply(201, { id: "the-id" });
    }
    if (href.endsWith("/replays")) return routes.list ?? reply(200, { replays: [] });
    if (init?.method === "DELETE") {
      deleted.push(href.split("/replays/")[1]);
      routes.list = reply(200, { replays: [] });
      return reply(204, null);
    }
    return reply(404, { error: "not_found" });
  }) as unknown as typeof fetch;
};

const renderBrowser = () =>
  render(
    <ChakraProvider>
      <ReplaysBrowser />
    </ChakraProvider>,
  );

const uploadButton = () => screen.findByRole("button", { name: /upload & copy link/i });

beforeEach(() => {
  window.localStorage.clear();
  __resetAccountStoreForTests();
  routes = { me: reply(200, { user: USER }) };
  wireFetch();
  copied = [];
  Object.assign(navigator, {
    clipboard: { writeText: (text: string) => { copied.push(text); return Promise.resolve(); } },
  });
  saveReplay(bundle);
});

describe("ReplaysBrowser cloud upload", () => {
  it("uploads with the local replay's label and copies the share link", async () => {
    renderBrowser();

    fireEvent.click(await uploadButton());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ title: "King Kong vs Thrall — The Mended Drum", bundle });
    await waitFor(() => expect(copied).toEqual([`${window.location.origin}/share/replay/the-id`]));
    expect(await screen.findByText("Share link copied")).toBeInTheDocument();
  });

  it("toasts a friendly message when the 50-replay cap is reached", async () => {
    routes.upload = reply(409, { error: "cap_reached", cap: CLOUD_REPLAY_CAP });
    wireFetch();

    renderBrowser();
    fireEvent.click(await uploadButton());

    expect(await screen.findByText("Cloud replays are full")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`cloud replays are full \\(${CLOUD_REPLAY_CAP}\\)`, "i")),
    ).toBeInTheDocument();
    expect(copied).toEqual([]);
  });

  it("toasts a friendly message when the replay is over the 2 MB limit", async () => {
    routes.upload = reply(413, { error: "too_large", limit: 2097152 });
    wireFetch();

    renderBrowser();
    fireEvent.click(await uploadButton());

    expect(await screen.findByText("Couldn't upload that replay")).toBeInTheDocument();
    expect(screen.getByText(/over 2 MB/)).toBeInTheDocument();
  });

  it("lists the user's cloud replays with the cap, and deletes one", async () => {
    routes.list = reply(200, {
      replays: [{ id: "cloud-1", title: "Grand final", bytes: 2048, createdAt: "2026-08-05T12:00:00.000Z" }],
    });
    wireFetch();

    renderBrowser();

    expect(await screen.findByText("My cloud replays")).toBeInTheDocument();
    expect(screen.getByText(`1/${CLOUD_REPLAY_CAP}`)).toBeInTheDocument();
    expect(screen.getByText("Grand final")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy share link for Grand final/i }));
    expect(copied).toEqual([`${window.location.origin}/share/replay/cloud-1`]);

    fireEvent.click(screen.getByRole("button", { name: /delete Grand final from the cloud/i }));
    await waitFor(() => expect(deleted).toEqual(["cloud-1"]));
    await waitFor(() => expect(screen.queryByText("Grand final")).toBeNull());
    expect(screen.getByText(`0/${CLOUD_REPLAY_CAP}`)).toBeInTheDocument();
  });

  it("shows nothing cloud-related to a signed-out visitor", async () => {
    routes.me = reply(401, { user: null });
    wireFetch();

    renderBrowser();

    // The local list still renders — guest behaviour is unchanged.
    expect(await screen.findByText(/The Mended Drum/)).toBeInTheDocument();
    expect(screen.queryByText("My cloud replays")).toBeNull();
    expect(screen.queryByRole("button", { name: /upload & copy link/i })).toBeNull();
  });

  it("behaves exactly as before when the accounts API is unreachable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    renderBrowser();

    expect(await screen.findByText(/The Mended Drum/)).toBeInTheDocument();
    expect(screen.queryByText("My cloud replays")).toBeNull();
    expect(screen.queryByRole("button", { name: /upload & copy link/i })).toBeNull();
  });

  it("hides the upload button when the listing call fails even though /me worked", async () => {
    routes.list = reply(500, { error: "boom" });
    wireFetch();

    renderBrowser();

    expect(await screen.findByText(/The Mended Drum/)).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/replays`, expect.anything()));
    expect(screen.queryByRole("button", { name: /upload & copy link/i })).toBeNull();
  });
});
