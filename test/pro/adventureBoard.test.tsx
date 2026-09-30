/**
 * Adventure board overlays (Wave 4.3, unbrewed-p2p#1099) — fixture-driven, no engine.
 */
import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { DOCK_RIGHT, DOCK_WIDTH } from "@/components/Pro/dockLayout";
import { theme } from "@/styles/style";
import { FormatOverlay } from "@/components/Pro/FormatOverlay";
import { ADVENTURE_BOARD_RIGHT, ENGINE_FAULT_FIXTURE } from "@/components/Pro/AdventureBoard";
import {
  adventureBoardModel,
  enemyCombatModel,
  moverIntent,
  parseInitiativeCardId,
} from "@/lib/pro/adventureBoard";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";

const fighter = (id: string, name: string, extra: object = {}) => ({
  id,
  owner: "p1",
  kind: "HERO",
  name,
  space: "a",
  tailSpace: null,
  hp: 10,
  maxHp: 12,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...extra,
});

const VIEW = {
  fighters: [
    fighter("p1/hero", "Hero"),
    fighter("e1/rex", "Rex", {
      hp: 7,
      maxHp: 20,
      enemy: { role: "VILLAIN", enemyId: "indominus-rex", move: 2, deckCount: 5, discardTop: null },
    }),
  ],
  initiative: {
    round: 3,
    phase: "TURN",
    deckCount: 4,
    current: "c2",
    row: [
      { id: "c1", title: "Hero", entry: "SEAT", seat: "p1" },
      { id: "c2", title: "Rex", entry: "FIGHTER", fighter: "e1/rex" },
      { id: "c3", entry: "EFFECT", faceDown: true },
    ],
  },
  scenario: {
    id: "isla-nublar",
    label: "Isla Nublar",
    threat: {
      position: 3,
      level: 2,
      overflows: 0,
      positions: [0, 1, 1, 2, 2, 3, 3, 4, 5],
    },
    objectives: [],
  },
} as unknown as PlayerView;

const EVENTS = [
  {
    type: "ENEMY_ACTIVATION",
    fighter: "e1/rex",
    outcome: "CLOSEST",
    target: "p1/hero",
  },
] as GameEvent[];

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
    expect(screen.getByTestId("adv-init-c2")).toHaveAttribute(
      "data-current",
      "true",
    );
    expect(screen.getByTestId("adv-init-c1")).not.toHaveAttribute(
      "data-current",
    );
    expect(screen.getByTestId("adv-init-c3")).toHaveTextContent("Face down");
    expect(screen.getAllByTestId(/^adv-threat-\d$/)).toHaveLength(9);
    expect(screen.getByTestId("adv-threat-3")).toHaveAttribute(
      "data-marker",
      "true",
    );
    expect(screen.getByTestId("adv-threat-level")).toHaveTextContent("2");
    expect(screen.getByTestId("adv-scenario")).toHaveTextContent("ISLA NUBLAR");
    expect(screen.getByTestId("adv-scenario")).toHaveAttribute("data-scenario-id", "isla-nublar");
    expect(screen.getByTestId("adv-enemy-e1/rex")).toHaveAttribute("data-enemy-id", "indominus-rex");
    expect(screen.getByTestId("adv-enemy-hp-e1/rex")).toHaveTextContent("7/20");
    expect(screen.getByTestId("adv-enemy-deck-e1/rex")).toHaveTextContent(
      "DECK 5",
    );
    expect(screen.queryByTestId("adv-enemy-p1/hero")).toBeNull();
    expect(screen.getByTestId("adv-intent")).toHaveTextContent(
      "Rex moves toward Hero",
    );
  });

  it("renders nothing for other formats or a view without adventure data", () => {
    mount("duel");
    expect(screen.queryByTestId("adventure-board")).toBeNull();
    mount(undefined);
    expect(screen.queryByTestId("adventure-board")).toBeNull();
    const plain = {
      fighters: [fighter("p1/hero", "Hero")],
    } as unknown as PlayerView;
    expect(adventureBoardModel(plain)).toBeNull();
    mount("adventure", plain);
    expect(screen.queryByTestId("adventure-board")).toBeNull();
  });
});

describe("moverIntent", () => {
  it("covers each outcome and no event", () => {
    const ev = (outcome: string, target?: string) =>
      [
        { type: "ENEMY_ACTIVATION", fighter: "e1/rex", outcome, target },
      ] as GameEvent[];
    expect(moverIntent(ev("ADJACENT", "p1/hero"), VIEW)).toBe(
      "Rex attacks Hero",
    );
    expect(moverIntent(ev("NO_TARGET"), VIEW)).toBe("Rex has no target");
    expect(moverIntent([], VIEW)).toBeNull();
    expect(moverIntent(undefined, VIEW)).toBeNull();
  });
});

