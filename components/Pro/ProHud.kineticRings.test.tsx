import "@testing-library/jest-dom";
import { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProHud } from "./ProHud";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import {
  CardInstanceId,
  PlayerId,
  PlayerView,
  ProMapDef,
  ViewPlayer,
} from "@/lib/pro/protocol";

/**
 * Harry Dresden's Kinetic Rings on the seat plate (issue #1718 ↔ engine #1092).
 *
 * The engine tucks each card placed on the Rings into the seat's public KINETIC pile
 * while the Rings are its `ongoingScheme`. The cards belong ON the scheme, so they are
 * drawn in the plate's ONGOING row, with their BOOST (what the release reads), on BOTH
 * seats' plates. The registry half is unit-tested in lib/pro/heroStateFlags.test.ts.
 */

// Chakra's focus lock trips jsdom's nwsapi (see memory: chakra-modal-jsdom-nwsapi-crash);
// the trap has nothing to verify here, so it is a passthrough.
jest.mock("@chakra-ui/focus-lock", () => ({
  __esModule: true,
  FocusLock: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => ({ status: "guest", account: null }),
}));

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: {
    title: "Test Map",
    minPlayers: 2,
    maxPlayers: 4,
    specialRules: false,
    imageUrl: "/test.png",
  },
  zones: [],
  spaces: [],
};

const seat = (
  id: PlayerId,
  you: boolean,
  heroId: string,
  extra: Partial<ViewPlayer> = {}
): ViewPlayer => ({
  id,
  heroId,
  you,
  team: id,
  hand: you ? [] : undefined,
  handCount: 0,
  deckCount: 0,
  discard: [],
  ongoingScheme: null,
  hasCommitted: false,
  counters: {},
  flags: {},
  wonCombatThisTurn: false,
  lostCombatThisTurn: false,
  firstAttackThisTurn: false,
  playedACardThisTurn: false,
  tookDamageThisTurn: false,
  ...extra,
});

const makeView = (players: ViewPlayer[], you: PlayerId): PlayerView => {
  const self = players.find((p) => p.id === you)!;
  return {
    you,
    phase: "PLAY",
    turnNumber: 1,
    activePlayer: you,
    actionsRemaining: 1,
    turnPhase: "ACTION_SELECT",
    maneuver: null,
    map: MAP,
    catalog: {},
    fighters: [],
    tokens: [],
    self: {
      id: self.id,
      heroId: self.heroId,
      hand: [],
      deckCount: 0,
      discard: [],
      ongoingScheme: null,
      committedCard: null,
      counters: self.counters,
      piles: self.piles,
      flags: self.flags,
      wonCombatThisTurn: false,
      lostCombatThisTurn: false,
      firstAttackThisTurn: false,
      playedACardThisTurn: false,
      tookDamageThisTurn: false,
    },
    opponent: null,
    players,
    combat: null,
    prompt: null,
    winner: null,
  };
};

const DECK: Record<string, Partial<DeckImportCardType>> = {
  "kinetic-rings": { title: "Kinetic Rings", boost: 1, type: "scheme" },
  "temple-dog": { title: "Temple Dog", boost: 2, type: "attack" },
  "service-pistol-mouse": { title: "Service Pistol", boost: 3, type: "attack" },
};
const defOf = (id: CardInstanceId) => id.split("#")[0].split("/").pop() ?? id;

const renderHud = (view: PlayerView) =>
  render(
    <ChakraProvider>
      <ProHud
        view={view}
        status="open"
        roomId="room-1"
        resolveCard={(id: CardInstanceId) => (DECK[defOf(id)] as DeckImportCardType) ?? null}
        resolveHero={() => null}
        labelFor={(id: CardInstanceId) => DECK[defOf(id)]?.title ?? id}
      />
    </ChakraProvider>
  );

const RINGS = "harry-dresden/kinetic-rings#1";
const dresden = (id: PlayerId, you: boolean, kinetic: string[]) =>
  seat(id, you, "harry-dresden", {
    ongoingScheme: RINGS,
    piles: kinetic.length ? { KINETIC: kinetic } : {},
  });

describe("Kinetic Rings: the placed cards are drawn on the ongoing scheme", () => {
  it("lists each placed card with its boost and the fill on the Rings' row", () => {
    renderHud(
      makeView(
        [dresden("p1", true, ["harry-dresden/temple-dog#2", "harry-dresden/service-pistol-mouse#1"]), seat("p2", false, "king-kong")],
        "p1"
      )
    );
    const row = screen.getAllByTestId("scheme-pile-row")[0];
    expect(within(row).getByText("Kinetic Rings")).toBeInTheDocument();
    expect(within(row).getByText("Temple Dog")).toBeInTheDocument();
    expect(within(row).getByText("+2")).toBeInTheDocument();
    expect(within(row).getByText("Service Pistol")).toBeInTheDocument();
    expect(within(row).getByText("+3")).toBeInTheDocument();
    expect(within(row).getByText("2/2")).toBeInTheDocument();
    // the collapsed plate's tag carries the count too
    expect(screen.getAllByText("ONGOING · 2/2").length).toBeGreaterThan(0);
  });

  it("shows the opponent's Rings and their cards on THEIR plate (a public pile)", () => {
    renderHud(
      makeView([seat("p1", true, "king-kong"), dresden("p2", false, ["harry-dresden/temple-dog#2"])], "p1")
    );
    const row = screen.getAllByTestId("scheme-pile-row")[0];
    expect(within(row).getByText("Temple Dog")).toBeInTheDocument();
    expect(within(row).getByText("1/2")).toBeInTheDocument();
  });

  it("keeps the plain ONGOING row while nothing is placed", () => {
    renderHud(makeView([dresden("p1", true, []), seat("p2", false, "king-kong")], "p1"));
    expect(screen.queryByTestId("scheme-pile-row")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Ongoing scheme: Kinetic Rings").length).toBeGreaterThan(0);
    expect(screen.queryByText(/ONGOING ·/)).not.toBeInTheDocument();
  });

  it("puts no KINETIC pill on the nameplate", () => {
    const { container } = renderHud(
      makeView([dresden("p1", true, ["harry-dresden/temple-dog#2"]), seat("p2", false, "king-kong")], "p1")
    );
    expect(container.textContent).not.toContain("KINETIC");
  });

  it("each placed card is a button that opens the pile, titled for the scheme", async () => {
    renderHud(
      makeView([dresden("p1", true, ["harry-dresden/temple-dog#2"]), seat("p2", false, "king-kong")], "p1")
    );
    const chip = screen.getAllByRole("button", { name: /Temple Dog, boost 2: placed on the ongoing scheme/ })[0];
    fireEvent.click(chip);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Kinetic Rings (placed on the ongoing scheme)");
    expect(dialog.textContent).not.toContain("tucked under hero card");
  });
});
