/**
 * The cloud bag UI (#566). The whole feature is additive, so the cases that
 * matter most are the ones where it must NOT appear: an unreachable API leaves
 * the Bag looking exactly as it does today, and a guest gets one quiet sign-in
 * line instead of controls that would 401.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import {
  CloudBagSection,
  CloudBagShelf,
  SaveToCloudButton,
  cloudMapName,
} from "./index";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetCloudBagStoresForTests } from "@/lib/account/useCloudBag";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/bag?tab=2" }),
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("react-hot-toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const USER = { id: "u1", username: "JollyGrin", avatarUrl: null };

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Bruce Lee",
  bytes: 4096,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

let fetchMock: jest.Mock;
const onImport = jest.fn(() => 1);

const install = (handler: (url: string, init?: any) => Response) => {
  fetchMock = jest.fn(async (url: string, init?: any) => handler(url, init));
  global.fetch = fetchMock as unknown as typeof fetch;
};

/** Signed in, one deck on the shelf. */
const signedIn = () =>
  install((url, init) => {
    const path = url.replace(API_URL, "");
    if (path === "/me") return reply(200, { user: USER });
    if (path === "/bag/decks" && init?.method === "POST")
      return reply(201, { id: "new-id" });
    if (path === "/bag/decks") return reply(200, { decks: [ROW] });
    if (path.startsWith("/bag/decks/") && init?.method === "DELETE")
      return { ok: true, status: 204 } as Response;
    if (path.startsWith("/bag/decks/"))
      return reply(200, { id: ROW.id, name: ROW.name, data: { id: "deck-1" } });
    throw new TypeError(`unrouted ${path}`);
  });

const renderShelf = () =>
  render(
    <ChakraProvider>
      <CloudBagShelf
        kind="decks"
        title="Cloud decks"
        emptyHint="Nothing up here yet."
        onImport={onImport}
      />
    </ChakraProvider>,
  );

/** The whole block as the Backup & Share tab mounts it. */
const renderSection = () =>
  render(
    <ChakraProvider>
      <CloudBagSection onImportDeck={onImport} onImportMap={onImport} />
    </ChakraProvider>,
  );

