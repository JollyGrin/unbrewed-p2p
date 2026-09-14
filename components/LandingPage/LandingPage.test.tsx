/**
 * The landing page's JSON-LD (#823) feeds Google's FAQPage / HowTo rich
 * results, so it must serialise to valid JSON and carry every visible FAQ.
 * Also pins the IRL-mode feature card's link to /irl.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { LandingPage } from "./index";

// Hero and FindMatch reach for the router / network; neither is under test.
// (jest.mock paths are relative: SWC rewrites the `@/` alias in imports only.)
jest.mock("./Hero", () => ({ Hero: () => null }));
jest.mock("../Discord", () => ({ FindMatch: () => null }));

const renderPage = () =>
  render(
    <ChakraProvider>
      <LandingPage />
    </ChakraProvider>,
  );

const readJsonLd = (container: HTMLElement) => {
  const script = container.querySelector(
    'script[type="application/ld+json"]',
  );
  expect(script).not.toBeNull();
  return JSON.parse(script!.innerHTML);
};

describe("LandingPage", () => {
  it("serialises JSON-LD whose FAQPage mirrors every visible FAQ", () => {
    const { container } = renderPage();
    const data = readJsonLd(container);
    const faqPage = data["@graph"].find(
      (node: { "@type": string }) => node["@type"] === "FAQPage",
    );
    const questions: string[] = faqPage.mainEntity.map(
      (q: { name: string }) => q.name,
    );

    expect(questions).toEqual(
      expect.arrayContaining([
        "Can I use Unbrewed to playtest a deck in person?",
        "Do my decks sync between my phone and my computer?",
      ]),
    );
    for (const q of questions) {
      expect(screen.getByRole("heading", { level: 3, name: q })).toBeVisible();
    }
    for (const entity of faqPage.mainEntity) {
      expect(entity.acceptedAnswer.text).toEqual(expect.any(String));
    }
  });

  it("links the IRL-mode feature card to /irl", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 3, name: "Playtesting at the table?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open IRL mode" })).toHaveAttribute(
      "href",
      "/irl",
    );
  });
});
