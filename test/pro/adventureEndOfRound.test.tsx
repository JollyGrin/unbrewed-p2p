/**
 * END OF ROUND on the initiative row (#1149): printed boxes on revealed row cards (engine #819),
 * the card face on hover/tap, the AT ROUND END box, and the left→right walk.
 */
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { theme } from "@/styles/style";
import { FormatOverlay } from "@/components/Pro/FormatOverlay";
import { adventureBoardModel, endOfRoundResolvingId, firstLineOf } from "@/lib/pro/adventureBoard";
import { endOfRoundSteps } from "@/lib/pro/endOfRoundWalk";
import { END_OF_ROUND_STEP_MS } from "@/lib/pro/useEndOfRoundWalk";
import { enrichLines } from "@/lib/pro/gameLog";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";

const ANKY_EOR = "Deal 1 damage to each hero and sidekick adjacent to Ankylosaurus.";
const GALLI_EOR =
  "Move Gallimimus to their Stampede marker, following the shortest route. They may move through spaces containing opposing fighters.\n\nDeal 1 damage to any hero or sidekick they moved through.";

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

const enemy = (id: string, name: string, enemyId: string) =>
  fighter(id, name, { owner: "e1", enemy: { role: "MINION", enemyId, move: 3, deckCount: 4, discardTop: null } });

const ROW = [
  { id: "seat:p1", title: "Hero", entry: "SEAT", seat: "p1" },
  { id: "ankylosaurus", title: "Ankylosaurus", entry: "FIGHTER", fighter: "e1/anky", move: 2, rightNow: "Ankylosaurus attacks.", endOfRound: ANKY_EOR },
  { id: "gallimimus@e1/galli", title: "Gallimimus", entry: "FIGHTER", fighter: "e1/galli", move: 0, endOfRound: GALLI_EOR },
  { id: "x", entry: "FIGHTER", faceDown: true },
];

const view = (init: object = {}, extra: object = {}) =>
  ({
    you: "p1",
    fighters: [fighter("p1/hero", "Hero"), enemy("e1/anky", "Ankylosaurus", "ankylosaurus"), enemy("e1/galli", "Gallimimus", "gallimimus")],
    initiative: { round: 2, phase: "TURN", deckCount: 3, current: "seat:p1", row: ROW, ...init },
    prompt: null,
    ...extra,
  }) as unknown as PlayerView;

const eorPrompt = (title: string) => ({
  promptId: "pr",
  player: "p1",
  kind: "YES_NO",
  description: `${title}, end of round: deal damage?`,
  source: null,
  options: [],
});

const mount = (v: PlayerView, events: GameEvent[] = []) =>
  render(
    <ChakraProvider theme={theme}>
      <FormatOverlay formatId="adventure" view={v} events={events} />
    </ChakraProvider>,
  );

beforeAll(async () => {
  mount(view());
  await screen.findByTestId("adventure-board");
  cleanup();
});

describe("row model (#1149)", () => {
  it("revealed cards carry the printed boxes; MOVE 0 is no MOVE box; face-down cards carry nothing", () => {
    const m = adventureBoardModel(view())!;
    const [seat, anky, galli, down] = m.row;
    expect(seat).toMatchObject({ move: null, rightNow: null, endOfRound: null, resolving: false });
    expect(anky).toMatchObject({ move: 2, rightNow: "Ankylosaurus attacks.", endOfRound: ANKY_EOR });
    expect(galli).toMatchObject({ move: null, endOfRound: GALLI_EOR });
    expect(down).toMatchObject({ move: null, rightNow: null, endOfRound: null });
    expect(m.atRoundEnd.map((b) => b.id)).toEqual(["ankylosaurus", "gallimimus@e1/galli"]);
  });

  it("first line of a printed box stops at the first sentence", () => {
    expect(firstLineOf(GALLI_EOR)).toBe("Move Gallimimus to their Stampede marker, following the shortest route");
    expect(firstLineOf("Advance the threat 1 space.")).toBe("Advance the threat 1 space");
  });

  it("END_OF_ROUND names the box parked on a prompt, by source or by its description", () => {
    expect(endOfRoundResolvingId(view({ phase: "END_OF_ROUND", current: null }, { prompt: eorPrompt("Gallimimus") }))).toBe(
      "gallimimus@e1/galli",
    );
    expect(
      endOfRoundResolvingId(
        view({ phase: "END_OF_ROUND", current: null }, { prompt: { ...eorPrompt("?"), source: { card: "initiative:ankylosaurus" } } }),
      ),
    ).toBe("ankylosaurus");
    // TURN phase: a prompt is never an END OF ROUND box
    expect(endOfRoundResolvingId(view({}, { prompt: eorPrompt("Gallimimus") }))).toBeNull();
  });
});

