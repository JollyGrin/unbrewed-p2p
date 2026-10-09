/**
 * Adventure scenario objects (engine #648 / #653 / #689 / #807): the breakable spaces of the board —
 * Isla Nublar's enclosures — as closed badges and destroyed marks.
 *
 * `ProMapSpace.startsBlocked` marks a space out of play at game start; the live still-blocked
 * set is `PlayerView.blockedSpaces` (sorted, public, absent when nothing is blocked). A
 * `startsBlocked` space NOT in that set has been destroyed. What the objects are called is the
 * engine's `display.objectNoun`; the printed number is the space's position in the
 * `map.scenario.groups[id = display.objectGroup].order`, index-aligned with that group's `spaces`.
 * Without display data: a generic noun, and the first group holding a `startsBlocked` space.
 *
 * PRESENTATION ONLY. Returns null for any map without `startsBlocked` spaces, so duel / ffa /
 * 2v2 boards receive no prop and render byte-identically.
 */
import { scenarioObjectStakes, type ScenarioObjectStakes } from "./scenarioObjectStakes";
import type { PlayerView, ProMapDef, ScenarioDisplay, SpaceId } from "./protocol";

export interface ObjectNoun {
  singular: string;
  plural: string;
}

/** What a scenario without `display.objectNoun` calls its breakable objects. */
export const GENERIC_OBJECT_NOUN: ObjectNoun = { singular: "space", plural: "spaces" };

export const objectNounOf = (display: Pick<ScenarioDisplay, "objectNoun"> | null | undefined): ObjectNoun =>
  display?.objectNoun ?? GENERIC_OBJECT_NOUN;

export const capitalize = (s: string): string => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);

/** "a space" / "an outpost". */
export const withArticle = (noun: string): string => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

export interface ScenarioObjectModel {
  /** Spaces still closed right now. */
  blocked: ReadonlySet<SpaceId>;
  /** startsBlocked spaces that are no longer blocked. */
  destroyed: ReadonlySet<SpaceId>;
  /** Printed object number by space, where the map declares one. */
  numbers: Readonly<Record<SpaceId, number>>;
  /** #1160: villain contacts / next-to-open / released enemy per space; `{}` without `scenario`. */
  stakes: ScenarioObjectStakes;
  /** #807: what the objects are called (`display.objectNoun`, else generic). */
  noun: ObjectNoun;
}

export const scenarioObjectNumbers = (
  map: Pick<ProMapDef, "scenario"> & Partial<Pick<ProMapDef, "spaces">>,
  display?: Pick<ScenarioDisplay, "objectGroup"> | null
): Record<SpaceId, number> => {
  const groups = map.scenario?.groups ?? [];
  const blocked = new Set((map.spaces ?? []).filter((s) => s.startsBlocked).map((s) => s.id));
  const group = display?.objectGroup
    ? groups.find((g) => g.id === display.objectGroup)
    : groups.find((g) => g.spaces.some((sp) => blocked.has(sp)));
  const out: Record<SpaceId, number> = {};
  if (!group?.order) return out;
  group.spaces.forEach((sp, i) => {
    const n = group.order?.[i];
    if (n != null) out[sp] = n;
  });
  return out;
};

export const scenarioObjectModel = (
  map: Pick<ProMapDef, "spaces" | "scenario">,
  blockedSpaces: readonly SpaceId[] | undefined,
  scenario?: PlayerView["scenario"],
  fighters: readonly { id: string; name: string }[] = []
): ScenarioObjectModel | null => {
  const starts = map.spaces.filter((s) => s.startsBlocked).map((s) => s.id);
  if (!starts.length) return null;
  const blocked = new Set(blockedSpaces ?? []);
  const destroyed = new Set(starts.filter((id) => !blocked.has(id)));
  const numbers = scenarioObjectNumbers(map, scenario?.display);
  const noun = objectNounOf(scenario?.display);
  return { blocked, destroyed, numbers, stakes: scenarioObjectStakes(scenario, fighters, blocked, destroyed, numbers), noun };
};
