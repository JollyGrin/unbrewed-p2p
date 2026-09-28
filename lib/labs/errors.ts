export type LabsErrorCode =
  | "bad-input"
  | "not-found"
  | "character-not-found"
  | "choose-character"
  | "no-deck"
  | "network";

export class LabsImportError extends Error {
  constructor(
    public code: LabsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LabsImportError";
  }
}

/** What the player should read, and what to do next, for each failure. */
export const LABS_ERROR_MESSAGES: Record<LabsErrorCode, string> = {
  "bad-input":
    "That doesn't look like an Unmatched Labs link. Copy the share link of a set (unmatchedlabs.com/shared/…) or a character's link, and paste it here.",
  "not-found":
    "Couldn't find that set on Unmatched Labs. It may be private, unpublished, or deleted — ask its creator to publish it, then try again.",
  "character-not-found":
    "That character isn't in a published Unmatched Labs set. Paste the set's share link instead, or ask its creator to publish it.",
  "choose-character":
    "This set has more than one hero. Paste a link to the character you want.",
  "no-deck":
    "This character has no action cards to import. Pick a hero that has a deck.",
  network:
    "Couldn't reach Unmatched Labs. Check your connection and try again in a moment.",
};

export const fail = (code: LabsErrorCode): never => {
  throw new LabsImportError(code, LABS_ERROR_MESSAGES[code]);
};

