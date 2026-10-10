import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { AdventureBriefing, AdventureBriefingModal, LobbyBriefing } from "./AdventureBriefing";
import { AdventureLobby } from "./AdventureLobby";
import { AdventureWaitingRoom } from "./AdventureWaitingRoom";
import { defaultAdventureSetup } from "@/lib/pro/adventureLobby";
import { resetAdventureScenarios, setScenarios } from "@/lib/pro/adventureScenarios";
import type { ScenarioBriefing, ScenarioDisplay, ScenarioListing } from "@/lib/pro/protocol";

// jsdom's selector engine rejects Chakra's focus-trap probe (see MapPreviewModal.test.tsx).
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const BRIEFING: ScenarioBriefing = {
  tagline: "Indominus Rex has escaped.",
  objective: "Defeat her.",
  win: "Bring Indominus Rex to 0 health. Felling her early isn't the end.",
  lose: "When the 4th pen is destroyed.",
  threat: "It climbs at every round's end.",
  special: [{ title: "Pens", text: "Locked spaces." }],
};
const DISPLAY: ScenarioDisplay = {
  verdict: { win: "Won", lose: "Lost" },
  enemyNoun: { singular: "dino", plural: "dinos" },
  setting: "Isla Nublar",
  markers: {},
  enemyTurn: { title: "WHAT A DINO DOES", steps: ["Stomps the nearest hero."] },
  lossLimit: null,
};
const e = (id: string, role: "VILLAIN" | "MINION", hp: number[], size: "NORMAL" | "LARGE" = "NORMAL") => ({ id, name: id, role, hp, move: 2, size });
const ISLA: ScenarioListing = {
  id: "isla-nublar",
  label: "Isla Nublar",
  formatIds: ["adventure"],
  mapId: "isla-nublar",
  villain: "indominus",
  villains: [e("indominus", "VILLAIN", [14, 16, 18, 20], "LARGE")],
  fixedMinions: [],
  minionPool: [e("raptor", "MINION", [10])],
  minionsPerPlayer: 1,
  duplicateMinions: false,
  briefing: BRIEFING,
};
const wrap = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);

