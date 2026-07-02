import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Load Unbrewed brand fonts from public/fonts. Fire-and-forget at import time.
loadFont({
  family: "BebasNeue",
  url: staticFile("fonts/BebasNeueRegular.otf"),
  weight: "700",
});
loadFont({
  family: "LeagueGothic",
  url: staticFile("fonts/LeagueGothic-Regular.otf"),
});
loadFont({
  family: "ArchivoNarrow",
  url: staticFile("fonts/ArchivoNarrow-Regular.otf"),
});
