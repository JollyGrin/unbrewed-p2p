/**
 * Badge art (issue #577) — every badge glyph in the app, in one file.
 *
 * The catalog itself lives in the accounts API: it sends ids, names, blurbs and
 * unlock hints, and the engine passes a chosen id between seats without ever
 * interpreting it. So this file is the CLIENT's half of the contract and nothing
 * more — a map from id to a picture. Adding a badge server-side needs no deploy
 * here (it renders with the fallback glyph), and adding art here needs no deploy
 * there. That is the whole reason the id is opaque on the wire.
 *
 * v1 is inline SVG rather than hosted images, per the design draft: these are UI
 * chrome, not card art, so they cost no request, tint with the surface they sit
 * on, and stay crisp from the 14px HUD chip to the 44px badge case tile.
 *
 * Every glyph is drawn inside one shared medallion — same disc, same rim, same
 * 24×24 frame — so fifteen badges read as one set at a glance and only the colour
 * and silhouette have to do the distinguishing work.
 */
import { Box } from "@chakra-ui/react";

interface BadgeArt {
  /** Display name. Used only where the API's own name isn't to hand — i.e. the
   *  HUD chip, which learns an id from the engine and nothing else. */
  name: string;
  /**
   * One line saying what the badge IS. Same reason as `name` (issue #718): the
   * engine sends the opponent's badge ids and nothing else, so the HUD has no
   * API catalog row to read a blurb off. Third person, because half the badges
   * this file describes belong to the player on the other side of the board.
   */
  blurb: string;
  /** Medallion fill. */
  tone: string;
  /**
   * Built on render, never at module scope. The render-fuzz harness puts React
   * in scope as a global AFTER its imports evaluate (scripts/renderFuzz/
   * mountProGame.tsx), so a registry of eagerly-constructed elements would
   * throw on import in the one tool that mounts the whole HUD.
   */
  glyph: () => React.ReactNode;
}

const LIGHT = "#F7F0E3";

/** Five dots on a ring — one per hero, for Generalist. */
const RING_DOTS: ReadonlyArray<readonly [number, number]> = [
  [12, 7.4],
  [16.38, 10.58],
  [14.7, 15.72],
  [9.3, 15.72],
  [7.62, 10.58],
];

/**
 * The four deck-completion badges (#717) — a whole deck taken to one rim tier.
 *
 * These are ONE ladder in four metals: every other badge in the case tells
 * itself apart by silhouette, and these deliberately don't. All four draw the
 * same fanned stack of cards and change only `tone`, because what the player
 * earned is the METAL — bronze, silver, antiqued gold, iridescent — and art
 * that also changed shape per tier would read as four unrelated badges instead
 * of four rungs. (The stack is the case's first card motif, which is what makes
 * these four say "deck" at 14px without a word of text.)
 *
 * The tones echo `COSMETIC_RIM_PAINTS` (lib/pro/cosmetics) without importing
 * it. A rim is a ten-stop conic sweep and a medallion is one flat fill plus a
 * light glyph, so what has to carry across surfaces is the colour FAMILY, not
 * the gradient — each tone here is a mid-stop lifted out of its own paint.
 * Antiqued gold stays darker and browner than seat gold `#E0A82E`, for exactly
 * the reason it does on the rim: it is the tier above silver, not a highlight.
 * No hue cycling and no animation — a badge is chrome, and the iridescent rung
 * earns its place by being the one cool tone in the ladder.
 */
const DECK_FAN_CARD = {
  x: -3.1,
  y: -4.2,
  width: 6.2,
  height: 8.4,
  rx: 1.2,
} as const;

/**
 * Three cards, each stepped down-right of the last and tilted a little further,
 * so the stack fans instead of stacking flat.
 *
 * The two behind are outlines and the one in front is solid: three light-on-
 * light cards separated only by a hairline merge into one blob at the 14px HUD
 * chip, and an outline lets the medallion's own colour do the separating. That
 * is also why every line here is either LIGHT or `tone` — the fan introduces no
 * colour the badge doesn't already have.
 */
const deckFan = (tone: string) => (
  <g strokeWidth={1} strokeLinejoin="round">
    <g fill={tone} stroke={LIGHT}>
      <rect {...DECK_FAN_CARD} transform="translate(9.7 10.4) rotate(-13)" />
      <rect {...DECK_FAN_CARD} transform="translate(12 11.9)" />
    </g>
    <rect
      {...DECK_FAN_CARD}
      fill={LIGHT}
      stroke={tone}
      transform="translate(14.3 13.4) rotate(13)"
    />
  </g>
);

