import {
  DEFAULT_RIM,
  HERO_MEDALLION_SIZE,
  MAX_SIDEKICK_MEDALLIONS,
  SIDEKICK_MEDALLION_SIZE,
  fighterInitials,
  fighterTokens,
  heroToken,
  heroTokenSources,
} from "./heroToken";

const IMG = "https://cdn.example/hero.webp";
const fighter = (over = {}) => ({ name: "Alice", tokenImageUrl: IMG, ...over });

describe("heroTokenSources", () => {
  it("is empty without an image (button hidden)", () => {
    expect(heroTokenSources(undefined)).toEqual([]);
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: undefined }) })).toEqual([]);
  });

  it.each([
    "https://cdn.example/a.webp",
    "/evergreen-decks/art/appa/token-appa.webp",
    "  /evergreen-decks/a.webp  ",
  ])("accepts %j and keeps it as the deck has it", (url) => {
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: url }) })).toEqual([
      { kind: "hero", name: "Alice", imageUrl: url.trim() },
    ]);
  });

  it.each([
    "http://x/a.png",
    "data:image/png;base64,AAAA",
    "//evil.example/a.png",
    "/\\evil.example/a.png",
    "javascript:alert(1)",
    "evergreen-decks/a.webp",
    "   ",
    "",
  ])("refuses %j", (url) => {
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: url }) })).toEqual([]);
  });

  it("offers the hero", () => {
    expect(heroTokenSources({ hero: fighter() })).toEqual([
      { kind: "hero", name: "Alice", imageUrl: IMG },
    ]);
  });

  it("offers an enabled sidekick with its own image only", () => {
    const sidekick = { name: "Momo", hp: 5, quantity: 1, tokenImageUrl: "https://cdn.example/momo.webp" };
    expect(heroTokenSources({ hero: fighter(), sidekick }).map((s) => s.kind)).toEqual(["hero", "sidekick"]);
    expect(heroTokenSources({ hero: fighter(), sidekick: { ...sidekick, tokenImageUrl: undefined } })).toHaveLength(1);
    expect(heroTokenSources({ hero: fighter(), sidekick: { name: "Sidekick", quantity: 0, tokenImageUrl: IMG } })).toHaveLength(1);
  });
});

describe("heroToken", () => {
  it("is a round labelled image token carrying imageUrl", () => {
    expect(heroToken({ kind: "hero", name: "Alice", imageUrl: IMG })).toEqual({
      imageUrl: IMG,
      clip: "circle",
      label: "Alice",
      size: 72,
      h: 72,
    });
  });
});

describe("fighterInitials", () => {
  it.each([
    ["Appa", "A"],
    ["Darth Vader", "DV"],
    ["The Piper of the Underroads", "PU"],
    ["B1 Battle Droid", "BB"],
    ["  gingerbread man  ", "GM"],
    ["R2-D2", "R"],
    ["The", "T"],
    ["«Élodie» de Montfort", "ÉM"],
    ["", ""],
    [undefined, ""],
  ])("%j → %j", (name, initials) => {
    expect(fighterInitials(name)).toBe(initials);
  });
});

