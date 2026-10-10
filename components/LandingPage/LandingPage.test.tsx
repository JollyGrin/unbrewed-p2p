/**
 * The "Four tables" landing page (unbrewed-p2p-1353): section order, the four
 * table cards, the footer's route links, and the FAQPage JSON-LD (#823) — which
 * must mirror the rendered accordions 1:1 because Google checks exactly that.
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { LandingPage } from "./index";
import { FAQS } from "./content";
import { buildLandingCatalog } from "./catalog";

const catalog = buildLandingCatalog();

// Network-bound pieces are not under test (jest.mock paths are relative: SWC
// rewrites the `@/` alias in imports only).
jest.mock("../Discord", () => ({ FindMatch: () => null, DiscordPresence: () => null }));
jest.mock("../Account/AccountChip", () => ({ AccountChip: () => null }));
jest.mock("./ChangelogUpdateDialog", () => ({
  ChangelogUpdateDialog: () => null,
  shortDate: (d: string) => d,
}));
jest.mock("./useLandingRoster", () => ({
  useLandingRoster: () => [
    { heroId: "a", name: "Hero A", lab: false },
    { heroId: "b", name: "Hero B", lab: true },
  ],
}));

const renderPage = () =>
  render(
    <ChakraProvider>
      <LandingPage catalog={catalog} />
    </ChakraProvider>,
  );

const readJsonLd = (container: HTMLElement) => {
  const script = container.querySelector('script[type="application/ld+json"]');
  expect(script).not.toBeNull();
  return JSON.parse(script!.innerHTML);
};

describe("LandingPage", () => {
  it("has one h1 and the ten sections in the brief's order", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Play Unmatched fan decks online, any way you like.",
    );
    const ids = [...container.querySelectorAll("header, section[id], footer[id]")].map(
      (el) => el.id || el.tagName.toLowerCase(),
    );
    expect(ids).toEqual(["header", "top", "ways", "helper", "pro", "compete", "decks", "community", "faq", "footer"]);
    // every section is labelled by a real h2
    for (const id of ids.slice(2)) {
      expect(container.querySelector(`#${id}-heading`)?.tagName).toBe("H2");
    }
  });

  it("links the four table cards to their routes", () => {
    const { container } = renderPage();
    const ways = within(container.querySelector("#ways") as HTMLElement);
    for (const [name, href] of [
      ["Sandbox", "/connect"],
      ["Pro", "/pro"],
      ["3D table", "/table"],
      ["IRL mode", "/irl"],
    ]) {
      const card = ways.getByRole("heading", { level: 3, name }).closest("a");
      expect(card).toHaveAttribute("href", href);
    }
    // stills carry explicit dimensions and alt text (no CLS)
    for (const img of container.querySelectorAll("#ways img")) {
      expect(img).toHaveAttribute("width", "1280");
      expect(img).toHaveAttribute("height", "800");
      expect(img.getAttribute("alt")).not.toBe("");
    }
  });

  it("derives counts from the catalogs and the live roster", () => {
    renderPage();
    expect(screen.getByText(`${catalog.sandboxMapCount} maps, or any image`)).toBeInTheDocument();
    expect(screen.getByText("2 heroes in Pro")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: `${catalog.proBoards.length} boards, or yours` })).toBeInTheDocument();
    expect(screen.getByText(/1 battle-ready · 1 in the lab/)).toBeInTheDocument();
  });

  it("links every surface from the footer, signed out", () => {
    const { container } = renderPage();
    const footer = within(container.querySelector("footer") as HTMLElement);
    for (const href of [
      "/connect", "/pro", "/table", "/irl", "/bag", "/tournaments", "/leaderboard",
      "/heroes", "/stats", "/collection", "/changelog",
    ]) {
      expect(footer.getAllByRole("link").some((a) => a.getAttribute("href") === href)).toBe(true);
    }
  });

  it("emits an FAQPage JSON-LD that matches the rendered FAQ 1:1", () => {
    const { container } = renderPage();
    const data = readJsonLd(container);
    const types = data["@graph"].map((node: { "@type": string }) => node["@type"]);
    expect(types).toEqual(expect.arrayContaining(["WebSite", "Organization", "FAQPage"]));

    const faqPage = data["@graph"].find((node: { "@type": string }) => node["@type"] === "FAQPage");
    const rendered = [...container.querySelectorAll("#faq details")].map((details) => ({
      q: details.querySelector("summary")!.textContent,
      a: details.querySelector("summary + *")!.textContent,
    }));
    expect(rendered).toHaveLength(FAQS.length);
    expect(
      faqPage.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => ({
        q: q.name,
        a: q.acceptedAnswer.text,
      })),
    ).toEqual(rendered);
  });
});
