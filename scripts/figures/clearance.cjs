/**
 * The licence gate for hero miniatures (unbrewed-p2p-879), for the build side.
 *
 * Rule (Dean, 2026-09-26): a figure is served only when there is no licence
 * conflict — never for an official hero, and never from a model whose licence
 * forbids redistribution. Every figures.json entry therefore declares:
 *
 *   "license":          an SPDX id (e.g. "CC-BY-4.0") or a named licence
 *   "redistributable":  true   — the licence allows shipping the renders
 *   "officialHero":     false  — the hero is not an official character
 *
 * Fail closed: a missing or wrong field means no figure. This file only checks
 * the declarations; deciding them for a given model is a human call.
 *
 * The app applies the same rule to manifest.json (`isCleared` in
 * lib/pro/figures.ts); lib/pro/figures.test.ts keeps the two in step.
 */

/** Why an entry is not cleared — empty when it is. */
const clearanceBlockers = (entry) => {
  const e = entry && typeof entry === "object" ? entry : {};
  const blockers = [];
  if (typeof e.license !== "string" || e.license.trim() === "") blockers.push("no license declared");
  if (e.redistributable !== true) blockers.push("license not declared redistributable");
  if (e.officialHero !== false) blockers.push("not declared a non-official hero");
  return blockers;
};

module.exports = { clearanceBlockers };
