/**
 * The Collection nav dot (p2p #1657): the account chip — where the Collection
 * link lives — carries a dot while some hero has an affordable upgrade the
 * player has not opened on /collection, and drops it the moment they have.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { AccountChip } from "./AccountChip";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetUpgradeSeenForTest, markUpgradeSeen, noteAffordableUpgrade } from "@/lib/collection/upgradeSeen";

jest.mock("../../lib/tournaments/useNextMatch", () => ({ useMyTournaments: () => null }));
jest.mock("../../lib/tournaments/nextMatch", () => ({ nextMatchView: () => null }));
jest.mock("next/router", () => ({ useRouter: () => ({ asPath: "/" }) }));

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const renderChip = () =>
  render(
    <ChakraProvider>
      <AccountChip />
    </ChakraProvider>,
  );

beforeEach(() => {
  __resetAccountStoreForTests();
  window.localStorage.clear();
  __resetUpgradeSeenForTest();
  global.fetch = jest.fn().mockResolvedValue(reply(200, { user: { id: "u1", username: "JollyGrin" } })) as unknown as typeof fetch;
});

it("no dot when nothing is waiting", async () => {
  renderChip();
  await screen.findByText("JollyGrin");
  expect(screen.queryByTestId("collection-nav-dot")).toBeNull();
  expect(screen.getByLabelText("Account: JollyGrin")).toBeInTheDocument();
});

it("appears when a game makes an upgrade affordable, on the chip and on the Collection item, and clears on the visit", async () => {
  renderChip();
  await screen.findByText("JollyGrin");

  act(() => noteAffordableUpgrade("hollow-oak", 1));
  expect(screen.getAllByTestId("collection-nav-dot")).toHaveLength(1);
  const chip = screen.getByLabelText("Account: JollyGrin, upgrade available");

  fireEvent.click(chip);
  const collection = await screen.findByText("Collection");
  expect(collection.querySelector('[data-testid="collection-nav-dot"]')).not.toBeNull();
  expect(screen.getAllByTestId("collection-nav-dot")).toHaveLength(2);

  // What /collection does when that hero is on screen.
  act(() => markUpgradeSeen("hollow-oak"));
  expect(screen.queryByTestId("collection-nav-dot")).toBeNull();
});

it("a stored dot survives a page load", async () => {
  noteAffordableUpgrade("hollow-oak", 1);
  __resetUpgradeSeenForTest();
  renderChip();
  await screen.findByText("JollyGrin");
  expect(screen.getByTestId("collection-nav-dot")).toBeInTheDocument();
});
