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
import { __resetBagStoresForTests, bagItems, stores } from "@/lib/bag/bagStore";
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
