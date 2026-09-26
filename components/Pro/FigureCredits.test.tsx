/**
 * Miniature credits (unbrewed-p2p-903). CC-BY obliges us to credit a model
 * wherever its figure is shown, so the credit must come from the manifest —
 * never from text in a component — and appear on every hero-info surface: the
 * hero preview (/pro and /pro/game) with the figurine itself, and the in-game
 * seat info (desktop plate popover, phone seat sheet) for the figure on the
 * table. A hero shown as its token gets neither.
 */
import "@testing-library/jest-dom";
import { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeroPreviewModal } from "./HeroPreviewModal";
import { SeatPlate } from "./ProHud";
import { FigureCredits } from "./FigureCredits";
import { ProMobileMenu } from "./ProMobileHud";
import { FigureCredit } from "@/lib/pro/figures";
import { resetFigureManifestCache } from "@/lib/pro/useFigureManifest";
import { DEFAULT_PLATE_LAYOUT } from "@/lib/pro/useHudPlates";

jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock("../../lib/pro/useDeckPreview", () => ({
  useDeckPreview: () => ({ data: null, isLoading: false }),
}));
jest.mock("../../lib/pro/useDeckStats", () => ({
  useDeckStats: () => ({ data: null }),
}));
jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => ({ status: "guest", account: null }),
}));

// A made-up model: nothing here is a ruling on a real one.
const OPEN_MANIFEST = {
  version: 1,
  figures: {
    triceratops: {
      anchor: { x: 0.5, y: 0.55 },
      imageWidthMm: 6.1,
      footprintMm: 2.8,
      aspect: 1.5,
      seats: { p1: "triceratops.p1.webp" },
      license: "CC-BY-4.0",
      redistributable: true,
      officialHero: false,
      modelName: "Test Horned Skeleton",
      creator: "Test Museum",
      sourceUrl: "https://example.org/horned-skeleton",
    },
  },
};

const originalFetch = (global as unknown as { fetch?: unknown }).fetch;
let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
    fetched.push(url);
    return url === "/figures-open/manifest.json"
      ? { ok: true, json: async () => OPEN_MANIFEST }
      : { ok: false, json: async () => ({}) };
  });
});
afterEach(() => {
  resetFigureManifestCache();
  (global as unknown as { fetch?: unknown }).fetch = originalFetch;
});

const openPreview = (heroId: string, heroName: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChakraProvider>
        <HeroPreviewModal
          isOpen
          onClose={() => {}}
          deckId="deck-id"
          heroName={heroName}
          heroId={heroId}
          quickStats={{ hp: 16, move: 2, reach: "MELEE" }}
        />
      </ChakraProvider>
    </QueryClientProvider>
  );

const expectCredits = () => {
  expect(screen.getByText("Test Horned Skeleton")).toBeInTheDocument();
  expect(screen.getByText(/by Test Museum/)).toBeInTheDocument();
  // CC BY 4.0 s3(a)(1): the licence is a link to its deed…
  expect(screen.getByRole("link", { name: "CC-BY-4.0", hidden: true })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by/4.0/"
  );
  expect(screen.getByRole("link", { name: /Source/, hidden: true })).toHaveAttribute(
    "href",
    "https://example.org/horned-skeleton"
  );
  // …and the renders' changes are indicated.
  expect(screen.getByTestId("figure-modified-notice")).toHaveTextContent("Rendered and recoloured for Unbrewed.");
};

describe("hero preview — figurine and credits", () => {
  it("shows the hero's figurine and its credit, from the manifest", async () => {
    openPreview("triceratops", "Triceratops");
    const img = await screen.findByAltText("Triceratops miniature");
    expect(img).toHaveAttribute("src", "/figures-open/triceratops.p1.webp");
    expectCredits();
    expect(fetched).toContain("/figures-open/manifest.json");
  });

  it("shows no figurine and no credit for a hero without a figure", async () => {
    openPreview("king-kong", "King Kong");
    await waitFor(() => expect(fetched).toContain("/figures-open/manifest.json"));
    await act(async () => {});
    expect(screen.queryByTestId("hero-figurine")).not.toBeInTheDocument();
    expect(screen.queryByTestId("figure-credits")).not.toBeInTheDocument();
  });
});

const CREDIT: FigureCredit = {
  modelName: "Test Horned Skeleton",
  creator: "Test Museum",
  license: "CC-BY-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceUrl: "https://example.org/horned-skeleton",
  modified: true,
};

const plate = (variant: "plate" | "sheet", figureCredit: FigureCredit | null) =>
  render(
    <ChakraProvider>
      <SeatPlate
        variant={variant}
        seatId="p1"
        label="You"
        hero={null}
        ruleCards={[]}
        heroId="triceratops"
        heroFighter={undefined}
        sidekicks={[]}
        isLocal
        isActive={false}
        isAlly={false}
        hand={[]}
        deckCount={0}
        discard={[]}
        ongoingScheme={null}
        labelFor={() => ""}
        resolveCard={() => null}
        layout={DEFAULT_PLATE_LAYOUT}
        hydrated
        onUpdate={() => {}}
        figureCredit={figureCredit}
      />
    </ChakraProvider>
  );

describe("in-game seat info — credits for the figure on the table", () => {
  it("the phone seat sheet spells the credit out inline", () => {
    plate("sheet", CREDIT);
    expectCredits();
  });

  it("the desktop plate opens it from a credits chip", async () => {
    plate("plate", CREDIT);
    const chips = screen.getAllByTestId("plate-figure-credit");
    fireEvent.click(chips[0]);
    await screen.findByText("Test Horned Skeleton");
    expectCredits();
  });

  it("a public-domain (CC0) model links its deed and needs no modification notice", () => {
    render(
      <ChakraProvider>
        <FigureCredits
          credit={{
            ...CREDIT,
            license: "CC0-1.0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            modified: false,
          }}
        />
      </ChakraProvider>
    );
    expect(screen.getByRole("link", { name: "CC0-1.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/publicdomain/zero/1.0/"
    );
    expect(screen.queryByTestId("figure-modified-notice")).not.toBeInTheDocument();
  });

  it("says nothing for a hero shown as its token", () => {
    plate("sheet", null);
    plate("plate", null);
    expect(screen.queryByTestId("figure-credits")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plate-figure-credit")).not.toBeInTheDocument();
  });
});

describe("phone Game menu — figure style item", () => {
  const openMenu = (props: Partial<Parameters<typeof ProMobileMenu>[0]>) => {
    render(
      <ChakraProvider>
        <ProMobileMenu status="open" roomId={null} boardView="table" onToggleBoardView={() => {}} {...props} />
      </ChakraProvider>
    );
    act(() => {
      fireEvent.click(screen.getByLabelText("Game menu"));
    });
    return screen.queryAllByRole("menuitem", { hidden: true }).find((el) => el.textContent?.startsWith("Heroes —"));
  };

  it("names the current style and cycles on tap", () => {
    const onCycleFigureStyle = jest.fn();
    const item = openMenu({ figureStyle: "open", onCycleFigureStyle });
    expect(item?.textContent).toBe("Heroes — Open-licence minis");
    fireEvent.click(item!);
    expect(onCycleFigureStyle).toHaveBeenCalledTimes(1);
  });

  it("is absent when the board offers no choice", () => {
    expect(openMenu({})).toBeUndefined();
  });
});
