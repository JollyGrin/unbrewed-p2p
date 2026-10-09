/**
 * Adventure board overlays (Wave 4.3, unbrewed-p2p#1099) — fixture-driven, no engine.
 */
import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import {
  ADVENTURE_BOARD_MAX_HEIGHT,
  ADVENTURE_BOARD_TOP,
  ADVENTURE_BOARD_WIDTH,
  ADVENTURE_PLATE_DROP,
  ADVENTURE_PLATE_DROP_BELOW_PX,
  ADVENTURE_PLATE_PAD_RIGHT,
  CHIP_CLUSTER_WIDTH_REM,
  COMPACT_PLATE_MAX_HEIGHT_REM,
  COMPACT_PLATE_WIDTH_REM,
  DOCK_RIGHT,
  DOCK_TOP,
  DOCK_WIDTH,
  HUD_OVERLAY_INSET,
} from "@/components/Pro/dockLayout";
import { ProHud } from "@/components/Pro/ProHud";
import { theme } from "@/styles/style";
import { FormatOverlay } from "@/components/Pro/FormatOverlay";
import { ADVENTURE_BOARD_RIGHT, ENGINE_FAULT_FIXTURE, InitiativeRow } from "@/components/Pro/AdventureBoard";
import {
  adventureBoardModel,
  enemyCombatModel,
  parseInitiativeCardId,
  teamDecisionModel,
} from "@/lib/pro/adventureBoard";
import {
  ISLA_NUBLAR_IMAGE,
  ISLA_NUBLAR_SPACES,
  ISLA_NUBLAR_SPACE_DIAMETER,
} from "./fixtures/islaNublarSpaces";
import { ADVENTURE_OVERLAY_INSET, boardFitInsetFor } from "@/lib/pro/mobileLayout";
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