describe("team decision (players choose)", () => {
  const prompt = (player: string) => ({
    promptId: "pr1",
    player,
    kind: "CHOOSE_TARGET",
    description: "Choose a hero to be attacked",
    onBehalfOf: "TEAM",
    forSeat: "e1",
    options: [
      { id: "p1/hero", label: "Hero" },
      { id: "p2/sid", label: "Sidekick" },
    ],
  });
  const withPrompt = (you: string, chooser: string) =>
    ({
      ...VIEW,
      you,
      prompt: prompt(chooser),
      players: [
        { id: "p1", heroId: "hero", you: you === "p1" },
        { id: "p2", heroId: "sid", displayName: "Sam", you: you === "p2" },
      ],
    }) as unknown as PlayerView;

  it("shows teammates who is choosing and the read-only options", () => {
    mount("adventure", withPrompt("p1", "p2"));
    expect(screen.getByTestId("adv-team-decision-who")).toHaveTextContent(
      "Sam is choosing",
    );
    expect(screen.getByTestId("adv-team-decision-what")).toHaveTextContent(
      "attacked",
    );
    expect(screen.getByTestId("adv-team-option-p1/hero")).toBeInTheDocument();
  });
  it("tells the chooser they choose, without duplicating options", () => {
    mount("adventure", withPrompt("p2", "p2"));
    expect(screen.getByTestId("adv-team-decision-who")).toHaveTextContent(
      "You choose",
    );
    expect(screen.queryByTestId("adv-team-option-p1/hero")).toBeNull();
  });
  it("ordinary prompts show no banner", () => {
    mount("adventure", {
      ...VIEW,
      prompt: { ...prompt("p1"), onBehalfOf: undefined },
    } as unknown as PlayerView);
    expect(screen.queryByTestId("adv-team-decision")).toBeNull();
  });
});

describe("enemy combat reveal", () => {
  const combatView = (over: object = {}) =>
    ({
      ...VIEW,
      catalog: {
        claw: { title: "Claw Swipe", type: "attack", value: 4, boost: null },
        hide: {
          title: "Thick Hide",
          type: "versatile",
          value: 2,
          defense: 5,
          boost: null,
        },
      },
      combat: {
        attacker: "e1/rex",
        target: "p1/hero",
        attackerCard: {
          instance: "claw#2",
          role: "ATTACK",
          boosts: [],
          effectiveValue: 4,
        },
        defenderCard: null,
        additionalDefenseCard: null,
        ...over,
      },
    }) as unknown as PlayerView;

  it("shows the enemy attack with its owner", () => {
    mount("adventure", combatView());
    expect(screen.getByTestId("adv-combat-value-attack")).toHaveTextContent(
      "4",
    );
    expect(screen.getByTestId("adv-combat-owner-attack")).toHaveTextContent(
      "Rex (Villain)",
    );
    expect(screen.queryByTestId("adv-combat-printed-attack")).toBeNull();
    expect(screen.queryByTestId("adv-combat-defense")).toBeNull();
  });

  it("reads defense ?? value when the enemy defends, showing printed vs effective", () => {
    const v = combatView({
      attacker: "p1/hero",
      target: "e1/rex",
      attackerCard: null,
      defenderCard: {
        instance: "hide#1",
        role: "DEFENSE",
        boosts: ["b#1"],
        effectiveValue: 6,
      },
    });
    expect(enemyCombatModel(v)?.[0]).toMatchObject({
      role: "DEFENSE",
      printed: 5,
      effective: 6,
      boosts: 1,
    });
    mount("adventure", v);
    expect(screen.getByTestId("adv-combat-printed-defense")).toHaveTextContent(
      "PRINTED 5",
    );
  });

  it("is null for hero-vs-hero combat and no combat", () => {
    expect(
      enemyCombatModel(combatView({ attacker: "p1/hero", target: "p1/hero" })),
    ).toBeNull();
    expect(enemyCombatModel(VIEW)).toBeNull();
  });
});

