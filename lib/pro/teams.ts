/**
 * Team-affiliation derivation for the Pro HUD + board (issue #195).
 *
 * The engine exposes a public, optional `team` on every `view.players[]` entry,
 * emitted UNIFORMLY in all formats (duel/ffa seats are their own singleton
 * teams; team-2v2 teammates share a value). This module turns that raw field
 * into the two questions the UI actually asks — "should any team chrome show?"
 * and "is this seat my ally / my enemy?" — so the derivation lives in ONE tested
 * place instead of being re-implemented in each component.
 *
 * Degrade-gracefully contract (acceptance criteria):
 * - Team chrome is ACTIVE only for a real team format: ≥2 distinct teams AND at
 *   least one team with >1 member. Duel (2 singleton teams), ffa-3 (3 singleton
 *   teams), and older servers (no `team` at all) are all INACTIVE → the UI
 *   renders exactly as before.
 */
import type { PlayerId, ViewPlayer } from "./protocol";

/** A seat relative to the viewing player. Only meaningful when `active`. */
export type TeamRelation = "self" | "ally" | "hostile";

/** The minimal seat shape the derivation needs (a `ViewPlayer`, or a test stub). */
export type TeamSeat = Pick<ViewPlayer, "id" | "you" | "team">;

export interface TeamView {
  /** True iff the view is a real team format (render team chrome). */
  active: boolean;
  /** The viewing seat's id, or undefined if it can't be resolved. */
  you: PlayerId | undefined;
  /** Relation of a seat to the viewer. Returns "hostile" for unknown teams when
   *  active (a defined enemy is the safe default); irrelevant when inactive. */
  relationOf: (playerId: PlayerId) => TeamRelation;
  /** The viewer's teammates (excludes self); empty unless `active`. */
  allies: PlayerId[];
  /** Owner ids on the viewer's team INCLUDING self — for shared board chrome.
   *  Empty unless `active` (so duel/ffa/older servers get no board treatment). */
  friendlyOwners: PlayerId[];
  /** Convenience: is this owner on the viewer's team (self or ally)? */
  isFriendly: (playerId: PlayerId) => boolean;
}

/**
 * Derive team relationships for the viewer from the per-seat `team` field.
 * `youId` is an explicit fallback for the viewer's seat when no entry is flagged
 * `you` (e.g. a spectator/god view); normally `players[].you` resolves it.
 */
export function deriveTeams(players: TeamSeat[], youId?: PlayerId): TeamView {
  const viewer = players.find((p) => p.you) ?? players.find((p) => p.id === youId);
  const you = viewer?.id ?? youId;

  // Group seats by team (ignore seats without a team — pre-team server).
  const members = new Map<string, PlayerId[]>();
  for (const p of players) {
    if (p.team == null) continue;
    const list = members.get(p.team) ?? [];
    list.push(p.id);
    members.set(p.team, list);
  }

  // A real team format: at least two distinct teams AND some team has a pair.
  const active =
    members.size >= 2 && [...members.values()].some((m) => m.length >= 2);

  const teamOf = new Map(players.map((p) => [p.id, p.team]));
  const viewerTeam = viewer?.team;

  const allies =
    active && viewerTeam != null
      ? players
          .filter((p) => p.id !== you && p.team === viewerTeam)
          .map((p) => p.id)
      : [];

  const friendlyOwners = allies.length && you ? [you, ...allies] : [];

  const isFriendly = (playerId: PlayerId) =>
    friendlyOwners.includes(playerId);

  const relationOf = (playerId: PlayerId): TeamRelation => {
    if (playerId === you) return "self";
    if (!active || viewerTeam == null) return "hostile";
    return teamOf.get(playerId) === viewerTeam ? "ally" : "hostile";
  };

  return { active, you, relationOf, allies, friendlyOwners, isFriendly };
}