// The overlay is lazy (next/dynamic, #1303): load its chunk once, then every mount renders synchronously.
beforeAll(async () => {
  mount("adventure");
  await screen.findByTestId("adventure-board");
  cleanup();
});

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
    expect(screen.getByTestId("adv-init-c3")).toHaveAttribute("data-face-down", "true");
    expect(screen.getAllByTestId(/^adv-threat-\d$/)).toHaveLength(9);
    expect(screen.getByTestId("adv-threat-3")).toHaveAttribute(
      "data-marker",
      "true",
    );
    expect(screen.getByTestId("adv-threat-level")).toHaveTextContent("2");
    expect(screen.getByTestId("adv-scenario")).toHaveTextContent("ISLA NUBLAR");
    expect(screen.getByTestId("adv-scenario")).toHaveAttribute("data-scenario-id", "isla-nublar");
    expect(screen.getByTestId("adv-villain")).toHaveAttribute("data-enemy-id", "indominus-rex");
    expect(screen.getByTestId("adv-enemy-hp-e1/rex")).toHaveTextContent("7/20");
    expect(screen.getByTestId("adv-enemy-deck-e1/rex")).toHaveTextContent(
      "DECK 5",
    );
    expect(screen.queryByTestId("adv-enemy-p1/hero")).toBeNull();
    expect(screen.getByTestId("adv-enemy-turn-title")).toHaveTextContent("REX'S TURN");
    expect(screen.getByTestId("adv-enemy-turn-result")).toHaveTextContent("moves toward Hero");
  });

  it("round strip: done / now / face-down states, NOW name, still-to-flip (#1155)", () => {
    mount("adventure");
    expect(screen.getByTestId("adv-init-c1")).toHaveAttribute("data-state", "done");
    expect(screen.getByTestId("adv-init-c2")).toHaveAttribute("data-state", "now");
    expect(screen.getByTestId("adv-init-c3")).toHaveAttribute("data-state", "down");
    expect(screen.getByTestId("adv-now")).toHaveTextContent("NOW · REX");
    expect(screen.getByTestId("adv-still-to-flip")).toHaveTextContent("5 STILL TO FLIP");
  });

  it("round strip: END_OF_ROUND says so; a reshuffled row resets every state", () => {
    const eor = { ...VIEW, initiative: { ...VIEW.initiative!, phase: "END_OF_ROUND" } } as PlayerView;
    const { unmount } = mount("adventure", eor);
    expect(screen.getByTestId("adv-phase")).toHaveTextContent("END OF ROUND · REX");
    unmount();
    const reshuffled = {
      ...VIEW,
      initiative: {
        round: 4,
        phase: "REVEAL",
        deckCount: 3,
        current: null,
        row: [{ id: "c1", entry: "SEAT", faceDown: true }],
      },
    } as unknown as PlayerView;
    mount("adventure", reshuffled);
    expect(screen.getByTestId("adv-init-c1")).toHaveAttribute("data-state", "down");
    expect(screen.queryByTestId("adv-now")).toBeNull();
  });

  it("hands the enemy turn's mover → target arrow to the board, from its one enemy-turn state (#1303)", () => {
    const arrows: unknown[] = [];
    render(
      <ChakraProvider theme={theme}>
        <FormatOverlay formatId="adventure" view={VIEW} events={EVENTS} onBoardArrow={(a) => arrows.push(a)} />
      </ChakraProvider>,
    );
    expect(arrows.at(-1)).toEqual({ attacker: "e1/rex", target: "p1/hero" });
    cleanup();
    expect(arrows.at(-1)).toBeNull();
  });

  it("clears the narrator card once the game is over (#1182)", () => {
    mount("adventure", { ...VIEW, winner: "e1" } as unknown as PlayerView);
    expect(screen.queryByTestId("adv-enemy-turn")).toBeNull();
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
      "Sam is choosing for",
    );
    expect(screen.getByTestId("adv-team-decision-what")).toHaveTextContent(
      "attacked",
    );
    expect(screen.getByTestId("adv-team-option-p1/hero")).toBeInTheDocument();
  });
  it("tells the chooser they choose, without duplicating options", () => {
    mount("adventure", withPrompt("p2", "p2"));
    expect(screen.getByTestId("adv-team-decision-who")).toHaveTextContent(
      "You're choosing for",
    );
    expect(screen.getByTestId("adv-team-decision-who")).toHaveTextContent(
      "Choose a hero to be attacked",
    );
    expect(screen.getByTestId("adv-team-decision-guidance")).toBeInTheDocument();
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

  it("clears the enemy-turn card", () => {
    mount("adventure");
    expect(screen.getByTestId("adv-enemy-turn")).toBeInTheDocument();
    cleanup();
    faulted();
    expect(screen.queryByTestId("adv-enemy-turn")).toBeNull();
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

// #1135: five plates (4 heroes + the engine seat) ran under the overlay at 1500px.
// Geometry model of HudOverlay: a wrapping flex row of 15rem plates, 0.6rem gap,
// inset 0.6rem each side, plus a right padding. Returns the rightmost plate edge.
const plateRowRight = (vw: number, plates: number, padRight: number) => {
  const plate = rem("15rem");
  const gap = rem("0.6rem");
  const left = rem(HUD_OVERLAY_INSET);
  const avail = vw - 2 * left - padRight;
  const perRow = Math.max(1, Math.floor((avail + gap) / (plate + gap)));
  const inRow = Math.min(plates, perRow);
  return left + inRow * plate + (inRow - 1) * gap;
};
const OLD_PAD = rem("8.5rem");
const NEW_PAD =
  rem(DOCK_RIGHT) + rem(DOCK_WIDTH) + rem("0.75rem") + rem(ADVENTURE_BOARD_WIDTH) + rem("0.75rem") - rem(HUD_OVERLAY_INSET);

describe("seat-plate row vs overlay probe (#1135)", () => {
  it("probe flags the pre-fix geometry (planted box): 5 plates at 1500 reach the overlay", () => {
    const { board } = spans(1500);
    expect(plateRowRight(1500, 5, OLD_PAD)).toBeGreaterThan(board[0]);
    expect(overlaps([0, plateRowRight(1500, 5, OLD_PAD)], board)).toBe(true);
  });
  it("the padding constant matches the geometry the probe assumes", () => {
    expect(ADVENTURE_PLATE_PAD_RIGHT).toBe(
      `calc(${DOCK_RIGHT} + ${DOCK_WIDTH} + 0.75rem + ${ADVENTURE_BOARD_WIDTH} + 0.75rem - ${HUD_OVERLAY_INSET})`,
    );
  });
  it.each([
    [1500, 2],
    [1500, 4],
    [1920, 2],
    [1920, 4],
  ])("plates clear the overlay and dock at %ipx with %i heroes", (vw, heroes) => {
    const { dock, board } = spans(vw);
    const right = plateRowRight(vw, heroes + 1, NEW_PAD);
    expect(overlaps([0, right], board)).toBe(false);
    expect(overlaps([0, right], dock)).toBe(false);
  });
  it("ProHud pads the plate row only on an adventure view", () => {
    const hud = (view: PlayerView) => (
      <ChakraProvider theme={theme}>
        <ProHud view={view} status="open" roomId="r" resolveCard={() => null} resolveHero={() => null} labelFor={() => ""} />
      </ChakraProvider>
    );
    const base = { you: "p1", phase: "PLAY", catalog: {}, tokens: [], players: [], self: { id: "p1", hand: [], discard: [], counters: {}, flags: {} } };
    const adv = { ...base, ...(VIEW as object) } as unknown as PlayerView;
    const plain = { ...base, fighters: [] } as unknown as PlayerView;
    cleanup();
    const a = render(hud(adv));
    expect(a.baseElement.querySelectorAll("[data-adventure]").length).toBe(1);
    cleanup();
    const b = render(hud(plain));
    expect(b.baseElement.querySelectorAll("[data-adventure]").length).toBe(0);
  });
});

// #1138: the #1137 wrapped second plate row sat over the board and swallowed clicks.
// Box model of everything fixed over the board (px, viewport coords), checked against
// every Isla Nublar space's hit circle. jsdom has no layout, so heights are the bounds
// the CSS pins (compact plate max-height) or the values Checkpoint 4 measured in Chrome
// for the legacy full plate (9.6rem tall; plate row starts 0.6rem down).
type Box = { id: string; x0: number; y0: number; x1: number; y1: number };
const boxHit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const ROW_TOP = rem(HUD_OVERLAY_INSET);
const PLATE_WIDTH_REM = 15;
const LEGACY_PLATE_H = rem("9.6rem");
const ASPECT = ISLA_NUBLAR_IMAGE.height / ISLA_NUBLAR_IMAGE.width;
// Measured at 1500x950 by Checkpoint 4: the board image is 1040px wide at (78,120).
const BOARD_1500 = { x: 78, y: 120, w: 1040 };

const plateBoxes = (vw: number, heroes: number, compactMode: boolean | "legacy", dropped = true): Box[] => {
  const n = heroes + 1;
  const compact = compactMode === true;
  const pw = rem(`${compact ? COMPACT_PLATE_WIDTH_REM : PLATE_WIDTH_REM}rem`);
  const ph = compact ? rem(`${COMPACT_PLATE_MAX_HEIGHT_REM}rem`) : LEGACY_PLATE_H;
  const gap = rem("0.6rem");
  const top = ROW_TOP + (dropped && vw <= ADVENTURE_PLATE_DROP_BELOW_PX ? rem(ADVENTURE_PLATE_DROP) : 0);
  const avail = vw - 2 * ROW_TOP - NEW_PAD;
  const perRow = Math.max(1, Math.floor((avail + gap) / (pw + gap)));
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x0 = ROW_TOP + col * (pw + gap);
    const y0 = top + row * (ph + gap);
    return { id: `plate${i + 1}`, x0, y0, x1: x0 + pw, y1: y0 + ph };
  });
};
const fixedBoxes = (vw: number): Box[] => {
  const { dock, board } = spans(vw);
  return [
    { id: "dock", x0: dock[0], y0: rem(DOCK_TOP), x1: dock[1], y1: rem(DOCK_TOP) + 400 },
    { id: "overlay", x0: board[0], y0: rem(DOCK_TOP), x1: board[1], y1: rem(DOCK_TOP) + 380 },
  ];
};
// Hit circles of the map's spaces. The board's top edge is the pt="7.5rem" strip; `w` is
// the board image width (a space can never sit above its board, so w only moves them down).
const spaceCircles = (board: { x: number; y: number; w: number }): Box[] =>
  ISLA_NUBLAR_SPACES.map((s) => {
    const r = (ISLA_NUBLAR_SPACE_DIAMETER * board.w) / 2;
    const cx = board.x + s.x * board.w;
    const cy = board.y + s.y * ASPECT * board.w;
    return { id: s.id, x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
  });
const covered = (boxes: Box[], circles: Box[]) =>
  boxes.flatMap((b) => circles.filter((c) => boxHit(b, c)).map((c) => `${b.id}x${c.id}`));
const mutual = (boxes: Box[]) =>
  boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => boxHit(a, b)).map((b) => `${a.id}x${b.id}`));

describe("plates/overlay/dock never cover a board space (#1138)", () => {
  it("probe flags a planted box over a space", () => {
    const circles = spaceCircles(BOARD_1500);
    const s7 = circles.find((c) => c.id === "s7")!;
    const planted: Box = { id: "planted", x0: s7.x0 + 2, y0: s7.y0 + 2, x1: s7.x1 - 2, y1: s7.y1 - 2 };
    expect(covered([planted], circles)).toContain("plantedxs7");
    expect(mutual([planted, { ...planted, id: "other" }])).toEqual(["plantedxother"]);
  });
  it("FAILS on the #1137 geometry: 4 heroes at 1500 wrap full plates over s2, s3, s7 …", () => {
    const hits = covered(plateBoxes(1500, 4, "legacy"), spaceCircles(BOARD_1500));
    expect(hits.length).toBeGreaterThan(0);
    for (const s of ["s2", "s3", "s7"]) expect(hits.some((h) => h.endsWith(`x${s}`))).toBe(true);
  });
  it.each([
    [1500, 2],
    [1500, 4],
    [1920, 2],
    [1920, 4],
  ])("at %ipx with %i heroes: one plate row, no box overlaps another or any space", (vw, heroes) => {
    const plates = plateBoxes(vw, heroes, true);
    expect(new Set(plates.map((p) => p.y0)).size).toBe(1); // single row, never wrapped
    const fixed = fixedBoxes(vw);
    expect(mutual([...plates, ...fixed])).toEqual([]);
    // the board is at most the viewport wide; a wider board only pushes spaces lower/right
    for (const w of [BOARD_1500.w, vw - 2 * 78]) {
      expect(covered(plates, spaceCircles({ x: 78, y: rem(DOCK_TOP), w }))).toEqual([]);
    }
  });
  it("the compact plate fits the strip above the board, even dropped under the toolbar", () => {
    const drop = rem(ADVENTURE_PLATE_DROP);
    expect(ROW_TOP + drop + rem(`${COMPACT_PLATE_MAX_HEIGHT_REM}rem`)).toBeLessThanOrEqual(rem(DOCK_TOP));
  });
  it("ProHud: adventure plates are compact; other formats keep the 15rem plate", () => {
    const base = { you: "p1", phase: "PLAY", catalog: {}, tokens: [], players: [], self: { id: "p1", hand: [], discard: [], counters: {}, flags: {} } };
    const adv = { ...base, ...(VIEW as object) } as unknown as PlayerView;
    const plain = { ...base, fighters: [] } as unknown as PlayerView;
    const widths = (view: PlayerView) => {
      cleanup();
      const r = render(
        <ChakraProvider theme={theme}>
          <ProHud view={view} status="open" roomId="r" resolveCard={() => null} resolveHero={() => null} labelFor={() => ""} />
        </ChakraProvider>,
      );
      return Array.from(r.baseElement.querySelectorAll<HTMLElement>("[style*='width: ']"))
        .map((e) => e.style.width)
        .filter((w) => w === "10rem" || w === "15rem");
    };
    const a = widths(adv);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((w) => w === "10rem")).toBe(true);
    const p = widths(plain);
    expect(p).not.toContain("10rem");
  });
});

