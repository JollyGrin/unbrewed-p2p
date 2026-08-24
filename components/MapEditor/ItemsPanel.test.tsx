/**
 * The scheme-effect builder as an author actually drives it (unbrewed-p2p-693):
 * pick effects from the menu, set amounts, stack them, and never see JSON. The
 * panel is presentational, so the test holds the doc itself and re-renders with
 * whatever `setItemField` produced — the same loop the history layer runs.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { useState } from "react";
import { ItemsPanel } from "./ItemsPanel";
import type { MapItem } from "./model";
import { addItem, emptyDoc } from "./model";

/** Mounts the panel over live state so edits accumulate exactly as in the editor. */
const Harness = ({ initial }: { initial: MapItem[] }) => {
  const [items, setItems] = useState<MapItem[]>(initial);
  return (
    <ChakraProvider>
      <ItemsPanel
        items={items}
        addItem={(kind) => setItems((cur) => addItem({ ...emptyDoc(), items: cur }, kind).doc.items!)}
        setItemField={(id, patch) =>
          setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)))
        }
        removeItem={(id) => setItems((cur) => cur.filter((i) => i.id !== id))}
        beginEdit={() => {}}
        endEdit={() => {}}
      />
      <pre data-testid="doc">{JSON.stringify(items)}</pre>
    </ChakraProvider>
  );
};

const doc = (): MapItem[] => JSON.parse(screen.getByTestId("doc").textContent!);
const scheme = () => doc().find((i) => i.kind === "scheme")!;
const effectSelects = () => screen.getAllByLabelText("effect") as HTMLSelectElement[];

const EMPTY_SCHEME: MapItem = { id: "item1", kind: "scheme", label: "Wedding Cake", ops: [] };

describe("scheme effect builder", () => {
  it("opens an empty-ops item in the builder, not the raw-JSON fallback", () => {
    render(<Harness initial={[EMPTY_SCHEME]} />);
    expect(screen.queryByLabelText("ops (raw JSON)")).not.toBeInTheDocument();
    expect(screen.getByText(/no effect yet/i)).toBeInTheDocument();
  });

  it("authors 'Recover 2 health' from the menu with no JSON typed", () => {
    render(<Harness initial={[EMPTY_SCHEME]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ effect" }));
    // "+ effect" adds heal at its default amount of 2 — the reporter's item2.
    expect(scheme().ops).toEqual([{ op: "heal", target: "SELF", amount: 2 }]);
    expect(scheme().text).toBe("Recover 2 health.");
    expect(screen.getByText(/players see: “Recover 2 health\.”/)).toBeInTheDocument();
  });

  it("switches an effect's kind from the menu", () => {
    render(<Harness initial={[EMPTY_SCHEME]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ effect" }));
    fireEvent.change(effectSelects()[0], { target: { value: "search" } });
    expect(scheme().ops).toEqual([{ op: "search", from: "DISCARD" }]);
    expect(scheme().text).toBe("Return a card from your discard pile to your hand.");
  });

  it("edits an amount", () => {
    render(<Harness initial={[EMPTY_SCHEME]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ effect" }));
    fireEvent.change(effectSelects()[0], { target: { value: "draw" } });
    fireEvent.change(screen.getByLabelText("Draw cards amount"), { target: { value: "3" } });
    expect(scheme().ops).toEqual([{ op: "draw", who: "SELF", amount: 3 }]);
    expect(scheme().text).toBe("Draw 3 cards.");
  });

  it("stacks effects, in order, and removes one", () => {
    render(<Harness initial={[EMPTY_SCHEME]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ effect" })); // heal 2
    fireEvent.click(screen.getByRole("button", { name: "+ effect" })); // heal 2
    fireEvent.change(effectSelects()[1], { target: { value: "search" } });
    expect(scheme().ops).toEqual([
      { op: "heal", target: "SELF", amount: 2 },
      { op: "search", from: "DISCARD" },
    ]);
    expect(scheme().text).toBe("Recover 2 health. Return a card from your discard pile to your hand.");

    fireEvent.click(screen.getAllByRole("button", { name: "remove effect" })[0]);
    expect(scheme().ops).toEqual([{ op: "search", from: "DISCARD" }]);
  });

  it("a freshly added scheme item is born with a real effect", () => {
    render(<Harness initial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ scheme" }));
    expect(scheme().ops).toEqual([{ op: "draw", who: "SELF", amount: 1 }]);
    expect(effectSelects()[0].value).toBe("draw");
  });
});

describe("advanced escape hatch", () => {
  it("stays hidden until asked for, and round-trips builder-shaped ops back", () => {
    render(<Harness initial={[EMPTY_SCHEME]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ effect" }));
    fireEvent.click(screen.getByRole("button", { name: "advanced (raw JSON)" }));

    const raw = screen.getByLabelText("ops (raw JSON)") as HTMLTextAreaElement;
    expect(JSON.parse(raw.value)).toEqual([{ op: "heal", target: "SELF", amount: 2 }]);

    // ops still match a menu entry, so going back is lossless and silent
    fireEvent.click(screen.getByRole("button", { name: "← effect builder" }));
    expect(screen.queryByLabelText("ops (raw JSON)")).not.toBeInTheDocument();
    expect(effectSelects()[0].value).toBe("heal");
  });

  it("opens in advanced mode for ops outside the menu, with an editable text field", () => {
    render(
      <Harness
        initial={[{ id: "item1", kind: "scheme", label: "Bomb", ops: [{ op: "dealDamage", amount: 1 }] }]}
      />
    );
    expect(screen.getByLabelText("ops (raw JSON)")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("effect text (required)"), {
      target: { value: "Deal 1 damage." },
    });
    expect(scheme().text).toBe("Deal 1 damage.");
  });

  it("warns before discarding advanced ops on the way back to the builder", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <Harness
        initial={[{ id: "item1", kind: "scheme", label: "Bomb", ops: [{ op: "dealDamage", amount: 1 }] }]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "← effect builder" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(scheme().ops).toEqual([{ op: "dealDamage", amount: 1 }]); // declined: untouched

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "← effect builder" }));
    expect(scheme().ops).toEqual([{ op: "draw", who: "SELF", amount: 1 }]);
    expect(screen.queryByLabelText("ops (raw JSON)")).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});

it("combat items are unchanged — value input, no effect menu", () => {
  render(<Harness initial={[{ id: "item1", kind: "combat", label: "Rose Bouquet", value: 2 }]} />);
  expect(screen.queryByLabelText("effect")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("item1 value"), { target: { value: "3" } });
  expect(doc()[0].value).toBe(3);
});