/** One rung of the ladder: same art, one metal. */
const deckBadge = (name: string, tone: string): BadgeArt => ({
  name,
  tone,
  glyph: () => deckFan(tone),
});

export const BADGE_ART: Record<string, BadgeArt> = {
  // Won your first game — a single drop.
  "first-win": {
    name: "First Blood",
    blurb: "Won their first game",
    tone: "#A83A3A",
    glyph: () => (
      <path
        d="M12 6.2C14.9 9.4 16.2 11.2 16.2 13.1a4.2 4.2 0 0 1-8.4 0C7.8 11.2 9.1 9.4 12 6.2Z"
        fill={LIGHT}
      />
    ),
  },
  // 25 games — a five-bar tally.
  regular: {
    name: "Regular",
    blurb: "Played 25 games",
    tone: "#9C6B34",
    glyph: () => (
      <g fill={LIGHT}>
        <rect x={7.9} y={8.2} width={1.1} height={7.6} rx={0.5} />
        <rect x={10.1} y={8.2} width={1.1} height={7.6} rx={0.5} />
        <rect x={12.3} y={8.2} width={1.1} height={7.6} rx={0.5} />
        <rect x={14.5} y={8.2} width={1.1} height={7.6} rx={0.5} />
        <path
          d="M7.1 15.9 16.4 8.1"
          stroke={LIGHT}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </g>
    ),
  },
  // 100 games — service chevrons.
  veteran: {
    name: "Veteran",
    blurb: "Played 100 games",
    tone: "#4F6F82",
    glyph: () => (
      <g
        fill="none"
        stroke={LIGHT}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7.8 10.4 12 7l4.2 3.4" />
        <path d="M7.8 13.2 12 9.8l4.2 3.4" />
        <path d="M7.8 16 12 12.6l4.2 3.4" />
      </g>
    ),
  },
  // Five wins in a row — a flame.
  "streak-5": {
    name: "Hot Streak",
    blurb: "Won five games in a row",
    tone: "#C9622A",
    glyph: () => (
      <path
        d="M12 5.5c1.6 2.7 4.4 4.1 4.4 7.3a4.4 4.4 0 0 1-8.8 0c0-1.6.8-2.6 1.7-3.4 0 1.4.7 2.1 1.5 2.2-.4-2.2.1-4.3 1.2-6.1Z"
        fill={LIGHT}
      />
    ),
  },
  // Beat the expert bot — a struck robot head.
  "bot-slayer": {
    name: "Bot Slayer",
    blurb: "Beat the expert bot",
    tone: "#2E7D7D",
    glyph: () => (
      <g fill={LIGHT}>
        <circle cx={12} cy={6.2} r={0.9} />
        <path d="M12 6.8v2.1" stroke={LIGHT} strokeWidth={1.1} strokeLinecap="round" />
        <rect x={7.4} y={9.2} width={9.2} height={7.2} rx={2} />
        <circle cx={10} cy={12.6} r={1.1} fill="#2E7D7D" />
        <circle cx={14} cy={12.6} r={1.1} fill="#2E7D7D" />
        <path
          d="M7.2 16.8 16.8 7.6"
          stroke={LIGHT}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </g>
    ),
  },
  // Ten games against humans — two figures.
  "people-person": {
    name: "People Person",
    blurb: "Played ten games against other people",
    tone: "#B4527A",
    glyph: () => (
      <g fill={LIGHT}>
        <circle cx={9} cy={10.6} r={1.6} />
        <path d="M6.2 16.6a2.8 2.8 0 0 1 5.6 0Z" />
        <circle cx={15} cy={10.6} r={1.6} />
        <path d="M12.2 16.6a2.8 2.8 0 0 1 5.6 0Z" />
      </g>
    ),
  },
  // Ten wins with one hero — a bullseye.
  specialist: {
    name: "Specialist",
    blurb: "Won ten games with one hero",
    tone: "#5B4B9E",
    glyph: () => (
      <g fill="none" stroke={LIGHT} strokeWidth={1.4}>
        <circle cx={12} cy={12} r={5.6} />
        <circle cx={12} cy={12} r={2.9} />
        <circle cx={12} cy={12} r={0.6} fill={LIGHT} stroke="none" strokeWidth={0} />
      </g>
    ),
  },
  // Wins with five heroes — five marks in a ring.
  generalist: {
    name: "Generalist",
    blurb: "Won with five different heroes",
    tone: "#3F8F5B",
    glyph: () => (
      <g>
        {RING_DOTS.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.5} fill={LIGHT} />
        ))}
      </g>
    ),
  },
  // Level 5 — a star.
  "level-5": {
    name: "Adept",
    blurb: "Reached level 5",
    tone: "#7C8794",
    glyph: () => (
      <path
        d="M12 6 13.53 9.9 17.71 10.15 14.47 12.8 15.53 16.85 12 14.6 8.47 16.85 9.53 12.8 6.29 10.15 10.47 9.9Z"
        fill={LIGHT}
      />
    ),
  },
  // Level 10 — a star in a wreath.
  "level-10": {
    name: "Expert",
    blurb: "Reached level 10",
    tone: "#BE9333",
    glyph: () => (
      <g>
        <path
          d="M12 7.8 13.06 10.54 15.99 10.7 13.71 12.56 14.47 15.4 12 13.8 9.53 15.4 10.29 12.56 8.01 10.7 10.94 10.54Z"
          fill={LIGHT}
        />
        <g fill="none" stroke={LIGHT} strokeWidth={1.3} strokeLinecap="round">
          <path d="M6.6 8.6A7 7 0 0 0 6.6 15.4" />
          <path d="M17.4 8.6a7 7 0 0 1 0 6.8" />
        </g>
      </g>
    ),
  },
  // Level 20 — a crown.
  "level-20": {
    name: "Grandmaster",
    blurb: "Reached level 20",
    tone: "#7E4FB8",
    glyph: () => (
      <g fill={LIGHT}>
        <path d="M6.6 15.4 5.8 8.3 9.3 11.1 12 6.6 14.7 11.1 18.2 8.3 17.4 15.4Z" />
        <rect x={6.6} y={16.2} width={10.8} height={1.6} rx={0.6} />
      </g>
    ),
  },
  // Whole deck at bronze rims.
  "deck-bronze": deckBadge("Bronze Deck", "#8A5127"),
  // ...at silver.
  "deck-silver": deckBadge("Silver Deck", "#7D858F"),
  // ...at antiqued gold: darker and browner than seat gold, as on the rim.
  "deck-gold": deckBadge("Gold Deck", "#6D5C22"),
  // ...and the top rung, iridescent — one flat cool tone standing in for a
  // paint that is nine pastels on a sweep.
  "deck-iridescent": deckBadge("Iridescent Deck", "#6A73C6"),
};

