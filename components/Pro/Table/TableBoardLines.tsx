/**
 * The board's flat vector layer: adjacency lines between space centres and
 * the attacker→target attack arrow (issue #148's crimson arrow, same colour
 * ProBoard uses so it reads as the same signal in either view).
 *
 * Drawn as ONE SVG sized to the frame's true measured pixels (`frameW` ×
 * `frameH` — see TableSpace's header comment on why px, not a square
 * viewBox, is what keeps geometry undistorted) and placed as a child of the
 * tilted stage plane, so a straight line between two board points is still a
 * straight line after the ancestor's `rotateX` — perspective projection maps
 * lines to lines, so this needs no trigonometry of its own; the CSS
 * transform on the ancestor does all the foreshortening.
 */
import type { ProMapSpace, SpaceId } from "@/lib/pro/protocol";

const ARROW_COLOR = "#E23B3B";
// Movement-intent cue (issue #320 follow-up), matching ProBoard's own periwinkle
// "who would move here" channel — deliberately distinct from the gold highlight
// ring, the crimson attack arrow and the dashed cyan relocate ring.
const MOVE_HINT_COLOR = "#A78BFA";

export interface TableBoardLinesProps {
  spaces: ProMapSpace[];
  frameW: number;
  frameH: number;
  attack?: { attackerSpace: SpaceId; targetSpace: SpaceId } | null;
  /** "Who would move here" source→destination connectors (issue #320 follow-up).
   *  Phase 1 draws the connector only, not the destination ghost token — see the
   *  table-board report for why. */
  moveHintEdges?: { from: SpaceId; to: SpaceId }[];
  /** LARGE (two-space) fighters' head↔tail connecting bands (phase-1 deferred
   *  item, ProBoard's own visual — see ProBoard's `frameTwoSpace` rendering).
   *  Drawn flat, in the board plane, same as an adjacency line: a straight
   *  line between two board points is still a straight line under the
   *  ancestor's `rotateX`, so this needs no billboarding of its own. */
  twoSpaceBands?: { head: SpaceId; tail: SpaceId; color: string }[];
}

export const TableBoardLines = ({
  spaces,
  frameW,
  frameH,
  attack,
  moveHintEdges = [],
  twoSpaceBands = [],
}: TableBoardLinesProps) => {
  if (!frameW || !frameH) return null;
  const bySpace = new Map(spaces.map((s) => [s.id, s]));
  const pt = (s: ProMapSpace) => ({ x: s.x * frameW, y: s.y * frameH });

  // Undirected edges, deduped (adjacentTo is stored symmetrically — s1 lists
  // s2 and s2 lists s1 — so a naive walk would draw every line twice).
  const seen = new Set<string>();
  const edges: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  for (const s of spaces) {
    for (const otherId of s.adjacentTo) {
      const other = bySpace.get(otherId);
      if (!other) continue;
      const key = [s.id, otherId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: pt(s), to: pt(other) });
    }
  }

  const attackFrom = attack ? bySpace.get(attack.attackerSpace) : null;
  const attackTo = attack ? bySpace.get(attack.targetSpace) : null;

  return (
    <svg
      viewBox={`0 0 ${frameW} ${frameH}`}
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <g stroke="rgba(224, 168, 46, 0.28)" strokeWidth={Math.max(1, frameW * 0.0015)}>
        {edges.map((e, i) => (
          <line key={i} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} />
        ))}
      </g>
      <g strokeLinecap="round">
        {twoSpaceBands.map((band, i) => {
          const from = bySpace.get(band.head);
          const to = bySpace.get(band.tail);
          if (!from || !to) return null;
          const a = pt(from);
          const b = pt(to);
          const width = Math.max(3, frameW * 0.012);
          return (
            <g key={i}>
              {/* White halo, then the player-color band on top — matches
                  ProBoard's own two-space band treatment exactly. */}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth={width * 1.35} opacity={0.9} />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={band.color} strokeWidth={width} />
            </g>
          );
        })}
      </g>
      <g stroke={MOVE_HINT_COLOR} strokeWidth={Math.max(1.5, frameW * 0.0025)} strokeDasharray="4 3" opacity={0.85}>
        {moveHintEdges.map((hint, i) => {
          const from = bySpace.get(hint.from);
          const to = bySpace.get(hint.to);
          if (!from || !to) return null;
          const a = pt(from);
          const b = pt(to);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
      </g>
      {attackFrom && attackTo && (
        <g>
          <defs>
            <marker
              id="table-attack-arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill={ARROW_COLOR} />
            </marker>
          </defs>
          <line
            x1={pt(attackFrom).x}
            y1={pt(attackFrom).y}
            x2={pt(attackTo).x}
            y2={pt(attackTo).y}
            stroke={ARROW_COLOR}
            strokeWidth={Math.max(2, frameW * 0.004)}
            strokeLinecap="round"
            markerEnd="url(#table-attack-arrowhead)"
          />
        </g>
      )}
    </svg>
  );
};
