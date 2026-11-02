/**
 * Browser translation vs /connect (#1528). Chrome's Google Translate replaces
 * each text node it translates with a <font> wrapper. React still holds the
 * original node, so using it as an insertBefore/removeChild reference throws
 * `NotFoundError`. That crashed the page in prod when a zh-CN visitor clicked
 * Connect to Game (the spinner is inserted before the label).
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConnectPage } from "./index";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";

const push = jest.fn();
let mockDeckImporting = false;

jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, push, prefetch: jest.fn() }),
}));
// Never answers: the button stays in its loading state.
jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn(() => new Promise(() => {})) },
}));
jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("../SiteNav", () => ({ SiteNav: () => null }));
jest.mock("../Discord", () => ({ DiscordPresence: () => null }));
jest.mock("../Settings/settings.modal", () => ({
  SettingsModal: () => null,
}));
jest.mock("../../lib/account/useAccount", () => ({
  useAccount: () => ({ status: "guest" }),
}));
jest.mock("../../lib/hooks", () => ({
  ...jest.requireActual("../../lib/hooks"),
  useLoadRouterDeck: () => ({ isLoading: mockDeckImporting, error: undefined }),
}));
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({
    starredDeck: { id: "d", name: "Deck" },
    decks: [{ id: "d", name: "Deck" }],
    setStar: jest.fn(),
    isLoading: false,
  }),
  useBagMaps: () => ({ data: [] }),
}));
jest.mock("../../lib/analytics", () => ({ track: jest.fn() }));
jest.mock("./SelectedDeck", () => ({ SelectedDeckContainer: () => null }));

Element.prototype.scrollIntoView = jest.fn();

const page = () => (
  <QueryClientProvider client={new QueryClient()}>
    <ChakraProvider>
      <ConnectPage />
    </ChakraProvider>
  </QueryClientProvider>
);

/** What Google Translate does: swap the text node for <font><font>…</font></font>. */
const translate = (text: string, into: string) => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue === text) {
      const outer = document.createElement("font");
      const inner = document.createElement("font");
      inner.textContent = into;
      outer.appendChild(inner);
      node.parentNode!.replaceChild(outer, node);
      return;
    }
  }
  throw new Error(`no text node "${text}"`);
};

const connectButton = () =>
  screen.getAllByRole("button").find((b) => /连接到游戏|正在导入|Connect to Game|Importing/.test(b.textContent ?? ""))!;

beforeEach(() => {
  push.mockClear();
  mockDeckImporting = false;
  localStorage.clear();
  __resetBagStoresForTests();
});

describe("/connect survives Google Translate (#1528)", () => {
  it("clicking a translated Connect to Game shows the spinner instead of crashing", () => {
    render(page());
    translate("Connect to Game", "连接到游戏");

    expect(() => fireEvent.click(connectButton())).not.toThrow();

    const button = connectButton();
    expect(button).toBeDisabled();
    expect(button.querySelector(".chakra-spinner")).toBeInTheDocument();
    expect(button).toHaveTextContent("连接到游戏");
  });

  it("the label switching from Importing to Connect doesn't crash either", () => {
    mockDeckImporting = true;
    const { rerender } = render(page());
    translate("Importing your deck…", "正在导入您的牌组…");

    mockDeckImporting = false;
    expect(() => act(() => rerender(page()))).not.toThrow();

    const button = connectButton();
    expect(button).toHaveTextContent("Connect to Game");
    expect(button).not.toHaveTextContent("正在导入");
    expect(button.querySelector(".chakra-spinner")).not.toBeInTheDocument();
  });
});
