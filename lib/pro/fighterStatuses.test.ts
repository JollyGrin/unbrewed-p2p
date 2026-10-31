/**
 * Per-fighter status registry (issue #371). These prove the resolver is generic
 * and data-driven off ViewFighter.statuses: a PINNED status yields the rooted rim
 * badge, the badge is absent when the status leaves the list, unknown kinds are
 * skipped, and a new kind is one registry entry away — no consumer change.
 */
import {
  FIGHTER_MARKER_BADGES,
  FIGHTER_STATUS_BADGES,
  fighterStatusBadgesFor,
  secretMarkedFighterIds,
  visibleSecretMarks,
  withSecretMarkStatuses,
  secretMarkLabel,
  secretMarkPromptDescription,
  emergenceCaption,
} from "./fighterStatuses";
import type { GameEvent, PlayerId, PlayerView, ViewFighter, ViewSecretMark } from "./protocol";

const fighter = (over: Partial<ViewFighter> = {}): ViewFighter => ({
  id: "p2/hero",
  owner: "p2",
  kind: "HERO",
  name: "Malfurion",
  space: "A1",
  tailSpace: null,
  hp: 12,
  maxHp: 18,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

describe("FIGHTER_STATUS_BADGES registry", () => {
  it("maps PINNED to a rooted rim badge distinct from the druid-form palette", () => {
    const pinned = FIGHTER_STATUS_BADGES.PINNED;
    expect(pinned).toBeDefined();
    expect(pinned.label).toBe("Rooted");
    expect(pinned.title.toLowerCase()).toContain("rooted");
    // Palette must not collide with any Malfurion druid-form bg (brown/blue/green)
    // so it never reads as a form badge.
    expect(["#5A351C", "#244D7A", "#2E6B48"]).not.toContain(pinned.bg);
  });
});

describe("MARKED / UNCHAINED (Superman 5zMj)", () => {
  it("has a known marker badge, so it never falls to the raw generic one", () => {
    expect(FIGHTER_MARKER_BADGES.UNCHAINED.label).toBe("Unchained");
    const [b] = fighterStatusBadgesFor(
      fighter({ owner: "p2", statuses: [{ kind: "MARKED", name: "UNCHAINED", count: 1 }] })
    );
    expect(b).toMatchObject({ key: "MARKED:UNCHAINED", label: "Unchained", icon: "⛓" });
  });
});

describe("MARKED / MERIDIAN (issue #596 ↔ engine #360, protocol v29)", () => {
  it("keys the mark by NAME, not kind — 'MARKED' says only 'a durable marker'", () => {
    // The engine emits { kind: 'MARKED', name: 'MERIDIAN', count } (verified against
    // engine #360's view builder + kenshiro.rules.ts). A kind-keyed 'MERIDIAN' entry
    // — which is what this client shipped first — never matches and renders nowhere.
    expect(FIGHTER_STATUS_BADGES.MERIDIAN).toBeUndefined();
    expect(FIGHTER_STATUS_BADGES.MARKED).toBeUndefined();
    expect(FIGHTER_MARKER_BADGES.MERIDIAN).toBeDefined();
    expect(FIGHTER_MARKER_BADGES.MERIDIAN.label).toBe("Meridian");
  });

  it("badges a marked OPPOSING hero — the fighter that takes the end-of-turn tick", () => {
    const badges = fighterStatusBadgesFor(
      fighter({ owner: "p2", statuses: [{ kind: "MARKED", name: "MERIDIAN", count: 1 }] })
    );
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ kind: "MARKED", key: "MARKED:MERIDIAN", count: 1 });
    expect(badges[0].title).toContain("Kenshiro");
  });

  it("badges a marked SIDEKICK too — the reason this is not a per-player hero flag", () => {
    const kick = fighter({
      id: "p2/sidekick-1",
      kind: "SIDEKICK",
      name: "Ally",
      statuses: [{ kind: "MARKED", name: "MERIDIAN", count: 1 }],
    });
    expect(fighterStatusBadgesFor(kick).map((b) => b.key)).toEqual(["MARKED:MERIDIAN"]);
  });

  it("carries the stack count, and puts it in the tooltip (it IS the damage dealt)", () => {
    const badges = fighterStatusBadgesFor(
      fighter({ statuses: [{ kind: "MARKED", name: "MERIDIAN", count: 3 }] })
    );
    expect(badges[0].count).toBe(3);
    expect(badges[0].title).toBe("Meridian ×3 — takes 3 damage at the end of Kenshiro's turn");
  });

  it("defaults a countless entry to one stack rather than dropping it", () => {
    expect(fighterStatusBadgesFor(fighter({ statuses: [{ kind: "MARKED", name: "MERIDIAN" }] }))[0])
      .toMatchObject({ count: 1 });
  });

  it("renders an UNKNOWN marker name generically instead of hiding public state", () => {
    // protocol v29: "a name it does not know should still render a generic mark with
    // the count" — e.g. Inigo's REVENGE tokens, landing before this client knows them.
    const badges = fighterStatusBadgesFor(
      fighter({ statuses: [{ kind: "MARKED", name: "REVENGE", count: 2 }] })
    );
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ key: "MARKED:REVENGE", label: "REVENGE", count: 2 });
    expect(badges[0].title).toBe("REVENGE ×2");
  });

  it("gives every badge a UNIQUE key — several markers can ride one fighter", () => {
    const badges = fighterStatusBadgesFor(
      fighter({
        statuses: [
          { kind: "PINNED" },
          { kind: "MARKED", name: "MERIDIAN", count: 1 },
          { kind: "MARKED", name: "REVENGE", count: 2 },
        ],
      })
    );
    expect(badges.map((b) => b.key)).toEqual(["PINNED", "MARKED:MERIDIAN", "MARKED:REVENGE"]);
    expect(new Set(badges.map((b) => b.key)).size).toBe(3);
  });

  it("keeps the Meridian palette clear of the PINNED slate — both can sit on one token", () => {
    expect(FIGHTER_MARKER_BADGES.MERIDIAN.bg).not.toBe(FIGHTER_STATUS_BADGES.PINNED.bg);
  });

  it("clears the instant the engine drops the mark (turn-edge sweep, clear, or defeat)", () => {
    expect(fighterStatusBadgesFor(fighter({ statuses: [] }))).toEqual([]);
  });
});

