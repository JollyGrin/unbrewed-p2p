/**
 * The account block on Backup & Share (#644).
 *
 * It replaces #566's "cloud shelf", and inherits that feature's hardest rule:
 * the cases that matter most are the ones where it must NOT appear. An
 * unreachable accounts API leaves the tab looking exactly as it does today,
 * and a guest gets one quiet sign-in line instead of controls that would 401.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";
import { LS_KEY } from "@/lib/hooks/useLocalStorage";
import { AccountBagPanel, BagSourceChip } from "./index";

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

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const deck = (id: string, name: string) =>
  ({ id, name, version_id: `${id}-v1`, deck_data: { cards: [] } }) as any;

let fetchMock: jest.Mock;

const install = (handler: (url: string, init?: any) => Response) => {
  fetchMock = jest.fn(async (url: string, init?: any) => handler(url, init));
  global.fetch = fetchMock as unknown as typeof fetch;
};

/** Signed in against an empty account that accepts every write. */
const signedIn = (options?: { refuse?: boolean }) => {
  const created: any[] = [];
  install((url, init) => {
    const path = url.replace(API_URL, "");
    const method = init?.method ?? "GET";
    if (path === "/me") return reply(200, { user: USER });
    if (path === "/bag/import") return reply(404, { error: "not_found" });
    if (method === "POST" && path === "/bag/decks") {
      if (options?.refuse) return reply(413, { error: "too_large" });
      created.push(JSON.parse(init.body).data);
      return reply(201, { id: `row-${created.length}` });
    }
    if (path === "/bag/decks") {
      return reply(200, {
        decks: created.map((_, index) => ({
          id: `row-${index + 1}`,
          name: "n",
          bytes: 1,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        })),
      });
    }
    if (path === "/bag/maps") return reply(200, { maps: [] });
    if (path.startsWith("/bag/decks/")) {
      const index = Number(path.slice("/bag/decks/row-".length)) - 1;
      return created[index]
        ? reply(200, { id: path, name: "n", data: created[index] })
        : reply(404, { error: "not_found" });
    }
    throw new TypeError(`unrouted ${method} ${path}`);
  });
  return created;
};

const show = () =>
  render(
    <ChakraProvider>
      <AccountBagPanel />
    </ChakraProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  toastSuccess.mockClear();
  toastError.mockClear();
  __resetAccountStoreForTests();
  __resetBagStoresForTests();
});

describe("when there is no account to speak of", () => {
  it("renders nothing at all against an unreachable API", async () => {
    install(() => {
      throw new TypeError("Failed to fetch");
    });

    const { container } = show();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // ChakraProvider always injects one hidden env span; "nothing" is no text.
    expect(container.textContent).toBe("");
  });

  it("offers a guest one sign-in line, and asks the API for nothing else", async () => {
    install(() => reply(401, { user: null }));

    show();

    expect(
      await screen.findByText("Sign in with Discord"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Move my bag/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // just /me
  });

  it("shows no device/account marker to a guest — there's one place to be", async () => {
    install(() => reply(401, { user: null }));

    const { container } = render(
      <ChakraProvider>
        <BagSourceChip source="device" />
      </ChakraProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector("[aria-label]")).toBeNull();
  });
});

describe("signed in", () => {
  it("moves a full local bag up on one press and empties the device", async () => {
    localStorage.setItem(
      LS_KEY.DECKS,
      JSON.stringify([deck("d1", "Bruce Lee"), deck("d2", "Yennenga")]),
    );
    const created = signedIn();

    show();

    // The count is shown up front, before anything is touched.
    expect(await screen.findByText(/2 decks are still stored/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Move my bag to my account"));

    await waitFor(() =>
      expect(localStorage.getItem(LS_KEY.DECKS)).toBeNull(),
    );
    expect(created.map((entry) => entry.id).sort()).toEqual(["d1", "d2"]);
    expect(toastSuccess).toHaveBeenCalledWith("Moved 2 items to your account");
    // Every item gets a line saying what happened to it.
    expect(await screen.findByText("Bruce Lee")).toBeInTheDocument();
    expect(screen.getAllByText("moved to your account")).toHaveLength(2);
  });

  it("leaves a refused item on the device, with the reason", async () => {
    localStorage.setItem(
      LS_KEY.DECKS,
      JSON.stringify([deck("d1", "Bruce Lee")]),
    );
    signedIn({ refuse: true });

    show();
    fireEvent.click(await screen.findByText("Move my bag to my account"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(
      JSON.parse(localStorage.getItem(LS_KEY.DECKS) ?? "[]"),
    ).toHaveLength(1);
    expect(screen.getByText(/too big/i)).toBeInTheDocument();
  });

  it("says so, and offers no move, once the device is empty", async () => {
    signedIn();

    show();

    expect(
      await screen.findByText(/Everything in your bag is saved to your account/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Move my bag to my account")).toBeNull();
  });
});
