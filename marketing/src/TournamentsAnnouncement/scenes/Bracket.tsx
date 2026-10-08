import { AbsoluteFill, Img, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Palette } from "../../shared/color";
import { alpha } from "../../shared/color";
import { cell, CLIP, pieces, PHONE } from "../shots";
import { CUE } from "../timeline";
import { centreOf, clamp, Clip, Copy, EASE, lookAt, mixCamera, Page } from "../ui";

const PAGE = "bracketLive";

/**
 * Beat 4 — footage of "Start bracket", then the live bracket a few games in
 * (one quarterfinal in play), the camera travelling round by round, and the
 * same bracket on a phone.
 */
export const Bracket: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - CUE.bracketCut;
  const tree = pieces(PAGE, "bracket-tree")[0];
  const qf = centreOf(cell(PAGE, "QF3"));
  const fin = centreOf(cell(PAGE, "FINAL"));
  const t = interpolate(local, [6, 96], [0, 1], { ...clamp, easing: EASE });
  const camera = mixCamera(lookAt(1.75, qf.x + 120, qf.y), lookAt(1.55, fin.x + 120, tree.y + tree.h / 2), t);
  const phone = spring({ frame: frame - CUE.bracketPhone, fps, config: { damping: 18, stiffness: 120 }, durationInFrames: 24 });
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={CUE.bracketCut + 6}>
        <Clip src={CLIP.start.src} mark={CLIP.start.marks.clickStart} lead={1.1} rate={1.25} />
      </Sequence>
      {local >= 0 ? (
        <AbsoluteFill style={{ opacity: interpolate(local, [0, 6], [0, 1], clamp) }}>
          <Page page={PAGE} layer="full" camera={camera} />
        </AbsoluteFill>
      ) : null}
      {frame >= CUE.bracketPhone ? (
        <div
          style={{
            position: "absolute",
            right: 140,
            top: 70,
            width: 380,
            height: 822,
            borderRadius: 54,
            padding: 14,
            background: "#141016",
            boxShadow: `0 30px 80px ${alpha("#000000", 0.7)}`,
            transform: `translateX(${(1 - phone) * 700}px) rotate(${(1 - phone) * 8}deg)`,
          }}
        >
          <Img src={PHONE.live} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", borderRadius: 42 }} />
        </div>
      ) : null}
      <Copy palette={palette} at={CUE.bracketLine} eyebrow="Bracket" headline="A real bracket. On your desk or your phone." />
    </AbsoluteFill>
  );
};