// #1139: the right-docked overlay column (turn-order row + "players choose" panel + threat
// track + dials) is ~272x380+ and sat over the board's right side: enclosure 07 (= s10, the
// third-from-last in the map's enclosures order) and s16 at 1500px. The board now FITS clear
// of the column, via boardFitInsetFor({ formatOverlayRight }), instead of running under it.
const ENCLOSURE_SPACES = ["s19", "s18", "s24", "s42", "s41", "s11", "s10", "s49"]; // printed 01..08
const boardRectFor = (vw: number, vh: number, adventureOverlay: boolean) => {
  const inset = boardFitInsetFor({ mode: "desktop", formatOverlayRight: adventureOverlay ? ADVENTURE_OVERLAY_INSET : 0 });
  const aw = vw - inset.left - inset.right;
  const ah = vh - inset.top - inset.bottom;
  const w = Math.min(aw, ah / ASPECT);
  return { x: inset.left + (aw - w) / 2, y: inset.top + (ah - w * ASPECT) / 2, w };
};
// The overlay's full footprint: docked at top 3.2rem, capped by maxH calc(100vh - 4rem).
const overlayBox = (vw: number, vh: number): Box => {
  const { board } = spans(vw);
  return { id: "overlay", x0: board[0], y0: rem("3.2rem"), x1: board[1], y1: rem("3.2rem") + vh - 64 };
};

