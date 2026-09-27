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
 * The committed open-licence set (unbrewed-p2p-903, figures-open.json) also
 * declares its attribution, which CC-BY obliges the app to show:
 *
 *   "modelName", "creator", "sourceUrl" (https)
 *
 * and a licence the app can link to (OPEN_LICENSE_DEEDS below) — CC BY /
 * BY-SA 4.0 s3(a)(1) require the licence link with the credit.
 *
 * Fail closed: a missing or wrong field means no figure. This file only checks
 * the declarations; deciding them for a given model is a human call.
 *
 * The app applies the same rule to manifest.json (`isCleared`, `creditOf`
 * and `LICENSE_DEEDS` in lib/pro/figures.ts); lib/pro/figures.test.ts and
 * lib/pro/figures.open.test.ts keep the two in step.
 */

/** SPDX id → licence deed. Keep equal to LICENSE_DEEDS in lib/pro/figures.ts. */
const OPEN_LICENSE_DEEDS = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
};

const asEntry = (entry) => (entry && typeof entry === "object" ? entry : {});
const filled = (v) => typeof v === "string" && v.trim() !== "";

/** Why an entry is not cleared — empty when it is. */
const clearanceBlockers = (entry) => {
  const e = asEntry(entry);
  const blockers = [];
  if (!filled(e.license)) blockers.push("no license declared");
  if (e.redistributable !== true) blockers.push("license not declared redistributable");
  if (e.officialHero !== false) blockers.push("not declared a non-official hero");
  return blockers;
};

/** Why an entry lacks the attribution its licence requires — empty when it has it. */
const attributionBlockers = (entry) => {
  const e = asEntry(entry);
  const blockers = [];
  if (!filled(e.modelName)) blockers.push("no modelName");
  if (!filled(e.creator)) blockers.push("no creator");
  if (!(typeof e.sourceUrl === "string" && /^https:\/\/\S+$/.test(e.sourceUrl))) blockers.push("no https sourceUrl");
  if (!(typeof e.license === "string" && Object.hasOwn(OPEN_LICENSE_DEEDS, e.license.trim())))
    blockers.push("licence has no known deed to link to");
  return blockers;
};

/** Why an OPEN-set entry (committed, deployed) may not be rendered or shown:
 *  the full clearance AND its attribution. Empty when it is cleared. */
const openRenderBlockers = (entry) => [...clearanceBlockers(entry), ...attributionBlockers(entry)];

module.exports = { clearanceBlockers, attributionBlockers, openRenderBlockers, OPEN_LICENSE_DEEDS };