/**
 * The neutral glyph for an id this build has never heard of.
 *
 * Forward compatibility, and the reason it can be neutral rather than absent:
 * on `/account` the API supplies the badge's real name and blurb, so a plain
 * medallion beside them is a badge the player can read and wear, not a mystery.
 * (The HUD makes the opposite call — see `isKnownBadge`.)
 */
const FALLBACK: BadgeArt = {
  name: "Badge",
  // Never reached by the HUD popover — unknown ids are dropped before it, by
  // `wornBadgeIds` — so this exists only to keep the shape total.
  blurb: "",
  tone: "#6B5E72",
  glyph: () => <path d="M12 6.6 14.1 12 12 17.4 9.9 12Z" fill={LIGHT} />,
};

/**
 * Whether this build has art for `id`.
 *
 * The HUD needs this because its ids come from the OTHER seat, unverified, over
 * a protocol that deliberately never validates them: rendering a fallback chip
 * would let any client put a shape on your screen just by inventing a string.
 * An unknown id therefore renders nothing there — the forward-compat cost is one
 * missing chip until the client catches up.
 */
export const isKnownBadge = (id: string | null | undefined): boolean =>
  !!id && id in BADGE_ART;

/** The badge's name as THIS build knows it — for surfaces with no API row to hand. */
export const badgeArtName = (id: string): string =>
  BADGE_ART[id]?.name ?? FALLBACK.name;

/** The badge's one-line blurb as THIS build knows it. Same "no API row" case. */
export const badgeArtBlurb = (id: string): string =>
  BADGE_ART[id]?.blurb ?? FALLBACK.blurb;

/**
 * How many badges a player may wear at once (issue #718).
 *
 * Enforced in three places on purpose — here, in the accounts API's write, and
 * in the engine's sanitizer — because the id array reaches a HUD from the OTHER
 * client, and neither of the two hops in between is a trust boundary.
 */
export const MAX_WORN_BADGES = 3;