describe("fighterStatusBadgesFor", () => {
  it("returns [] for a fighter with no statuses", () => {
    expect(fighterStatusBadgesFor(fighter())).toEqual([]);
    expect(fighterStatusBadgesFor(fighter({ statuses: [] }))).toEqual([]);
  });

  it("yields the rooted badge while a PINNED status is present", () => {
    const badges = fighterStatusBadgesFor(
      fighter({ statuses: [{ kind: "PINNED", expiresAtTurn: 4, expiresAt: "END" }] })
    );
    expect(badges).toHaveLength(1);
    expect(badges[0].kind).toBe("PINNED");
    expect(badges[0].label).toBe("Rooted");
  });

  it("clears the badge once the status leaves the list (pin expiry / unpin)", () => {
    const rooted = fighter({ statuses: [{ kind: "PINNED" }] });
    const freed = fighter({ statuses: [] });
    expect(fighterStatusBadgesFor(rooted)).toHaveLength(1);
    expect(fighterStatusBadgesFor(freed)).toHaveLength(0);
  });

  it("works for a rooted sidekick as well as a rooted hero", () => {
    const kick = fighter({ id: "p2/sidekick-1", kind: "SIDEKICK", name: "Wisp", statuses: [{ kind: "PINNED" }] });
    expect(fighterStatusBadgesFor(kick)).toHaveLength(1);
    expect(fighterStatusBadgesFor(kick)[0].kind).toBe("PINNED");
  });

  it("silently skips a status kind the client doesn't map yet", () => {
    const badges = fighterStatusBadgesFor(
      fighter({ statuses: [{ kind: "PINNED" }, { kind: "FUTURE_UNKNOWN_EFFECT" }] })
    );
    expect(badges.map((b) => b.kind)).toEqual(["PINNED"]);
  });
});

/**
 * v38 secret fighter marks (issue #1453 ↔ engine #918, the Xenomorph's Marked Blip).
 * The engine redacts `marks` per viewer; the client only folds what a view carries,
 * so privacy is pinned here as: a view WITHOUT `marks` badges nothing, one WITH it
 * badges exactly the bearer.
 */
