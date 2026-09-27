/**
 * A mini-pipeline bundle's `credit.modelName` carries the generation tool as
 * a trailing parenthetical (e.g. "King Taranis (Meshy AI)") — the tool is not
 * part of the player-facing attribution and must never reach it
 * (unbrewed-p2p-975). Strip it once here so every writer (add-hero-mini.cjs)
 * shares the same rule.
 */
const stripToolCredit = (modelName) => {
  if (typeof modelName !== "string") return modelName;
  return modelName.replace(/\s*\([^()]*\)\s*$/, "").trim();
};

module.exports = { stripToolCredit };
