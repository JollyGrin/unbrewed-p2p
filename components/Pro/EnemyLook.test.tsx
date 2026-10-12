/**
 * Villain vs minion look (#1406): one helper, every surface. Fixtures are a synthetic,
 * non-Jurassic scenario — roles come off the wire, nothing here keys on an enemy id.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ENEMY_LOOK, fighterColor } from "@/lib/pro/enemyLook";
import { SEAT_COLOR } from "@/lib/pro/seatColors";
import { adventureBoardModel } from "@/lib/pro/adventureBoard";
import { EnemyDials, InitiativeRow, VillainHeader } from "./AdventureBoard";
import { EnemyToken } from "./EnemyToken";
import type { PlayerView } from "@/lib/pro/protocol";

const lum = (hex: string) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const fighter = (id: string, name: string, extra: object = {}) => ({
  id,
  owner: "p1",
  kind: "HERO",
  name,
  space: "a",
  tailSpace: null,
  hp: 5,
  maxHp: 5,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...extra,
});

// A made-up pack: a villain, TWO minion kinds, no threat track, no scenario display data.
const VIEW = {
  fighters: [
    fighter("p1/hero", "Ada"),
    fighter("e1/warlord", "Warlord", {
      owner: "e1",
      enemy: { role: "VILLAIN", move: 2, deckCount: 3, discardTop: null },
    }),
    fighter("e1/drone", "Drone", {
      owner: "e1",
      enemy: { role: "MINION", move: 3, deckCount: 2, discardTop: null },
    }),
    fighter("e1/sentry", "Sentry", {
      owner: "e1",
      enemy: { role: "MINION", move: 1, deckCount: 2, discardTop: null },
    }),
  ],
  initiative: {
    round: 1,
    phase: "TURN",
    deckCount: 2,
    current: "c1",
    row: [
      {
        id: "c1",
        entry: "FIGHTER",
        fighter: "e1/warlord",
        title: "Rally",
        faceDown: false,
      },
      {
        id: "c2",
        entry: "FIGHTER",
        fighter: "e1/drone",
        title: "Swarm",
        faceDown: false,
      },
    ],
  },
  scenario: { id: "moon-base", label: "Moon Base", objectives: [] },
} as unknown as PlayerView;

const wrap = (ui: React.ReactElement) =>
  render(<ChakraProvider>{ui}</ChakraProvider>);

describe("enemy look", () => {
  it("villain and minion differ in hue AND ring shape", () => {
    expect(ENEMY_LOOK.VILLAIN.ring).toBe("#F5F0E6");
    expect(ENEMY_LOOK.VILLAIN.plate).toBe("#7A1626");
    expect(ENEMY_LOOK.VILLAIN.ringStyle).not.toBe(ENEMY_LOOK.MINION.ringStyle);
    expect(ENEMY_LOOK.VILLAIN.ring).not.toBe(ENEMY_LOOK.MINION.ring);
  });

  it("is keyed on the role, not the seat; heroes keep SEAT_COLOR", () => {
    expect(
      fighterColor({ owner: "p4", enemy: { role: "VILLAIN" } }, SEAT_COLOR),
    ).toBe(ENEMY_LOOK.VILLAIN.ring);
    expect(
      fighterColor({ owner: "p4", enemy: { role: "MINION" } }, SEAT_COLOR),
    ).toBe(ENEMY_LOOK.MINION.ring);
    expect(fighterColor({ owner: "p3" }, SEAT_COLOR)).toBe(SEAT_COLOR.p3);
  });

  it("no enemy colour is a hero seat colour", () => {
    for (const e of Object.values(ENEMY_LOOK))
      expect(Object.values(SEAT_COLOR)).not.toContain(e.ring);
  });

  it("minion salmon is lighter than the p3 hero green (deuteranopia luminance gap)", () => {
    expect(lum(ENEMY_LOOK.MINION.ring) - lum(SEAT_COLOR.p3)).toBeGreaterThan(
      0.3,
    );
  });

  it("EnemyToken wears the role's ring", () => {
    wrap(
      <>
        <EnemyToken name="Warlord" role="VILLAIN" />
        <EnemyToken name="Drone" role="MINION" />
      </>,
    );
    const [v, m] = screen.getAllByTestId("enemy-token");
    expect(v).toHaveAttribute("data-enemy-role", "VILLAIN");
    expect(m).toHaveAttribute("data-enemy-role", "MINION");
    expect(getComputedStyle(v).borderStyle).toBe("solid");
    expect(getComputedStyle(m).borderStyle).toBe("dashed");
  });

  it("header, dials and initiative strip carry the role on a synthetic scenario", () => {
    const model = adventureBoardModel(VIEW)!;
    wrap(
      <>
        <VillainHeader villain={model.villain!} objective={null} />
        <EnemyDials enemies={model.enemies} />
        <InitiativeRow model={model} />
      </>,
    );
    const badges = screen
      .getAllByTestId("enemy-role-badge")
      .map((b) => b.getAttribute("data-enemy-role"));
    expect(badges.filter((r) => r === "VILLAIN").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(badges.filter((r) => r === "MINION")).toHaveLength(2);
    const roles = screen
      .getAllByTestId("adv-token")
      .map((t) => t.getAttribute("data-enemy-role"));
    expect(roles).toEqual(expect.arrayContaining(["VILLAIN", "MINION"]));
  });
});