describe("overlay column never covers an enclosure badge or space (#1139)", () => {
  it("probe flags a planted box over enclosure 07 (s10)", () => {
    const circles = spaceCircles(boardRectFor(1500, 950, false));
    const s10 = circles.find((c) => c.id === "s10")!;
    const planted: Box = { id: "planted", x0: s10.x0 + 2, y0: s10.y0 + 2, x1: s10.x1 - 2, y1: s10.y1 - 2 };
    expect(ENCLOSURE_SPACES.indexOf("s10") + 1).toBe(7);
    expect(covered([planted], circles)).toContain("plantedxs10");
  });
  it("FAILS on the old geometry: at 1500x950 the column covers enclosure 07 (s10) and s16", () => {
    const hits = covered([overlayBox(1500, 950)], spaceCircles(boardRectFor(1500, 950, false)));
    expect(hits).toContain("overlayxs10");
    expect(hits).toContain("overlayxs16");
  });
  it.each([
    [1500, 950, 2],
    [1500, 950, 4],
    [1920, 1080, 2],
    [1920, 1080, 4],
  ])("at %ix%i with %i heroes: column, dock and plates clear every space", (vw, vh, heroes) => {
    const circles = spaceCircles(boardRectFor(vw, vh, true));
    const boxes = [overlayBox(vw, vh), ...fixedBoxes(vw).filter((b) => b.id === "dock"), ...plateBoxes(vw, heroes, true)];
    expect(covered(boxes, circles)).toEqual([]);
    expect(covered(boxes, circles.filter((c) => ENCLOSURE_SPACES.includes(c.id)))).toEqual([]);
  });
  it("only an adventure room reserves the column; the desktop inset is otherwise unchanged", () => {
    const base = boardFitInsetFor({ mode: "desktop" });
    expect(base.right).toBe(320);
    expect(boardFitInsetFor({ mode: "desktop", formatOverlayRight: ADVENTURE_OVERLAY_INSET }).right).toBe(320 + 284);
    expect(boardFitInsetFor({ mode: "portrait", formatOverlayRight: ADVENTURE_OVERLAY_INSET })).toEqual(boardFitInsetFor({ mode: "portrait" }));
  });
});

