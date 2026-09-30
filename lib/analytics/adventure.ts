/**
 * Adventure funnel events (unbrewed-p2p#1097). Names are `adventure_*`; the keys
 * (`humans`, `heroes`, `villain`, `minions`, `rounds`, `verdict`, `defeatKind`,
 * `overflows`) are the engine's Adventure record keys (engine #660,
 * docs/TELEMETRY.md § Adventure record) so client and engine rows join on them.
 * `scenarioId` rides from the view's `scenario.id` (engine #664) — null against a
 * server that predates it; the lobby event carries the picked scenario id.
 */
import { track } from "./index";
import type { AdventureSetup } from "@/lib/pro/adventureLobby";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";

export type AdventureVerdict = "victory" | "defeat" | "unknown";
export type AdventureExit = "rematch" | "leave";

/** Engine verdict mapping: GAME_ENDED.reason -> record `verdict`. */
export const verdictOf = (reason: string): AdventureVerdict =>
  reason === "SCENARIO_VICTORY" ? "victory" : reason === "SCENARIO_DEFEAT" ? "defeat" : "unknown";

/** Roster keys shared by every in-game event. Seat order, hero ids only. */
export const rosterOf = (
  view: PlayerView,
): { scenarioId: string | null; humans: number; heroes: string[]; villain: string | null; minions: string[] } => ({
  scenarioId: view.scenario?.id ?? null,
  humans: view.players.length,
  heroes: view.players.map((p) => p.heroId),
  // engine enemy ids (fall back to the fighter id against a server without enemyId)
  villain: view.fighters.find((f) => f.enemy?.role === "VILLAIN")?.enemy?.enemyId ?? null,
  minions: view.fighters.filter((f) => f.enemy?.role === "MINION").map((f) => f.enemy?.enemyId ?? f.id),
});

/** DERIVED like the engine: SCENARIO_DEFEAT with no hero standing is a wipe, otherwise an overflow. */
export const defeatKindOf = (view: PlayerView): "overflow" | "wipe" =>
  view.fighters.some((f) => !f.enemy && !f.defeated) ? "overflow" : "wipe";

const setupProps = (s: AdventureSetup) => ({ scenarioId: s.scenarioId, humans: s.humans, villain: s.villainId, minions: s.minionIds.map((m) => m ?? "random") });

export const trackFormatOpened = (): void => track("adventure_format_opened");
export const trackLobbyConfigured = (s: AdventureSetup): void => track("adventure_lobby_configured", () => setupProps(s));
export const trackGameStarted = (view: PlayerView): void => track("adventure_game_started", () => rosterOf(view));
export const trackRound = (view: PlayerView, round: number): void =>
  track("adventure_round", () => ({ ...rosterOf(view), round, threat: view.scenario?.threat.level ?? null }));
export const trackThreat = (view: PlayerView, e: Extract<GameEvent, { type: "THREAT_CHANGED" }>): void =>
  track("adventure_threat", () => ({
    ...rosterOf(view),
    position: e.position,
    level: e.level,
    overflows: view.scenario?.threat.overflows ?? 0,
  }));
export const trackVerdict = (view: PlayerView, reason: string, rounds: number | null): void =>
  track("adventure_verdict", () => {
    const verdict = verdictOf(reason);
    return {
      ...rosterOf(view),
      verdict,
      rounds,
      overflows: view.scenario?.threat.overflows ?? 0,
      defeatKind: verdict === "defeat" ? defeatKindOf(view) : null,
    };
  });
export const trackExit = (view: PlayerView, exit: AdventureExit, afterVerdict: boolean): void =>
  track("adventure_exit", () => ({ ...rosterOf(view), exit, afterVerdict }));
/** Chooser-prompt latency: ms from the prompt reaching this seat to it being answered. */
export const trackPromptLatency = (kind: string, team: boolean, ms: number): void =>
  track("adventure_prompt_latency", { kind, team, ms: Math.round(ms) });
