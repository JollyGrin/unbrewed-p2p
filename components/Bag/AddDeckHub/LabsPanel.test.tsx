/**
 * #1002: the Labs panel's "also add this set's map" checkbox, on the real
 * Lucy & Piper set row and hosted save.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import lucy from "@/lib/labs/fixtures/set-by-slug.lucy-piper.json";
import lucySave from "@/lib/labs/fixtures/tts-save.lucy-piper.json";
import pink from "@/lib/labs/fixtures/set-by-slug.pink-panther.json";
import pinkSave from "@/lib/labs/fixtures/tts-save.pink-panther.json";
import { LABS_TTS_ASSETS, LabsSetRow } from "@/lib/labs";
import { __resetBagStoresForTests, addItem, bagItems, stores } from "@/lib/bag/bagStore";
import { useBagDecks } from "@/lib/bag/useBag";
import { toast } from "react-hot-toast";
import { LabsPanel } from "./LabsPanel";

jest.mock("react-hot-toast", () => {
  const toast: any = () => {};
  toast.success = jest.fn();
  toast.error = jest.fn();
  return { toast };
});

const LUCY = (lucy as unknown as LabsSetRow[])[0];
const PINK = (pink as unknown as LabsSetRow[])[0];
const json = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: async () => body } as Response);

const mockLabs = (row: LabsSetRow, save: unknown, saveOk = true) => {
  global.fetch = jest.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("rpc/set_by_slug")) return json([row]);
    if (u.includes("profiles")) return json([{ display_name: "Tombadil Bombadil" }]);
    if (u.includes("rpc/published_tts_save")) {
      return saveOk ? json([{ save_path: "a/b/save.json" }]) : json([]);
    }
    if (u.startsWith(LABS_TTS_ASSETS)) return json(JSON.parse(JSON.stringify(save)));
    throw new Error(`unexpected ${u}`);
  }) as unknown as typeof fetch;
};

const openSet = async (row: LabsSetRow) => {
  const pushDeck = jest.fn(async () => true);
  render(
    <ChakraProvider>
      <LabsPanel pushDeck={pushDeck} setStar={() => {}} />
    </ChakraProvider>,
  );
  fireEvent.change(screen.getByLabelText("Unmatched Labs link"), {
    target: { value: `https://www.unmatchedlabs.com/shared/${row.slug}` },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  await screen.findByText(/^From “/);
  return pushDeck;
};

const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Save & use/ }));
  await waitFor(() => expect(screen.queryByText(/^From “/)).not.toBeInTheDocument());
};

const maps = () => bagItems(stores.maps);

beforeEach(() => {
  localStorage.clear();
  __resetBagStoresForTests();
});

describe("LabsPanel map checkbox", () => {
  it("offers the backyard, off by default, and adds nothing when left off", async () => {
    mockLabs(LUCY, lucySave);
    const pushDeck = await openSet(LUCY);
    const box = screen.getByRole("checkbox", { name: /Also add this set's map \(the backyard\) to my maps/ });
    expect(box).not.toBeChecked();
    await save();
    expect(pushDeck).toHaveBeenCalledTimes(1);
    expect(maps()).toEqual([]);
  });

  it("ticked: adds the map, and importing again does not duplicate it", async () => {
    mockLabs(LUCY, lucySave);
    for (let i = 0; i < 2; i++) {
      __resetBagStoresForTests();
      if (i === 0) {
        await openSet(LUCY);
      } else {
        document.body.innerHTML = "";
        await openSet(LUCY);
      }
      const box = screen.getByRole("checkbox");
      fireEvent.click(box);
      // an added map moves from "not imported" to the "Imported" line
      expect(screen.getByTestId("labs-skipped")).toHaveTextContent(/Imported: .*1 map\./);
      expect(screen.getByTestId("labs-skipped")).not.toHaveTextContent(/Not imported from this set: .*1 map/);
      await save();
    }
    expect(maps()).toHaveLength(1);
    expect(maps()[0]).toMatchObject({
      imgUrl: expect.stringContaining("/map/lucy-piper-the-backyard-"),
      meta: { title: "the backyard", author: "Tombadil Bombadil" },
      labsSlug: LUCY.slug,
    });
  });

  it("a republished set's map replaces the older import of it, keeping its star (#1029)", async () => {
    const OLD = `${LABS_TTS_ASSETS}/owner/set_old/map/lucy-piper-the-backyard-00000000.jpg`;
    const other = { imgUrl: "https://example.test/other.jpg", meta: { title: "other" } };
    await addItem(stores.maps, {
      imgUrl: OLD,
      isStarred: true,
      meta: { title: "the backyard" },
      labsSlug: LUCY.slug,
    });
    await addItem(stores.maps, other);
    mockLabs(LUCY, lucySave);
    await openSet(LUCY);
    fireEvent.click(screen.getByRole("checkbox"));
    await save();
    await waitFor(() => expect(maps()).toHaveLength(2));
    expect(maps().map((m) => m.imgUrl)).not.toContain(OLD);
    expect(maps()).toContainEqual(other);
    expect(maps()).toContainEqual(
      expect.objectContaining({
        imgUrl: expect.stringContaining("/map/lucy-piper-the-backyard-"),
        isStarred: true,
        labsSlug: LUCY.slug,
      }),
    );
  });

  it("Pink Panther: no checkbox", async () => {
    mockLabs(PINK, pinkSave);
    await openSet(PINK);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("save lookup fails: no checkbox, the deck still imports", async () => {
    mockLabs(LUCY, lucySave, false);
    const pushDeck = await openSet(LUCY);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await save();
    expect(pushDeck).toHaveBeenCalledTimes(1);
    expect(maps()).toEqual([]);
  });
});

/**
 * #1033: re-importing a Labs deck the player has changed asks in the page,
 * with the real pushDeck. Keep mine stores nothing and toasts no success.
 */