describe("engine fault banner", () => {
  const faulted = () =>
    render(
      <ChakraProvider theme={theme}>
        <FormatOverlay formatId="adventure" view={VIEW} events={EVENTS} engineFault={ENGINE_FAULT_FIXTURE} />
      </ChakraProvider>,
    );

  it("shows a persistent banner with the diagnostic and keeps the board", () => {
    faulted();
    expect(screen.getByTestId("adv-engine-fault-title")).toHaveTextContent(
      "This game hit an engine fault and was stopped",
    );
    expect(screen.getByTestId("adv-engine-fault-message")).toHaveTextContent(ENGINE_FAULT_FIXTURE);
    expect(screen.getByTestId("adv-round")).toHaveTextContent("3");
    expect(screen.getByTestId("adv-engine-fault-leave")).toBeInTheDocument();
  });

  it("clears the mover-intent indicator", () => {
    mount("adventure");
    expect(screen.getByTestId("adv-intent")).toBeInTheDocument();
    cleanup();
    faulted();
    expect(screen.queryByTestId("adv-intent")).toBeNull();
  });

  it("is absent without a fault", () => {
    mount("adventure");
    expect(screen.queryByTestId("adv-engine-fault")).toBeNull();
  });
});

describe("spawned enemies (engine 2.4)", () => {
  it("splits an `<enemy card id>@<fighter>` initiative id; plain ids pass through", () => {
    expect(parseInitiativeCardId("raptor@e1/raptor-2")).toEqual({
      cardId: "raptor",
      fighter: "e1/raptor-2",
    });
    expect(parseInitiativeCardId("c1")).toEqual({ cardId: "c1", fighter: null });
  });

  it("keys the row entry's art on the part before the @ and keeps the full id", () => {
    const view = {
      ...VIEW,
      fighters: [
        ...VIEW.fighters,
        fighter("e1/raptor-2", "Raptor", {
          space: null,
          enemy: { role: "MINION", enemyId: "raptor", move: 2, deckCount: 0, discardTop: null },
        }),
      ],
      initiative: {
        ...VIEW.initiative,
        row: [
          ...VIEW.initiative!.row,
          { id: "raptor@e1/raptor-2", title: "Raptor", entry: "FIGHTER", fighter: "e1/raptor-2" },
        ],
      },
    } as unknown as PlayerView;
    const model = adventureBoardModel(view)!;
    const entry = model.row.find((r) => r.card.id === "raptor@e1/raptor-2")!;
    expect(entry.artKey).toBe("raptor");
    expect(entry.spawnedFighter).toBe("e1/raptor-2");
    expect(model.enemies.map((e) => e.id)).toContain("e1/raptor-2");
    cleanup();
    mount("adventure", view);
    expect(screen.getByTestId("adv-init-raptor@e1/raptor-2")).toHaveAttribute(
      "data-card-art",
      "raptor",
    );
  });
});

describe("overlay placement (#1114)", () => {
  it("docks to the right edge, clear of the top-left seat-plate row", () => {
    cleanup();
    mount("adventure");
    const el = screen.getByTestId("adventure-board");
    expect(el).toHaveStyle({ right: ADVENTURE_BOARD_RIGHT });
    expect(el).not.toHaveStyle({ left: "50%" });
  });
});

// #1128: the fixed Actions dock (z 140) fully covered the enemy dials (z 5).
// jsdom has no layout, so the probe intersects the horizontal extents both
// boxes are pinned to (rem -> px at 16px) at real viewport widths.
type Span = [number, number];
const rem = (v: string) => parseFloat(v) * 16;
const overlaps = (a: Span, b: Span) => a[0] < b[1] && b[0] < a[1];
const spans = (vw: number) => {
  const dock: Span = [vw - rem(DOCK_RIGHT) - rem(DOCK_WIDTH), vw - rem(DOCK_RIGHT)];
  // ADVENTURE_BOARD_RIGHT = calc(<DOCK_RIGHT> + <DOCK_WIDTH> + 0.75rem); board maxW 17rem
  const right = rem(DOCK_RIGHT) + rem(DOCK_WIDTH) + rem("0.75rem");
  const board: Span = [vw - right - rem("17rem"), vw - right];
  return { dock, board };
};

describe("overlay vs Actions dock overlap probe (#1128)", () => {
  it("probe detects a planted box over the dock", () => {
    const { dock } = spans(1500);
    expect(overlaps(dock, [dock[0] + 10, dock[1] - 10])).toBe(true);
    // the pre-fix geometry (right 0.7rem) must be flagged
    expect(overlaps(dock, [1500 - rem("0.7rem") - rem("17rem"), 1500 - rem("0.7rem")])).toBe(true);
  });
  it.each([1500, 1920])("board clears the dock at %ipx", (vw) => {
    const { dock, board } = spans(vw);
    expect(overlaps(dock, board)).toBe(false);
  });
  it("the constant matches the geometry the probe assumes", () => {
    expect(ADVENTURE_BOARD_RIGHT).toBe(`calc(${DOCK_RIGHT} + ${DOCK_WIDTH} + 0.75rem)`);
  });
});