// #1145 (1): the initiative row sat LEFT of its clipped column (align flex-end + a nowrap
// chip row wider than the column), cutting the scenario header and the first chip.
// Model: the panel is as wide as its content, capped at the column only when the chips wrap.
const CHIP_W = (label: string) => label.length * rem("0.7rem") * 0.55 + 2 * rem("0.4rem") + 2;
const PANEL_PAD = 2 * rem("0.6rem");
const CHIP_LABELS = [
  "Indominus Rex (defeated)", "Therizinosaurus", "Tyrannosaurus Rex", "Gallimimus", "Parasaurolophus", "Hero One", "Hero Two",
];
const initiativePanelBox = (vw: number, chips: string[], wraps: boolean): Box => {
  const { board } = spans(vw);
  const colW = rem(ADVENTURE_BOARD_WIDTH);
  const content = chips.reduce((w, c) => w + CHIP_W(c), 0) + (chips.length - 1) * rem("0.25rem") + PANEL_PAD;
  const w = wraps ? Math.min(content, colW) : content;
  return { id: "initiative", x0: board[1] - w, y0: 0, x1: board[1], y1: 1 };
};
const chipsWrap = () => {
  cleanup();
  const model = adventureBoardModel(VIEW as unknown as PlayerView)!;
  render(
    <ChakraProvider theme={theme}>
      <InitiativeRow model={model} />
    </ChakraProvider>,
  );
  return getComputedStyle(screen.getByTestId("adv-init-chips")).flexWrap === "wrap";
};

describe("initiative row stays inside its overlay column (#1145)", () => {
  it("probe flags a planted nowrap row left of the column", () => {
    const { board } = spans(1500);
    expect(initiativePanelBox(1500, CHIP_LABELS, false).x0).toBeLessThan(board[0]);
  });
  it("the chip row wraps (the rendered style the probe relies on)", () => {
    expect(chipsWrap()).toBe(true);
  });
  it.each([
    [1500, 2],
    [1500, 4],
    [1920, 2],
    [1920, 4],
  ])("at %ipx with %i heroes: 6+ chips never reach left of the column", (vw, heroes) => {
    const { board } = spans(vw);
    const chips = CHIP_LABELS.slice(0, 5 + heroes - 1);
    expect(chips.length).toBeGreaterThanOrEqual(6);
    expect(initiativePanelBox(vw, chips, chipsWrap()).x0).toBeGreaterThanOrEqual(board[0]);
  });
});

// #1145 (2): at 1500px the fifth plate sat under the top-right chip cluster, hiding TURN.
const clusterBox = (vw: number): Box => ({
  id: "cluster",
  x0: vw - rem("0.7rem") - rem(`${CHIP_CLUSTER_WIDTH_REM}rem`),
  y0: rem("0.7rem"),
  x1: vw - rem("0.7rem"),
  y1: rem("2.4rem"),
});
describe("plates clear the top-right chip cluster (#1145)", () => {
  it("probe: the undropped 4-hero row at 1500 runs under the cluster", () => {
    expect(mutual([...plateBoxes(1500, 4, true, false), clusterBox(1500)])).toContain("plate5xcluster");
  });
  it.each([
    [1500, 2],
    [1500, 4],
    [1920, 2],
    [1920, 4],
  ])("at %ipx with %i heroes: no plate under the cluster, none over a space", (vw, heroes) => {
    const plates = plateBoxes(vw, heroes, true);
    expect(mutual([...plates, clusterBox(vw)])).toEqual([]);
    expect(covered(plates, spaceCircles({ x: 78, y: rem(DOCK_TOP), w: BOARD_1500.w }))).toEqual([]);
    expect(Math.max(...plates.map((p) => p.y1))).toBeLessThanOrEqual(rem(DOCK_TOP));
  });
});

