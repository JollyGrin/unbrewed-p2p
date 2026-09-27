/**
 * A hero's circular token (issue #935). Art is the deck snapshot's
 * `hero.tokenImageUrl`, resolved through one shared react-query entry per hero
 * (lib/stats/heroToken). No art — Nancy Drew has none, Specter Knight's is a
 * stub, or the image fails to load — draws the initials disc from the mockups
 * instead, so a token is never an empty hole.
 */
import { useState } from "react";
import { Box, Image } from "@chakra-ui/react";

import { useHeroTokenUrl } from "@/lib/stats/heroToken";
import { heroDisplayName, heroInitials } from "@/lib/stats/roster";

/** The sizes the mockups use. */
export type HeroTokenSize = 36 | 40 | 64 | 72 | 120 | 200;

export interface HeroTokenProps {
  heroId: string | null;
  /** Name the payload sent, used when the roster doesn't know the id. */
  heroName?: string | null;
  /** A size, or `{ base, md }` for a phone/desktop pair. */
  size?: HeroTokenSize | { base: HeroTokenSize; md: HeroTokenSize };
  /** Ring drawn inside the circle (hero rank, podium). */
  ring?: { color: string; width: number } | null;
  /** Unplayed roster slot: greyed out. */
  muted?: boolean;
  /** Drop shadow, as on the leaderboard's hero cards. */
  shadow?: boolean;
  /** Decorative next to a visible name: empty alt, no tooltip. */
  decorative?: boolean;
}

export const HeroToken = ({
  heroId,
  heroName,
  size = 40,
  ring = null,
  muted = false,
  shadow = false,
  decorative = false,
}: HeroTokenProps) => {
  const src = useHeroTokenUrl(heroId);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const name = heroDisplayName(heroId, heroName);
  const state = src === undefined ? "loading" : src && src !== failedSrc ? "image" : "initials";

  const px =
    typeof size === "number"
      ? `${size}px`
      : { base: `${size.base}px`, md: `${size.md}px` };
  const fontPx =
    typeof size === "number"
      ? `${Math.round(size * 0.5)}px`
      : { base: `${Math.round(size.base * 0.5)}px`, md: `${Math.round(size.md * 0.5)}px` };

  const frame = {
    w: px,
    h: px,
    minW: px,
    borderRadius: "50%",
    boxSizing: "border-box" as const,
    border: ring ? `${ring.width}px solid ${ring.color}` : undefined,
    boxShadow: shadow ? "0 2px 8px rgba(44,24,49,0.35)" : undefined,
    filter: muted ? "grayscale(1)" : undefined,
    opacity: muted ? 0.55 : undefined,
    title: decorative ? undefined : name,
    "data-token-state": state,
    "data-testid": "hero-token",
  };

  if (state === "image" && src) {
    return (
      <Image
        {...frame}
        src={src}
        alt={decorative ? "" : `${name} token`}
        objectFit="cover"
        loading="lazy"
        onError={() => setFailedSrc(src)}
      />
    );
  }

  return (
    <Box
      {...frame}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${name} token`}
      aria-hidden={decorative || undefined}
      bg={state === "loading" ? "rgba(72,40,79,0.12)" : "#48284F"}
      color="#FAEBD7"
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontFamily="LeagueGothic"
      fontSize={fontPx}
      lineHeight={1}
      userSelect="none"
    >
      {state === "initials" ? heroInitials(name) : null}
    </Box>
  );
};
