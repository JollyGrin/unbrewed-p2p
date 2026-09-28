/**
 * "This deck's map" in the map modal (#1028): fetch only on the press, one
 * lookup per modal, both actions, and one quiet line when there is no map.
 * Real Lucy & Piper / Pink Panther rows and hosted saves from lib/labs/fixtures.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeckMapEntry } from "./deckMap.entry";
import lucy from "@/lib/labs/fixtures/set-by-slug.lucy-piper.json";
import pink from "@/lib/labs/fixtures/set-by-slug.pink-panther.json";
import lucySave from "@/lib/labs/fixtures/tts-save.lucy-piper.json";
import pinkSave from "@/lib/labs/fixtures/tts-save.pink-panther.json";
import { LABS_TTS_ASSETS, fetchLabsDeck } from "@/lib/labs/fetch";
import { LabsSetRow } from "@/lib/labs/labs.type";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";

jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const LUCY = (lucy as unknown as LabsSetRow[])[0];
const PINK = (pink as unknown as LabsSetRow[])[0];
const LUCY_ID = "char_2dd4ea0c-a02c-4297-aeb1-5b761489e1c3";
const PINK_ID = "char_dc1ed800-ebe2-4eeb-9487-97e15a7ac956";
const BACKYARD =
  "https://kyqcvbnxfmpnbwtikzxp.supabase.co/storage/v1/object/public/tts-assets/3acb4605-5d8f-4492-ac70-18e348fa8e19/set_d9326fea-f3d8-4d20-9976-7b1b657c384d/map/lucy-piper-the-backyard-f6293ce6.jpg";

const json = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: async () => body } as Response);

const labsFetch = (row: LabsSetRow, save: unknown, down = false) =>
  jest.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (down) throw new TypeError("Failed to fetch");
    if (u.includes("gallery_characters")) return json([{ slug: row.slug }]);
    if (u.includes("rpc/set_by_slug")) return json([row]);
    if (u.includes("profiles")) return json([{ display_name: "Tombadil Bombadil" }]);
    if (u.includes("rpc/published_tts_save")) return json([{ save_path: "a/b/save.json" }]);
    if (u.startsWith(LABS_TTS_ASSETS)) return json(JSON.parse(JSON.stringify(save)));
    throw new Error(`unexpected ${u}`);
  }) as unknown as jest.MockedFunction<typeof fetch>;

/** Calls to Labs / its storage; the bag's own `/me` probe is not ours. */
const labsCalls = (f: jest.MockedFunction<typeof fetch>) =>
  f.mock.calls.filter(([u]) => String(u).includes("supabase.co")).length;

const deckOf = (row: LabsSetRow, id: string, save: unknown) =>
  fetchLabsDeck({ kind: "character", characterId: id }, labsFetch(row, save));

const show = (deck: DeckImportType, onUse = jest.fn()) => {
  render(
    <ChakraProvider>
      <DeckMapEntry deck={deck} onUse={onUse} />
    </ChakraProvider>,
  );
  return onUse;
};

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});
beforeEach(() => {
  localStorage.clear();
  __resetBagStoresForTests();
});

describe("DeckMapEntry", () => {
  it("fetches only on the press; both buttons work; a second press does not refetch", async () => {
    const deck = await deckOf(LUCY, LUCY_ID, lucySave);
    const fetchMock = labsFetch(LUCY, lucySave);
    global.fetch = fetchMock;
    const onUse = show(deck);

    const entry = screen.getByRole("button", { name: /This deck's map/ });
    expect(entry).toHaveTextContent(LUCY.name);
    expect(labsCalls(fetchMock)).toBe(0);

    fireEvent.click(entry);
    expect(await screen.findByAltText("the backyard preview")).toHaveAttribute("src", BACKYARD);
    const calls = labsCalls(fetchMock);
    expect(calls).toBeGreaterThan(0);

    fireEvent.click(entry); // collapse
    fireEvent.click(entry); // expand again
    expect(await screen.findByAltText("the backyard preview")).toBeInTheDocument();
    expect(labsCalls(fetchMock)).toBe(calls);

    fireEvent.click(screen.getByRole("button", { name: "Use for this room" }));
    expect(onUse).toHaveBeenCalledWith(BACKYARD);

    fireEvent.click(screen.getByRole("button", { name: "Save to my maps" }));
    await waitFor(() => expect(screen.getByText("Saved in your maps")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save to my maps" })).toBeNull();
    const stored = JSON.parse(localStorage.getItem("MAP_LIST") ?? "[]");
    expect(stored).toEqual([
      {
        imgUrl: BACKYARD,
        meta: { title: "the backyard", author: "Tombadil Bombadil" },
        labsSlug: LUCY.slug,
      },
    ]);
  });

  it("shows a map already in the bag as saved, with only Use for this room", async () => {
    localStorage.setItem(
      "MAP_LIST",
      JSON.stringify([{ imgUrl: BACKYARD, meta: { title: "the backyard" }, labsSlug: LUCY.slug }]),
    );
    __resetBagStoresForTests();
    const deck = await deckOf(LUCY, LUCY_ID, lucySave);
    global.fetch = labsFetch(LUCY, lucySave);
    show(deck);

    fireEvent.click(screen.getByRole("button", { name: /This deck's map/ }));
    expect(await screen.findByText("Saved in your maps")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save to my maps" })).toBeNull();
    expect(screen.getByRole("button", { name: "Use for this room" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("MAP_LIST") ?? "[]")).toHaveLength(1);
  });

  it("says the set has no map for Pink Panther, with nothing else", async () => {
    const deck = await deckOf(PINK, PINK_ID, pinkSave);
    global.fetch = labsFetch(PINK, pinkSave);
    show(deck);

    fireEvent.click(screen.getByRole("button", { name: /This deck's map/ }));
    expect(await screen.findByText("This set has no map to bring in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use for this room" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save to my maps" })).toBeNull();
  });

  it("says the same when the lookup fails, and does not retry", async () => {
    const deck = await deckOf(LUCY, LUCY_ID, lucySave);
    const fetchMock = labsFetch(LUCY, lucySave, true);
    global.fetch = fetchMock;
    show(deck);

    const entry = screen.getByRole("button", { name: /This deck's map/ });
    fireEvent.click(entry);
    expect(await screen.findByText("This set has no map to bring in")).toBeInTheDocument();
    const calls = labsCalls(fetchMock);
    fireEvent.click(entry);
    fireEvent.click(entry);
    expect(labsCalls(fetchMock)).toBe(calls);
  });

  it("renders nothing and fetches nothing for a deck from another source", () => {
    const fetchMock = labsFetch(LUCY, lucySave);
    global.fetch = fetchMock;
    show({ id: "pk1x", name: "Not Labs" } as unknown as DeckImportType);
    expect(screen.queryByText(/This deck's map/)).toBeNull();
    expect(labsCalls(fetchMock)).toBe(0);
  });
});
