/**
 * The acceptance case from #645: a bag holding ~200kb of decks/maps next to a
 * 6 MB pile of Pro replays must read ~200kb, with the replays explained (and
 * linked) rather than charged to the bag.
 */
import { render } from "@testing-library/react";

import { computeStorageBreakdown } from "@/lib/storage/breakdown";
import { DeckStats } from "./Stats";

const val = (kb: number) => "x".repeat(Math.round((kb * 1024) / 2));

describe("DeckStats meter", () => {
  it("charges the bag for decks + maps only, and explains the rest", () => {
    const storage = computeStorageBreakdown([
      ["DECKS", val(180)],
      ["MAP_LIST", val(20)],
      ["unbrewed:pro:replay:one", val(3000)],
      ["unbrewed:pro:replay:two", val(3144)],
      ["SERVER_LIST", val(2)],
    ]);

    const { container } = render(
      <DeckStats length={3} storage={storage} />,
    );

    // ~200kb, not the 6.3 MB the old meter reported (key names add a few bytes)
    expect(container.textContent).toMatch(/200(\.\d+)?kb \/ 5120kb local storage/);
    expect(container.textContent).toContain("Decks 180 kb");
    expect(container.textContent).toContain("Maps 20 kb");
    expect(container.textContent).toContain("Replays 6144 kb");
    expect(container.textContent).toContain("Other 2 kb");
    const replayLink = container.querySelector("a");
    expect(replayLink?.textContent).toBe("Replays");
    expect(replayLink?.getAttribute("href")).toBe("/pro/replays");
  });

  it("clamps the text and the bar when the bag itself overflows", () => {
    const storage = computeStorageBreakdown([["DECKS", val(6000)]]);
    const { container } = render(<DeckStats length={1} storage={storage} />);

    expect(container.textContent).toContain("5120kb / 5120kb local storage");
  });

  /**
   * The meter measures a BROWSER limit (#644). A signed-in user whose bag has
   * moved to their account has no such limit to be warned about, and showing a
   * bar reading "0kb / 5120kb" would imply one that isn't there.
   */
  describe("when signed in", () => {
    it("drops the bar entirely once nothing is left on this device", () => {
      const storage = computeStorageBreakdown([
        ["unbrewed:pro:replay:one", val(3000)],
      ]);

      const { container } = render(
        <DeckStats length={4} storage={storage} isSignedIn />,
      );

      expect(container.textContent).toContain("4 Decks");
      expect(container.textContent).toContain("saved to your account");
      expect(container.textContent).not.toContain("local storage");
      expect(container.querySelector("a")).toBeNull();
    });

    it("keeps the bar, plus a way out, while items remain on the device", () => {
      const storage = computeStorageBreakdown([["DECKS", val(180)]]);

      const { container } = render(
        <DeckStats length={2} storage={storage} isSignedIn />,
      );

      expect(container.textContent).toMatch(/180(\.\d+)?kb \/ 5120kb local storage/);
      const move = Array.from(container.querySelectorAll("a")).find(
        (link) => link.textContent === "move to your account",
      );
      expect(move?.getAttribute("href")).toBe("/bag?tab=2");
    });

    it("is unchanged for a guest with an empty bag", () => {
      const storage = computeStorageBreakdown([]);
      const { container } = render(<DeckStats length={0} storage={storage} />);

      expect(container.textContent).toContain("0kb / 5120kb local storage");
    });
  });
});
