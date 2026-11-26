/**
 * `first_bot_tier` (#1611) on the three landing links to VS_BOT_HREF: the
 * markup keeps the medium href, a plain click by a `hard` browser goes to
 * ai-hard, and `landing_cta_clicked` keeps its `cta`.
 */
import { createEvent, fireEvent, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { LandingPage } from "./index";
import { buildLandingCatalog } from "./catalog";
import { VS_BOT_HREF } from "./content";
import { resetGrowthAnalytics } from "../../lib/growthAnalytics";

const track = jest.fn();
const expose = jest.fn();
const push = jest.fn();
jest.mock("../../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));
jest.mock("../../lib/experiments", () => ({ exposeExperiment: (...args: unknown[]) => expose(...args) }));
// A plain anchor, so `defaultPrevented` reflects only our handler (next/link prevents and pushes itself).
jest.mock("next/link", () => {
  const { forwardRef, createElement } = jest.requireActual("react");
  return {
    __esModule: true,
    default: forwardRef((props: Record<string, unknown>, ref: unknown) => createElement("a", { ...props, ref })),
  };
});
jest.mock("next/router", () => ({ __esModule: true, default: { push: (...a: unknown[]) => push(...a) } }));
jest.mock("../Discord", () => ({ FindMatch: () => null, DiscordPresence: () => null }));
jest.mock("../Account/AccountChip", () => ({ AccountChip: () => null }));
jest.mock("./ChangelogUpdateDialog", () => ({
  ChangelogUpdateDialog: () => null,
  shortDate: (d: string) => d,
}));
jest.mock("./useLandingRoster", () => ({ useLandingRoster: () => [] }));

const catalog = buildLandingCatalog();
const HARD = "/pro/game?vs=ai-hard";

const renderLanding = () =>
  render(
    <ChakraProvider>
      <LandingPage catalog={catalog} />
    </ChakraProvider>,
  );

/** The bot link of one section; the intent card first switches to "play right now, alone". */
const botLink = (container: HTMLElement, section: "chooser" | "pro" | "intent"): HTMLElement => {
  if (section === "intent") {
    const toggle = [...container.querySelectorAll<HTMLButtonElement>("#helper button")].find((b) =>
      b.textContent?.includes("play right now, alone"),
    );
    fireEvent.click(toggle!);
  }
  const scope = { chooser: `#top [role="region"]`, pro: "#pro", intent: "#helper" }[section];
  const link = container.querySelector<HTMLElement>(`${scope} a[href="${VS_BOT_HREF}"]`);
  if (!link) throw new Error(`no bot link in ${section}`);
  return link;
};

/** Click and report whether our handler prevented the default (following the medium href). */
const click = (link: HTMLElement, init: MouseEventInit = {}): boolean => {
  const event = createEvent.click(link, { button: 0, ...init });
  let prevented = false;
  // After React's root listener: record, then stop jsdom from trying to navigate.
  document.addEventListener(
    "click",
    (e) => {
      prevented = e.defaultPrevented;
      e.preventDefault();
    },
    { once: true },
  );
  fireEvent(link, event);
  return prevented;
};

beforeEach(() => {
  track.mockClear();
  expose.mockReset();
  push.mockClear();
  resetGrowthAnalytics();
});

describe.each(["chooser", "pro", "intent"] as const)("%s bot link", (section) => {
  it("hard → /pro/game?vs=ai-hard, cta unchanged", () => {
    expose.mockReturnValue("hard");
    const { container } = renderLanding();
    const prevented = click(botLink(container, section));
    expect(expose).toHaveBeenCalledWith("first_bot_tier");
    expect(prevented).toBe(true);
    expect(push).toHaveBeenCalledWith(HARD);
    expect(track).toHaveBeenCalledWith("landing_cta_clicked", { cta: `${section}:${VS_BOT_HREF}`, from_page: "/" });
  });

  it.each([["medium"], [null]])("%s → the medium href, cta unchanged", (variant) => {
    expose.mockReturnValue(variant);
    const { container } = renderLanding();
    const prevented = click(botLink(container, section));
    expect(expose).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("landing_cta_clicked", { cta: `${section}:${VS_BOT_HREF}`, from_page: "/" });
  });

  it.each([
    ["ctrl", { ctrlKey: true }],
    ["cmd", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["middle", { button: 1 }],
  ])("%s-click → medium link, no exposure", (_label, init) => {
    expose.mockReturnValue("hard");
    const { container } = renderLanding();
    click(botLink(container, section), init);
    expect(expose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("landing_cta_clicked", { cta: `${section}:${VS_BOT_HREF}`, from_page: "/" });
  });
});

it("other CTAs never run the experiment", () => {
  expose.mockReturnValue("hard");
  const { container } = renderLanding();
  click(container.querySelector<HTMLElement>(`#pro a[href="/pro"]`)!);
  expect(expose).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
});

/** React's useId values (`:r1:`) differ per mount; they are not part of the markup's meaning. */
const html = (el: HTMLElement) => el.innerHTML.replace(/:r[0-9a-z]+:/g, ":id:");

it("renders the same HTML for both variants, with the medium href", () => {
  expose.mockReturnValue("medium");
  const medium = renderLanding();
  const mediumHtml = html(medium.container);
  medium.unmount();
  expose.mockReturnValue("hard");
  const hard = renderLanding();
  expect(html(hard.container)).toBe(mediumHtml);
  expect(hard.container.querySelectorAll(`a[href="${VS_BOT_HREF}"]`).length).toBeGreaterThanOrEqual(2);
  expect(hard.container.querySelectorAll(`a[href="${HARD}"]`)).toHaveLength(0);
  expect(expose).not.toHaveBeenCalled(); // nothing resolves during render
});
