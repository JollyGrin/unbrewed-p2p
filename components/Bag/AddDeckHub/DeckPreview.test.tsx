/**
 * #1538 review: the preview's three actions share one in-flight save, so a
 * second tap during a slow save neither pushes twice nor sends two events.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DeckPreview } from "./DeckPreview";

const mockPush = jest.fn(async (..._a: unknown[]) => true);
jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, push: (...a: unknown[]) => mockPush(...a) }),
}));
const mockTrack = jest.fn();
jest.mock("../../../lib/analytics", () => ({
  ...jest.requireActual("../../../lib/analytics"),
  track: (...a: unknown[]) => mockTrack(...a),
}));

const deck = {
  id: "d1",
  name: "Alpha",
  deck_data: { cards: [], appearance: {}, hero: { hp: 15, move: 2, isRanged: false, name: "Alpha" } },
} as unknown as DeckImportType;

it("Solo table then Invite a friend during a slow save: one save, one table, one event", async () => {
  let finish: (id: string) => void = () => {};
  const onSave = jest.fn(() => new Promise<string | undefined>((resolve) => (finish = resolve)));
  render(
    <ChakraProvider>
      <DeckPreview deck={deck} source="test" onSave={onSave} />
    </ChakraProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "▶ Solo table" }));
  expect(screen.getByRole("button", { name: "⚔ Invite a friend" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Save for later/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "⚔ Invite a friend" }));
  fireEvent.click(screen.getByRole("button", { name: /Save for later/ }));
  expect(onSave).toHaveBeenCalledTimes(1);

  await act(async () => finish("d1"));
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/offline", query: { deckId: "d1" } });
  expect(mockTrack).toHaveBeenCalledTimes(1);
  expect(mockTrack).toHaveBeenCalledWith("bag_table_opened", { destination: "offline", from: "preview" });
  await waitFor(() => expect(screen.getByRole("button", { name: "⚔ Invite a friend" })).not.toBeDisabled());
});
