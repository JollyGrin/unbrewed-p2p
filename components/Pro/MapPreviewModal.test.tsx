/**
 * The board-preview modal's badge row (issue #316, #725, #727).
 *
 * `hasItems` is computed from `entry.map.items` — CATALOG entries only, never a
 * pasted board — so until Wedding Crashers joined `MAP_CATALOG` (#727) the 🎁
 * tag was unreachable by construction. These cases drive the real catalog
 * entries so the tag stays wired to the shipped data, not to a hand-built prop.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { MapPreviewModal } from "./MapPreviewModal";
import { catalogEntry } from "@/lib/pro/mapCatalog";

// Chakra's modal focus trap probes the DOM with `:not(:disabled):not([disabled])`,
// which the nwsapi bundled with jsdom 20 rejects as invalid. The trap is not what
// this suite is testing, so stub it out and render the modal contents plainly.
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const open = (id: string) =>
  render(
    <ChakraProvider>
      <MapPreviewModal isOpen onClose={() => {}} entry={catalogEntry(id)!} />
    </ChakraProvider>,
  );

describe("MapPreviewModal — 🎁 items tag", () => {
  it("shows it for Wedding Crashers, the catalog's items board", () => {
    open("wedding-crashers");
    expect(screen.getByText("Wedding Crashers")).toBeInTheDocument();
    expect(screen.getByText("🎁 items")).toBeInTheDocument();
    // duel-only, via the printed slots 1&2 fallback
    expect(screen.getByText("1v1")).toBeInTheDocument();
    expect(screen.queryByText("3P")).not.toBeInTheDocument();
    expect(screen.queryByText("2v2")).not.toBeInTheDocument();
  });

  it("shows the self-hosted board image, not the reporter's third-party host", () => {
    open("wedding-crashers");
    expect(screen.getByRole("img", { name: /Wedding Crashers/ })).toHaveAttribute(
      "src",
      "https://unbrewed.xyz/maps/community-wedding-crashers.webp",
    );
  });

  it("omits it for an item-less board", () => {
    open("counts-castle");
    expect(screen.getByText("Count's Castle")).toBeInTheDocument();
    expect(screen.queryByText("🎁 items")).not.toBeInTheDocument();
  });

  it("renders nothing board-specific when no entry is open", () => {
    render(
      <ChakraProvider>
        <MapPreviewModal isOpen={false} onClose={() => {}} entry={null} />
      </ChakraProvider>,
    );
    expect(screen.queryByText("🎁 items")).not.toBeInTheDocument();
  });
});
