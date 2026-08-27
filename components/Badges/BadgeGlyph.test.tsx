/**
 * Badge art (#577, extended by #717, #721 and #723) — the client's half of the
 * badge contract.
 *
 * What these pin:
 *  - the client has art for EVERY id the accounts API sends, and calls each one
 *    by the API's own name. Both halves cost a player something real when they
 *    slip: an id with no art is dropped outright by the leaderboard and the HUD
 *    shelf (see `isKnownBadge`), and a name only this file believes in is a
 *    badge that is called one thing in the badge case and another in the HUD;
 *  - every id this build claims to know draws its OWN art, at the 14px HUD chip
 *    and the 44px case tile alike (the art is a viewBox, so the two must agree);
 *  - an id it doesn't know still draws — the neutral fallback — but is not
 *    claimed by `isKnownBadge`, which is what keeps an invented id off the HUD;
 *  - the four deck-completion badges are ONE ladder in four metals: identical
 *    silhouette, only `tone` differing. That is the whole design, and it is the
 *    kind of thing a well-meaning edit quietly breaks;
 *  - the four map & matchup badges are the exact opposite, and deliberately so.
 *    They are unrelated achievements, so each gets its own shape and the ladder
 *    trick — one drawing, four colours — is the wrong answer for them.
 *
 * Those last two together are why `silhouetteOf` exists: the case makes two
 * OPPOSING claims about shape-versus-colour, and neither is safe unless the
 * other is pinned beside it.
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";

import {
  BADGE_ART,
  BadgeCluster,
  BadgeGlyph,
  MAX_WORN_BADGES,
  badgeArtBlurb,
  badgeArtName,
  isKnownBadge,
  wornBadgeIds,
} from "./BadgeGlyph";

const DECK_IDS = [
  "deck-bronze",
  "deck-silver",
  "deck-gold",
  "deck-iridescent",
] as const;

/**
 * The accounts API's badge catalog — every id it can send, with the name it
 * sends for it. Captured verbatim from `GET /players?u=` against
 * api.unbrewed.xyz on 2026-08-28, in the API's own catalog order.
 *
 * This is the checked-in copy of somebody else's list, and that is the point
 * (#723): the client cannot discover a new server-side badge at runtime — it
 * would simply drop the id — so the list has to live here, where adding a row
 * fails a test until the art exists. Two ids sat in the API's catalog for four
 * releases with no art and nobody noticed, which is exactly the failure this
 * turns into a red test.
 *
 * Update it whenever the API's catalog changes, and add the art in the same
 * commit.
 */
const API_BADGE_CATALOG: ReadonlyArray<{ id: string; name: string }> = [
  { id: "first-win", name: "First Blood" },
  { id: "regular", name: "Regular" },
  { id: "veteran", name: "Veteran" },
  { id: "streak-5", name: "Hot Streak" },
  { id: "bot-slayer", name: "Bot Slayer" },
  { id: "clutch", name: "On the Brink" },
  { id: "speedrunner", name: "Speedrunner" },
  { id: "people-person", name: "People Person" },
  { id: "specialist", name: "Specialist" },
  { id: "generalist", name: "Generalist" },
  { id: "level-5", name: "Adept" },
  { id: "level-10", name: "Expert" },
  { id: "level-20", name: "Grandmaster" },
  { id: "cartographer", name: "Cartographer" },
  { id: "local-knowledge", name: "Local Knowledge" },
  { id: "rogues-gallery", name: "Rogues' Gallery" },
  { id: "nemesis", name: "Nemesis" },
  { id: "deck-bronze", name: "Burnished" },
  { id: "deck-silver", name: "Sterling" },
  { id: "deck-gold", name: "Gilded" },
  { id: "deck-iridescent", name: "Prismatic" },
];

/**
 * The API's own blurbs, for the badges whose blurb this file mirrors verbatim.
 *
 * Not all twenty-one: the other fifteen are deliberately re-voiced in the third
 * person, because the HUD popover describes the badge on the OTHER seat's plate
 * ("Won their first game", not "Won your first game"). These six read the same
 * either way, so there is no reason for a second wording of them to exist — and
 * the deck four had one, which is half of what #723 was raised for.
 */
const API_BLURBS: Readonly<Record<string, string>> = {
  clutch: "Won a game with a single HP left against a hard or expert bot.",
  speedrunner: "Beat a hard or expert bot in 5 turns or fewer.",
  "deck-bronze": "A whole deck in bronze.",
  "deck-silver": "A whole deck in silver.",
  "deck-gold": "A whole deck in antiqued gold.",
  "deck-iridescent": "A whole deck, every card iridescent.",
};

const MAP_IDS = [
  "cartographer",
  "local-knowledge",
  "rogues-gallery",
  "nemesis",
] as const;

