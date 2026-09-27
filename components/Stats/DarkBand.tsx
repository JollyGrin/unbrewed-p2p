/**
 * The deep-purple header band that opens every stats page (#2C1831). Padding
 * is the mockups' — `hero` for the leaderboard (48/48/56), `profile` for the
 * player and hero pages (40/48/48) — and collapses to a 16px gutter on a
 * phone. Layout inside is the page's; the band only frames it.
 */
import { ReactNode } from "react";
import { Box } from "@chakra-ui/react";

import { BAND_INK } from "./tokens";

export interface DarkBandProps {
  variant?: "hero" | "profile";
  gap?: { base: string; md: string } | string;
  children?: ReactNode;
}

const PADDING = {
  hero: { base: "24px 16px 28px", md: "48px 48px 56px" },
  profile: { base: "16px 16px 28px", md: "40px 48px 48px" },
};

export const DarkBand = ({ variant = "profile", gap = { base: "20px", md: "32px" }, children }: DarkBandProps) => (
  <Box
    as="header"
    data-testid="dark-band"
    bg="#2C1831"
    color={BAND_INK}
    p={PADDING[variant]}
    display="flex"
    flexDirection="column"
    gap={gap}
    minW={0}
  >
    {children}
  </Box>
);
