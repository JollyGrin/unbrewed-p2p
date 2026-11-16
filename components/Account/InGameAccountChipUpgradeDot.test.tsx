/**
 * The upgrade dot on the in-game HUD chip (p2p #1666). The post-game strip is
 * what announces an upgrade, and it lives on the game page: the dot has to be
 * drawn on THAT page's account chip, or a player who follows "Upgrade" (which
 * marks it seen) never sees it at all.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { InGameAccountChip } from "./AccountChip";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetUpgradeSeenForTest, markUpgradeSeen, noteAffordableUpgrade } from "@/lib/collection/upgradeSeen";

jest.mock("../../lib/tournaments/useNextMatch", () => ({ useMyTournaments: () => null }));
jest.mock("../../lib/tournaments/nextMatch", () => ({ nextMatchView: () => null }));
jest.mock("next/router", () => ({ useRouter: () => ({ asPath: "/pro/game" }) }));

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const renderChip = (withMenu = true) =>
  render(
    <ChakraProvider>
      <InGameAccountChip withMenu={withMenu} />
    </ChakraProvider>,
  );

const signIn = (user: unknown) => {
  global.fetch = jest.fn().mockResolvedValue(reply(200, { user })) as unknown as typeof fetch;
};

beforeEach(() => {
  __resetAccountStoreForTests();
  window.localStorage.clear();
  __resetUpgradeSeenForTest();
  signIn({ id: "u1", username: "JollyGrin" });
});

it("no dot when nothing is waiting: the chip is what it was", async () => {
  renderChip();
  await screen.findByText("JollyGrin");
  expect(screen.queryByTestId("collection-nav-dot")).toBeNull();
  expect(screen.getByLabelText("Signed in as JollyGrin")).toBeInTheDocument();
});

it("the post-game strip noting an affordable upgrade lights the dot on the HUD chip; opening the hero on /collection clears it", async () => {
  renderChip();
  await screen.findByText("JollyGrin");

  // What ProPostGameNextUp does once the landed game makes Bronze affordable.
  act(() => noteAffordableUpgrade("king-kong", 1));
  const chip = screen.getByLabelText("Signed in as JollyGrin, upgrade available");
  expect(chip.querySelector('[data-testid="collection-nav-dot"]')).not.toBeNull();
  expect(screen.getAllByTestId("collection-nav-dot")).toHaveLength(1);

  act(() => markUpgradeSeen("king-kong"));
  expect(screen.queryByTestId("collection-nav-dot")).toBeNull();
  expect(screen.getByLabelText("Signed in as JollyGrin")).toBeInTheDocument();
});

it("the menu-less phone chip draws it too", async () => {
  noteAffordableUpgrade("king-kong", 1);
  __resetUpgradeSeenForTest();
  renderChip(false);
  await screen.findByText("JollyGrin");
  expect(screen.getByLabelText("Signed in as JollyGrin, upgrade available").querySelector('[data-testid="collection-nav-dot"]')).not.toBeNull();
});

it("a guest's sign-in chip never shows a dot", async () => {
  noteAffordableUpgrade("king-kong", 1);
  __resetUpgradeSeenForTest();
  signIn(null);
  renderChip();
  await screen.findByLabelText("Sign in with Discord");
  expect(screen.queryByTestId("collection-nav-dot")).toBeNull();
});