// #1154: the villain board column.
describe("villain board (#1154)", () => {
  const withScenario = (threat: object, objectives: object[], enemyExtra: object = {}) =>
    ({
      ...VIEW,
      catalog: { "slam": { title: "Killing for Sport" } },
      fighters: [
        VIEW.fighters[0],
        {
          ...VIEW.fighters[1],
          size: "LARGE",
          enemy: { role: "VILLAIN", enemyId: "indominus-rex", move: 2, deckCount: 5, discardTop: "slam#1", ...enemyExtra },
        },
        fighter("e2/trex", "T. Rex", {
          size: "LARGE",
          hp: 6,
          maxHp: 6,
          enemy: { role: "MINION", move: 1, deckCount: 3, discardTop: null, released: true },
        }),
      ],
      scenario: {
        ...VIEW.scenario,
        threat: { position: 4, level: 2, overflows: 0, positions: [1, 1, 2, 2, 2, 3, 3, 4], ...threat },
        objectives,
      },
    }) as unknown as PlayerView;
  const OBJ = [1, 2, 3, 4].map((n) => ({ id: `o${n}`, label: `Enclosure 0${n}`, fired: 0 }));

  it("last played resolves the enemy card-id form (…#p5.enemy-1.1) and the plain #n form", () => {
    for (const id of ["slam#p5.enemy-1.1", "slam#1"]) {
      const m = adventureBoardModel(withScenario({}, OBJ, { discardTop: id }))!;
      expect(m.villain!.lastPlayed).toBe("Killing for Sport");
    }
  });

  it("header shows scenario.briefing.objective (v36 object), and omits it without a briefing", () => {
    const briefing = { tagline: "t", objective: "Keep the park open", win: "w", lose: "l" };
    const v = withScenario({}, OBJ);
    const withBriefing = { ...v, scenario: { ...v.scenario, briefing } } as unknown as PlayerView;
    expect(adventureBoardModel(withBriefing)!.objective).toBe("Keep the park open");
    mount("adventure", withBriefing);
    expect(screen.getByTestId("adv-villain-objective")).toHaveTextContent("Keep the park open");
    cleanup();
    expect(adventureBoardModel(v)!.objective).toBeNull();
  });

  it("model: steps to breakout and terminal label are correct, also after an overflow reset", () => {
    expect(adventureBoardModel(withScenario({}, OBJ))!.threat).toMatchObject({
      stepsToBreakout: 5,
      terminal: { label: "Enclosure 01", marker: false },
    });
    const reset = adventureBoardModel(
      withScenario({ position: 1, overflows: 1 }, [{ ...OBJ[0], fired: 1 }, ...OBJ.slice(1)]),
    )!.threat!;
    expect(reset.stepsToBreakout).toBe(8);
    expect(reset.overflows).toBe(1);
    expect(reset.terminal.label).toBe("Enclosure 02");
    expect(adventureBoardModel(withScenario({ position: 8 }, OBJ))!.threat!.stepsToBreakout).toBe(1);
  });

  it("renders all five blocks with live values", () => {
    mount("adventure", withScenario({}, [{ ...OBJ[0], fired: 1 }, ...OBJ.slice(1)]));
    expect(screen.getByTestId("adv-villain-line")).toHaveTextContent("VILLAIN · LARGE · MOVE 2");
    expect(screen.getByTestId("adv-villain-last-played")).toHaveTextContent("Killing for Sport");
    expect(screen.getByTestId("adv-threat-terminal")).toHaveTextContent("ENCLOSURE 02");
    expect(screen.getByTestId("adv-threat-steps")).toHaveTextContent("5 steps");
    expect(screen.getByTestId("adv-objectives-count")).toHaveTextContent("1 of 4 · the 4th ends the game");
    expect(screen.getByTestId("adv-objective-1")).toHaveAttribute("data-fired", "true");
    expect(screen.getByTestId("adv-objective-4")).toHaveTextContent("LOSE");
    expect(screen.getByTestId("adv-win-line")).toHaveTextContent("To win: Rex to 0 and T. Rex (6/6) defeated");
    expect(screen.getByTestId("adv-enemy-released-e2/trex")).toBeInTheDocument();
    expect(screen.queryByTestId("adv-enemy-e1/rex")).toBeNull();
  });

  // #1176: Isla Nublar shape — enclosure-destroyed repeats 3x, then fourth-enclosure (4 fires, last loses).
  const ISLA = (fired: [number, number]) => [
    { id: "enclosure-destroyed", label: "ENCLOSURE DESTROYED!", fired: fired[0], repeat: 3 },
    { id: "fourth-enclosure", label: "FOURTH ENCLOSURE DESTROYED", fired: fired[1] },
  ];

  it("Isla shape: a repeating objective expands to one slot per fire; the 4th loses", () => {
    mount("adventure", withScenario({}, ISLA([0, 0])));
    expect(screen.getByTestId("adv-objectives-count")).toHaveTextContent("0 of 4 · the 4th ends the game");
    expect(screen.getByTestId("adv-objective-4")).toHaveTextContent("LOSE");
    expect(screen.getByTestId("adv-threat-terminal")).toHaveTextContent("ENCLOSURE DESTROYED!");
  });

  it("Isla shape: terminal cell tracks the next unfired slot, not the next unfired objective", () => {
    const model = (f: [number, number]) => adventureBoardModel(withScenario({}, ISLA(f)))!;
    expect(model([1, 0]).threat!.terminal.label).toBe("ENCLOSURE DESTROYED!");
    expect(model([1, 0]).objectives!.lost).toBe(1);
    expect(model([2, 0]).objectives!.lost).toBe(2);
    expect(model([3, 0]).threat!.terminal.label).toBe("FOURTH ENCLOSURE DESTROYED");
    expect(model([3, 0]).objectives!.slots.map((x) => x.fired)).toEqual([true, true, true, false]);
  });

  it("any objective count works, and missing optional fields just hide their bits", () => {
    mount("adventure", withScenario({}, OBJ.slice(0, 2), { discardTop: null }));
    expect(screen.getByTestId("adv-objectives-count")).toHaveTextContent("0 of 2 · the 2nd ends the game");
    expect(screen.queryByTestId("adv-villain-last-played")).toBeNull();
    expect(screen.queryByTestId("adv-villain-objective")).toBeNull();
    cleanup();
    mount("adventure", VIEW); // no objectives, no minions
    expect(screen.queryByTestId("adv-objectives")).toBeNull();
    expect(screen.getByTestId("adv-villain")).toBeInTheDocument();
  });
});

