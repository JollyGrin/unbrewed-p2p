/**
 * The stats mockups' palette in one place (Main/Player/Hero.dc.html). Chart
 * colours come from the theme (`stats.*`, `brand.positive`, `brand.danger`);
 * these are the inks and washes the mockups spell as raw rgba().
 */
import { colors } from "@/styles/style";

import type { OpponentKind } from "@/lib/stats/types";

export const INK = "#48284F";
export const INK_DEEP = "#2C1831";
export const INK_MUTED = "rgba(72,40,79,0.72)";
export const INK_SOFT = "rgba(72,40,79,0.78)";
export const PARCHMENT = "#FAEBD7";
export const PAGE_BG = "#F1E0C1";
export const WASH = "rgba(72,40,79,0.06)";
export const TRACK = "rgba(72,40,79,0.12)";
export const RULE = "1px solid rgba(72,40,79,0.15)";
export const GOLD = "#E0A82E";
export const GOLD_DEEP = "#C48F1E";
export const BAND_INK = "#FAEBD7";
export const BAND_MUTED = "rgba(250,235,215,0.7)";
export const BAND_WASH = "rgba(250,235,215,0.08)";

export const KIND_COLOR: Record<OpponentKind, string> = {
  human: colors.stats.human,
  hardExpert: colors.stats.hardExpert,
  casual: colors.stats.casual,
};

/** Legend wording from the mockups. */
export const KIND_LABEL: Record<OpponentKind, string> = {
  human: "Human vs human",
  hardExpert: "vs hard / expert bot",
  casual: "vs casual bot",
};

/** The small uppercase caption style used for every tile/axis label. */
export const captionStyle = {
  fontFamily: "ArchivoNarrow",
  fontSize: "12px",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
};
