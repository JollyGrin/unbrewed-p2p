/**
 * Pure view-model for the Adventure board overlays (Wave 4.3, unbrewed-p2p#1099).
 * Everything here reads the redacted PlayerView / GameEvent stream only, so it is
 * fixture-testable without an engine. Enemy hands never reach the client; we only
 * ever read `enemy.deckCount` (a count) and `initiative.deckCount`.
 */
import type {
  FighterId,
  PlayerView,
  ViewCombat,
  ViewFighter,
  ViewInitiativeCard,
} from "@/lib/pro/protocol";

/**
 * A spawned enemy's initiative card id is `<enemy card id>@<fighter>` (engine 2.4):
 * the part before the `@` is the card (key art / labels), the part after is the
 * spawned fighter. Plain ids pass through with `fighter: null`.
 */
export const parseInitiativeCardId = (
  id: string,
): { cardId: string; fighter: FighterId | null } => {
  const at = id.indexOf("@");
  return at < 0
    ? { cardId: id, fighter: null }
    : { cardId: id.slice(0, at), fighter: id.slice(at + 1) };
};

export interface InitiativeRowEntry {
  card: ViewInitiativeCard;
  /** the card id with any `@<fighter>` spawn suffix stripped — key art on this */
  artKey: string;
  /** the spawned fighter named by an `@` suffix, else null */
  spawnedFighter: FighterId | null;
  current: boolean;
  /** done = resolved this round (before the current card); now = the current card;
   *  up = revealed, still to act; down = face-down (identity not public) */
  state: "done" | "now" | "up" | "down";
  /** the portrait fighter (hero for a SEAT card, the enemy for a FIGHTER card), if resolvable */
  fighter: ViewFighter | null;
  /** hero | enemy | event, null for a face-down card */
  who: "hero" | "enemy" | "event" | null;
  /** short display name; null for a face-down card (hidden info) */
  name: string | null;
  /** face-down cards carry no title (hidden info) — the label falls back to the entry kind */
  label: string;
}

export interface ThreatCell {
  /** 1-based space on the track (engine `resetTo: 1` convention) */
  space: number;
  /** the printed number / value at this space, from scenario data */
  value: number;
  marker: boolean;
}

export interface EnemyDial {
  id: FighterId;
  /** engine enemy id (art / label key); null against an older server that omits it */
  enemyId: string | null;
  name: string;
  role: "VILLAIN" | "MINION";
  hp: number;
  maxHp: number;
  deckCount: number;
  defeated: boolean;
  size: "NORMAL" | "LARGE" | "SMALL";
  move: number;
  /** printed title of the top of the enemy's face-up discard ("last played"), null when empty/unknown */
  lastPlayed: string | null;
  /** engine #735 part 4 `enemy.released`; null against a server that omits it */
  released: boolean | null;
}

export interface ObjectiveSlot {
  id: string;
  label: string;
  fired: boolean;
  /** the last slot: when it fires the game is lost */
  lose: boolean;
}

export interface ThreatModel {
  cells: ThreatCell[];
  level: number;
  overflows: number;
  /** the terminal cell after the last printed position: what the track does when it fills */
  terminal: { label: string | null; marker: boolean };
  /** steps the marker needs to reach the terminal cell (1 = breaks out on the next step) */
  stepsToBreakout: number;
}

export interface AdventureBoardModel {
  /** the scenario the table is playing (engine #664), null against an older server */
  scenarioId: string | null;
  scenarioLabel: string | null;
  round: number | null;
  phase: string | null;
  initiativeDeckCount: number | null;
  row: InitiativeRowEntry[];
  threat: ThreatModel | null;
  objectives: { slots: ObjectiveSlot[]; lost: number } | null;
  /** the villain's dial (header), when one is on the board */
  villain: EnemyDial | null;
  /** engine v36 `scenario.briefing.objective` (header line); null when the scenario authors no briefing */
  objective: string | null;
  /** "To win" line parts: villain + the released minions still to defeat; null without a villain */
  win: {
    villain: string;
    released: { name: string; hp: number; maxHp: number }[];
    /** every hero is down but this sidekick still stands (the lose condition is heroes AND sidekicks) */
    heroesDownSidekick: string | null;
  } | null;
  /** face-down cards in the row plus the draw pile: "k still to flip" */
  stillToFlip: number;
  /** who the `current` card belongs to, as the banner/NOW chip names them */
  nowName: string | null;
  enemies: EnemyDial[];
}

const ENTRY_LABEL = {
  SEAT: "Seat",
  FIGHTER: "Enemy",
  EFFECT: "Event",
} as const;

export const threatCells = (
  positions: number[],
  position: number,
): ThreatCell[] =>
  positions.map((value, i) => ({
    space: i + 1,
    value,
    marker: i + 1 === position,
  }));

