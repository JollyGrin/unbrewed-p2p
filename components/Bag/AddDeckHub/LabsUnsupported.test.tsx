/**
 * #999: the "hasn't published finished art for some of X's cards" sentence is
 * only true when a deck card has to be templated. An extra character card
 * with no render is its own problem, and the warning names it.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { LabsUnsupportedFeature } from "@/lib/labs";

import { LabsUnsupportedWarning } from "./LabsUnsupported";

const warn = (unsupported: LabsUnsupportedFeature[]) =>
  render(
    <ChakraProvider>
      <LabsUnsupportedWarning deckName="Black Spy" unsupported={unsupported} />
    </ChakraProvider>,
  );

const EXTRA: LabsUnsupportedFeature = {
  id: "additional-character-cards",
  label: "Extra character cards",
  cards: ["White Spy"],
};
const SPLIT: LabsUnsupportedFeature = {
  id: "split-card",
  label: "Split cards",
  cards: ["Point Blank"],
};

describe("LabsUnsupportedWarning", () => {
  it("names the extra character card, without blaming the deck's cards", () => {
    warn([EXTRA]);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This deck is missing a character card");
    expect(alert).toHaveTextContent(
      "hasn't published finished art for Black Spy's extra character card, White Spy",
    );
    expect(alert).not.toHaveTextContent("some of Black Spy's cards");
  });

  it("keeps the template wording for deck cards, and adds the extra card when both apply", () => {
    warn([SPLIT, EXTRA]);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("won't look right with our card template");
    expect(alert).toHaveTextContent("some of Black Spy's cards");
    expect(alert).toHaveTextContent("Split cards — Point Blank");
    expect(alert).toHaveTextContent("extra character card, White Spy");
    // not listed as a template feature a second time
    expect(alert).not.toHaveTextContent("Extra character cards");
  });

  it("says nothing about extra cards when only deck cards are affected", () => {
    warn([SPLIT]);
    expect(screen.getByRole("alert")).not.toHaveTextContent("extra character");
  });
});