describe("secret fighter marks (protocol v38)", () => {
  const blip = (n: number, owner: PlayerId = "p1") =>
    fighter({ id: `${owner}/sidekick-${n}`, owner, kind: "SIDEKICK", name: "Blip", hp: 1, maxHp: 1 });
  const fighters = [blip(1), blip(2), blip(3), fighter({ id: "p1/hero", owner: "p1", name: "Xenomorph", space: null })];
  const seatView = (selfMarks?: ViewSecretMark[], playerMarks?: ViewSecretMark[]) =>
    ({
      self: selfMarks ? { marks: selfMarks } : {},
      players: [{ id: "p1", ...(playerMarks ? { marks: playerMarks } : {}) }, { id: "p2" }],
    }) as unknown as Pick<PlayerView, "self" | "players">;
  const badgesOn = (view: Pick<PlayerView, "self" | "players">) =>
    withSecretMarkStatuses(fighters, visibleSecretMarks(view)).map((f) => fighterStatusBadgesFor(f).map((b) => b.label));

  it("an opponent's view (no `marks`) renders no badge at all", () => {
    expect(badgesOn(seatView())).toEqual([[], [], [], []]);
    // and leaves the array itself untouched — every other deck pays nothing
    expect(withSecretMarkStatuses(fighters, visibleSecretMarks(seatView()))).toBe(fighters);
    expect(secretMarkedFighterIds(seatView()).size).toBe(0);
  });

  it("the owner's view badges exactly the hidden bearer", () => {
    const own = [{ name: "MARK", fighter: "p1/sidekick-2", open: false }];
    expect(badgesOn(seatView(own, own))).toEqual([[], ["Marked"], [], []]);
    const [badge] = fighterStatusBadgesFor(withSecretMarkStatuses(fighters, own)[1]);
    expect(badge.title).toMatch(/only you/);
    expect([...secretMarkedFighterIds(seatView(own, own))]).toEqual(["p1/sidekick-2"]);
  });

  it("an open mark (ESCAPE) reaches other seats through players[] and reads as revealed", () => {
    const open = [{ name: "MARK", fighter: "p1/sidekick-3", open: true }];
    expect(badgesOn(seatView(undefined, open))).toEqual([[], [], ["Marked"], []]);
    const [badge] = fighterStatusBadgesFor(withSecretMarkStatuses(fighters, open)[2]);
    expect(badge.title).toMatch(/every seat/);
  });
});