describe("round strip (#1149)", () => {
  afterEach(cleanup);

  it("revealed chips show an END OF ROUND marker; AT ROUND END lists the boxes in row order", () => {
    mount(view());
    expect(screen.getByTestId("adv-init-eor-ankylosaurus")).toHaveTextContent(
      "Deal 1 damage to each hero and sidekick adjacent to Ankylosaurus",
    );
    expect(screen.queryByTestId("adv-init-eor-seat:p1")).toBeNull();
    expect(screen.queryByTestId("adv-init-eor-x")).toBeNull();
    const box = screen.getByTestId("adv-at-round-end");
    expect(box).toHaveTextContent("AT ROUND END");
    expect(screen.getByTestId("adv-at-round-end-ankylosaurus")).toHaveTextContent(`1. Ankylosaurus: ${ANKY_EOR}`);
    expect(screen.getByTestId("adv-at-round-end-gallimimus@e1/galli")).toHaveTextContent("2. Gallimimus: Move Gallimimus");
  });

  it("a row without printed fields renders as before: no marker, no AT ROUND END, native tooltip, no face", () => {
    const bare = ROW.map(({ id, title, entry, seat, fighter, faceDown }: Record<string, unknown>) =>
      Object.fromEntries(Object.entries({ id, title, entry, seat, fighter, faceDown }).filter(([, v]) => v !== undefined)),
    );
    mount(view({ row: bare }));
    expect(screen.queryByTestId("adv-at-round-end")).toBeNull();
    expect(screen.queryByTestId(/^adv-init-eor-/)).toBeNull();
    const chip = screen.getByTestId("adv-init-ankylosaurus");
    expect(chip).toHaveAttribute("title", "Ankylosaurus");
    expect(chip.closest("button")).toBeNull();
  });

  it("hover opens the card as printed: title, MOVE, RIGHT NOW, END OF ROUND; no MOVE when it prints none", async () => {
    mount(view());
    fireEvent.mouseEnter(screen.getByTestId("adv-init-ankylosaurus").closest("button")!);
    expect(await screen.findByTestId("adv-init-face-ankylosaurus")).toHaveTextContent("ANKYLOSAURUS");
    expect(screen.getByTestId("adv-init-face-move-ankylosaurus")).toHaveTextContent("MOVE 2");
    expect(screen.getByTestId("adv-init-face-rn-ankylosaurus")).toHaveTextContent("RIGHT NOWAnkylosaurus attacks.");
    expect(screen.getByTestId("adv-init-face-eor-ankylosaurus")).toHaveTextContent(`END OF ROUND${ANKY_EOR}`);
    fireEvent.click(screen.getByTestId("adv-init-gallimimus@e1/galli").closest("button")!);
    expect(await screen.findByTestId("adv-init-face-gallimimus@e1/galli")).toBeInTheDocument();
    expect(screen.queryByTestId("adv-init-face-move-gallimimus@e1/galli")).toBeNull();
  });

  it("a card with CDN art opens its real face", async () => {
    const irex = { id: "indominus-rex", title: "Indominus Rex", entry: "FIGHTER", fighter: "e1/anky", move: 3, endOfRound: "Advance the threat marker 1 space." };
    mount(view({ row: [irex] }));
    fireEvent.mouseEnter(screen.getByTestId("adv-init-indominus-rex").closest("button")!);
    const face = await screen.findByTestId("adv-init-face-indominus-rex");
    expect(face.tagName).toBe("IMG");
    expect(face).toHaveAttribute("src", expect.stringContaining("irex/irex-initiative.webp"));
    expect(face).toHaveStyle({ objectFit: "contain" });
  });

  it("END_OF_ROUND highlights the box parked on a prompt and names it", () => {
    mount(view({ phase: "END_OF_ROUND", current: null }, { prompt: eorPrompt("Gallimimus") }));
    expect(screen.getByTestId("adv-init-gallimimus@e1/galli")).toHaveAttribute("data-resolving", "true");
    expect(screen.getByTestId("adv-init-ankylosaurus")).not.toHaveAttribute("data-resolving");
    expect(screen.getByTestId("adv-phase")).toHaveTextContent("END OF ROUND · GALLIMIMUS");
    expect(screen.getByTestId("adv-at-round-end-gallimimus@e1/galli")).toHaveAttribute("data-resolving", "true");
  });

  it("a finished round replays its walk left to right on the old row, then shows the live one", () => {
    jest.useFakeTimers();
    try {
      const before = view();
      const after = view({ round: 3, phase: "TURN", current: "seat:p1", row: [ROW[0]] });
      const { rerender } = mount(before);
      rerender(
        <ChakraProvider theme={theme}>
          <FormatOverlay formatId="adventure" view={after} events={[{ type: "ROUND_ENDED", round: 2 } as GameEvent]} />
        </ChakraProvider>,
      );
      expect(screen.getByTestId("adv-initiative")).toHaveAttribute("data-phase", "END_OF_ROUND");
      expect(screen.getByTestId("adv-round")).toHaveTextContent("2");
      expect(screen.getByTestId("adv-init-ankylosaurus")).toHaveAttribute("data-resolving", "true");
      act(() => void jest.advanceTimersByTime(END_OF_ROUND_STEP_MS));
      expect(screen.getByTestId("adv-init-ankylosaurus")).not.toHaveAttribute("data-resolving");
      expect(screen.getByTestId("adv-init-gallimimus@e1/galli")).toHaveAttribute("data-resolving", "true");
      act(() => void jest.advanceTimersByTime(END_OF_ROUND_STEP_MS));
      expect(screen.getByTestId("adv-round")).toHaveTextContent("3");
      expect(screen.queryByTestId("adv-init-ankylosaurus")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("endOfRoundSteps (#1149)", () => {
  const ended = [{ type: "ROUND_ENDED", round: 2 }] as GameEvent[];
  const ids = (s: ReturnType<typeof endOfRoundSteps>) => s?.cards.map((c) => c.id) ?? null;

  it("a round-ending batch resolved the pre-batch row's boxes; a first view witnessed nothing", () => {
    const next = view({ round: 3, row: [] });
    expect(ids(endOfRoundSteps(view(), next, ended))).toEqual(["ankylosaurus", "gallimimus@e1/galli"]);
    expect(endOfRoundSteps(null, next, ended)).toBeNull();
    expect(endOfRoundSteps(view(), view(), [])).toBeNull();
  });

  it("a parked box: up to and including it, then the rest when the walk resumes", () => {
    const parked = view({ phase: "END_OF_ROUND", current: null }, { prompt: eorPrompt("Ankylosaurus") });
    expect(ids(endOfRoundSteps(view(), parked, []))).toEqual(["ankylosaurus"]);
    expect(ids(endOfRoundSteps(parked, view({ round: 3, row: [] }), ended))).toEqual(["gallimimus@e1/galli"]);
  });
});

describe("log names each END OF ROUND box (#1149)", () => {
  const ctx = { label: (s: string) => s, you: "p1", seat: (p: string) => p, fighter: (f: string) => f };
  const boxes = [
    { title: "Ankylosaurus", text: ANKY_EOR },
    { title: "Gallimimus", text: "Move Gallimimus." },
  ];

  it("before End of round n", () => {
    const lines = enrichLines([], [{ type: "ROUND_ENDED", round: 2 }, { type: "ROUND_STARTED", round: 3 }] as GameEvent[], {
      ...ctx,
      endOfRound: boxes,
    });
    expect(lines.map((l) => l.text)).toEqual([
      `End of round · Ankylosaurus: ${ANKY_EOR}`,
      "End of round · Gallimimus: Move Gallimimus.",
      "End of round 2",
      "ROUND 3",
    ]);
  });

  it("at the end of a batch that parked on a box; nothing without boxes", () => {
    const ev = [{ type: "ROUND_STARTED", round: 9 }] as GameEvent[];
    expect(enrichLines([], ev, { ...ctx, endOfRound: boxes.slice(0, 1) }).map((l) => l.text)).toEqual([
      "ROUND 9",
      `End of round · Ankylosaurus: ${ANKY_EOR}`,
    ]);
    expect(enrichLines([], ev, ctx).map((l) => l.text)).toEqual(["ROUND 9"]);
  });
});
