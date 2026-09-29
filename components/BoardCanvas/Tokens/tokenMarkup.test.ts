import { OwnedToken } from "@/components/Positions/position.type";
import { tokenMarkup } from "./tokenMarkup";

const iconSvg = () => `<svg data-icon="1"></svg>`;
const draw = (
  t: Partial<OwnedToken>,
  own = true,
  selected = false,
  brokenImage = false,
) =>
  tokenMarkup({ id: "me#1", x: 0, y: 0, owner: "me", ...t } as OwnedToken, {
    own,
    selected,
    iconSvg,
    brokenImage,
  });

const URL = "https://example.test/piece.png";
/** A two-faced piece: front|back side by side on one 2x1 sheet. */
const PIECE: Partial<OwnedToken> = {
  imageUrl: URL,
  size: 80,
  h: 80,
  sheet: { cols: 2, rows: 1, index: 0 },
};

describe("tokenMarkup — face choice by field presence", () => {
  it("draws a plain image unclipped and unlabelled without the new fields", () => {
    const svg = draw({ imageUrl: URL, size: 72 });
    expect(svg).toContain(`href="${URL}"`);
    expect(svg).toContain("xMidYMid meet");
    expect(svg).not.toContain("clipPath");
    expect(svg).not.toContain('class="label"');
  });

  it("clip: circle clips an image face to a centred circle", () => {
    const svg = draw({ id: "me#r", imageUrl: URL, size: 72, clip: "circle" });
    expect(svg).toContain('<clipPath id="tokclip-mer">');
    expect(svg).toContain('<circle cx="36" cy="36" r="36" />');
    expect(svg).toContain('clip-path="url(#tokclip-mer)"');
    // fills the circle instead of letterboxing a non-square image
    expect(svg).toContain("xMidYMid slice");
  });

  it("clip: circle also rounds a sheet cell", () => {
    const svg = draw({ ...PIECE, clip: "circle" });
    expect(svg).toContain("tokclip-me1");
    expect(svg).toContain('width="160" height="80"');
  });

  it("ignores clip on tokens with no image (discs, icons, cards keep their shape)", () => {
    expect(draw({ clip: "circle" })).not.toContain("tokclip");
    expect(draw({ icon: "GiFireShield", clip: "circle" })).toBe(
      `<svg data-icon="1"></svg>`,
    );
  });

  it("selection ring follows the round clip", () => {
    expect(draw({ imageUrl: URL, clip: "circle" }, true, true)).toContain(
      'r="40" fill="none" stroke="#E7CC98"',
    );
    expect(draw({ imageUrl: URL }, true, true)).toContain('<rect x="-4"');
  });

  it("label hangs a name plate under the token, on any token kind", () => {
    const svg = draw({ imageUrl: URL, size: 72, label: "Frisbee" });
    expect(svg).toContain('<g class="label" transform="translate(36, 84)"');
    expect(svg).toContain(">Frisbee</text>");
    expect(draw({ label: "Trap" })).toContain(">Trap</text>");
  });

  it("escapes and caps a label that arrives from the wire", () => {
    const svg = draw({ label: `<b>${"x".repeat(40)}` });
    expect(svg).toContain("&lt;b&gt;");
    expect(svg).not.toContain("<b>");
    expect(svg).toMatch(/x+…<\/text>/);
    expect(svg.match(/>([^<]*)<\/text>/)?.[1]).toHaveLength(
      "&lt;b&gt;".length + 21, // 3 + 20 x + "…" = 24 chars before escaping
    );
  });

  it("a blank or non-string label draws nothing", () => {
    expect(draw({ label: "   " })).not.toContain('class="label"');
    expect(draw({ label: 42 as unknown as string })).not.toContain(
      'class="label"',
    );
  });

  it("with no image and only new fields, falls back to a plain disc", () => {
    const svg = draw({ clip: "circle", altIndex: 1, flipped: true });
    expect(svg).toContain('<circle cx="50" cy="50" r="48" />');
  });
});

describe("tokenMarkup — second face", () => {
  it("draws the front cell until flipped, then the altIndex cell", () => {
    const front = draw({ ...PIECE, altIndex: 1 });
    const back = draw({ ...PIECE, altIndex: 1, flipped: true });
    expect(front).toContain('x="0" y="0" width="160"');
    expect(back).toContain('x="-80" y="0" width="160"');
  });

  it("flipped does nothing without an altIndex", () => {
    expect(draw({ ...PIECE, flipped: true })).toBe(draw(PIECE));
  });

  it("card-aspect sheet tokens keep the card face renderer", () => {
    const svg = draw({
      imageUrl: URL,
      size: 130,
      h: 182,
      sheet: { cols: 10, rows: 7, index: 3 },
    });
    expect(svg).toContain('viewBox="0 0 63 88"');
    expect(svg).toContain('x="-189"');
  });

  it("flips a card-aspect sheet token through the same renderer", () => {
    const svg = draw({
      imageUrl: URL,
      size: 130,
      h: 182,
      sheet: { cols: 10, rows: 7, index: 3 },
      altIndex: 4,
      flipped: true,
    });
    expect(svg).toContain('x="-252"');
  });
});

describe("tokenMarkup — an image that failed to load (#1029)", () => {
  it("draws a placeholder in the token's box instead of the image", () => {
    const svg = draw({ imageUrl: URL, size: 72, h: 72 }, true, false, true);
    expect(svg).not.toContain("<image");
    expect(svg).toContain('<rect x="1" y="1" width="70" height="70"');
    expect(svg).toContain("Image unavailable");
  });

  it("stays round for a round token, sheet or not", () => {
    const svg = draw({ ...PIECE, clip: "circle" }, true, false, true);
    expect(svg).not.toContain("<image");
    expect(svg).toContain('<circle cx="40" cy="40" r="39"');
  });

  it("keeps the label, counter and selection ring", () => {
    const svg = draw(
      {
        imageUrl: URL,
        label: "Frisbee",
        counter: { value: 3 },
        counterDisplay: 3,
      } as Partial<OwnedToken>,
      true,
      true,
      true,
    );
    expect(svg).toContain('class="label"');
    expect(svg).toContain('class="counter"');
    expect(svg).toContain('stroke-dasharray="7 5"');
  });

  it("leaves cards, icons and discs alone", () => {
    expect(draw({ icon: "GiFireShield" }, true, false, true)).toBe(
      `<svg data-icon="1"></svg>`,
    );
    expect(draw({}, true, false, true)).not.toContain("Image unavailable");
  });
});
