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
});
