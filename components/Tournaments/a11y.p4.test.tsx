/**
 * Round-4 accessibility + copy items (p2p #1279): bracket caption contrast,
 * hidden winner/eliminated words, name tooltips, astral-safe initials, the
 * round tabs' keyboard pattern, 44 px tap targets, the replay overlay's Esc +
 * focus trap, the round-robin form dots, and one "one game per match" phrasing.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { INK_MUTED } from "@/components/Stats/tokens";
import { buildBracket } from "@/lib/tournaments/bracket";
import { PRESETS } from "@/lib/tournaments/createForm";
import { fixtureBracket, fixtureRoundRobin4, fixtureRunning8, fixtureSignup8 } from "@/lib/tournaments/fixtures";
import { proErrorMessage } from "@/lib/pro/proErrors";

import { Avatar, MatchCell, RoundTabs } from "./Bracket";
import { MapChips } from "./MapChips";
import { MatchReplay } from "./MatchReplay";
import { RoundRobinEventView } from "./RoundRobinEventView";
import { SeatHeldNote } from "./SeatHeldNote";
import { SeedingPanel } from "./SeedingPanel";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("../../lib/tournaments/api", () => ({
  ...jest.requireActual("../../lib/tournaments/api"),
  getGameReplay: jest.fn(() => new Promise(() => undefined)),
}));

const wrap = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);
const minH = (el: Element) => window.getComputedStyle(el).minHeight;
const px = (v: string) => parseFloat(v);

const decidedCell = () => {
  const b = fixtureBracket(4, 4);
  b.decide(b.at(1, 0), "a", "result");
  return buildBracket({ slug: "x", size: 4, status: "running" }, b.entries, b.matches).rounds[0].cells[0];
};

describe("bracket cells", () => {
  it("seed and score captions use INK_MUTED (AA), not the 0.55 alpha", () => {
    wrap(<MatchCell c={decidedCell()} now={Date.now()} />);
    const seed = screen.getAllByText("1")[0];
    expect(window.getComputedStyle(seed).color).toBe("rgba(72, 40, 79, 0.72)");
    expect(INK_MUTED).toBe("rgba(72,40,79,0.72)");
  });

  it("says winner / eliminated to a screen reader, and names truncate with a tooltip", () => {
    const c = decidedCell();
    wrap(<MatchCell c={c} now={Date.now()} />);
    const cell = screen.getByTestId("match-cell");
    expect(cell).toHaveTextContent(`${c.a.name}, winner`);
    expect(cell).toHaveTextContent(`${c.b.name}, eliminated`);
    expect(within(cell).getByTitle(c.a.name)).toBeInTheDocument();
    expect(within(cell).getByTitle(c.b.name)).toBeInTheDocument();
  });

  it("an emoji / astral name's initial is a whole character, never a lone surrogate", () => {
    wrap(<Avatar name="🔥🔥 سلطان" />);
    expect(document.body.textContent).toBe("🔥");
  });
});

describe("round tabs (P13)", () => {
  const p = fixtureRunning8();
  const view = buildBracket(p.tournament, p.entries, p.matches);
  it("arrow keys / Home / End move the selection and focus; tabs control the panel", () => {
    wrap(<RoundTabs view={view} now={Date.now()} />);
    const tabs = screen.getAllByRole("tab");
    const panel = screen.getByRole("tabpanel");
    for (const t of tabs) expect(t).toHaveAttribute("aria-controls", panel.id);
    const start = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    expect(panel).toHaveAttribute("aria-labelledby", tabs[start].id);
    expect(tabs[start]).toHaveAttribute("tabindex", "0");
    tabs[start].focus();
    fireEvent.keyDown(tabs[start], { key: "Home" });
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(screen.getAllByRole("tab")[0]);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(screen.getAllByRole("tab")[1]);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getAllByRole("tab")[tabs.length - 1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(screen.getAllByRole("tab")[tabs.length - 2]).toHaveAttribute("aria-selected", "true");
  });

  it("each tab is a 44 px tap target", () => {
    wrap(<RoundTabs view={view} now={Date.now()} />);
    for (const t of screen.getAllByRole("tab")) expect(px(minH(t))).toBeGreaterThanOrEqual(44);
  });
});

describe("tap targets ≥ 44 px (S15)", () => {
  it("map chips", () => {
    wrap(<MapChips value={null} onPick={() => undefined} label="Map" />);
    for (const r of screen.getAllByRole("radio")) expect(px(minH(r))).toBeGreaterThanOrEqual(44);
  });

  it("seeding arrows", () => {
    const p = fixtureSignup8();
    wrap(<SeedingPanel t={p.tournament} entries={p.entries.map((e, i) => ({ ...e, seed: i + 1 }))} reload={() => undefined} />);
    const up = screen.getAllByRole("button", { name: /^Move .* up$/ })[0];
    const s = window.getComputedStyle(up);
    expect(px(s.width)).toBeGreaterThanOrEqual(44);
    expect(px(s.height)).toBeGreaterThanOrEqual(44);
  });
});

describe("the replay overlay (P14)", () => {
  it("is a modal dialog: Esc closes it, Tab stays inside, focus returns to the opener", async () => {
    const opener = document.createElement("button");
    opener.textContent = "open";
    document.body.appendChild(opener);
    opener.focus();
    const onExit = jest.fn();
    const game = { gameIndex: 0 } as never;
    const r = wrap(<MatchReplay slug="s" matchId="m" game={game} onExit={onExit} />);
    const dialog = screen.getByRole("dialog", { name: "Replay" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.activeElement).toBe(dialog);
    // focus that escaped the dialog is pulled back in on the next Tab, both ways
    opener.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    opener.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("round robin (P7, P9)", () => {
  it("form dots carry an accessible name; match-row names a tooltip", () => {
    const p = fixtureRoundRobin4();
    wrap(<RoundRobinEventView t={p.tournament} entries={p.entries} matches={p.matches} standings={p.standings ?? null} />);
    // the form column is md+ only (jsdom renders base), so include hidden nodes
    const dots = screen.getAllByRole("img", { name: /^(Win|Loss|Not played yet)$/, hidden: true });
    expect(dots.length).toBeGreaterThan(0);
    expect(dots.some((d) => d.getAttribute("aria-label") === "Not played yet")).toBe(true);
    // the standings row already had a tooltip; the match rows now do too
    const name = p.entries[0].username!;
    expect(screen.getAllByTitle(name).length).toBeGreaterThanOrEqual(2);
  });
});

describe("copy (S6, P6)", () => {
  it("no 'seat ticket' and no room code in player copy", () => {
    expect(proErrorMessage("TICKET_EXPIRED")).toBe("Your seat reservation ran out (they last 15 minutes).");
    expect(proErrorMessage("TICKET_MISMATCH")).not.toMatch(/ticket/i);
    wrap(<SeatHeldNote roomId="SF2ROOM" />);
    expect(screen.getByTestId("seat-held-note")).toHaveTextContent("Your seat is held in this match's room.");
    expect(screen.getByTestId("seat-held-note")).not.toHaveTextContent("SF2ROOM");
  });

  it("presets say one game, never 'First to 1'", () => {
    const bullets = PRESETS.flatMap((p) => p.bullets).join(" ");
    expect(bullets).not.toMatch(/First to 1/i);
    expect(bullets).toMatch(/One game · 48h per match/);
  });
});
