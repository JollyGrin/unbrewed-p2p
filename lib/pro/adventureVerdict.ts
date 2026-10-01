/**
 * Adventure end screen (unbrewed-p2p#1159): the verdict and WHY.
 *
 * Pure view-model over `PlayerView.scenario.result` / `.releases` / `.threat.bySource`
 * (engine #735, protocol v36) plus the fighters. ADVENTURE ONLY: `adventureVerdictModel`
 * returns null for any view without a scenario, so every other format keeps today's
 * VICTORY!/DEFEAT panel byte for byte. This file is also the adventure end-screen copy
 * module — scenario-flavoured strings come from `scenario.briefing` where the scenario
 * authors one.
 *
 * REMATCH: there is deliberately no "try again" in this model. The rematch ruling today
 * refuses a rematch at co-op tables (the engine answers REMATCH_OFFER with a
 * "Rematch offers are for rooms with two or more human players"-style refusal), so the
 * dock renders neither the button nor the notice for an adventure. If the ruling changes,
 * add the button to the dock where the verdict buttons are — not here.
 */
import type { FighterId, PlayerView, ScenarioRelease } from "./protocol";

export interface VerdictReleaseTile {
  round: number;
  /** printed enclosure number (the fence's number), else its order of release */
  enclosure: string;
  enemyName: string;
  /** the round the released enemy fell, when we watched it happen */
  defeatedRound: number | null;
  /** the slot that ended the game — carries no enemy */
  final: boolean;
}

export interface VerdictFact {
  label: string;
  text: string;
}

export interface AdventureVerdictModel {
  /** null when the wire carried no `result` */
  verdict: "VICTORY" | "DEFEAT" | null;
  /** the big title; with no `result` on the wire this is today's VICTORY! / DEFEAT */
  headline: string;
  /** false when the wire carried no `result` — only the headline is shown */
  explained: boolean;
  /** "DEFEAT · ROUND 9" */
  kicker: string | null;
  lines: string[];
  releases: VerdictReleaseTile[];
  facts: VerdictFact[];
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
export const ordinalWord = (n: number): string => ORDINALS[n - 1] ?? `${n}th`;

/** The scenario overflow count at the end is the enclosure number (the 4th breaks the game). */
const finalEnclosure = (view: PlayerView): number | null => {
  const n = view.scenario?.threat.overflows;
  return typeof n === "number" && n > 0 ? n : null;
};

/**
 * Record the round each fighter fell. `prev` is returned untouched when nothing new fell, so
 * a caller can keep it in state without re-rendering on every batch.
 */
export const trackDefeatRounds = (
  prev: Readonly<Record<FighterId, number>>,
  events: readonly { type: string; fighter?: FighterId }[],
  round: number | null | undefined,
): Readonly<Record<FighterId, number>> => {
  if (round == null) return prev;
  let next: Record<FighterId, number> | null = null;
  for (const e of events) {
    if (e.type !== "FIGHTER_DEFEATED" || !e.fighter || e.fighter in prev) continue;
    next ??= { ...prev };
    next[e.fighter] = round;
  }
  return next ?? prev;
};

const releaseTiles = (
  view: PlayerView,
  releases: readonly ScenarioRelease[],
  defeatRounds: Readonly<Record<FighterId, number>>,
): VerdictReleaseTile[] =>
  releases.map((r, i) => ({
    round: r.round,
    enclosure: r.spaceLabel ?? String(i + 1),
    enemyName: view.fighters.find((f) => f.id === r.fighter)?.name ?? r.enemyId,
    defeatedRound: defeatRounds[r.fighter] ?? null,
    final: false,
  }));

const sourceFact = (view: PlayerView): VerdictFact | null => {
  const s = view.scenario?.threat.bySource;
  if (!s) return null;
  return {
    label: "Threat came from",
    text: `Round ends ${s.roundEnd} · enemies with no target ${s.noTarget} · enemy cards ${s.effect}`,
  };
};

/** null for any non-adventure view (no scenario) or an unfinished game. */
export const adventureVerdictModel = (
  view: PlayerView,
  defeatRounds: Readonly<Record<FighterId, number>> = {},
): AdventureVerdictModel | null => {
  const scenario = view.scenario;
  if (!scenario || !view.winner) return null;
  const result = scenario.result;
  const villain = view.fighters.find((f) => f.enemy?.role === "VILLAIN");
  const villainName = villain?.name ?? "The villain";

  if (!result) {
    // Older engine, or a FORFEIT: the caller keeps today's VICTORY! / DEFEAT headline.
    return { verdict: null, headline: "", explained: false, kicker: null, lines: [], releases: [], facts: [] };
  }
  const verdict = result.verdict;

  const kicker = `${result.verdict} · ROUND ${result.round}`;
  const tiles = releaseTiles(view, scenario.releases ?? [], defeatRounds);
  const facts: VerdictFact[] = [];
  const src = sourceFact(view);
  if (src) facts.push(src);
  const lines: string[] = [];
  const hpText = villain ? `${villain.hp} of ${villain.maxHp}` : null;

  if (result.verdict === "VICTORY") {
    const villainRound = villain ? defeatRounds[villain.id] : undefined;
    const lastLoose = [...(scenario.releases ?? [])]
      .map((r) => ({ r, round: defeatRounds[r.fighter] }))
      .filter((x) => x.round != null)
      .sort((a, b) => b.round - a.round)[0];
    lines.push(villainRound != null ? `${villainName} fell in round ${villainRound}.` : `${villainName} fell.`);
    if (lastLoose) {
      const name = view.fighters.find((f) => f.id === lastLoose.r.fighter)?.name ?? lastLoose.r.enemyId;
      lines.push(`The last loose enemy, ${name}, fell in round ${lastLoose.round}.`);
    }
    return { verdict, headline: "THE ISLAND IS SAFE", explained: true, kicker, lines, releases: tiles, facts };
  }

  const cause = result.cause;
  let headline = "DEFEAT";
  if (cause.kind === "OBJECTIVE") {
    headline = "THE ISLAND FELL";
    const n = finalEnclosure(view);
    lines.push(`${villainName} broke open her ${n ? `${ordinalWord(n)} ` : ""}enclosure.${hpText ? ` You had her down to ${hpText} health.` : ""}`);
    tiles.push({ round: result.round, enclosure: n ? String(n) : "?", enemyName: "", defeatedRound: null, final: true });
  } else if (cause.kind === "WIPE") {
    headline = "THE HEROES FELL";
    lines.push("Every hero and sidekick is down.");
    if (hpText) lines.push(`${villainName} was left at ${hpText} health.`);
  } else {
    lines.push(scenario.briefing?.lose ?? "The scenario's defeat condition was met.");
    if (hpText) lines.push(`${villainName} was left at ${hpText} health.`);
  }
  if (villain && !villain.defeated) {
    facts.push({ label: "Villain health left", text: `${villainName} ${hpText}` });
  }
  return { verdict, headline, explained: true, kicker, lines, releases: tiles, facts };
};

/** The log's closing line for an adventure (never "P5 wins"), or null off-adventure. */
export const adventureEndLogLine = (view: PlayerView): string | null => {
  const scenario = view.scenario;
  if (!scenario || !view.winner) return null;
  const result = scenario.result;
  const won = result ? result.verdict === "VICTORY" : null;
  if (won === null) return null;
  if (won) return "Victory — your team wins";
  const n = finalEnclosure(view);
  return result!.cause.kind === "OBJECTIVE" && n
    ? `Defeat — the island wins (${ordinalNumber(n)} enclosure)`
    : "Defeat — the island wins";
};

function ordinalNumber(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