describe("heroes down, sidekick standing (#1154)", () => {
  const v = (heroDefeated: boolean, sideDefeated: boolean) =>
    ({
      ...VIEW,
      fighters: [
        fighter("p1/hero", "Hero", { defeated: heroDefeated }),
        fighter("p1/side", "Sidekick", { kind: "SIDEKICK", defeated: sideDefeated }),
        VIEW.fighters[1],
      ],
      scenario: { ...VIEW.scenario, objectives: [{ id: "o1", label: "Enclosure 01", fired: 0 }] },
    }) as unknown as PlayerView;
  it("says so only when every hero is down and a sidekick lives", () => {
    expect(adventureBoardModel(v(true, false))!.win!.heroesDownSidekick).toBe("Sidekick");
    expect(adventureBoardModel(v(false, false))!.win!.heroesDownSidekick).toBeNull();
    expect(adventureBoardModel(v(true, true))!.win!.heroesDownSidekick).toBeNull();
  });
  it("renders the line", () => {
    mount("adventure", v(true, false));
    expect(screen.getByTestId("adv-heroes-down")).toHaveTextContent("Your heroes are down — Sidekick is still standing");
  });
});

// #1178: at 1500x900 the column ran to calc(100vh - 4rem) from 3.2rem, under the desktop
// hand fan (cards 8.5rem wide, 63:88, bottom -0.75rem, 1.25rem hover lift), and could not
// scroll. Vertical probe: the column's bottom edge vs the fan's top edge.
describe("adventure column vs hand fan probe (#1178)", () => {
  const fanTop = (vh: number) => vh - (rem("8.5rem") * (88 / 63) - rem("0.75rem")) + 0 - rem("1.25rem");
  const columnBottom = (vh: number, maxH: string) => {
    const m = /calc\(100vh - ([\d.]+)rem(?: - ([\d.]+)rem)?\)/.exec(maxH)!;
    return rem(ADVENTURE_BOARD_TOP) + vh - rem(m[1]) - (m[2] ? rem(m[2]) : 0);
  };
  const OLD_MAX_H = "calc(100vh - 4rem)";
  it("probe flags the pre-fix cap at 1500x900", () => {
    expect(columnBottom(900, OLD_MAX_H)).toBeGreaterThan(fanTop(900));
  });
  it.each([
    [1500, 900, 2],
    [1500, 900, 4],
  ])("column ends above the fan at %ix%i with %i heroes", (_vw, vh) => {
    expect(columnBottom(vh, ADVENTURE_BOARD_MAX_HEIGHT)).toBeLessThanOrEqual(fanTop(vh));
  });
  it("keeps the live panels outside the scrolling region and the roster inside it", () => {
    mount("adventure", VIEW);
    cleanup();
    render(
      <ChakraProvider theme={theme}>
        <FormatOverlay formatId="adventure" view={VIEW} events={EVENTS} engineFault={ENGINE_FAULT_FIXTURE} />
      </ChakraProvider>,
    );
    const col = screen.getByTestId("adventure-board");
    expect(col).toHaveStyle({ "max-height": ADVENTURE_BOARD_MAX_HEIGHT });
    expect(screen.getByTestId("adventure-board-scroll")).toHaveStyle({ "overflow-y": "auto" });
    expect(screen.getByTestId("adventure-board-scroll")).toContainElement(screen.getByTestId("adv-villain"));
    expect(screen.getByTestId("adventure-board-live")).toContainElement(screen.getByTestId("adv-engine-fault"));
  });
});

describe("teamDecisionModel readability (#1169)", () => {
  const base = (kind: string, options: { id: string; label: string }[]) =>
    ({
      fighters: [
        fighter("p1/hero", "Leon", { owner: "p1" }),
        fighter("e1/rex", "Indominus Rex", { owner: "e1", kind: "ENEMY" }),
      ],
      you: "p1",
      map: { spaces: ["s12", "s17", "s18", "s2"].map((id) => ({ id })) },
      players: [
        { id: "p1", heroId: "leon-s-kennedy", you: true },
        { id: "p2", heroId: "hollow-oak-spice", you: false },
      ],
      prompt: {
        promptId: "x",
        player: "p2",
        kind,
        onBehalfOf: "TEAM",
        forSeat: "e1",
        options,
      },
    }) as unknown as PlayerView;
  const text = (m: ReturnType<typeof teamDecisionModel>) =>
    JSON.stringify([m?.chooser, m?.forName, m?.options.map((o) => o.label)]);

  it("names the chooser by hero name, not deck id", () => {
    const v = base("CHOOSE_SPACE", [{ id: "s2", label: "s2" }]);
    (v.fighters as unknown as { owner: string }[])[0].owner = "p2";
    expect(teamDecisionModel(v)?.chooser).toBe("Leon");
  });
  it("names the engine seat by its fighter, not its hero id", () => {
    const v = base("CHOOSE_SPACE", [{ id: "s2", label: "s2" }]);
    (v as unknown as { players: unknown[] }).players.push({ id: "e1", heroId: "indominus-rex", you: false });
    expect(teamDecisionModel(v)?.forName).toBe("Indominus Rex");
  });
  it("space prompts become a count plus highlighted spaces", () => {
    const m = teamDecisionModel(
      base("CHOOSE_SPACE", [
        { id: "s2", label: "s2" },
        { id: "s17", label: "s17" },
      ]),
    );
    expect(m?.options).toEqual([{ id: "spaces", label: "2 spaces" }]);
    expect(m?.spaces).toEqual(["s2", "s17"]);
    expect(text(m)).not.toMatch(/\bs\d+/);
  });
  it("two-step routes read 'route i of n'", () => {
    const m = teamDecisionModel(
      base("CHOOSE_SPACE", [
        { id: "s12|s17", label: "s12|s17" },
        { id: "s12|s18", label: "s12|s18" },
      ]),
    );
    expect(m?.options.map((o) => o.label)).toEqual(["route 1 of 2", "route 2 of 2"]);
    expect(m?.spaces).toEqual(["s12", "s17", "s18"]);
    expect(text(m)).not.toMatch(/s1[78]/);
  });
  it("target prompts show fighter names; option prompts keep labels", () => {
    const t = teamDecisionModel(base("CHOOSE_TARGET", [{ id: "p1/hero", label: "p1/hero" }]));
    expect(t?.options[0].label).toBe("Leon");
    const o = teamDecisionModel(base("CHOOSE_OPTION", [{ id: "a", label: "Discard a card" }]));
    expect(o?.options[0].label).toBe("Discard a card");
  });
});

