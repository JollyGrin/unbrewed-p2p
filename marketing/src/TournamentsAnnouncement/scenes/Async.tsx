import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Palette } from "../../shared/color";
import { alpha } from "../../shared/color";
import { font } from "../../theme";
import { cell } from "../shots";
import { CUE } from "../timeline";
import { centreOf, clamp, Copy, EASE, lookAt, Page, Piece } from "../ui";

const PAGE = "bracketOpen";
const WINDOWS = ["24h", "48h", "72h", "1 week"];
const PICKED = 1;

/**
 * Beat 5 — one quarterfinal card, lifted off the real bracket, and the four
 * match windows the organizer can choose from. A sun and a moon cross behind
 * it: the two players don't have to be online on the same evening.
 */
export const Async: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = cell(PAGE, "QF1");
  const c = centreOf(card);
  const lift = spring({ frame: frame - CUE.asyncCard, fps, config: { damping: 200 }, durationInFrames: 20 });
  const scale = 1 + 1.15 * lift;
  const arc = interpolate(frame, [0, 105], [0, 1], clamp);
  const orb = (phase: number, glyph: string, color: string) => {
    const a = Math.PI * (1 - ((arc + phase) % 1));
    return (
      <div style={{ position: "absolute", left: 640 + Math.cos(a) * 520 - 50, top: 760 - Math.sin(a) * 520 - 50, width: 100, height: 100, fontSize: 84, lineHeight: "100px", textAlign: "center", color, textShadow: `0 0 40px ${alpha(color, 0.8)}`, opacity: 0.85 }}>
        {glyph}
      </div>
    );
  };
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: "blur(10px) brightness(0.45)" }}>
        <Page page={PAGE} layer="full" camera={lookAt(1.5, c.x + 200, c.y)} />
      </AbsoluteFill>
      {orb(0, "☀", "#F4C24E")}
      {orb(0.5, "☾", "#C9D4FF")}
      <div style={{ position: "absolute", left: 640 - (card.w * scale) / 2, top: 470 - (card.h * scale) / 2, width: card.w, height: card.h, transform: `scale(${scale})`, transformOrigin: "0 0", filter: `drop-shadow(0 18px 30px ${alpha("#000000", 0.55)})` }}>
        <div style={{ position: "absolute", left: -card.x, top: -card.y }}>
          <Piece page={PAGE} rect={card} radius={10} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 1130, top: 250, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ fontFamily: font.body, fontSize: 32, letterSpacing: 6, textTransform: "uppercase", color: alpha(palette.ink, 0.8) }}>Time per match</div>
        {WINDOWS.map((w, i) => {
          const at = CUE.asyncChips + i * CUE.asyncChipGap;
          const pop = spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 190 }, durationInFrames: 16 });
          const on = i === PICKED ? interpolate(frame, [CUE.asyncPick, CUE.asyncPick + 6], [0, 1], { ...clamp, easing: EASE }) : 0;
          return (
            <div key={w} style={{ opacity: Math.min(1, pop * 1.4), transform: `translateX(${(1 - pop) * 120}px) scale(${1 + on * 0.08})`, transformOrigin: "left center", width: 330, padding: "16px 30px 8px", borderRadius: 16, fontFamily: font.gothic, fontSize: 76, lineHeight: 1, color: on > 0.5 ? palette.onAccent : palette.ink, background: on > 0.5 ? palette.accent : alpha(palette.ink, 0.1), border: `3px solid ${on > 0.5 ? palette.accent : alpha(palette.ink, 0.25)}`, boxShadow: on ? `0 0 ${30 * on}px ${alpha(palette.accent, 0.7)}` : undefined }}>
              {w}
            </div>
          );
        })}
      </div>
      <Copy palette={palette} at={CUE.asyncLine} eyebrow="No scheduling" headline="Play your match when it suits you." />
    </AbsoluteFill>
  );
};
