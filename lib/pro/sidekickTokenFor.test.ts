/**
 * Sidekick token art by name (issue #1717 ↔ engine #1087). A deck whose player
 * chooses a sidekick has several, so the board asks for the one it is drawing by
 * the fighter's name; every one-sidekick deck answers exactly as before.
 */
import type { DeckImportSidekickType } from "@/components/DeckPool/deck-import.type";
import { sidekickTokenFor } from "./useProCardArt";

const sk = (name: string, tokenImageUrl?: string): DeckImportSidekickType =>
  ({ name, hp: 5, quantity: 1, quote: "", tokenImageUrl }) as DeckImportSidekickType;

describe("sidekickTokenFor", () => {
  describe("a one-sidekick deck (every deck today)", () => {
    it("answers its token whatever name the board passes", () => {
      const deck = { sidekick: sk("Robin", "/robin.webp") };
      expect(sidekickTokenFor(deck)).toBe("/robin.webp");
      expect(sidekickTokenFor(deck, "Robin")).toBe("/robin.webp");
      expect(sidekickTokenFor(deck, "Clone Trooper 2")).toBe("/robin.webp");
    });

    it("is null when the deck has no token art", () => {
      expect(sidekickTokenFor({ sidekick: sk("Robin") }, "Robin")).toBeNull();
    });
  });

  describe("a deck with sidekick options", () => {
    const deck = {
      sidekick: sk("Mouse", "/mouse.webp"),
      sidekickOptions: [sk("Mouse", "/mouse.webp"), sk("Karrin Murphy", "/murphy.webp")],
    };

    it("answers the chosen sidekick's token by name", () => {
      expect(sidekickTokenFor(deck, "Mouse")).toBe("/mouse.webp");
      expect(sidekickTokenFor(deck, "Karrin Murphy")).toBe("/murphy.webp");
    });

    it("matches names the way card titles match (case and outer whitespace)", () => {
      expect(sidekickTokenFor(deck, " karrin murphy ")).toBe("/murphy.webp");
    });

    it("never paints another sidekick's face: unknown name or no name is null (initials token)", () => {
      expect(sidekickTokenFor(deck, "Bob")).toBeNull();
      expect(sidekickTokenFor(deck)).toBeNull();
    });

    it("is null for an option without art, even when the primary sidekick has some", () => {
      expect(
        sidekickTokenFor({ sidekick: sk("Mouse", "/mouse.webp"), sidekickOptions: [sk("Mouse", "/mouse.webp"), sk("Karrin Murphy")] }, "Karrin Murphy")
      ).toBeNull();
    });

    it("falls back to the primary sidekick when it is the one named but not listed", () => {
      expect(sidekickTokenFor({ sidekick: sk("Mouse", "/mouse.webp"), sidekickOptions: [sk("Karrin Murphy"), sk("Bob")] }, "Mouse")).toBe(
        "/mouse.webp"
      );
    });
  });
});
