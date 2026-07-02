import { extendTheme } from "@chakra-ui/react";

export const colors = {
  brand: {
    primary: "#E7CC98",
    secondary: "#48284F",
    highlight: "#F1E0C1",
    // semantic table-surface tokens (same palette, named for use)
    parchment: "#FAEBD7", // panel/tray background (was `antiquewhite`)
    parchmentDeep: "#DEB887", // hover/pressed parchment (was `burlywood`)
    surface: "#3A2140", // deep purple table surface
    surfaceDim: "#2C1831", // darker purple (modals, trays)
    danger: "#FF6347", // damage / remove (was `tomato`)
    positive: "#2F9E68", // heal / add (was `green`)
    accent: "#E0A82E", // antique gold — primary CTAs, starred/active (was `gold`)
    accentDeep: "#C48F1E", // hover/pressed gold
  },
  purple: {
    900: "#48284F",
  },
};

export const fonts = {
  BebasNeueRegular: `'BebasNeueRegular', sans-serif`,
  ArchivoNarrow: `'ArchivoNarrow', sans-serif`,
  LeagueGothic: `'LeagueGothic', sans-serif`,
  SpaceGrotesk: `'Space Grotesk', sans-serif`,
};

export const shadows = {
  card: "0 2px 8px rgba(44, 24, 49, 0.35)",
  cardHover: "0 8px 24px rgba(44, 24, 49, 0.5)",
};

export const theme = extendTheme({
  colors,
  fonts,
  shadows,
  styles: {
    global: {
      body: {
        bg: "brand.parchment",
        color: "brand.surfaceDim",
      },
    },
  },
});