describe("AdventureBriefing (#1153)", () => {
  it("renders scenario tiles and the format-level tiles from the briefing", () => {
    wrap(<AdventureBriefing label="Isla Nublar" briefing={BRIEFING} />);
    expect(screen.getByTestId("adventure-briefing-label")).toHaveTextContent("ISLA NUBLAR");
    expect(screen.getByTestId("adventure-briefing-tagline")).toHaveTextContent("Indominus Rex has escaped.");
    for (const id of ["win", "lose", "threat", "special", "round", "turn"]) {
      expect(screen.getByTestId(`adventure-briefing-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("adventure-briefing-turn")).toHaveTextContent("2 actions");
  });

  it("kicks with the given hero-seat range, 1–4 when no listing is known (#1360)", () => {
    const { unmount } = wrap(<AdventureBriefing label="X" seats={{ min: 1, max: 4 }} />);
    expect(screen.getByTestId("adventure-briefing-header")).toHaveTextContent("1–4 HEROES");
    unmount();
    wrap(<AdventureBriefing label="X" />);
    expect(screen.getByTestId("adventure-briefing-header")).toHaveTextContent("ADVENTURE · CO-OP · 1–4 HEROES");
  });

  it("hides scenario tiles when the briefing is missing; format tiles still render", () => {
    wrap(<AdventureBriefing label="Isla Nublar" briefing={undefined} display={DISPLAY} />);
    for (const id of ["scenario", "win", "lose", "threat", "special", "tagline"]) {
      expect(screen.queryByTestId(`adventure-briefing-${id}`)).not.toBeInTheDocument();
    }
    for (const id of ["round", "acts", "turn"]) expect(screen.getByTestId(`adventure-briefing-${id}`)).toBeInTheDocument();
  });

  it("renders the engine's projected enemyTurn, and no client fallback without a display (#1330)", () => {
    const { unmount } = wrap(<AdventureBriefing label="X" briefing={BRIEFING} display={DISPLAY} />);
    expect(screen.getByTestId("adventure-briefing-acts")).toHaveTextContent("WHAT A DINO DOES");
    expect(screen.getByTestId("adventure-briefing-acts")).toHaveTextContent("Stomps the nearest hero.");
    unmount();
    wrap(<AdventureBriefing label="X" briefing={BRIEFING} />);
    expect(screen.queryByTestId("adventure-briefing-acts")).not.toBeInTheDocument();
    expect(screen.getByTestId("adventure-briefing-round")).toBeInTheDocument();
  });

  it("omits the threat tile when the scenario has none", () => {
    wrap(<AdventureBriefing label="X" briefing={{ ...BRIEFING, threat: undefined, special: undefined }} />);
    expect(screen.queryByTestId("adventure-briefing-threat")).not.toBeInTheDocument();
    expect(screen.queryByTestId("adventure-briefing-special")).not.toBeInTheDocument();
    expect(screen.getByTestId("adventure-briefing-win")).toBeInTheDocument();
  });

  it("modal opens its content and closes", () => {
    const onClose = jest.fn();
    wrap(<AdventureBriefingModal isOpen onClose={onClose} label="Isla Nublar" briefing={BRIEFING} />);
    expect(screen.getByTestId("adventure-rules-modal")).toBeInTheDocument();
    expect(screen.getByTestId("adventure-briefing-win")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("adventure-rules-close"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Adventure lobby with a scenario listing (#1153)", () => {
  beforeEach(() => {
    resetAdventureScenarios();
    setScenarios([ISLA]);
  });
  afterEach(() => resetAdventureScenarios());

  const lobby = (humans: number) =>
    wrap(
      <AdventureLobby
        setup={{ ...defaultAdventureSetup(), humans, villainId: "indominus", minionIds: Array(humans).fill("raptor") }}
        onChange={() => {}}
        youSeat={<div />}
        renderSeat={() => <div />}
      />,
    );

  it("shows the scenario name even with one scenario", () => {
    lobby(1);
    expect(screen.getByTestId("adventure-scenario-name")).toHaveTextContent("Isla Nublar");
  });

  it("shows HP at the selected hero count, with size and MOVE", () => {
    lobby(3);
    const villain = screen.getByTestId("adventure-villain").closest("div")!.parentElement!.parentElement!;
    expect(villain).toHaveTextContent("18");
    expect(villain).toHaveTextContent("LARGE · MOVE 2");
  });

  it("offers the scenario's projected hero-seat range, 1–4 when the listing has none (#1330)", () => {
    lobby(1);
    expect([1, 2, 3, 4].map((n) => !!screen.queryByTestId(`adventure-humans-${n}`))).toEqual([true, true, true, true]);
  });

  it("offers only the projected range, pulling an out-of-range table into it (#1330)", () => {
    setScenarios([{ ...ISLA, heroSeats: { min: 2, max: 3 } }]);
    const onChange = jest.fn();
    wrap(<AdventureLobby setup={defaultAdventureSetup()} onChange={onChange} youSeat={<div />} renderSeat={() => <div />} />);
    expect([1, 2, 3, 4].map((n) => !!screen.queryByTestId(`adventure-humans-${n}`))).toEqual([false, true, true, false]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ humans: 2, minionIds: [null, null] }));
  });

  it("renders the lobby briefing for the selected scenario", () => {
    wrap(<LobbyBriefing setup={defaultAdventureSetup()} />);
    expect(screen.getByTestId("adventure-briefing-win")).toBeInTheDocument();
  });

  it("kicks the briefing with the scenario's hero-seat range (#1360)", () => {
    setScenarios([{ ...ISLA, heroSeats: { min: 2, max: 3 } }]);
    wrap(<LobbyBriefing setup={defaultAdventureSetup()} />);
    expect(screen.getByTestId("adventure-briefing-header")).toHaveTextContent("ADVENTURE · CO-OP · 2–3 HEROES");
  });
});

describe("AdventureWaitingRoom (#1153)", () => {
  beforeEach(() => {
    resetAdventureScenarios();
    setScenarios([ISLA]);
  });
  afterEach(() => resetAdventureScenarios());

  it("names Adventure, the scenario and the resolved roster — no duel board", () => {
    wrap(
      <AdventureWaitingRoom
        roomInfo={{
          formatId: "adventure",
          seats: ["p1"],
          requiredPlayers: 2,
          you: "p1",
          scenario: { id: "isla-nublar", label: "Isla Nublar", villain: "indominus", minions: ["raptor", null] },
        }}
      />,
    );
    const line = screen.getByTestId("adventure-waiting-line");
    expect(line).toHaveTextContent("Adventure · Isla Nublar · co-op");
    expect(line).not.toHaveTextContent(/opponent|playing on/i);
    expect(screen.getByTestId("adventure-waiting-enemy-0")).toHaveTextContent("16");
    expect(screen.getByTestId("adventure-waiting-enemy-2")).toHaveTextContent("Random");
  });
});