describe("fighterTokens", () => {
  const appearance = { borderColour: "#5fb94e", highlightColour: "#583300" };
  const hero = { name: "Appa", hp: 14, tokenImageUrl: IMG };
  const momo = { name: "Momo", hp: 6, quantity: 1, tokenImageUrl: "/art/momo.webp" };

  it("is empty without a hero", () => {
    expect(fighterTokens(undefined)).toEqual([]);
    expect(fighterTokens({})).toEqual([]);
  });

  it("gives the hero a rimmed portrait linked to hero health", () => {
    expect(fighterTokens({ hero, appearance })).toEqual([
      {
        imageUrl: IMG,
        clip: "circle",
        label: "Appa",
        rim: "#5fb94e",
        initials: "A",
        size: HERO_MEDALLION_SIZE,
        h: HERO_MEDALLION_SIZE,
        counter: { link: "hero" },
      },
    ]);
  });

  it("adds a lone sidekick, smaller, linked to sidekick health", () => {
    const [, sidekick, ...rest] = fighterTokens({ hero, sidekick: momo, appearance });
    expect(rest).toEqual([]);
    expect(sidekick).toEqual({
      imageUrl: "/art/momo.webp",
      clip: "circle",
      label: "Momo",
      rim: "#5fb94e",
      initials: "M",
      size: SIDEKICK_MEDALLION_SIZE,
      h: SIDEKICK_MEDALLION_SIZE,
      counter: { link: "sidekick" },
    });
  });

  it("a lone sidekick without printed health still carries its heart, like the HUD", () => {
    const [, sidekick] = fighterTokens({ hero, sidekick: { ...momo, hp: null } });
    expect(sidekick.counter).toEqual({ link: "sidekick" });
  });

  it("several one-hit sidekicks: one piece each, no name, no counter", () => {
    const tokens = fighterTokens({
      hero,
      sidekick: { name: "B1 Battle Droid", hp: 1, quantity: 3, tokenImageUrl: IMG },
    });
    expect(tokens).toHaveLength(4);
    for (const droid of tokens.slice(1)) {
      expect(droid.label).toBeUndefined();
      expect(droid.counter).toBeUndefined();
      expect(droid.initials).toBe("BB");
      expect(droid.imageUrl).toBe(IMG);
    }
  });

  it("several tougher sidekicks each get their own detached health", () => {
    const tokens = fighterTokens({ hero, sidekick: { name: "Larry", hp: 3, quantity: 4 } });
    expect(tokens.slice(1).map((t) => t.counter)).toEqual(
      Array(4).fill({ value: 3, min: 0 }),
    );
  });

  it("several sidekicks with no printed health (Stormtroopers) get none", () => {
    const tokens = fighterTokens({ hero, sidekick: { name: "Stormtroopers", hp: null, quantity: 3 } });
    expect(tokens.slice(1).every((t) => !t.counter)).toBe(true);
  });

  it.each([
    { name: "Sidekick", hp: null, quantity: 0 },
    { name: "", hp: null, quantity: 0 },
    { name: "Robin", hp: null, quantity: 0 },
    null,
  ])("no sidekick piece for %j (the HUD shows no sidekick row either)", (sidekick) => {
    expect(fighterTokens({ hero, sidekick })).toHaveLength(1);
  });

  it("caps a huge sidekick count", () => {
    const tokens = fighterTokens({ hero, sidekick: { name: "Rats", hp: 1, quantity: 40 } });
    expect(tokens).toHaveLength(1 + MAX_SIDEKICK_MEDALLIONS);
  });

  it("no art: no imageUrl or clip, just the rim and initials (most community decks)", () => {
    const [vader, trooper] = fighterTokens({
      hero: { name: "DARTH VADER", hp: 18 },
      sidekick: { name: "STORMTROOPERS", hp: null, quantity: 3 },
      appearance: { borderColour: "#ff0000" },
    });
    expect(vader).toEqual({
      label: "DARTH VADER",
      rim: "#ff0000",
      initials: "DV",
      size: HERO_MEDALLION_SIZE,
      h: HERO_MEDALLION_SIZE,
      counter: { link: "hero" },
    });
    expect(trooper).toEqual({
      rim: "#ff0000",
      initials: "S",
      size: SIDEKICK_MEDALLION_SIZE,
      h: SIDEKICK_MEDALLION_SIZE,
    });
  });

  it("refuses unusable art the same way the library button does", () => {
    const [token] = fighterTokens({ hero: { ...hero, tokenImageUrl: "http://x/a.png" } });
    expect(token.imageUrl).toBeUndefined();
    expect(token.clip).toBeUndefined();
  });

  it.each([
    [{ borderColour: "", highlightColour: "#146312" }, "#146312"],
    [{ borderColour: "not-a-colour" }, DEFAULT_RIM],
    [undefined, DEFAULT_RIM],
  ])("rim from %j is %j", (colours, rim) => {
    expect(fighterTokens({ hero, appearance: colours })[0].rim).toBe(rim);
  });

  it("a nameless sidekick (Clone Troopers) still gets pieces", () => {
    const tokens = fighterTokens({ hero, sidekick: { name: "", hp: null, quantity: 6 } });
    expect(tokens).toHaveLength(7);
    expect(tokens[1].initials).toBe("");
  });
});
