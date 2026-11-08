/**
 * The bag's storage card. The #645 acceptance case still holds: a bag holding
 * ~200kb of decks/maps next to a 6 MB pile of Pro replays must read ~200 KB,
 * with the replays explained (and linked) rather than charged to the bag.
 * #1538 round 3 added the two ways out of the browser limit: a guest's
 * "Sign in with Discord", and "Push to cloud" for a signed-in player with
 * decks still only on this device.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { computeStorageBreakdown } from "@/lib/storage/breakdown";
import { toast } from "react-hot-toast";
import { DeckStats } from "./Stats";

jest.mock("next/router", () => ({ useRouter: () => ({ asPath: "/bag", query: {} }) }));
const mockTrack = jest.fn();
jest.mock("../../../lib/analytics", () => ({
  ...jest.requireActual("../../../lib/analytics"),
  track: (...a: unknown[]) => mockTrack(...a),
}));
let mockLocal = { decks: 0, maps: 0, total: 0 };
jest.mock("../../../lib/bag/useBag", () => ({
  useLocalBagRemainder: () => mockLocal,
}));
const mockMigrate = jest.fn();
jest.mock("../../../lib/bag/migrate", () => ({
  migrateLocalBagToAccount: (...a: unknown[]) => mockMigrate(...a),
}));
jest.mock("react-hot-toast", () => {
  const toast: any = () => {};
  toast.success = jest.fn();
  toast.error = jest.fn();
  return { toast };
});

const val = (kb: number) => "x".repeat(Math.round((kb * 1024) / 2));
const wrap = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);

beforeEach(() => {
  mockLocal = { decks: 0, maps: 0, total: 0 };
  mockMigrate.mockReset();
  mockTrack.mockClear();
  (toast.success as jest.Mock).mockClear();
  (toast.error as jest.Mock).mockClear();
});

describe("DeckStats meter", () => {
  it("charges the bag for decks + maps only, and explains the rest", () => {
    const storage = computeStorageBreakdown([
      ["DECKS", val(180)],
      ["MAP_LIST", val(20)],
      ["unbrewed:pro:replay:one", val(3000)],
      ["unbrewed:pro:replay:two", val(3144)],
      ["SERVER_LIST", val(2)],
    ]);
    const { container } = wrap(<DeckStats length={3} storage={storage} />);

    // ~200 KB, not the 6.3 MB the old meter reported (key names add a few bytes)
    expect(container.textContent).toMatch(/200(\.\d+)? KB of 5 MB/);
    expect(container.textContent).toContain("Decks 180 KB");
    expect(container.textContent).toContain("Maps 20 KB");
    expect(container.textContent).toContain("Replays 6144 KB");
    expect(container.textContent).toContain("Other 2 KB");
    expect(screen.getByRole("link", { name: "Replays" })).toHaveAttribute("href", "/pro/replays");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
    expect(container.textContent).toContain("3decks");
  });

  it("clamps the text and the bar when the bag itself overflows", () => {
    const storage = computeStorageBreakdown([["DECKS", val(6000)]]);
    const { container } = wrap(<DeckStats length={1} storage={storage} />);
    expect(container.textContent).toContain("5120 KB of 5 MB");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("a guest gets the Discord sign-in, through the existing login flow", () => {
    const storage = computeStorageBreakdown([["DECKS", val(10)]]);
    wrap(<DeckStats length={1} storage={storage} />);
    const cta = screen.getByRole("link", { name: /Sign in with Discord/ });
    expect(cta).toHaveAttribute("href", expect.stringContaining("/auth/discord?return_to=%2Fbag"));
    expect(screen.getByText(/no 5 MB browser limit/)).toBeInTheDocument();
    fireEvent.click(cta);
    expect(mockTrack).toHaveBeenCalledWith("login_started", { provider: "discord", from_page: "/" });
    expect(screen.queryByRole("button", { name: /Push to cloud/ })).toBeNull();
  });

  describe("when signed in", () => {
    it("drops the bar entirely once nothing is left on this device", () => {
      const storage = computeStorageBreakdown([["unbrewed:pro:replay:one", val(3000)]]);
      const { container } = wrap(<DeckStats length={4} storage={storage} isSignedIn />);
      expect(container.textContent).toContain("4decksin your account");
      expect(container.textContent).toContain("Saved to your account");
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(screen.queryByRole("button", { name: /Push to cloud/ })).toBeNull();
      expect(screen.queryByRole("link", { name: /Sign in with Discord/ })).toBeNull();
    });

    it("keeps the bar and offers Push to cloud while decks remain on the device", async () => {
      mockLocal = { decks: 2, maps: 1, total: 3 };
      mockMigrate.mockResolvedValue({ moved: 3, kept: [], items: [] });
      const storage = computeStorageBreakdown([["DECKS", val(180)]]);
      const { container } = wrap(<DeckStats length={5} storage={storage} isSignedIn />);

      expect(container.textContent).toMatch(/180(\.\d+)? KB of 5 MB/);
      expect(screen.getByText(/2 decks and 1 map are still only in this browser/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Push to cloud/ }));
      expect(mockMigrate).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Moved 3 items to your account"));
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("says what stayed behind, and when the account couldn't be reached", async () => {
      mockLocal = { decks: 1, maps: 0, total: 1 };
      mockMigrate.mockResolvedValueOnce({
        moved: 0,
        kept: [{ kind: "decks", id: "a", name: "Alpha", ok: false, reason: "too_large" }],
        items: [],
      });
      const storage = computeStorageBreakdown([["DECKS", val(180)]]);
      const { unmount } = wrap(<DeckStats length={1} storage={storage} isSignedIn />);
      fireEvent.click(screen.getByRole("button", { name: /Push to cloud/ }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/1 item stayed on this device: .*256 KB/)),
      );
      unmount();

      mockMigrate.mockResolvedValueOnce({ moved: 0, kept: [], items: [], blocked: "unavailable" });
      wrap(<DeckStats length={1} storage={storage} isSignedIn />);
      fireEvent.click(screen.getByRole("button", { name: /Push to cloud/ }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Couldn't reach your account/)),
      );
    });
  });
});
