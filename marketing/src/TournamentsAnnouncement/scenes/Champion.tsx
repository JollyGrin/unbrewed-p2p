import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Palette } from "../../shared/color";
import { alpha } from "../../shared/color";
import { font } from "../../theme";
import { CHAMPION, TOURNAMENT_NAME } from "../cast";
import { pieces } from "../shots";
import { CUE } from "../timeline";
import { clamp, centreOf, EASE, Eyebrow, Headline, lookAt, mixCamera, Page } from "../ui";

const PAGE = "bracketDone";

/**
 * Beat 10, first half — the hook's crown, paid off: the real champion card on
 * the finished bracket, and the line the bot posts for it.
 */
export const Champion: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = pieces(PAGE, "champion")[0];
  const c = centreOf(card);
  const t = interpolate(frame, [0, 50], [0, 1], { ...clamp, easing: EASE });
  const camera = mixCamera(lookAt(1.5, c.x - 300, c.y), lookAt(2.3, c.x, c.y), t);
  const slam = spring({ frame: frame - CUE.ctaCrown, fps, config: { damping: 9, stiffness: 260, mass: 0.7 }, durationInFrames: 16 });
  const line = spring({ frame: frame - CUE.ctaCrown - 8, fps, config: { damping: 200 }, durationInFrames: 20 });
  return (
    <AbsoluteFill>
      <Page page={PAGE} layer="full" camera={camera} />
      <AbsoluteFill style={{ background: `radial-gradient(50% 50% at 50% 45%, transparent 40%, ${alpha("#000000", 0.55)} 100%)` }} />
      {frame >= CUE.ctaCrown ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 70 - (1 - slam) * 160, textAlign: "center", fontSize: 150, lineHeight: 1, color: palette.accent, opacity: Math.min(1, slam * 1.5), textShadow: `0 0 50px ${alpha(palette.accent, 0.9)}` }}>
          ♛
        </div>
      ) : null}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 110, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, opacity: line, transform: `translateY(${(1 - line) * 30}px)` }}>
        <Eyebrow label="Champion" color={palette.accent} />
        <Headline text={`${CHAMPION} wins ${TOURNAMENT_NAME}`} palette={palette} size={110} />
      </div>
    </AbsoluteFill>
  );
};

/** Beat 10, second half — where to go, and what to do there. */
export const EndCard: React.FC<{ palette: Palette; url: string }> = ({ palette, url }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = spring({ frame: frame - CUE.ctaMark, fps, config: { damping: 200 }, durationInFrames: 30 });
  const pill = spring({ frame: frame - CUE.ctaUrl, fps, config: { damping: 200 }, durationInFrames: 28 });
  const line = interpolate(frame, [CUE.ctaLine, CUE.ctaLine + 20], [0, 1], { ...clamp, easing: EASE });
  return (
    <AbsoluteFill style={{ flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, opacity: mark, transform: `translateY(${interpolate(mark, [0, 1], [40, 0])}px)` }}>
        <Eyebrow label="Tournaments · Brackets · Discord bot" color={palette.accent} />
        <div style={{ fontFamily: font.gothic, fontSize: 168, lineHeight: 0.95, letterSpacing: 2, color: palette.ink, textShadow: `0 8px 34px ${alpha("#000000", 0.65)}` }}>
          Run one for your group.
        </div>
      </div>
      <div style={{ fontFamily: font.display, fontSize: 92, letterSpacing: 3, lineHeight: 1, color: palette.onAccent, background: palette.accent, padding: "22px 60px 12px", borderRadius: 20, boxShadow: `0 14px 0 ${alpha("#000000", 0.35)}`, opacity: pill, transform: `translateY(${interpolate(pill, [0, 1], [36, 0])}px)` }}>
        {url}
      </div>
      <div style={{ fontFamily: font.body, fontSize: 46, letterSpacing: 3, color: alpha(palette.ink, 0.9), opacity: line, transform: `translateY(${interpolate(line, [0, 1], [20, 0])}px)` }}>
        Casual brackets, played on your own time.
      </div>
    </AbsoluteFill>
  );
};