/** the standing sidekick's name when every (non-enemy) hero is defeated, else null. */
export const standingSidekick = (view: PlayerView): string | null => {
  const team = view.fighters.filter((f) => !f.enemy);
  const heroes = team.filter((f) => f.kind === "HERO");
  if (heroes.length === 0 || !heroes.every((f) => f.defeated)) return null;
  return team.find((f) => f.kind === "SIDEKICK" && !f.defeated)?.name ?? null;
};

type ViewScenario = NonNullable<PlayerView["scenario"]>;

/**
 * The track plus its terminal cell. The marker sits on 1..N; one step past N is the
 * breakout (the engine resets to 1 and counts an overflow), so steps-to-breakout is
 * N - position + 1. The terminal cell is labelled by the first unfired objective.
 */
export const threatModel = (scenario: ViewScenario): ThreatModel => {
  const { positions, position, level, overflows } = scenario.threat;
  const next = objectiveSlots(scenario.objectives).slots.find((s) => !s.fired);
  return {
    cells: threatCells(positions, position),
    level,
    overflows,
    terminal: { label: next?.label ?? null, marker: position > positions.length },
    stepsToBreakout: Math.max(1, positions.length - position + 1),
  };
};

/** How many times an objective can fire (engine `repeat`, absent = once). */
export const objectiveRepeat = (o: { repeat?: number }): number =>
  Math.max(Math.floor(o.repeat ?? 1), 1);

/** Total objective fires in the scenario; the last one loses the game. */
export const objectiveTotal = (objectives: ViewScenario["objectives"]): number =>
  objectives.reduce((n, o) => n + objectiveRepeat(o), 0);

/**
 * One slot per objective FIRE (a repeating objective expands to `repeat` slots, in order);
 * the last slot is the game-losing one.
 */
export const objectiveSlots = (
  objectives: ViewScenario["objectives"],
): { slots: ObjectiveSlot[]; lost: number } => {
  const total = objectiveTotal(objectives);
  const slots: ObjectiveSlot[] = [];
  for (const o of objectives) {
    for (let k = 0; k < objectiveRepeat(o); k++) {
      slots.push({ id: `${o.id}#${k + 1}`, label: o.label, fired: k < o.fired, lose: slots.length === total - 1 });
    }
  }
  return { slots, lost: slots.filter((s) => s.fired).length };
};

const seatName = (view: PlayerView, id: string): string => {
  const pl = view.players?.find((x) => x.id === id);
  return pl?.displayName?.trim() || pl?.heroId || id;
};

/** Resolve one initiative card to the fighter/seat it activates (null for face-down / events). */
const resolveCardOwner = (
  view: PlayerView,
  card: ViewInitiativeCard,
): { who: "hero" | "enemy" | "event" | null; fighter: ViewFighter | null; name: string | null; seat: string | null } => {
  if (card.faceDown) return { who: null, fighter: null, name: null, seat: null };
  const { cardId, fighter: spawned } = parseInitiativeCardId(card.id);
  if (card.entry === "SEAT") {
    const seat = card.seat ?? null;
    const hero =
      view.fighters.find((f) => f.owner === seat && f.kind === "HERO" && !f.enemy) ?? null;
    return { who: "hero", fighter: hero, name: (seat && view.players?.find((x) => x.id === seat)?.displayName?.trim()) || hero?.name || (seat ? seatName(view, seat) : card.title ?? null), seat };
  }
  if (card.entry === "FIGHTER") {
    const fid = card.fighter ?? spawned;
    const f =
      (fid ? view.fighters.find((x) => x.id === fid) : undefined) ??
      view.fighters.find((x) => x.enemy?.enemyId === cardId) ??
      null;
    return { who: "enemy", fighter: f, name: f?.name ?? card.title ?? null, seat: null };
  }
  return { who: "event", fighter: null, name: card.title ?? null, seat: null };
};

export interface AdventureTurnLabel {
  text: string;
  tone: "self" | "ally" | "enemy";
}

/**
 * The turn-banner text for an Adventure view (never "OPPONENT'S TURN" at a co-op table):
 * YOUR TURN / "<P2>'S TURN · ALLY" / "<ENEMY>'S TURN". Null when no initiative card is
 * current, so the caller falls back to `activePlayer`.
 */
export const adventureTurnLabel = (view: PlayerView): AdventureTurnLabel | null => {
  const init = view.initiative;
  if (!init) return null;
  const card = init.current ? init.row.find((c) => c.id === init.current) : undefined;
  if (!card) return null;
  const o = resolveCardOwner(view, card);
  if (o.who === "hero") {
    if (o.seat === view.you) return { text: "YOUR TURN", tone: "self" };
    return { text: `${(o.name ?? "ALLY").toUpperCase()}'S TURN · ALLY`, tone: "ally" };
  }
  if (o.who === "enemy") {
    return { text: `${(o.name ?? "ENEMY").toUpperCase()}'S TURN`, tone: "enemy" };
  }
  return null;
};

