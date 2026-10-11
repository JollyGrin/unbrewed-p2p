import { useEffect, useState } from "react";
import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import Link from "next/link";

/**
 * The shiny PRO promo button for the front-page nav (issue #358). Introduces
 * players to the rules-enforced mode at `/pro`. A slow diagonal shimmer sweep
 * catches the eye (same foil idiom as FighterTokenPortrait), a superscript NEW
 * badge flags it as fresh, and the gold-on-parchment palette keeps it at home
 * next to the plain icon links.
 */

/** localStorage flag: the NEW badge is dismissed once the user reaches Pro. */
const PRO_NEW_SEEN_KEY = "unbrewed:pro-new-badge-seen";

/**
 * Dismiss the NEW badge for good. Called when the user clicks the PRO button
 * and (for direct-URL visitors) on the `/pro` page itself. Guarded because
 * localStorage throws in private-mode / SSR contexts.
 */
export const markProNewSeen = () => {
  try {
    localStorage.setItem(PRO_NEW_SEEN_KEY, "1");
  } catch {
    /* private mode / storage disabled — badge simply keeps showing */
  }
};

// Slow diagonal light streak that wipes across the word and then rests off to
// the side for the bulk of the cycle — one gentle catch every ~5s, not a strobe.
const shimmerSweep = keyframes`
  0%   { transform: translateX(-180%) skewX(-20deg); }
  18%  { transform: translateX(220%) skewX(-20deg); }
  100% { transform: translateX(220%) skewX(-20deg); }
`;

/** Honor prefers-reduced-motion: freeze the sweep as a static parked shine. */
const NO_MOTION = {
  "@media (prefers-reduced-motion: reduce)": {
    "&::after": {
      animation: "none !important",
      transform: "translateX(55%) skewX(-20deg)",
      opacity: 0.3,
    },
  },
} as const;

export const ProNavButton = () => {
  // Start hidden so SSR and the first client paint agree (no hydration flash);
  // the effect reveals it only for users who haven't reached Pro yet.
  const [showBadge, setShowBadge] = useState(false);

  useEffect(() => {
    try {
      setShowBadge(localStorage.getItem(PRO_NEW_SEEN_KEY) !== "1");
    } catch {
      setShowBadge(true);
    }
  }, []);

  const dismissBadge = () => {
    markProNewSeen();
    setShowBadge(false);
  };

  return (
    <Link href="/pro" onClick={dismissBadge} aria-label="Unbrewed Pro — new">
      {/* Outer wrapper carries the badge; it must NOT clip so the badge can sit
          proud of the top-right corner. The inner box does the clipping. */}
      <Box position="relative" display="inline-flex" flexShrink={0}>
        <Box
          position="relative"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          h="1.9rem"
          px="0.65rem"
          borderRadius="0.4rem"
          border="1px solid"
          borderColor="brand.accent"
          overflow="hidden"
          bg="linear-gradient(180deg, rgba(224,168,46,0.16), rgba(196,143,30,0.05))"
          boxShadow="0 0 0 1px rgba(224,168,46,0.16), inset 0 0 12px rgba(224,168,46,0.08)"
          transition="all 0.25s ease-in-out"
          _hover={{
            transform: "scale(1.12)",
            borderColor: "brand.accentDeep",
            boxShadow:
              "0 0 14px rgba(224,168,46,0.55), inset 0 0 14px rgba(224,168,46,0.18)",
          }}
          _active={{ transform: "scale(1.04)" }}
          sx={{
            // Foil light-streak, clipped to the button by overflow:hidden above.
            "&::after": {
              content: '""',
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "45%",
              background:
                "linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
              transform: "translateX(-180%) skewX(-20deg)",
              animation: `${shimmerSweep} 5s ease-in-out infinite`,
              pointerEvents: "none",
              zIndex: 1,
            },
            ...NO_MOTION,
          }}
        >
          <Box
            as="span"
            fontFamily="BebasNeueRegular"
            fontSize="1.15rem"
            fontWeight="bold"
            lineHeight="1"
            letterSpacing="0.14em"
            // Gold sheen on the word itself, distinct from the plain icon links.
            bgGradient="linear(to-b, #F1E0C1 0%, #E0A82E 55%, #C48F1E 100%)"
            bgClip="text"
            color="transparent"
            sx={{ WebkitTextFillColor: "transparent" }}
          >
            PRO
          </Box>
        </Box>

        {showBadge && (
          <Box
            position="absolute"
            top="-0.45rem"
            right="-0.5rem"
            zIndex={2}
            px="0.28rem"
            py="0.04rem"
            borderRadius="full"
            bg="brand.accent"
            color="brand.secondary"
            fontFamily="ArchivoNarrow"
            fontSize="0.5rem"
            fontWeight="bold"
            lineHeight="1.4"
            letterSpacing="0.12em"
            textTransform="uppercase"
            boxShadow="0 1px 3px rgba(0,0,0,0.45)"
            pointerEvents="none"
          >
            New
          </Box>
        )}
      </Box>
    </Link>
  );
};
