import { extendTheme } from "@chakra-ui/react";

const colors = {
  brand: {
    900: "#1a365d",
    800: "#153e75",
    700: "#2a69ac",
  },
};

const fonts = {
  BebasNeueRegular: `'BebasNeueRegular', sans-serif`,
  ArchivoNarrow: `'ArchivoNarrow', sans-serif`,
  LeagueGothic: `'LeagueGothic', sans-serif`,
  SpaceGrotesk: `'Space Grotesk', sans-serif`,
};

export const theme = extendTheme({ colors, fonts });