/**
 * The ids a shelf will actually draw, from whatever the wire carried.
 *
 * SLICE FIRST, then drop the unknowns. The cap is on what a seat may CLAIM — a
 * hand-rolled client sending thirty ids gets three discs, not thirty — and the
 * art check is a separate rule about what we are willing to draw. Filtering
 * first would let a claim of thirty ids still fill the shelf by burying the
 * unknown ones, which is exactly the shape the cap exists to refuse.
 *
 * `legacy` is the pre-#718 singular field, still populated by the engine for a
 * release; it is read only when the array is absent or empty, so a newer server
 * always wins.
 */
export const wornBadgeIds = (
  badges: readonly string[] | null | undefined,
  legacy?: string | null,
): string[] => {
  const claimed = badges?.length ? badges : legacy ? [legacy] : [];
  return claimed.slice(0, MAX_WORN_BADGES).filter(isKnownBadge);
};

/**
 * One badge medallion.
 *
 * `muted` is the locked treatment: a filter rather than a second set of grey
 * art, so every badge — including one this build has no art for — greys out the
 * same way and no glyph can be forgotten.
 */
export const BadgeGlyph = ({
  id,
  size = "2.75rem",
  muted = false,
  rim = false,
  title,
}: {
  id: string;
  /** Any CSS length. The art is a viewBox, so it stays crisp at any of them. */
  size?: string;
  muted?: boolean;
  /**
   * Draw the separator ring (issue #718). Only wanted where medallions OVERLAP:
   * without it two adjacent discs of similar tone mush into one shape. A badge
   * sitting on its own doesn't need separating from anything.
   */
  rim?: boolean;
  /** Native tooltip. Omit where a visible label already says the same thing. */
  title?: string;
}) => {
  const art = BADGE_ART[id] ?? FALLBACK;
  return (
    <Box
      as="span"
      data-testid="badge-glyph"
      data-badge-id={id}
      display="inline-flex"
      flexShrink={0}
      lineHeight={0}
      filter={muted ? "grayscale(1)" : undefined}
      opacity={muted ? 0.45 : 1}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-hidden={title ? undefined : true}
        aria-label={title}
        focusable="false"
      >
        {title ? <title>{title}</title> : null}
        <circle cx={12} cy={12} r={11.4} fill={art.tone} />
        <circle
          cx={12}
          cy={12}
          r={9.4}
          fill="none"
          stroke="rgba(255, 255, 255, 0.35)"
          strokeWidth={0.9}
        />
        {art.glyph()}
        {/* Drawn LAST so it rides over the glyph as well as the disc — it is a
            separator, not part of the art. */}
        {rim ? (
          <circle
            cx={12}
            cy={12}
            r={11}
            fill="none"
            stroke="#2B1730"
            strokeWidth={1.5}
          />
        ) : null}
      </svg>
    </Box>
  );
};

/**
 * The worn-badge shelf (issue #718) — up to three medallions as one overlapping
 * cluster, leftmost in front.
 *
 * The three numbers are settled on the design canvas and are not worth
 * re-deriving here: 17px discs, 32% overlap, rim on. Below ~15% overlap the
 * discs stop reading as a set and start reading as three separate chips; the
 * rim is what keeps them from mushing together at 32%.
 *
 * Z-INDEX DESCENDS from the left, so slot 1 — the badge the player put first —
 * is the one never occluded. That is the whole reason the picker is ordered.
 *
 * Renders nothing at all for an empty list: the row is absent, not empty. Empty
 * slots are picker chrome; a plate with no badges must be exactly as tall as it
 * is today.
 */
export const BadgeCluster = ({
  ids,
  size = 17,
  title = true,
}: {
  /** Already filtered and capped — see `wornBadgeIds`. */
  ids: readonly string[];
  /** Disc diameter in px. The overlap scales with it. */
  size?: number;
  /** Native tooltips per disc. Off where a visible list already names them. */
  title?: boolean;
}) => {
  if (ids.length === 0) return null;
  const overlap = size * 0.32;
  return (
    <Box
      as="span"
      data-testid="badge-cluster"
      display="inline-flex"
      alignItems="center"
      flexShrink={0}
    >
      {ids.map((id, i) => (
        <Box
          as="span"
          key={id}
          position="relative"
          display="block"
          zIndex={ids.length - i}
          ml={i === 0 ? undefined : `-${overlap}px`}
        >
          <BadgeGlyph
            id={id}
            size={`${size}px`}
            rim
            title={title ? badgeArtName(id) : undefined}
          />
        </Box>
      ))}
    </Box>
  );
};
