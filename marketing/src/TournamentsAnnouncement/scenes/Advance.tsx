import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import type { Palette } from "../../shared/color";
import { CLIP } from "../shots";
import { CUE } from "../timeline";
import { clamp, Clip, Copy, lookAt, Page, Ring } from "../ui";
import { ADVANCE_LANDS, REPLAY_CHIP } from "../marks";

/**
 * Beat 8 — footage of the organizer's bracket while the semifinal ends in
 * another browser: nobody touches this page, its poll picks the result up and
 * bramble's name lands in the final. Then the decided match's page, with its
 * public replay.
 */
export const Advance: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const local = frame - CUE.advanceReplay;
  const page = REPLAY_CHIP;
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={CUE.advanceReplay + 6}>
        <Clip src={CLIP.advance.src} mark={ADVANCE_LANDS} lead={1.6} style={{ transform: "scale(1.18)", transformOrigin: "60% 85%" }} />
      </Sequence>
      {local >= 0 ? (
        <AbsoluteFill style={{ opacity: interpolate(local, [0, 6], [0, 1], clamp) }}>
          <Page page="sf2Done" layer="full" camera={lookAt(1.45, 560, 860)}>
            <Ring rect={page} at={CUE.advanceReplay + 8} color={palette.accent} />
          </Page>
        </AbsoluteFill>
      ) : null}
      <Copy palette={palette} at={CUE.advanceLine} eyebrow="Automatic" headline="Results report themselves." note="The bracket moves on. Every game keeps a replay." />
    </AbsoluteFill>
  );
};
