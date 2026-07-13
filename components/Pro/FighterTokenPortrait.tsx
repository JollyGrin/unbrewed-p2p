/**
 * Circular fighter portrait — the board token's art-clip + initials fallback
 * (issue #247) lifted into a standalone piece so the hero-preview modal (#260)
 * seats the SAME circular portrait next to a hero/sidekick name that the live
 * board draws on its token. Decks with painted `tokenImageUrl` show the art
 * clipped to the circle; converted/community decks with none fall back to the
 * board's exact initials, so BOTH read as intentional — never a broken image
 * or an empty circle.
 *
 * The board's own token (ProBoard.fighterToken) stays bespoke — it layers HP /
 * number / reach badges OUTSIDE the clip and rides framer-motion move tweens —
 * so this mirrors its art+fallback treatment rather than trying to be the same
 * element. `tokenInitials` IS shared (imported by ProBoard) so the two can
 * never drift on how a name reduces to letters.
 */
import { Box, Text } from "@chakra-ui/react";

/**
 * Board-token initials: strip a leading "the ", take up to 3 letters, and floor
 * to a single letter (or "?") so every fighter gets a legible glyph. Shared with
 * ProBoard so the modal portrait and the board token read identically.
 */
export const tokenInitials = (name: string) => {
  const stripped = name.replace(/^the\b\s*/i, "").trim();
  const base = stripped || name.trim();
  const initials = base.slice(0, 3).toUpperCase();
  return initials && initials !== "THE" ? initials : base.slice(0, 1).toUpperCase() || "?";
};

export interface FighterTokenPortraitProps {
  name: string;
  /** deck `tokenImageUrl` (already resolved from the snapshot); null → initials */
  artUrl?: string | null;
  /** any CSS length — drives diameter and the initials font size */
  size?: string;
}

/**
 * A framed circular portrait with a tasteful pick-up-the-card hover: a slight
 * scale + tilt and a diagonal shimmer sweep (foil catch-the-light), both clipped
 * to the circle. CSS-only (Chakra `_hover` + `sx` keyframe-free sweep) to match
 * the codebase's hover idiom (see ProHand's lift, ProBoard's token).
 */
export const FighterTokenPortrait = ({
  name,
  artUrl,
  size = "5rem",
}: FighterTokenPortraitProps) => (
  <Box
    position="relative"
    flexShrink={0}
    w={size}
    h={size}
    borderRadius="50%"
    overflow="hidden"
    display="flex"
    alignItems="center"
    justifyContent="center"
    // A soft vignette seats the portrait into the modal's dark-purple field so a
    // no-art circle still reads as a designed frame, not a flat disc (Part 3).
    bg="radial-gradient(circle at 50% 30%, #3d2249 0%, var(--chakra-colors-brand-surfaceDim) 80%)"
    border="2px solid"
    borderColor="brand.accent"
    boxShadow="0 0 0 1px rgba(224,168,46,0.28), 0 6px 16px rgba(0,0,0,0.55), inset 0 0 20px rgba(0,0,0,0.5)"
    transition="transform 0.25s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.25s ease"
    _hover={{
      transform: "scale(1.07) rotate(-2deg)",
      boxShadow:
        "0 0 0 1px rgba(224,168,46,0.55), 0 10px 24px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.35)",
    }}
    sx={{
      // Diagonal shimmer band wipes across on hover — the portrait "catches the
      // light" like a foil card. overflow:hidden above clips it to the circle.
      "&::after": {
        content: '""',
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.38) 48%, transparent 64%)",
        transform: "translateX(-130%)",
        transition: "transform 0.6s ease",
        pointerEvents: "none",
        zIndex: 2,
      },
      "&:hover::after": { transform: "translateX(130%)" },
    }}
  >
    {artUrl ? (
      <>
        <Box
          as="img"
          src={artUrl}
          alt=""
          draggable={false}
          position="absolute"
          // Overscan the art past the mask on EVERY edge (~3px) before any
          // framing zoom. The `scale(1.2)` below is anchored center-top, so it
          // overscans the bottom and sides but pins the art's TOP edge exactly on
          // the circle's border-radius/overflow:hidden seam — at some DPRs a
          // sub-pixel hairline of the field/gold rim then peeks through at the
          // top (issue #279; #272 fixed the bottom, #273 added the zoom, neither
          // covered the top). Growing the base box outward gives the pinned top
          // its own bleed so the art fully covers the circle at every edge.
          top="-3px"
          left="-3px"
          w="calc(100% + 6px)"
          h="calc(100% + 6px)"
          // `cover` only zooms to the container's aspect ratio; a token asset with
          // its own baked-in padding/margin around the character still reads as
          // inset inside the circle. An extra scale zooms into the art itself so
          // the character fills the frame edge-to-edge (issue #270). Anchored at
          // center-top to match objectPosition and the board token, and kept
          // inside the circle's overflow:hidden so nothing spills the gold rim.
          sx={{
            objectFit: "cover",
            objectPosition: "center top",
            transform: "scale(1.2)",
            transformOrigin: "center top",
          }}
        />
        {/* Soft edge scrim keeps the gold rim reading over any portrait. */}
        <Box
          position="absolute"
          inset={0}
          bg="radial-gradient(circle at 50% 40%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0.42) 100%)"
        />
      </>
    ) : (
      <Text
        fontFamily="BebasNeueRegular"
        fontSize={`calc(${size} * 0.36)`}
        letterSpacing="0.02em"
        color="brand.parchment"
        lineHeight={1}
        zIndex={1}
      >
        {tokenInitials(name)}
      </Text>
    )}
  </Box>
);
