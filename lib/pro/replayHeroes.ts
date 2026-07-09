/**
 * Small client-side adapters for protocol v13 replay hero maps. Existing Pro UI
 * remains duel-first, so these helpers provide stable p1/p2 labels while the wire
 * can carry p3+ heroes.
 */
import type { PlayerId, ReplayMeta } from "./protocol";

const RUNTIME_PLAYER_IDS: PlayerId[] = [
  "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8",
  "p9", "p10", "p11", "p12", "p13", "p14", "p15", "p16",
];

export function replayHeroList(heroes: ReplayMeta["heroes"]): string[] {
  return RUNTIME_PLAYER_IDS.map((id) => heroes[id]).filter((hero): hero is string => !!hero);
}

export function replayHeroFor(heroes: ReplayMeta["heroes"], player: PlayerId): string {
  return heroes[player] ?? player;
}

export function replayDuelHeroPair(heroes: ReplayMeta["heroes"]): [string, string] {
  return [heroes.p1 ?? "p1", heroes.p2 ?? "p2"];
}
