import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProBoard } from "./ProBoard";
import { ProMapDef, ViewFighter } from "@/lib/pro/protocol";
import { boughtRangeBlurb, boughtRangeChip, RANGE_PURCHASE_HEROES } from "@/lib/pro/rangePurchase";

/**
 * The bought-range target on the board (issue #668 ↔ engine #456).
 *
 * Cecil Palmer may declare an attack on a fighter well beyond melee reach, and the
 * engine silently deducts the shortfall in Broadcast tokens the instant he does.
 * There is no confirmation step, so the price has to be legible BEFORE the click —
 * and the target has to look DIFFERENT from a free adjacent one, or the board is
 * lying about what the attack costs.
 *
 * The pricing itself is unit-tested in lib/pro/rangePurchase.test.ts; what is pinned
 * here is that the board draws it, distinctly, and only on the offered targets.
 */

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: [], adjacentTo: ["s2"] },
    { id: "s2", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s1", "s3"] },
    { id: "s3", x: 0.8, y: 0.8, zones: [], adjacentTo: ["s2"] },
  ],
};

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Cecil Palmer",
  space: "s1",
  tailSpace: null,
  hp: 13,
  maxHp: 13,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

const FREE = fighter({ id: "p2/near", owner: "p2", name: "Khoshekh", space: "s2" });
const BOUGHT = fighter({ id: "p2/far", owner: "p2", name: "Mandalorian", space: "s3" });
const RULE = RANGE_PURCHASE_HEROES["cecil-palmer"];
const priced = { cost: 2, rule: RULE };

const board = (props: Partial<Parameters<typeof ProBoard>[0]> = {}) =>
  render(
    <ChakraProvider>
      <ProBoard
        map={MAP}
        fighters={[fighter({}), FREE, BOUGHT]}
        highlightedFighters={["p2/near", "p2/far"]}
        onFighterClick={() => {}}
        boughtRangeTargets={[
          { id: "p2/far", chip: boughtRangeChip(priced), blurb: boughtRangeBlurb(priced) },
        ]}
        {...props}
      />
    </ChakraProvider>
  );

describe("bought-range attack targets", () => {
  it("prints the price on the bought target, and nothing on the free one", () => {
    board();
    expect(screen.getByText("−2 📻")).toBeInTheDocument();
    // The free adjacent target is offered too, and must stay unannotated.
    expect(screen.getAllByText(/−\d/)).toHaveLength(1);
  });

  it("says WHY it costs, in the token's hover text as well as the chip's", () => {
    board();
    const token = screen.getByTitle(/Mandalorian —/);
    expect(token.getAttribute("title")).toContain("spends 2 Broadcast tokens");
    expect(screen.getByTitle(boughtRangeBlurb(priced))).toBeInTheDocument();
    // the free target's hover is untouched
    expect(screen.getByTitle(/Khoshekh —/).getAttribute("title")).not.toMatch(/Broadcast/);
  });

  it("gives the bought target a DIFFERENT pulse from the free one", () => {
    // A price the player has to read a chip to notice is a price they will miss.
    // The two targets must not animate identically.
    board();
    const bought = getComputedStyle(screen.getByTitle(/Mandalorian —/)).animation;
    const free = getComputedStyle(screen.getByTitle(/Khoshekh —/)).animation;
    expect(bought).toBeTruthy();
    expect(free).toBeTruthy();
    expect(bought).not.toBe(free);
  });

  it("draws nothing when the target is not currently offered", () => {
    // A price left over from a previous view must never light a token the server
    // is not offering right now — `isTarget` gates the whole annotation.
    board({ highlightedFighters: ["p2/near"] });
    expect(screen.queryByText("−2 📻")).not.toBeInTheDocument();
  });

  it("is entirely absent for every other deck (no prop passed)", () => {
    board({ boughtRangeTargets: undefined });
    expect(screen.queryByText(/−\d/)).not.toBeInTheDocument();
  });
});
