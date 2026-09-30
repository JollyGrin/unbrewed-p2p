/**
 * Adventure enclosures (engine #648 / #653 / #689): the closed-fence layer of the board.
 *
 * `ProMapSpace.startsBlocked` marks a space out of play at game start; the live still-blocked
 * set is `PlayerView.blockedSpaces` (sorted, public, absent when nothing is blocked). A
 * `startsBlocked` space NOT in that set has been destroyed. The printed enclosure number is
 * the space's position in `map.scenario.groups[id=enclosures].order`, index-aligned with
 * that group's `spaces`.
 *
 * PRESENTATION ONLY. Returns null for any map without `startsBlocked` spaces, so duel / ffa /
 * 2v2 boards receive no prop and render byte-identically.
 */
import type { ProMapDef, SpaceId } from "./protocol";

export interface EnclosureModel {
  /** Spaces still closed right now. */
  blocked: ReadonlySet<SpaceId>;
  /** startsBlocked spaces that are no longer blocked. */
  destroyed: ReadonlySet<SpaceId>;
  /** Printed enclosure number by space, where the map declares one. */
  numbers: Readonly<Record<SpaceId, number>>;
}

export const enclosureNumbers = (map: Pick<ProMapDef, "scenario">): Record<SpaceId, number> => {
  const group = map.scenario?.groups?.find((g) => g.id === "enclosures");
  const out: Record<SpaceId, number> = {};
  if (!group?.order) return out;
  group.spaces.forEach((sp, i) => {
    const n = group.order?.[i];
    if (n != null) out[sp] = n;
  });
  return out;
};

export const enclosureModel = (
  map: Pick<ProMapDef, "spaces" | "scenario">,
  blockedSpaces: readonly SpaceId[] | undefined
): EnclosureModel | null => {
  const starts = map.spaces.filter((s) => s.startsBlocked).map((s) => s.id);
  if (!starts.length) return null;
  const blocked = new Set(blockedSpaces ?? []);
  return {
    blocked,
    destroyed: new Set(starts.filter((id) => !blocked.has(id))),
    numbers: enclosureNumbers(map),
  };
};
