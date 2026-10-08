import { AbsoluteFill, Freeze, interpolate, Sequence, useCurrentFrame } from "remotion";
import type { Palette } from "../../shared/color";
import { alpha } from "../../shared/color";
import { font } from "../../theme";
import { CLIP } from "../shots";
import { CUE } from "../timeline";
import { clamp, Clip, Copy, EASE } from "../ui";

const W = 880;
const H = 495;
const TOP = 170;

const Panel: React.FC<{ left: number; label: string; sub: string; dim: number; palette: Palette; children: React.ReactNode }> = ({ left, label, sub, dim, palette, children }) => (
  <div style={{ position: "absolute", left, top: TOP }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginBottom: 14 }}>
      <span style={{ fontFamily: font.gothic, fontSize: 58, color: palette.ink }}>{label}</span>
      <span style={{ fontFamily: font.body, fontSize: 30, letterSpacing: 3, textTransform: "uppercase", color: palette.accent }}>{sub}</span>
    </div>
    <div style={{ width: W, height: H, borderRadius: 18, overflow: "hidden", boxShadow: `0 24px 60px ${alpha("#000000", 0.6)}`, border: `3px solid ${alpha(palette.ink, 0.15)}`, filter: `brightness(${1 - dim * 0.6}) saturate(${1 - dim * 0.7})` }}>
      {children}
    </div>
  </div>
);

/**
 * Beat 6 — two players, two moments, one room. Left: quill presses "I'm
 * ready to play" on the match page and lands in the room. Right, later:
 * bramble's /pro banner says quill is ready, bramble presses "Join now". Then
 * the split folds into bramble's seat at the table: King Taranis against
 * Triceratops on Island of Despair, set by the organizer, no hero picker.
 */
export const Ready: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const wake = interpolate(frame, [CUE.readyRight - 6, CUE.readyRight + 4], [1, 0], clamp);
  const leftDim = interpolate(frame, [CUE.readyRight - 4, CUE.readyRight + 6], [0, 0.5], clamp);
  const merge = interpolate(frame, [CUE.readyMerge, CUE.readyMerge + 16], [0, 1], { ...clamp, easing: EASE });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - merge }}>
        <Panel left={60} label="quill" sub="Tuesday 7:42 PM" dim={leftDim} palette={palette}>
          <Clip src={CLIP.ready.src} mark={CLIP.ready.marks.click} lead={1.4} />
        </Panel>
        <Panel left={980} label="bramble" sub="Later that evening" dim={wake} palette={palette}>
          {frame < CUE.readyRight - 2 ? (
            <Freeze frame={0}>
              <Clip src={CLIP.join.src} mark={CLIP.join.marks.click} lead={1.6} />
            </Freeze>
          ) : (
            <Sequence from={CUE.readyRight - 2}>
              <Clip src={CLIP.join.src} mark={CLIP.join.marks.click} lead={1.6} />
            </Sequence>
          )}
        </Panel>
      </AbsoluteFill>
      {frame >= CUE.readyMerge ? (
        <AbsoluteFill
          style={{
            opacity: merge,
            transform: `translate(${(1 - merge) * 520}px, ${(1 - merge) * 40}px) scale(${0.46 + 0.54 * merge})`,
            transformOrigin: "50% 50%",
          }}
        >
          <Sequence from={CUE.readyMerge}>
            <Clip src={CLIP.board.src} mark={CLIP.board.marks.keep} lead={0.2} />
          </Sequence>
        </AbsoluteFill>
      ) : null}
      <Copy palette={palette} at={CUE.readyLine} out={CUE.readyMerge - 6} eyebrow="Ready check" headline="Press ready. They get pinged." />
      <Copy palette={palette} at={CUE.readyLine2} eyebrow="Join now" headline="Same room. Matchup locked." />
    </AbsoluteFill>
  );
};
