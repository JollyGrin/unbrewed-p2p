import { AbsoluteFill } from "remotion";
import type { Palette } from "../../shared/color";
import { ORG_TOOLS } from "../marks";
import { CUE } from "../timeline";
import { Copy, lookAt, Page, Ring } from "../ui";

/**
 * Beat 9 — the organizer's own view of a match: "Set matchup…" and
 * "Override result…", the controls only they see. The event page carries the
 * rest (edit, extend signup, cancel), which the note names.
 */
export const Organizer: React.FC<{ palette: Palette }> = ({ palette }) => {
  const r = ORG_TOOLS;
  return (
    <AbsoluteFill>
      <Page page="orgMatch" layer="full" camera={lookAt(1.9, r.x + r.w / 2 - 260, r.y + r.h / 2 + 70)}>
        <Ring rect={r} at={CUE.orgRing} color={palette.accent} />
      </Page>
      <Copy palette={palette} at={CUE.orgLine} eyebrow="Organizer tools" headline="You stay in charge." note="Set matchups, override a result, extend or cancel." />
    </AbsoluteFill>
  );
};