/** The `<svg>` a given id draws, at a given size. */
const drawn = (id: string, size = "2.75rem"): SVGSVGElement => {
  const { container } = render(<BadgeGlyph id={id} size={size} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error(`no svg for ${id}`);
  return svg as SVGSVGElement;
};

/** The medallion fill — `tone`, as it actually reached the DOM. */
const toneOf = (svg: SVGSVGElement): string =>
  svg.querySelector("circle")?.getAttribute("fill") ?? "";

/** Everything inside the medallion, i.e. the glyph plus the shared disc/rim. */
const artOf = (svg: SVGSVGElement): string => svg.innerHTML;

/**
 * The drawing with the badge's own tone factored out — the shape alone.
 *
 * A global replace, not a one-off: a glyph's cut-outs and separating strokes are
 * painted in the tone too, so a partial substitution would leave colour in what
 * is supposed to be a colourless comparison.
 */
const silhouetteOf = (id: string): string =>
  artOf(drawn(id)).split(toneOf(drawn(id))).join("<tone>");

/** Relative luminance, for "darker than" claims about a hex colour. */
const luminance = (hex: string): number => {
  const channel = (from: number) => {
    const c = parseInt(hex.slice(from, from + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

describe("badge art — the set", () => {
  it("draws its own art for every id it knows, at chip size and tile size", () => {
    const ids = Object.keys(BADGE_ART);
    const unknown = artOf(drawn("no-such-badge"));

    const seen = new Map<string, string>();
    for (const id of ids) {
      const art = artOf(drawn(id, "0.875rem"));
      expect(art).not.toEqual(unknown);
      // The art is a viewBox: 14px and 44px must be the same drawing.
      expect(artOf(drawn(id, "2.75rem"))).toEqual(art);
      const clash = [...seen.entries()].find(([, other]) => other === art);
      expect(clash?.[0] ?? null).toBeNull();
      seen.set(id, art);
    }
    expect(seen.size).toBe(ids.length);
  });

  it("gives every badge a name and a blurb for the surfaces with no API row", () => {
    // The HUD reads both off this file — the engine sends it an id and nothing
    // else — so a badge with art but no words is a blank popover, not a build
    // error. Only FALLBACK may be wordless, and the HUD never reaches it.
    for (const [id, art] of Object.entries(BADGE_ART)) {
      expect(art.name).not.toEqual("");
      expect(badgeArtBlurb(id)).not.toEqual("");
    }
  });

  it("draws, but does not claim, an id this build has never heard of", () => {
    expect(isKnownBadge("moon-walker")).toBe(false);
    expect(drawn("moon-walker").querySelector("circle")).toBeInTheDocument();
    expect(badgeArtName("moon-walker")).toBe("Badge");
  });
});

describe("badge art — the API's catalog", () => {
  it("has art for every id the API can send", () => {
    // The check that would have caught `clutch` and `speedrunner` in #577.
    // Listed, not counted: the failure has to name the id, because the fix is
    // to draw that one badge and a number tells you nothing about which.
    const missing = API_BADGE_CATALOG.map(({ id }) => id).filter(
      (id) => !isKnownBadge(id),
    );
    expect(missing).toEqual([]);
  });

  it("calls every badge what the API calls it", () => {
    // Both names reach a player: the badge case renders the API's row, and the
    // leaderboard tooltip and HUD popover render this file's. They cannot be
    // allowed to disagree — which they did, for the four deck badges (#723).
    const expected = API_BADGE_CATALOG.map(({ id, name }) => `${id} → ${name}`);
    const actual = API_BADGE_CATALOG.map(
      ({ id }) => `${id} → ${badgeArtName(id)}`,
    );
    expect(actual).toEqual(expected);
  });

  it("carries the API's own blurb where it mirrors one, byte for byte", () => {
    for (const [id, blurb] of Object.entries(API_BLURBS)) {
      expect(badgeArtBlurb(id)).toBe(blurb);
    }
  });
});

describe("badge art — the two bot feats", () => {
  // #723: both are worn on the live leaderboard's top three, and both rendered
  // as nothing at all on the two surfaces that gate on `isKnownBadge`.
  const BOT_FEAT_IDS = ["clutch", "speedrunner"] as const;

  it("is claimed by the gate the leaderboard row and the HUD shelf use", () => {
    for (const id of BOT_FEAT_IDS) expect(isKnownBadge(id)).toBe(true);
    expect(wornBadgeIds([...BOT_FEAT_IDS])).toEqual([...BOT_FEAT_IDS]);
  });

  it("names On the Brink by its own name, which is not its id", () => {
    // The one badge whose display name and id are different words.
    expect(badgeArtName("clutch")).toBe("On the Brink");
    expect(badgeArtName("speedrunner")).toBe("Speedrunner");
  });

  it("distinguishes by silhouette, not tone — the #721 rule, not the #717 one", () => {
    // Two unrelated feats: neither may be the other in a different colour, and
    // neither may borrow the deck ladder's shared fan.
    expect(new Set(BOT_FEAT_IDS.map(silhouetteOf)).size).toBe(2);
    expect(
      new Set([...BOT_FEAT_IDS, ...DECK_IDS].map(silhouetteOf)).size,
    ).toBe(3);
  });

  it("draws its own art in the shelf, at chip size", () => {
    const { container } = render(<BadgeCluster ids={[...BOT_FEAT_IDS]} />);
    const discs = [...container.querySelectorAll("[data-badge-id]")];
    expect(discs.map((el) => el.getAttribute("data-badge-id"))).toEqual([
      ...BOT_FEAT_IDS,
    ]);

    const unknown = artOf(drawn("no-such-badge"));
    for (const disc of discs) {
      const svg = disc.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe("17px");
      expect(svg?.innerHTML).not.toEqual(unknown);
    }
  });
});

describe("badge art — the deck-completion ladder", () => {
  it("knows all four ids and names each one", () => {
    for (const id of DECK_IDS) {
      expect(isKnownBadge(id)).toBe(true);
      // Only the HUD chip needs this — /account shows the API's own name.
      expect(badgeArtName(id)).not.toBe("Badge");
    }
  });

  it("is one silhouette in four metals — only the tone differs", () => {
    expect(new Set(DECK_IDS.map((id) => toneOf(drawn(id)))).size).toBe(4);
    expect(new Set(DECK_IDS.map(silhouetteOf)).size).toBe(1);
  });

  it("keeps antiqued gold darker than seat gold, as the rim does", () => {
    expect(luminance(toneOf(drawn("deck-gold")))).toBeLessThan(
      luminance("#E0A82E"),
    );
  });

  it("holds still — no animation, no hue cycling", () => {
    for (const id of DECK_IDS) {
      const svg = drawn(id);
      expect(svg.querySelector("animate, animateTransform, set")).toBeNull();
      expect(svg.outerHTML).not.toMatch(/@keyframes|animation|hue-rotate/i);
    }
  });
});

describe("badge art — the map & matchup four", () => {
  it("knows all four ids and names each one", () => {
    for (const id of MAP_IDS) {
      expect(isKnownBadge(id)).toBe(true);
      expect(badgeArtName(id)).not.toBe("Badge");
    }
    expect(MAP_IDS.map(badgeArtName)).toEqual([
      "Cartographer",
      "Local Knowledge",
      "Rogues' Gallery",
      "Nemesis",
    ]);
  });

  it("distinguishes by silhouette, not by tone — the ladder's rule inverted", () => {
    // Four unrelated achievements: no two may be the same drawing in a different
    // colour, and none may borrow the ladder's fanned stack either. Four shapes
    // of their own, plus the one the four deck rungs share, is five in all.
    expect(new Set(MAP_IDS.map(silhouetteOf)).size).toBe(4);
    expect(new Set([...MAP_IDS, ...DECK_IDS].map(silhouetteOf)).size).toBe(5);
  });

  it("shares a medallion fill with nothing else in the case", () => {
    // Not a rule the four impose on the rest — it is how the WHOLE case works,
    // and worth pinning here because these four are the ones that arrived after
    // the palette had run to fifteen and the free room was getting thin.
    const tones = Object.values(BADGE_ART).map((art) => art.tone);
    expect(new Set(tones).size).toBe(tones.length);
  });

  it("holds still — no animation, no hue cycling", () => {
    for (const id of MAP_IDS) {
      const svg = drawn(id);
      expect(svg.querySelector("animate, animateTransform, set")).toBeNull();
      expect(svg.outerHTML).not.toMatch(/@keyframes|animation|hue-rotate/i);
    }
  });

  it("draws in the HUD shelf, three across at chip size", () => {
    // The shelf (#718) is where these are smallest and most crowded: three 17px
    // discs at a 32% overlap. Each one still has to arrive as ITS OWN art.
    const ids = MAP_IDS.slice(0, MAX_WORN_BADGES);
    const { container } = render(<BadgeCluster ids={ids} />);
    const discs = [...container.querySelectorAll("[data-badge-id]")];
    expect(discs.map((el) => el.getAttribute("data-badge-id"))).toEqual([...ids]);

    const unknown = artOf(drawn("no-such-badge"));
    for (const disc of discs) {
      const svg = disc.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe("17px");
      expect(svg?.innerHTML).not.toEqual(unknown);
    }
  });
});
