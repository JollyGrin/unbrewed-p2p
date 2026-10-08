import { AbsoluteFill } from "remotion";
import type { Palette } from "../../shared/color";
import { CLIP } from "../shots";
import { CUE } from "../timeline";
import { Clip, Copy } from "../ui";

/** Beat 2 — footage: /tournaments → Create → the Weekend bracket preset → a name → Open signup. */
export const Create: React.FC<{ palette: Palette }> = ({ palette }) => (
  <AbsoluteFill>
    <Clip src={CLIP.create.src} mark={CLIP.create.marks.clickCreate} lead={0.7} rate={1.6} />
    <Copy palette={palette} at={CUE.createLine} eyebrow="Create" headline="Pick a format. Set a match window." />
  </AbsoluteFill>
);