/**
 * Log/dock name for an engine-controlled seat (a seat that owns only enemy fighters): the
 * acting enemy while its initiative card is current, else the scenario label, else its
 * setting noun (`display.setting`), else "The enemy". Null for human seats and every
 * non-adventure view.
 */
export const adventureEnemySeatName = (view: PlayerView, player: string): string | null => {
  if (!view.initiative) return null;
  const owned = view.fighters.filter((f) => f.owner === player);
  if (owned.length === 0 || !owned.every((f) => f.enemy)) return null;
  const init = view.initiative;
  const card = init.current ? init.row.find((c) => c.id === init.current) : undefined;
  const o = card ? resolveCardOwner(view, card) : null;
  if (o?.who === "enemy" && o.name && (!o.fighter || o.fighter.owner === player)) return o.name;
  const setting = view.scenario?.display?.setting;
  return view.scenario?.label ?? (setting ? setting[0].toUpperCase() + setting.slice(1) : "The enemy");
};

/** null when the view carries no adventure data (every regular format). */
export const adventureBoardModel = (
  view: PlayerView,
): AdventureBoardModel | null => {
  const { initiative, scenario } = view;
  const enemies: EnemyDial[] = view.fighters
    .filter((f) => f.enemy)
    .map((f) => ({
      id: f.id,
      enemyId: f.enemy!.enemyId ?? null,
      name: f.name,
      role: f.enemy!.role,
      hp: f.hp,
      maxHp: f.maxHp,
      deckCount: f.enemy!.deckCount,
      defeated: f.defeated,
      size: f.size,
      move: f.enemy!.move,
      lastPlayed: f.enemy!.discardTop
        ? (view.catalog?.[f.enemy!.discardTop.split("#")[0]]?.title ??
          null)
        : null,
      released: (f.enemy as { released?: boolean }).released ?? null,
    }));
  if (!initiative && !scenario && enemies.length === 0) return null;
  const villain = enemies.find((e) => e.role === "VILLAIN") ?? null;
  return {
    scenarioId: scenario?.id ?? null,
    scenarioLabel: scenario?.label ?? null,
    round: initiative?.round ?? null,
    phase: initiative?.phase ?? null,
    initiativeDeckCount: initiative?.deckCount ?? null,
    ...(() => {
      const cards = initiative?.row ?? [];
      const curIdx = cards.findIndex((c) => c.id === initiative?.current);
      const row = cards.map((card, i) => {
        const o = resolveCardOwner(view, card);
        return {
          card,
          artKey: parseInitiativeCardId(card.id).cardId,
          spawnedFighter: parseInitiativeCardId(card.id).fighter,
          current: i === curIdx,
          state: (card.faceDown
            ? "down"
            : i === curIdx
              ? "now"
              : curIdx >= 0 && i < curIdx
                ? "done"
                : "up") as InitiativeRowEntry["state"],
          fighter: o.fighter,
          who: o.who,
          name: o.name,
          label:
            card.title ?? (card.faceDown ? "Face down" : ENTRY_LABEL[card.entry]),
        };
      });
      const now = row.find((r) => r.current);
      return {
        row,
        stillToFlip:
          cards.filter((c) => c.faceDown).length + (initiative?.deckCount ?? 0),
        nowName: now?.name ?? null,
      };
    })(),
    threat: scenario ? threatModel(scenario) : null,
    objectives: scenario ? objectiveSlots(scenario.objectives) : null,
    villain,
    objective: scenario?.briefing?.objective ?? null,
    win: villain
      ? {
          villain: villain.name,
          released: enemies
            .filter((e) => e.role === "MINION" && e.released === true)
            .map((e) => ({ name: e.name, hp: e.hp, maxHp: e.maxHp })),
          heroesDownSidekick: standingSidekick(view),
        }
      : null,
    enemies,
  };
};

export interface TeamDecisionModel {
  promptId: string;
  /** the human seat that answers (R2 chooser) */
  chooser: string;
  /** the engine seat whose decision this is, when named */
  forName: string | null;
  /** title of the card the enemy is playing (`enemy.inPlay`, #748), so a reconnect names it too */
  card: string | null;
  youChoose: boolean;
  description: string | null;
  /** read-only option labels for teammates; empty for the chooser (they use the normal prompt UI) */
  options: { id: string; label: string }[];
  /** board spaces the chooser is deciding between, for teammates' gold highlight (never ids in text) */
  spaces: string[];
}

/**
 * The "players choose" decision (engine #589, R2): null unless the open prompt is a TEAM
 * decision. Every seat sees who is choosing and what; only the chooser answers.
 */
