import { loadFont } from "@remotion/fonts";
import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

const FACES = [
  { family: "BebasNeue", file: "fonts/BebasNeueRegular.otf" },
  { family: "LeagueGothic", file: "fonts/LeagueGothic-Regular.otf" },
  { family: "ArchivoNarrow", file: "fonts/ArchivoNarrow-Regular.otf" },
  // The app's CardFactory names these two families itself (card.helpers.tsx),
  // so real card faces need them registered under those exact names.
  { family: "BebasNeueRegular", file: "fonts/BebasNeueRegular.otf" },
];

/** Unbrewed brand fonts from public/fonts. Loading starts at import; the
 * promise is what compositions wait on. */
export const brandFontsReady: Promise<void> = Promise.all(
  FACES.map(({ family, file }) => loadFont({ family, url: staticFile(file) })),
).then(() => undefined);

/**
 * Renders nothing until the brand fonts are on the page, holding the render
 * open meanwhile. loadFont registers its own delayRender while the bundle is
 * evaluating — before any composition mounts — which does NOT hold a render
 * back, so without this every frame comes out in the fallback face. Gating the
 * children (rather than just delaying the screenshot) also means the app's
 * CardFactory never measures its text wrapping against fallback metrics.
 */
export const BrandFonts: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [handle] = useState(() => delayRender("Loading Unbrewed brand fonts"));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    brandFontsReady.then(() => {
      if (!alive) return;
      setReady(true);
      continueRender(handle);
    });
    return () => {
      alive = false;
    };
  }, [handle]);

  return ready ? <>{children}</> : null;
};
