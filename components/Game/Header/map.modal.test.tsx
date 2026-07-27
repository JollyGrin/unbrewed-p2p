/**
 * The gallery-first "Change the Map" modal (issue #502).
 *
 * The contract worth pinning down is the split between *selecting* and
 * *applying*: `mapUrl` in the router query is the room-wide sync channel
 * (WebGameProvider broadcasts every change), so clicking a card must never
 * push — only "Set Map" does.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MapModal } from "./map.modal";
import DEFAULT_MAPS from "@/components/Bag/Map/MapModal/defaultMaps.json";
import { DEFAULT_MAP_URL } from "@/lib/maps/defaultMap";

const push = jest.fn();
let mockQuery: Record<string, string> = {};

jest.mock("next/router", () => ({
  useRouter: () => ({ query: mockQuery, push }),
}));

// Chakra's modal focus trap probes the DOM with `:not(:disabled):not([disabled])`,
// which the nwsapi bundled with jsdom 20 rejects as invalid. The trap is not what
// this suite is testing, so stub it out and render the modal contents plainly.
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const LOCAL_MAP = {
  imgUrl: "https://example.com/my-arena.png",
  meta: { title: "My Backyard Arena", author: "grins" },
};

// `useLocalMapStorage` reads localStorage on mount; seeding it is enough.
const seedLocalMaps = (maps: unknown[]) =>
  localStorage.setItem("MAP_LIST", JSON.stringify(maps));

// jsdom has no layout, so scrollIntoView (used to reveal the preselected card)
// is not implemented.
Element.prototype.scrollIntoView = jest.fn();

beforeEach(() => {
  push.mockClear();
  mockQuery = {};
  localStorage.clear();
});

const open = () =>
  render(
    <ChakraProvider>
      <MapModal isOpen onClose={() => {}} />
    </ChakraProvider>,
  );

/** The scrollable card grid — cards are identified by their alt text. */
const cardImage = (title: string) => screen.getByAltText(title);

describe("MapModal — gallery", () => {
  it("renders the built-in maps as a thumbnail grid, no click required", () => {
    open();

    expect(cardImage("The Mended Drum")).toBeInTheDocument();
    expect(cardImage("The Chalk")).toBeInTheDocument();
    // every built-in is on screen; there is no browse step
    expect(screen.queryByText("Browse saved maps")).toBeNull();
  });

  it("uses the lazy-loaded thumbnail snapshot, not the full-size board", () => {
    open();
    expect(cardImage("The Chalk")).toHaveAttribute("loading", "lazy");
    expect(cardImage("The Chalk")).toHaveAttribute(
      "src",
      "/maps/thumb/legacy-the-chalk.webp",
    );
  });

  it("lists saved local maps before the built-ins", () => {
    seedLocalMaps([LOCAL_MAP]);
    open();

    const images = screen
      .getAllByRole("img")
      .map((img) => img.getAttribute("alt"));
    expect(images).toContain("My Backyard Arena");
    expect(images.indexOf("My Backyard Arena")).toBeLessThan(
      images.indexOf("The Chalk"),
    );
  });

  it("preselects the default map and badges it when no map is set", () => {
    open();
    expect(screen.getByText("Default")).toBeInTheDocument();
    // the preview pane shows the default board
    expect(screen.getByAltText("Selected map preview")).toHaveAttribute(
      "src",
      DEFAULT_MAP_URL,
    );
  });

  it("preselects the currently-set map", () => {
    mockQuery = { mapUrl: "/maps/legacy-the-chalk.webp" };
    open();

    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getByAltText("Selected map preview")).toHaveAttribute(
      "src",
      "/maps/legacy-the-chalk.webp",
    );
  });
});

describe("MapModal — filter and search", () => {
  it("narrows the grid by source", () => {
    open();

    const legacyOnly = (DEFAULT_MAPS as { source?: string }[]).filter(
      (m) => m.source === "legacy",
    ).length;
    fireEvent.click(screen.getByRole("button", { name: "Legacy" }));

    // one extra <img> is the preview pane
    expect(screen.getAllByRole("img")).toHaveLength(legacyOnly + 1);
    expect(screen.queryByAltText("Opera House")).toBeInTheDocument();
  });

  it("scopes 'My maps' to saved maps only", () => {
    seedLocalMaps([LOCAL_MAP]);
    open();

    fireEvent.click(screen.getByRole("button", { name: "My maps" }));
    expect(screen.getByAltText("My Backyard Arena")).toBeInTheDocument();
    expect(screen.queryByAltText("The Chalk")).toBeNull();
  });

  it("searches on title and author", () => {
    open();

    fireEvent.change(screen.getByLabelText("Search maps"), {
      target: { value: "mended" },
    });
    expect(screen.getByAltText("The Mended Drum")).toBeInTheDocument();
    expect(screen.queryByAltText("Aperature Labs")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search maps"), {
      target: { value: "vediano" },
    });
    expect(screen.getByAltText("Aperature Labs")).toBeInTheDocument();
    expect(screen.queryByAltText("The Mended Drum")).toBeNull();
  });

  it("says so when nothing matches", () => {
    open();
    fireEvent.change(screen.getByLabelText("Search maps"), {
      target: { value: "zzzz-no-such-map" },
    });
    expect(screen.getByText("No maps match that search.")).toBeInTheDocument();
  });
});

describe("MapModal — select vs apply", () => {
  it("clicking a card selects it WITHOUT pushing mapUrl to the room", () => {
    open();

    fireEvent.click(cardImage("The Chalk"));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByAltText("Selected map preview")).toHaveAttribute(
      "src",
      "/maps/legacy-the-chalk.webp",
    );
  });

  it("Set Map pushes the selection and closes", () => {
    const onClose = jest.fn();
    render(
      <ChakraProvider>
        <MapModal isOpen onClose={onClose} />
      </ChakraProvider>,
    );

    fireEvent.click(cardImage("The Chalk"));
    fireEvent.click(screen.getByRole("button", { name: "Set Map" }));

    expect(push).toHaveBeenCalledWith({
      query: { mapUrl: "/maps/legacy-the-chalk.webp" },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("Reset to default strips mapUrl from the query", () => {
    mockQuery = { mapUrl: "/maps/legacy-the-chalk.webp", gid: "abc" };
    open();

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));

    expect(push).toHaveBeenCalledWith({ query: { gid: "abc" } });
  });
});

describe("MapModal — custom URL disclosure", () => {
  it("keeps the custom URL input collapsed until asked for, then applies it", async () => {
    open();

    expect(screen.queryByLabelText("Custom map image URL")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Use a custom image URL/ }),
    );
    fireEvent.change(screen.getByLabelText("Custom map image URL"), {
      target: { value: "https://x.test/map.png" },
    });

    // the input is debounced before it becomes the selection
    await waitFor(() =>
      expect(screen.getByAltText("Selected map preview")).toHaveAttribute(
        "src",
        "https://x.test/map.png",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Set Map" }));
    expect(push).toHaveBeenCalledWith({
      query: { mapUrl: "https://x.test/map.png" },
    });
  });
});