export const teamDecisionModel = (
  view: PlayerView,
): TeamDecisionModel | null => {
  const p = view.prompt;
  if (!p || p.onBehalfOf !== "TEAM") return null;
  const seatName = (id: string) => {
    const pl = view.players?.find((x) => x.id === id);
    const owned = view.fighters.filter((f) => f.owner === id);
    const seatFighter = (owned.find((f) => f.kind === "HERO") ?? owned[0])?.name;
    if (pl) return pl.displayName?.trim() || seatFighter || pl.heroId || id;
    return seatFighter ?? id;
  };
  const spaceIds = new Set((view.map?.spaces ?? []).map((s) => s.id));
  const fighterName = (id: string) =>
    view.fighters.find((f) => f.id === id)?.name;
  // Candidate spaces: a single-space option, or both ends of a two-step "a|b" route.
  const optionSpaces = (o: { id: string; label: string }): string[] => {
    const parts = (o.id.includes("|") ? o.id : o.label).split("|");
    return parts.every((x) => spaceIds.has(x)) ? parts : [];
  };
  const readableOptions = (): { id: string; label: string }[] => {
    if (p.kind !== "CHOOSE_SPACE" && p.kind !== "CHOOSE_TARGET")
      return p.options.map(({ id, label }) => ({
        id,
        label: spaceIds.has(label) ? "a space" : (fighterName(label) ?? label),
      }));
    const withSpaces = p.options.filter((o) => optionSpaces(o).length > 0);
    const routes = withSpaces.filter((o) => optionSpaces(o).length > 1);
    if (routes.length > 0)
      return routes.map((o, i) => ({
        id: o.id,
        label: `route ${i + 1} of ${routes.length}`,
      }));
    if (withSpaces.length > 0)
      return [
        {
          id: "spaces",
          label: `${withSpaces.length} space${withSpaces.length === 1 ? "" : "s"}`,
        },
      ];
    return p.options.map(({ id, label }) => ({
      id,
      label: fighterName(id) ?? fighterName(label) ?? (spaceIds.has(label) ? "a space" : label),
    }));
  };
  const youChoose = p.player === view.you;
  // The prompt is parked inside a card the enemy is playing: read it off the view, not the event.
  const playing = view.fighters.find(
    (f) => f.enemy?.inPlay?.length && (!p.forSeat || f.owner === p.forSeat),
  )?.enemy?.inPlay?.[0];
  return {
    promptId: p.promptId,
    card: playing
      ? (view.catalog?.[playing.split("#")[0]]?.title ?? playing)
      : null,
    chooser: youChoose ? "You" : seatName(p.player),
    forName: p.forSeat ? seatName(p.forSeat) : null,
    youChoose,
    description: p.description ?? null,
    options: youChoose ? [] : readableOptions(),
    spaces: youChoose
      ? []
      : [...new Set(p.options.flatMap((o) => optionSpaces(o)))],
  };
};

export interface EnemyCombatSide {
  role: "ATTACK" | "DEFENSE";
  fighterId: FighterId;
  /** the owning enemy (box scoping: which villain/minion the card belongs to) */
  enemyName: string;
  enemyRole: "VILLAIN" | "MINION";
  title: string;
  /** printed value read in this role: attacker -> value, defender -> defense ?? value */
  printed: number | null;
  /** server-computed running value (printed ± effects + boosts) */
  effective: number;
  boosts: number;
}

/**
 * The enemy's revealed combat card(s) (Wave 4.5): one side per enemy fighter that is the
 * attacker or defender and has a PUBLIC card in the slot. Null when no enemy is in combat
 * or nothing is revealed yet — regular formats never produce a model.
 */
export const enemyCombatModel = (
  view: PlayerView,
): EnemyCombatSide[] | null => {
  const c = view.combat;
  if (!c) return null;
  const sides: EnemyCombatSide[] = [];
  const add = (
    fighterId: FighterId,
    card: ViewCombat["attackerCard"],
    role: "ATTACK" | "DEFENSE",
  ) => {
    const f = view.fighters.find((x) => x.id === fighterId);
    if (!f?.enemy || !card) return;
    const meta = view.catalog?.[card.instance.split("#")[0]];
    const printed =
      role === "DEFENSE"
        ? (meta?.defense ?? meta?.value ?? null)
        : (meta?.value ?? null);
    sides.push({
      role,
      fighterId,
      enemyName: f.name,
      enemyRole: f.enemy.role,
      title: meta?.title ?? card.instance,
      printed,
      effective: card.effectiveValue,
      boosts: card.boosts.length,
    });
  };
  add(c.attacker, c.attackerCard, "ATTACK");
  add(c.target, c.defenderCard, "DEFENSE");
  return sides.length ? sides : null;
};
