import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { TokenLibraryModal } from "./token-library.modal";

// p2p #1605: the picker retries a failed icon load each time it opens (never
// on close), and says so when the load failed instead of spinning forever.

let mockFailed = false;
const mockLoad = jest.fn((_enabled: boolean, _retryKey: unknown) => ({ icons: null, failed: mockFailed }));
jest.mock("../../lib/icons/gameIcons", () => ({
  iconLabel: (n: string) => n,
  searchIcons: () => [],
  useGameIconsLoad: (enabled: boolean, retryKey: unknown) => mockLoad(enabled, retryKey),
}));
jest.mock("react-hot-toast", () => ({ toast: { success: jest.fn() } }));
// jsdom cannot parse the tabbable selector focus-lock uses.
jest.mock("@chakra-ui/focus-lock", () => ({
  FocusLock: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("react-color", () => ({ CirclePicker: () => null }));

const modal = (isOpen: boolean) => (
  <ChakraProvider>
    <TokenLibraryModal
      isOpen={isOpen}
      onClose={() => {}}
      color="#fff"
      onColorChange={() => {}}
      tokens={[]}
      linkedHp={{}}
      onAdd={() => {}}
      onPatch={() => {}}
      onDelete={() => {}}
    />
  </ChakraProvider>
);

/** The retry key of the last render that asked for icons. */
const lastEnabledKey = () => [...mockLoad.mock.calls].reverse().find(([enabled]) => enabled)?.[1];

beforeEach(() => {
  mockFailed = false;
  mockLoad.mockClear();
});

it("bumps the retry key on each open, not on close", () => {
  const { rerender } = render(modal(false));
  expect(mockLoad.mock.calls.every(([enabled]) => !enabled)).toBe(true);

  rerender(modal(true));
  const first = lastEnabledKey();
  expect(first).toBeDefined();

  rerender(modal(false));
  // Closed (no icon tokens): not enabled, so no load at all, whatever the key.
  const closed = mockLoad.mock.calls.at(-1)!;
  expect(closed[0]).toBe(false);

  rerender(modal(true));
  const second = lastEnabledKey();
  expect(second).not.toBe(first);
});

it("keeps the key when closing with an icon token on the board (closing does not retry)", () => {
  const withIcon = (isOpen: boolean) => (
    <ChakraProvider>
      <TokenLibraryModal
        isOpen={isOpen}
        onClose={() => {}}
        color="#fff"
        onColorChange={() => {}}
        tokens={[{ id: "t1", icon: "GiFireShield" } as never]}
        linkedHp={{}}
        onAdd={() => {}}
        onPatch={() => {}}
        onDelete={() => {}}
      />
    </ChakraProvider>
  );
  const { rerender } = render(withIcon(true));
  const open = mockLoad.mock.calls.at(-1)![1];
  rerender(withIcon(false));
  expect(mockLoad.mock.calls.at(-1)).toEqual([true, open]);
});

it("a failed load says so instead of spinning", () => {
  mockFailed = true;
  render(modal(true));
  expect(screen.getByText(/couldn't load icons/i)).toBeTruthy();
  expect(screen.getByText(/Close and reopen this window to try again/)).toBeTruthy();
});
