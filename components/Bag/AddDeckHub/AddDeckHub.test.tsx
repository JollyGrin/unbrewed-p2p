/**
 * #977: a player arriving with a link from unmatched.cards or The Unmatched
 * Club must be able to tell which import card is theirs at a glance, so the
 * card titles name the source site.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";

import { AddDeckHub } from "./index";

describe("AddDeckHub", () => {
  it("names the source site on the unmatched.cards and Unmatched Club cards", () => {
    render(
      <ChakraProvider>
        <AddDeckHub
          pushDeck={async () => true}
          setStar={() => {}}
        />
      </ChakraProvider>,
    );

    expect(screen.getByText("Import from unmatched.cards")).toBeInTheDocument();
    expect(
      screen.getByText("Import from The Unmatched Club"),
    ).toBeInTheDocument();
    expect(screen.getByText("Popular decks")).toBeInTheDocument();
    expect(screen.getByText("Paste JSON")).toBeInTheDocument();
    expect(screen.getByText("Starter decks")).toBeInTheDocument();
  });
});
