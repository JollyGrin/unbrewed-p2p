/**
 * The share landing (#566) is the one page a total stranger lands on: no
 * account, no cookie, nothing in localStorage. These tests pin that path
 * end-to-end — preview, then one press that leaves the deck (or map) in this
 * browser's bag — plus the two ways a link can fail, which must read as
 * sentences rather than as an error.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ShareLanding } from "./ShareLanding";
import { API_URL } from "@/lib/account/apiUrl";
import { LS_KEY } from "@/lib/hooks/useLocalStorage";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/share/deck/cloud-id", query: {} }),
}));

const toastSuccess = jest.fn();
jest.mock("react-hot-toast", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

const DECK_DATA = {
  id: "deck-1",
  name: "Bruce Lee",
  deck_data: {
    name: "Bruce Lee",
    hero: { name: "Bruce Lee", hp: 16, move: 2, isRanged: false },
    sidekick: { name: "Sidekick", quantity: 0 },
    appearance: { cardbackUrl: "https://example.com/back.png" },
    cards: [
      { title: "Fist", quantity: 3 },
      { title: "Kick", quantity: 4 },
    ],
  },
};

const MAP_DATA = {
  imgUrl: "https://example.com/map.webp",
  meta: { title: "Sarah's Attic", author: "Gerry" },
};

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

let fetchMock: jest.Mock;

const renderLanding = (route: "deck" | "map", id = "cloud-id") =>
  render(
    <ChakraProvider>
      <ShareLanding route={route} id={id} />
    </ChakraProvider>,
  );

beforeEach(() => {
  // The navbar chip shares a module-level probe; cold-start it so every case
  // sees the same sequence of calls.
  __resetAccountStoreForTests();
  __resetBagStoresForTests();
  localStorage.clear();
  toastSuccess.mockClear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("a shared deck", () => {
  it("previews it from the public endpoint, no cookies involved", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { id: "cloud-id", name: "Bruce Lee", data: DECK_DATA }),
    );

    renderLanding("deck");

    expect(await screen.findByText("Bruce Lee")).toBeInTheDocument();
    expect(screen.getByText("🃏 7 cards")).toBeInTheDocument();
    expect(screen.getByText("🦸 Bruce Lee")).toBeInTheDocument();
    // The navbar's account chip probes /me on every page, as it already did;
    // the share read is the only call this page adds, and it sends no cookie.
    const shareCall = fetchMock.mock.calls.find(([url]) =>
      url.includes("/share/"),
    );
    expect(shareCall?.[0]).toBe(`${API_URL}/share/decks/cloud-id`);
    expect(shareCall?.[1].credentials).toBeUndefined();
    expect(
      fetchMock.mock.calls.filter(([url]) => !url.endsWith("/me")),
    ).toHaveLength(1);
  });

  it("adds it to a fresh browser's bag and stars it", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { id: "cloud-id", name: "Bruce Lee", data: DECK_DATA }),
    );

    renderLanding("deck");
    fireEvent.click(await screen.findByText("Add to my bag"));

    // The write goes through the bag store now (#644), which is async even for
    // a guest — the localStorage path underneath is the same one as before.
    await waitFor(() =>
      expect(localStorage.getItem(LS_KEY.DECKS)).not.toBeNull(),
    );
    const stored = JSON.parse(localStorage.getItem(LS_KEY.DECKS) ?? "[]");
    expect(stored).toHaveLength(1);
    // The identical deck JSON, round-tripped through the share link.
    expect(stored[0]).toEqual(DECK_DATA);
    expect(localStorage.getItem(LS_KEY.STAR_DECK)).toBe("deck-1");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    // and the button becomes the way onward
    expect(await screen.findByText("Open your bag")).toBeInTheDocument();
  });

  it("says the link expired on a 404, and writes nothing", async () => {
    fetchMock.mockResolvedValue(reply(404, { error: "not_found" }));

    renderLanding("deck", "gone");

    expect(await screen.findByText(/link has expired/i)).toBeInTheDocument();
    expect(screen.queryByText("Add to my bag")).toBeNull();
    expect(localStorage.getItem(LS_KEY.DECKS)).toBeNull();
  });

  it("distinguishes an unreachable API from a dead link", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    renderLanding("deck");

    expect(await screen.findByText(/Couldn't reach the cloud/i)).toBeInTheDocument();
  });

  it("refuses a payload that isn't a deck at all", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { id: "cloud-id", name: "Junk", data: { hello: "world" } }),
    );

    renderLanding("deck");

    expect(await screen.findByText(/link has expired/i)).toBeInTheDocument();
    expect(localStorage.getItem(LS_KEY.DECKS)).toBeNull();
  });
});

describe("a shared map", () => {
  it("previews it and adds it to the local map list", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { id: "cloud-id", name: "Sarah's Attic", data: MAP_DATA }),
    );

    renderLanding("map");

    expect(await screen.findByText("Sarah's Attic")).toBeInTheDocument();
    expect(screen.getByText("by Gerry")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Add to my maps"));

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(LS_KEY.MAP_LIST) ?? "[]")).toEqual([
        MAP_DATA,
      ]),
    );
  });

  it("doesn't duplicate a map the visitor already has", async () => {
    localStorage.setItem(LS_KEY.MAP_LIST, JSON.stringify([MAP_DATA]));
    fetchMock.mockResolvedValue(
      reply(200, { id: "cloud-id", name: "Sarah's Attic", data: MAP_DATA }),
    );

    renderLanding("map");
    fireEvent.click(await screen.findByText("Add to my maps"));

    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(LS_KEY.MAP_LIST) ?? "[]"),
      ).toHaveLength(1),
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("already in your maps"),
    );
  });
});