describe("secret mark wording (issue #1468)", () => {
  const blips = [
    fighter({ id: "p1/sidekick-1", owner: "p1", kind: "SIDEKICK" }),
    fighter({ id: "p3/sidekick-1", owner: "p3", kind: "SIDEKICK" }),
  ];
  const titleOn = (i: number, marks: ViewSecretMark[], you: PlayerId) =>
    fighterStatusBadgesFor(withSecretMarkStatuses(blips, marks, you)[i])[0].title;

  it("tooltip depends on whose fighter it is", () => {
    const hidden = (f: string) => [{ name: "MARK", fighter: f, open: false }];
    expect(titleOn(0, hidden("p1/sidekick-1"), "p1")).toMatch(/only you can see which of your fighters/);
    expect(titleOn(1, hidden("p3/sidekick-1"), "p1")).toBe(
      "Marked — your teammate's Marked Blip — only your team can see it"
    );
    expect(titleOn(1, [{ name: "MARK", fighter: "p3/sidekick-1", open: true }], "p1")).toMatch(/every seat/);
  });

  it("maps mark names to labels, falling back to Title Case", () => {
    expect(secretMarkLabel("MARK")).toBe("the Marked Blip");
    expect(secretMarkLabel("SHADOW_TAG")).toBe("Shadow Tag");
    expect(secretMarkPromptDescription("Secretly choose the fighter that bears MARK")).toBe(
      "Secretly choose the fighter that bears the Marked Blip"
    );
    expect(secretMarkPromptDescription("Choose a fighter to take 2 damage")).toBe("Choose a fighter to take 2 damage");
    expect(secretMarkPromptDescription(undefined)).toBeUndefined();
  });

  it("captions the emergence placement only after SECRET_MARK_REVEALED for the prompted player", () => {
    const prompt = { kind: "CHOOSE_SPACE", player: "p1" } as const;
    const revealed = (player: string) =>
      [{ type: "SECRET_MARK_REVEALED", player, name: "MARK", fighter: "p1/sidekick-1" }] as GameEvent[];
    expect(emergenceCaption(prompt, revealed("p1"))).toBe("The Xenomorph emerges — choose its space");
    expect(emergenceCaption(prompt, revealed("p2"))).toBeNull();
    expect(emergenceCaption(prompt, [])).toBeNull();
    expect(emergenceCaption({ kind: "CHOOSE_TARGET", player: "p1" }, revealed("p1"))).toBeNull();
    expect(emergenceCaption(prompt, undefined)).toBeNull();
  });

  // Issue #1492: the live batch (client c8c74fd × engine 0915bf7d, attacker arm, Thorns
  // AFTER kills the Marked Blip). The deck's T-REVEAL runs revealSecretMark → counter
  // gain XENO_REVEALS → place, so the reveal is never the last event before the prompt.
  describe("emergence caption against the live event order (issue #1492)", () => {
    const prompt = { kind: "CHOOSE_SPACE", player: "p2" } as const;
    const reveal: GameEvent = { type: "SECRET_MARK_REVEALED", player: "p2", name: "MARK", fighter: "p2/sidekick-1" };
    const counter: GameEvent = { type: "COUNTER_CHANGED", player: "p2", name: "XENO_REVEALS", value: 1 };
    const resolving = (source: string): GameEvent => ({ type: "EFFECT_RESOLVING", source, window: "AFTER", player: "p1" });
    const opened: GameEvent = { type: "PROMPT_OPENED", player: "p2", kind: "CHOOSE_SPACE", promptId: "p14" };
    const revealBatch: GameEvent[] = [
      { type: "CARD_COMMITTED", player: "p1", card: "malfurion-stormrage/thorns#2" } as GameEvent,
      { type: "COMBAT_RESOLVED", winner: "p1" } as unknown as GameEvent,
      resolving("Thorns"),
      { type: "DAMAGE_APPLIED", fighter: "p2/sidekick-1", amount: 1, source: "EFFECT" },
      { type: "FIGHTER_DEFEATED", fighter: "p2/sidekick-1" },
      resolving("PERFECT ORGANISM"),
      reveal,
      counter,
      opened,
    ];

    it("captions the owner's placement prompt when only bookkeeping follows the reveal", () => {
      expect(emergenceCaption(prompt, revealBatch)).toBe("The Xenomorph emerges — choose its space");
      expect(emergenceCaption(prompt, [reveal, counter, resolving("PERFECT ORGANISM"), opened])).toBe(
        "The Xenomorph emerges — choose its space"
      );
    });

    it("stays null on the other seat's prompt and for a different player's reveal", () => {
      expect(emergenceCaption({ kind: "CHOOSE_SPACE", player: "p1" }, revealBatch)).toBeNull();
    });

    it("does not caption a later placement once the Xenomorph was placed", () => {
      // The follow-up batch after the owner answered p14: PROMPT_RESOLVED, then the
      // hero's FIGHTER_MOVED onto s16 and the attacker swap. Any CHOOSE_SPACE here is
      // some other effect, and so is one in a batch that still carries the reveal.
      const placed: GameEvent[] = [
        { type: "PROMPT_RESOLVED", player: "p2", promptId: "p14", optionId: "s16" },
        resolving("PERFECT ORGANISM"),
        { type: "FIGHTER_MOVED", fighter: "p2/hero", path: ["s16"] },
        { type: "COMBAT_ATTACKER_CHANGED", from: "p2/sidekick-1", to: "p2/hero" },
        { type: "PROMPT_OPENED", player: "p2", kind: "CHOOSE_SPACE", promptId: "p15" },
      ];
      expect(emergenceCaption(prompt, placed)).toBeNull();
      expect(emergenceCaption(prompt, [...revealBatch, ...placed])).toBeNull();
    });

    it("ignores an open pair (ESCAPE / a lone summoned Blip): a face-up assignment is not an emergence", () => {
      const openPair: GameEvent[] = [
        { type: "SECRET_MARK_ASSIGNED", player: "p2", name: "MARK" },
        { type: "SECRET_MARK_REVEALED", player: "p2", name: "MARK", fighter: "p2/sidekick-3" },
        opened,
      ];
      expect(emergenceCaption(prompt, openPair)).toBeNull();
    });
  });
});
