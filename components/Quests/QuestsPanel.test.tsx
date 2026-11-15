/**
 * The quests panel (#1658), rendered from the contract fixtures: brand-new,
 * half done, all done, dailies done / not done — plus the two states that must
 * leave the page exactly as it was (no payload) and the guest teaser.
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { QuestsPanelView } from "./QuestsPanel";
import { QUEST_FIXTURES, QUESTS_NOW_MS, type QuestFixtureName } from "@/lib/account/fixtures/quests";
import { normalizeDaily } from "@/lib/account/bonuses";
import { normalizeQuestBoard } from "@/lib/account/quests";
import type { QuestsState } from "@/lib/account/useQuests";

jest.mock("next/router", () => ({ useRouter: () => ({ asPath: "/pro", query: {} }) }));

const ready = (name: QuestFixtureName, withDaily = true): QuestsState => ({
  status: "ready",
  board: normalizeQuestBoard(QUEST_FIXTURES[name].quests),
  daily: withDaily ? normalizeDaily(QUEST_FIXTURES[name].daily) : null,
});

const show = (state: QuestsState, props: Partial<React.ComponentProps<typeof QuestsPanelView>> = {}) =>
  render(
    <ChakraProvider>
      <div data-testid="host">
        <QuestsPanelView state={state} tone="dark" now={QUESTS_NOW_MS} {...props} />
      </div>
    </ChakraProvider>,
  );

const row = (id: string) => screen.getByTestId(`quest-${id}`);
const linkOf = (id: string) => within(row(id)).queryByRole("link");

describe("no payload", () => {
  it.each<QuestsState>([
    { status: "loading", board: null, daily: null },
    { status: "unavailable", board: null, daily: null },
    // A streak block alone is not a quests payload.
    { status: "unavailable", board: null, daily: normalizeDaily(QUEST_FIXTURES.halfDone.daily) },
    { status: "ready", board: { starter: [], daily: [], resetsAt: null }, daily: null },
  ])("renders nothing at all (%#)", (state) => {
    show(state, { mb: "1rem" });
    expect(screen.getByTestId("host")).toBeEmptyDOMElement();
  });
});

describe("brand-new account", () => {
  it("lists every starter quest open, each linking to where it is done", () => {
    show(ready("brandNew"));
    expect(screen.getByText("0 of 6 done")).toBeInTheDocument();
    expect(linkOf("first-game")).toHaveAttribute("href", "/pro/game?vs=ai-easy");
    expect(linkOf("first-win")).toHaveAttribute("href", "/pro/game?vs=ai-easy");
    expect(linkOf("upgrade-card")).toHaveAttribute("href", "/collection");
    expect(linkOf("harder-bot")).toHaveAttribute("href", "/pro/game?vs=ai-hard");
    expect(linkOf("play-human")).toHaveAttribute("href", "/pro/game?quick=1");
    expect(linkOf("three-heroes")).toHaveAttribute("href", "/pro/game?vs=ai");
    expect(within(row("play-human")).getByText("Quick Play →")).toBeInTheDocument();
  });

  it("shows reward chips as the API sent them, and none for a null reward", () => {
    show(ready("brandNew"));
    expect(within(row("first-win")).getByTestId("quest-reward")).toHaveTextContent("+30 XP");
    expect(within(row("first-game")).getByTestId("quest-reward")).toHaveTextContent("+100 XP and 50 hero points");
    expect(within(row("upgrade-card")).queryByTestId("quest-reward")).toBeNull();
    expect(within(row("three-heroes")).getByText("0/3")).toBeInTheDocument();
  });

  it("has no streak to boast about, but says what today pays and when it resets", () => {
    show(ready("brandNew"));
    expect(screen.queryByTestId("quests-streak")).toBeNull();
    expect(screen.getByTestId("quests-streak-line")).toHaveTextContent(
      "Today's bonus: +10 XP for your first game · Tomorrow: +15 XP · Resets in 5h 12m",
    );
    expect(row("play-today")).toHaveAttribute("data-done", "false");
    expect(linkOf("play-today")).toHaveAttribute("href", "/pro/game");
  });
});

describe("half done", () => {
  it("strikes done rows (no link) and keeps open ones as links with progress", () => {
    show(ready("halfDone"));
    expect(screen.getByText("3 of 6 done")).toBeInTheDocument();
    expect(row("first-game")).toHaveAttribute("data-done", "true");
    expect(linkOf("first-game")).toBeNull();
    expect(linkOf("harder-bot")).not.toBeNull();
    expect(within(row("three-heroes")).getByText("2/3")).toBeInTheDocument();
  });

  it("daily played, not won: Day N, the bonus earned, the win still open", () => {
    show(ready("halfDone"));
    expect(screen.getByTestId("quests-streak")).toHaveTextContent("Day 3");
    expect(screen.getByTestId("quests-streak-line")).toHaveTextContent("Today's bonus: +20 XP, earned · Tomorrow: +25 XP");
    expect(row("play-today")).toHaveAttribute("data-done", "true");
    expect(row("win-today")).toHaveAttribute("data-done", "false");
    expect(within(row("win-today")).getByTestId("quest-reward")).toHaveTextContent("+20 XP");
  });
});

describe("all done", () => {
  it("collapses the checklist to one line and keeps Today", () => {
    show(ready("allDone"));
    expect(screen.getByTestId("quests-starter-summary")).toHaveTextContent("Getting started: all 6 done");
    expect(screen.queryByTestId("quests-starter")).toBeNull();
    expect(screen.queryByTestId("quest-first-game")).toBeNull();
    expect(screen.getByTestId("quests-streak")).toHaveTextContent("Day 6");
    expect(row("play-today")).toHaveAttribute("data-done", "true");
    expect(row("win-today")).toHaveAttribute("data-done", "true");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("dailies not done on a live run: today would be the next day", () => {
    show(ready("dailyOpen"));
    expect(screen.getByTestId("quests-streak")).toHaveTextContent("Day 3 if you play today");
    expect(row("play-today")).toHaveAttribute("data-done", "false");
    expect(within(row("play-today")).getByTestId("quest-reward")).toHaveTextContent("+20 XP");
  });
});

describe("optional pieces", () => {
  it("without the stats daily block: quests and the reset countdown, no streak", () => {
    show(ready("halfDone", false));
    expect(screen.queryByTestId("quests-streak")).toBeNull();
    expect(screen.getByTestId("quests-streak-line")).toHaveTextContent(/^Resets in 5h 12m$/);
    expect(row("play-today")).toBeInTheDocument();
  });

  it("no clock yet (server render): no countdown", () => {
    show(ready("halfDone"), { now: null });
    expect(screen.getByTestId("quests-streak-line")).not.toHaveTextContent("Resets in");
  });

  it("decorates quest links with the host's href helper", () => {
    show(ready("brandNew"), { withHref: (href) => `${href}${href.includes("?") ? "&" : "?"}debug=1` });
    expect(linkOf("play-human")).toHaveAttribute("href", "/pro/game?quick=1&debug=1");
    expect(linkOf("upgrade-card")).toHaveAttribute("href", "/collection?debug=1");
  });
});

describe("guest", () => {
  it("teases the starter list with a sign-in link and no play links", () => {
    show({ status: "guest", board: null, daily: null }, { tone: "parchment", returnTo: "/account" });
    const teaser = screen.getByTestId("quests-teaser");
    expect(teaser).toHaveTextContent("Play your first game");
    expect(teaser).toHaveTextContent("Play three different heroes");
    const links = within(teaser).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Sign in with Discord");
    expect(links[0].getAttribute("href")).toContain("/auth/");
    expect(screen.queryByTestId("quests-panel")).toBeNull();
  });
});