describe("LabsPanel re-import of an edited deck", () => {
  const RealPanel = () => {
    const { pushDeck } = useBagDecks();
    return <LabsPanel pushDeck={pushDeck} setStar={() => {}} />;
  };

  const importLucy = async () => {
    document.body.innerHTML = "";
    render(
      <ChakraProvider>
        <RealPanel />
      </ChakraProvider>,
    );
    fireEvent.change(screen.getByLabelText("Unmatched Labs link"), {
      target: { value: `https://www.unmatchedlabs.com/shared/${LUCY.slug}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await screen.findByText(/^From “/);
  };

  const savedDecks = () => JSON.parse(localStorage.getItem("DECKS") ?? "[]");

  it("asks inline; Keep mine keeps the edit, Replace takes the import", async () => {
    mockLabs(LUCY, lucySave);
    await importLucy();
    await save();
    expect(savedDecks()).toHaveLength(1);

    // the player picks a token colour in /bag
    localStorage.setItem(
      "DECKS",
      JSON.stringify([{ ...savedDecks()[0], savedTokenColor: "#ff0000" }]),
    );
    __resetBagStoresForTests();
    (toast.success as jest.Mock).mockClear();

    await importLucy();
    fireEvent.click(screen.getByRole("button", { name: /Save & use/ }));
    const prompt = await screen.findByTestId("replace-deck-confirm");
    expect(prompt).toHaveTextContent(/with changes you made: token colour/);
    expect(screen.getByRole("button", { name: /Save & use/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    await waitFor(() =>
      expect(screen.queryByTestId("replace-deck-confirm")).not.toBeInTheDocument(),
    );
    expect(savedDecks()).toHaveLength(1);
    expect(savedDecks()[0].savedTokenColor).toBe("#ff0000");
    expect(toast.success).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Save & use/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Replace" }));
    await waitFor(() => expect(screen.queryByText(/^From “/)).not.toBeInTheDocument());
    expect(savedDecks()).toHaveLength(1);
    expect(savedDecks()[0].savedTokenColor).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/saved & ready to play/));
  });

  it("re-imports an unedited deck without asking", async () => {
    mockLabs(LUCY, lucySave);
    await importLucy();
    await save();
    __resetBagStoresForTests();

    await importLucy();
    await save();
    expect(screen.queryByTestId("replace-deck-confirm")).not.toBeInTheDocument();
    expect(savedDecks()).toHaveLength(1);
  });
});
