import { extendTheme } from "@chakra-ui/react";

export const colors = {
  brand: {
    primary: "#E7CC98",
    secondary: "#48284F",
    highlight: "#F1E0C1",
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

export const theme = extendTheme({ colors, fonts });
