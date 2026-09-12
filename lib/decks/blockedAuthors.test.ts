import {
  BLOCKED_AUTHORS,
  blockedAuthorMessage,
  isImportBlocked,
} from "./blockedAuthors";

describe("isImportBlocked", () => {
  it("keeps every entry lowercase so the case-insensitive match holds", () => {
    for (const author of BLOCKED_AUTHORS) {
      expect(author).toBe(author.toLowerCase());
    }
  });

  it.each(["jowee", "Jowee", "JOWEE", "jOwEe", "  jowee  ", "\tJowee\n"])(
    "blocks %j",
    (user) => {
      expect(isImportBlocked({ user })).toBe(true);
    },
  );

  it.each(["JollyGrin", "you", "jowee2", "jo wee", ""])(
    "allows %j",
    (user) => {
      expect(isImportBlocked({ user })).toBe(false);
    },
  );

  it("allows a deck with no author at all", () => {
    expect(isImportBlocked({} as any)).toBe(false);
    expect(isImportBlocked({ user: undefined } as any)).toBe(false);
    expect(isImportBlocked({ user: null } as any)).toBe(false);
    expect(isImportBlocked(undefined)).toBe(false);
    expect(isImportBlocked(null)).toBe(false);
  });
});

describe("blockedAuthorMessage", () => {
  it("names the author and says why", () => {
    expect(blockedAuthorMessage("Jowee")).toBe(
      "Decks by Jowee can't be imported — the author has asked that their decks not be importable into Unbrewed.",
    );
  });
});
