/**
 * The mobile game menu's Board item (#870). A portrait phone always draws the
 * flat board, so the page passes `boardViewLockedHint` there: the item must
 * read disabled with the hint and must not call the toggle (which would
 * silently rewrite the stored preference the landscape tabletop relies on).
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProMobileMenu } from "./ProMobileHud";

const renderMenu = (props: Partial<Parameters<typeof ProMobileMenu>[0]> = {}) => {
  const onToggleBoardView = jest.fn();
  render(
    <ChakraProvider>
      <ProMobileMenu status="open" roomId={null} boardView="flat" onToggleBoardView={onToggleBoardView} {...props} />
    </ChakraProvider>,
  );
  act(() => {
    fireEvent.click(screen.getByLabelText("Game menu"));
  });
  // An opened Chakra MenuList stays visibility:hidden in jsdom, so its items
  // have empty accessible names — find the Board item by its text.
  const boardItem = screen
    .getAllByRole("menuitem", { hidden: true })
    .find((el) => el.textContent?.startsWith("Board —"));
  if (!boardItem) throw new Error("Board menu item not rendered");
  return { boardItem, onToggleBoardView };
};

describe("ProMobileMenu board item", () => {
  it("toggles the board view when nothing locks it (landscape / desktop)", () => {
    const { boardItem, onToggleBoardView } = renderMenu();
    expect(boardItem).not.toBeDisabled();
    expect(boardItem.textContent).not.toContain("Tabletop needs landscape");
    fireEvent.click(boardItem);
    expect(onToggleBoardView).toHaveBeenCalledTimes(1);
  });

  it("is disabled with the hint in portrait and leaves the preference alone", () => {
    const { boardItem, onToggleBoardView } = renderMenu({ boardViewLockedHint: "Tabletop needs landscape" });
    expect(boardItem).toBeDisabled();
    expect(boardItem.textContent).toContain("Board — Flat board");
    expect(boardItem.textContent).toContain("Tabletop needs landscape");
    fireEvent.click(boardItem);
    expect(onToggleBoardView).not.toHaveBeenCalled();
  });
});