beforeEach(() => {
  __resetAccountStoreForTests();
  __resetCloudBagStoresForTests();
  toastSuccess.mockClear();
  toastError.mockClear();
  onImport.mockClear();
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

describe("with the accounts API unreachable", () => {
  it("renders NOTHING — not even the blurb, so the tab reads as today", async () => {
    install(() => {
      throw new TypeError("Failed to fetch");
    });

    renderSection();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText("Cloud decks")).toBeNull();
    expect(screen.queryByText("Cloud maps")).toBeNull();
    expect(screen.queryByText("Sign in to sync")).toBeNull();
    expect(screen.queryByText(/Keep copies of individual decks/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("also renders nothing while the account probe is still in flight", async () => {
    // A promise that never settles: the section must be empty meanwhile, not
    // flash a panel that then disappears.
    fetchMock = jest.fn(() => new Promise(() => {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    renderSection();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/Keep copies of individual decks/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hides the per-deck save button too", async () => {
    install(() => {
      throw new TypeError("Failed to fetch");
    });

    render(
      <ChakraProvider>
        <SaveToCloudButton kind="decks" name="Bruce Lee" data={{}} />
      </ChakraProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/cloud/i)).toBeNull();
  });
});

describe("as a guest", () => {
  it("offers sign-in ONCE (not per kind) and never touches /bag", async () => {
    install((url) =>
      url.endsWith("/me")
        ? reply(401, { user: null })
        : (() => {
            throw new Error("a guest must not call /bag");
          })(),
    );

    renderSection();

    expect(await screen.findByText("Sign in to sync")).toBeInTheDocument();
    expect(screen.getAllByText("Sign in to sync")).toHaveLength(1);
    expect(screen.queryByText("Cloud decks")).toBeNull();
    expect(screen.queryByText("Load into bag")).toBeNull();
    // the OAuth handoff carries the page it started on
    expect(screen.getByText("Sign in to sync").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent("/bag?tab=2")),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${API_URL}/me`]);
  });
});

describe("as a signed-in user", () => {
  it("shows both shelves and the blurb", async () => {
    install((url) => {
      const path = url.replace(API_URL, "");
      if (path === "/me") return reply(200, { user: USER });
      if (path === "/bag/decks") return reply(200, { decks: [ROW] });
      if (path === "/bag/maps") return reply(200, { maps: [] });
      throw new TypeError(`unrouted ${path}`);
    });

    renderSection();

    expect(await screen.findByText("Cloud decks")).toBeInTheDocument();
    // each kind has its own listing probe, so the map shelf can arrive a tick later
    expect(await screen.findByText("Cloud maps")).toBeInTheDocument();
    expect(
      screen.getByText(/Keep copies of individual decks/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sign in to sync")).toBeNull();
  });

  it("shows the shelf with quota, size and date", async () => {
    signedIn();

    renderShelf();

    expect(await screen.findByText("Bruce Lee")).toBeInTheDocument();
    expect(screen.getByText("1/100 · 4.0 KB")).toBeInTheDocument();
    expect(screen.getByText("4.0 KB · 2026-08-02")).toBeInTheDocument();
  });

  it("loads an item back through the bag's own import path", async () => {
    signedIn();

    renderShelf();
    fireEvent.click(await screen.findByText("Load into bag"));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith({ id: "deck-1" }));
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Loaded Bruce Lee"),
    );
  });

  it("says so when the item is already in the bag", async () => {
    signedIn();
    onImport.mockReturnValue(0);

    renderShelf();
    fireEvent.click(await screen.findByText("Load into bag"));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("already in your bag"),
      ),
    );
  });

  it("copies the full share URL, not just the id", async () => {
    signedIn();

    renderShelf();
    fireEvent.click(await screen.findByText("Copy share link"));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/share/deck/${ROW.id}`,
      ),
    );
  });

  it("deletes from the cloud", async () => {
    signedIn();

    renderShelf();
    fireEvent.click(await screen.findByText("Delete from cloud"));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("Removed Bruce Lee"),
      ),
    );
  });

  it("offers an update — not a duplicate — for a name already up there", async () => {
    signedIn();

    render(
      <ChakraProvider>
        <SaveToCloudButton kind="decks" name="Bruce Lee" data={{ id: "d" }} />
      </ChakraProvider>,
    );

    expect(await screen.findByText("Update in cloud")).toBeInTheDocument();
  });

  it("saves a new deck and toasts", async () => {
    signedIn();

    render(
      <ChakraProvider>
        <SaveToCloudButton kind="decks" name="Jill Trent" data={{ id: "d" }} />
      </ChakraProvider>,
    );
    fireEvent.click(await screen.findByText("Save to cloud"));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("Saved Jill Trent"),
      ),
    );
  });

  it("turns a full cloud bag into a friendly toast, not a console error", async () => {
    install((url, init) => {
      const path = url.replace(API_URL, "");
      if (path === "/me") return reply(200, { user: USER });
      if (path === "/bag/decks" && init?.method === "POST")
        return reply(409, { error: "cap_reached", cap: 100 });
      return reply(200, { decks: [] });
    });

    render(
      <ChakraProvider>
        <SaveToCloudButton kind="decks" name="Jill Trent" data={{ id: "d" }} />
      </ChakraProvider>,
    );
    fireEvent.click(await screen.findByText("Save to cloud"));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining("cloud bag is full"),
      ),
    );
  });
});

describe("cloudMapName", () => {
  it("prefers the map's title", () => {
    expect(
      cloudMapName({ imgUrl: "https://x/y.webp", meta: { title: "Attic" } }),
    ).toBe("Attic");
  });

  it("falls back to the image filename so untitled maps stay distinct", () => {
    expect(cloudMapName({ imgUrl: "https://x/legacy-attic.webp?v=2" })).toBe(
      "legacy-attic",
    );
    expect(cloudMapName({ imgUrl: "https://x/my%20map.png" })).toBe("my map");
    expect(cloudMapName({ imgUrl: "https://x/" })).toBe("Custom map");
  });
});
