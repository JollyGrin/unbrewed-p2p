import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import type { Palette } from "../../shared/color";
import { CLIP, pieces } from "../shots";
import { CUE } from "../timeline";
import { clamp, Clip, Copy, EASE, lookAt, mixCamera, Page, usePop } from "../ui";

const SHARE = 34;

/**
 * Beat 3 — the link card right after create ("Copy link"), then the seats
 * card filling: one capture per join, eight of them, flipped in order.
 */
export const Signup: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const local = frame - SHARE;
  const seat = Math.min(8, Math.max(1, Math.floor((local - CUE.signupFirst) / CUE.signupGap) + 2));
  const page = `signup${seat}`;
  const panel = pieces("signup8", "join-panel")[0] ?? pieces("signup8", "seat-count")[0];
  const cx = panel.x + panel.w / 2;
  const cy = panel.y + panel.h / 2;
  const t = interpolate(local, [0, 56], [0, 1], { ...clamp, easing: EASE });
  const camera = mixCamera(lookAt(1.9, cx, cy), lookAt(2.1, cx, cy), t);
  const pop = usePop(SHARE + CUE.signupFirst + (seat - 1) * CUE.signupGap, 10, 10);
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={SHARE + 4}>
        <Clip src={CLIP.share.src} mark={CLIP.share.marks.click} lead={0.8} />
      </Sequence>
      {frame >= SHARE ? (
        <AbsoluteFill style={{ opacity: interpolate(local, [0, 5], [0, 1], clamp), transform: `scale(${1 + 0.006 * (1 - pop)})` }}>
          <Page page={page} layer="full" camera={camera} />
        </AbsoluteFill>
      ) : null}
      <Copy palette={palette} at={CUE.signupLine} eyebrow="Signup" headline="Share one link. Your group signs up." />
    </AbsoluteFill>
  );
};
