/**
 * #977: a player arriving with a link from unmatched.cards or The Unmatched
 * Club must be able to tell which import card is theirs at a glance, so the
 * card titles name the source site.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";

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
    expect(screen.getByText("Import from Unmatched Labs")).toBeInTheDocument();
    expect(screen.getByText("Popular decks")).toBeInTheDocument();
    expect(screen.getByText("Paste JSON")).toBeInTheDocument();
    expect(screen.getByText("Starter decks")).toBeInTheDocument();
  });

  // #978: the Labs panel's TTS-export fallback hands off to the card-image
  // import, under the name #977 gave it
  it("opens the Unmatched Labs panel, which links on to the card-image import", () => {
    render(
      <ChakraProvider>
        <AddDeckHub pushDeck={async () => true} setStar={() => {}} />
      </ChakraProvider>,
    );

    fireEvent.click(screen.getByText("Import from Unmatched Labs"));
    expect(screen.getByLabelText("Unmatched Labs link")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Import from The Unmatched Club" }),
    );
    // the focused view's header is now the card-image panel
    expect(screen.getByText("Import from The Unmatched Club")).toBeInTheDocument();
    expect(screen.queryByLabelText("Unmatched Labs link")).not.toBeInTheDocument();
  });
});
