/**
 * Adventure board overlays (Wave 4.3, unbrewed-p2p#1099) — fixture-driven, no engine.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { theme } from "@/styles/style";
import { FormatOverlay } from "@/components/Pro/FormatOverlay";
import { adventureBoardModel, moverIntent } from "@/lib/pro/adventureBoard";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";

const fighter = (id: string, name: string, extra: object = {}) => ({
  id, owner: "p1", kind: "HERO", name, space: "a", tailSpace: null, hp: 10, maxHp: 12,
  reach: "MELEE", size: "NORMAL", defeated: false, ...extra,
});

const VIEW = {
  fighters: [
    fighter("p1/hero", "Hero"),
    fighter("e1/rex", "Rex", { hp: 7, maxHp: 20, enemy: { role: "VILLAIN", move: 2, deckCount: 5, discardTop: null } }),
  ],
  initiative: {
    round: 3, phase: "TURN", deckCount: 4, current: "c2",
    row: [
      { id: "c1", title: "Hero", entry: "SEAT", seat: "p1" },
      { id: "c2", title: "Rex", entry: "FIGHTER", fighter: "e1/rex" },
      { id: "c3", entry: "EFFECT", faceDown: true },
    ],
  },
  scenario: {
    threat: { position: 3, level: 2, overflows: 0, positions: [0, 1, 1, 2, 2, 3, 3, 4, 5] },
    objectives: [],
  },
} as unknown as PlayerView;

const EVENTS = [{ type: "ENEMY_ACTIVATION", fighter: "e1/rex", outcome: "CLOSEST", target: "p1/hero" }] as GameEvent[];

const mount = (formatId: string | undefined, view = VIEW, events = EVENTS) =>
  render(
    <ChakraProvider theme={theme}>
      <FormatOverlay formatId={formatId} view={view} events={events} />
    </ChakraProvider>,
  );

describe("AdventureBoard", () => {
  it("renders round, highlighted current initiative, threat marker, enemy dials, intent", () => {
    mount("adventure");
    expect(screen.getByTestId("adv-round")).toHaveTextContent("3");
    expect(screen.getByTestId("adv-init-c2")).toHaveAttribute("data-current", "true");
    expect(screen.getByTestId("adv-init-c1")).not.toHaveAttribute("data-current");
    expect(screen.getByTestId("adv-init-c3")).toHaveTextContent("Face down");
    expect(screen.getAllByTestId(/^adv-threat-\d$/)).toHaveLength(9);
    expect(screen.getByTestId("adv-threat-3")).toHaveAttribute("data-marker", "true");
    expect(screen.getByTestId("adv-threat-level")).toHaveTextContent("2");
    expect(screen.getByTestId("adv-enemy-hp-e1/rex")).toHaveTextContent("7/20");
    expect(screen.getByTestId("adv-enemy-deck-e1/rex")).toHaveTextContent("DECK 5");
    expect(screen.queryByTestId("adv-enemy-p1/hero")).toBeNull();
    expect(screen.getByTestId("adv-intent")).toHaveTextContent("Rex moves toward Hero");
  });

  it("renders nothing for other formats or a view without adventure data", () => {
    mount("duel");
    expect(screen.queryByTestId("adventure-board")).toBeNull();
    mount(undefined);
    expect(screen.queryByTestId("adventure-board")).toBeNull();
    const plain = { fighters: [fighter("p1/hero", "Hero")] } as unknown as PlayerView;
    expect(adventureBoardModel(plain)).toBeNull();
    mount("adventure", plain);
    expect(screen.queryByTestId("adventure-board")).toBeNull();
  });
});

describe("moverIntent", () => {
  it("covers each outcome and no event", () => {
    const ev = (outcome: string, target?: string) =>
      [{ type: "ENEMY_ACTIVATION", fighter: "e1/rex", outcome, target }] as GameEvent[];
    expect(moverIntent(ev("ADJACENT", "p1/hero"), VIEW)).toBe("Rex attacks Hero");
    expect(moverIntent(ev("NO_TARGET"), VIEW)).toBe("Rex has no target");
    expect(moverIntent([], VIEW)).toBeNull();
    expect(moverIntent(undefined, VIEW)).toBeNull();
  });
});
