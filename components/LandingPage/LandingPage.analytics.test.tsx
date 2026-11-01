/**
 * `landing_cta_clicked` (#1513): every CTA that leaves the landing for a table,
 * the bag or a progression page reports `<section>:<href>`. In-page anchors,
 * the changelog and the footer are not CTAs.
 */
import { fireEvent, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { LandingPage } from "./index";
import { buildLandingCatalog } from "./catalog";
import { VS_BOT_HREF } from "./content";
import { resetGrowthAnalytics } from "../../lib/growthAnalytics";

const track = jest.fn();
jest.mock("../../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));
jest.mock("../Discord", () => ({ FindMatch: () => null, DiscordPresence: () => null }));
jest.mock("../Account/AccountChip", () => ({ AccountChip: () => null }));
jest.mock("./ChangelogUpdateDialog", () => ({
  ChangelogUpdateDialog: () => null,
  shortDate: (d: string) => d,
}));
jest.mock("./useLandingRoster", () => ({ useLandingRoster: () => [] }));

const catalog = buildLandingCatalog();

const clickIn = (container: HTMLElement, selector: string) => {
  const link = container.querySelector(selector);
  if (!link) throw new Error(`no ${selector}`);
  // Keep jsdom from trying to navigate.
  link.addEventListener("click", (e) => e.preventDefault());
  fireEvent.click(link);
};

beforeEach(() => {
  track.mockClear();
  resetGrowthAnalytics();
});

describe("landing_cta_clicked", () => {
  it.each([
    ["chooser", `#top [role="region"] a[href="/irl"]`, "/irl"],
    ["tables", `#ways a[href="/connect"]`, "/connect"],
    ["intent", `#helper a[href="/bag"]`, "/bag"],
    ["pro", `#pro a[href="${VS_BOT_HREF}"]`, VS_BOT_HREF],
    ["progression", `#compete a[href="/leaderboard"]`, "/leaderboard"],
    ["decks", `#decks a[href="/table"]`, "/table"],
    ["decks", `#decks a[href="/bag"]`, "/bag"],
  ])("%s → %s", (section, selector, href) => {
    const { container } = render(
      <ChakraProvider>
        <LandingPage catalog={catalog} />
      </ChakraProvider>,
    );
    clickIn(container, selector);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("landing_cta_clicked", {
      cta: `${section}:${href}`,
      from_page: "/",
    });
  });

  it("is sent once per page load, and never for in-page anchors", () => {
    const { container } = render(
      <ChakraProvider>
        <LandingPage catalog={catalog} />
      </ChakraProvider>,
    );
    clickIn(container, `#ways a[href="#helper"]`);
    expect(track).not.toHaveBeenCalled();
    clickIn(container, `#ways a[href="/connect"]`);
    clickIn(container, `#ways a[href="/pro"]`);
    expect(track).toHaveBeenCalledTimes(1);
  });
});