// #1181: chips truncated to identical stubs ("Darth…") and the strip wrapped to 3 rows at 4 heroes.
describe("initiative strip chips are distinguishable and stay within 2 rows (#1181)", () => {
  const seats = ["p1", "p2", "p3", "p4"];
  const BIG = {
    ...VIEW,
    players: undefined,
    fighters: [
      ...seats.map((s, i) => fighter(`${s}/h`, i < 2 ? "Darth Vader" : `Hero ${i}`, { owner: s })),
      ...["a", "b", "c", "d"].map((k, i) =>
        fighter(`e${i}/x`, i < 2 ? "Indominus Rex" : `Raptor ${i}`, {
          kind: "ENEMY",
          owner: "ai",
          enemy: { role: i === 0 ? "VILLAIN" : "MINION", enemyId: `en-${k}`, move: 2, deckCount: 3, discardTop: null },
        }),
      ),
    ],
    initiative: {
      round: 2,
      phase: "TURN",
      deckCount: 3,
      current: "s2",
      row: [
        ...seats.map((s, i) => ({ id: `s${i + 1}`, title: `Seat card ${i + 1}`, entry: "SEAT", seat: s })),
        ...[0, 1, 2, 3].map((i) => ({ id: `f${i}`, title: `Bite ${i}`, entry: "FIGHTER", fighter: `e${i}/x` })),
        ...[0, 1, 2, 3].map((i) => ({ id: `d${i}`, entry: "EFFECT", faceDown: true })),
      ],
    },
  } as unknown as PlayerView;
  const mountRow = (view: PlayerView) => {
    cleanup();
    render(
      <ChakraProvider theme={theme}>
        <InitiativeRow model={adventureBoardModel(view)!} />
      </ChakraProvider>,
    );
    return Array.from(screen.getByTestId("adv-init-chips").children) as HTMLElement[];
  };

  it("same-name chips get unique tooltips and an ordinal badge", () => {
    mountRow(BIG);
    const tips = ["s1", "s2", "f0", "f1"].map((id) => screen.getByTestId(`adv-init-${id}`).getAttribute("title"));
    expect(new Set(tips).size).toBe(4);
    expect(tips[0]).toContain("Darth Vader");
    expect(screen.getByTestId("adv-init-dup-s1")).toHaveTextContent("1");
    expect(screen.getByTestId("adv-init-dup-s2")).toHaveTextContent("2");
    expect(screen.queryByTestId("adv-init-dup-s3")).toBeNull();
  });
  it("chips carry no truncated name label", () => {
    mountRow(BIG);
    expect(screen.getByTestId("adv-init-s1")).not.toHaveTextContent("Darth");
  });
  it("4 heroes + 4 enemies + face-down cards fit 2 rows in the 17rem column at 1500px", () => {
    const chips = mountRow(BIG).filter((c) => c.dataset.state);
    const inner = rem(ADVENTURE_BOARD_WIDTH) - 2 * rem("0.6rem") - 2;
    const wOf = (c: HTMLElement) => (c.dataset.faceDown ? rem("1.5rem") : rem("2rem"));
    let rows = 1;
    let x = 0;
    for (const c of chips) {
      const w = wOf(c);
      if (x > 0 && x + rem("0.2rem") + w > inner) {
        rows++;
        x = w;
      } else x += (x > 0 ? rem("0.2rem") : 0) + w;
    }
    // the "k STILL TO FLIP" text rides the same row
    expect(rows).toBeLessThanOrEqual(2);
    expect(chips).toHaveLength(12);
  });
});
