import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { TokenLibraryModal } from "./token-library.modal";

jest.mock("../../lib/icons/gameIcons", () => ({
  iconLabel: (n: string) => n,
  searchIcons: () => [],
  useGameIcons: () => null,
}));
jest.mock("react-hot-toast", () => ({ toast: { success: jest.fn() } }));
// jsdom cannot parse the tabbable selector focus-lock uses.
jest.mock("@chakra-ui/focus-lock", () => ({
  FocusLock: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("react-color", () => ({ CirclePicker: () => null }));

const renderModal = (heroTokens?: { kind: "hero" | "sidekick"; name: string; imageUrl: string }[]) => {
  const onAdd = jest.fn();
  render(
    <ChakraProvider>
      <TokenLibraryModal
        isOpen
        onClose={() => {}}
        color="#fff"
        onColorChange={() => {}}
        tokens={[]}
        linkedHp={{}}
        heroTokens={heroTokens}
        onAdd={onAdd}
        onPatch={() => {}}
        onDelete={() => {}}
      />
    </ChakraProvider>,
  );
  return onAdd;
};

describe("TokenLibraryModal hero token", () => {
  it("hides the button without an image", () => {
    renderModal([]);
    expect(screen.queryByRole("button", { name: /hero token/i })).toBeNull();
  });

  it("adds a round labelled image token when pressed", () => {
    const onAdd = renderModal([
      { kind: "hero", name: "Alice", imageUrl: "https://cdn.example/a.webp" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /hero token/i }));
    expect(onAdd).toHaveBeenCalledWith({
      imageUrl: "https://cdn.example/a.webp",
      clip: "circle",
      label: "Alice",
      size: 72,
      h: 72,
    });
  });
});
