import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Palette } from "../../shared/color";
import { alpha, mix } from "../../shared/color";
import { font } from "../../theme";
import { avatarColor, ROUNDS, winnerOf } from "../cast";
import { CUE } from "../timeline";
import { clamp, Copy, EASE, Headline } from "../ui";

/**
 * Beat 1 — the whole tournament in three seconds, then a rewind. Eight names
 * snap into their seats, winners fire through the rounds, the crown slams on
 * the champion; then everything zips back to empty seats and the title lands.
 * Drawn, not captured: it is the promise the rest of the ad keeps.
 */

const CHIP = { w: 330, h: 62 };
const COLS = [150, 610, 1070];
const CROWN_X = 1530;
const TOP = 150;
const SPAN = 700;

/** y of slot `slot` (0/1) of match `index` in `round` */
const slotY = (round: number, index: number, slot: number) => {
  const matches = ROUNDS[round].length;
  const band = SPAN / matches;
  const centre = TOP + band * (index + 0.5);
  return centre + (slot === 0 ? -1 : 1) * (CHIP.h / 2 + 8) - CHIP.h / 2;
};
const matchCentre = (round: number, index: number) =>
  slotY(round, index, 0) + CHIP.h + 8 / 2;

const Chip: React.FC<{
  name: string;
  x: number;
  y: number;
  palette: Palette;
  dim?: number;
  glow?: number;
  scale?: number;
}> = ({ name, x, y, palette, dim = 0, glow = 0, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: CHIP.w,
      height: CHIP.h,
      borderRadius: 12,
      background: mix("#F7E8CF", palette.deep, dim * 0.55),
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "0 18px",
      transform: `scale(${scale})`,
      boxShadow: `0 6px 18px ${alpha("#000000", 0.4)}, 0 0 ${28 * glow}px ${alpha(palette.accent, 0.9 * glow)}`,
      border: `3px solid ${alpha(palette.accent, glow)}`,
      opacity: 1 - dim * 0.35,
    }}
  >
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: avatarColor(name),
        color: "#FAEBD7",
        fontFamily: font.body,
        fontWeight: 700,
        fontSize: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {name[0].toUpperCase()}
    </div>
    <div
      style={{
        fontFamily: font.body,
        fontWeight: 700,
        fontSize: 30,
        color: "#3A2140",
      }}
    >
      {name}
    </div>
  </div>
);

const EmptySlot: React.FC<{ x: number; y: number; palette: Palette }> = ({
  x,
  y,
  palette,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: CHIP.w,
      height: CHIP.h,
      borderRadius: 12,
      border: `2px dashed ${alpha(palette.ink, 0.25)}`,
      background: alpha(palette.ink, 0.04),
    }}
  />
);

/** The bracket at virtual time `v` (hook frames, before the rewind). */
const Bracket: React.FC<{ v: number; palette: Palette; fps: number }> = ({
  v,
  palette,
  fps,
}) => {
  const lines: React.ReactNode[] = [];
  const nodes: React.ReactNode[] = [];

  // connectors
  ROUNDS.forEach((matches, round) =>
    matches.forEach((_, index) => {
      const x0 = COLS[round] + CHIP.w;
      const y = matchCentre(round, index);
      const nextX = round + 1 < COLS.length ? COLS[round + 1] : CROWN_X;
      const nextY =
        round + 1 < ROUNDS.length
          ? slotY(round + 1, Math.floor(index / 2), index % 2) + CHIP.h / 2
          : y;
      const lit = interpolate(
        v,
        [CUE.hookRounds[round], CUE.hookRounds[round] + 8],
        [0, 1],
        clamp,
      );
      const mid = x0 + (nextX - x0) / 2;
      const stroke = mix(alpha(palette.ink, 0.22), palette.accent, lit);
      lines.push(
        <path
          key={`l${round}-${index}`}
          d={`M ${x0} ${y} H ${mid} V ${nextY} H ${nextX}`}
          fill="none"
          stroke={stroke}
          strokeWidth={3 + lit * 2}
        />,
      );
    }),
  );

  // round 1 seats
  ROUNDS[0].forEach((pair, index) =>
    pair.forEach((name, slot) => {
      const at = CUE.hookSeats + (index * 2 + slot) * 2;
      const pop = spring({ frame: v - at, fps, config: { damping: 14, stiffness: 200, mass: 0.6 }, durationInFrames: 14 });
      const lost = name !== winnerOf(0, index) ? interpolate(v, [CUE.hookRounds[0], CUE.hookRounds[0] + 6], [0, 1], clamp) : 0;
      nodes.push(
        <EmptySlot key={`e0${index}${slot}`} x={COLS[0]} y={slotY(0, index, slot)} palette={palette} />,
      );
      if (v >= at)
        nodes.push(
          <Chip key={`c0${index}${slot}`} name={name} x={COLS[0]} y={slotY(0, index, slot)} palette={palette} scale={0.6 + 0.4 * pop} dim={lost} />,
        );
    }),
  );

  // later rounds: each winner slides along its connector into the next seat
  for (let round = 1; round < ROUNDS.length; round++) {
    ROUNDS[round].forEach((pair, index) =>
      pair.forEach((name, slot) => {
        nodes.push(<EmptySlot key={`e${round}${index}${slot}`} x={COLS[round]} y={slotY(round, index, slot)} palette={palette} />);
        const from = index * 2 + slot;
        const go = interpolate(v, [CUE.hookRounds[round - 1], CUE.hookRounds[round - 1] + 9], [0, 1], { ...clamp, easing: EASE });
        if (go <= 0) return;
        const x = interpolate(go, [0, 1], [COLS[round - 1], COLS[round]]);
        const y = interpolate(go, [0, 1], [slotY(round - 1, Math.floor(from / 2), from % 2), slotY(round, index, slot)]);
        const lost = round < ROUNDS.length && name !== winnerOf(round, index) ? interpolate(v, [CUE.hookRounds[round], CUE.hookRounds[round] + 6], [0, 1], clamp) : 0;
        nodes.push(<Chip key={`c${round}${index}${slot}`} name={name} x={x} y={y} palette={palette} glow={(1 - go) * 0.8} dim={lost} />);
      }),
    );
  }

  // the champion
  const last = ROUNDS.length - 1;
  const champGo = interpolate(v, [CUE.hookRounds[last], CUE.hookRounds[last] + 9], [0, 1], { ...clamp, easing: EASE });
  const champY = matchCentre(last, 0) - CHIP.h / 2;
  const slam = spring({ frame: v - CUE.hookCrown, fps, config: { damping: 9, stiffness: 260, mass: 0.7 }, durationInFrames: 16 });
  if (champGo > 0)
    nodes.push(
      <Chip key="champ" name={winnerOf(last, 0)} x={interpolate(champGo, [0, 1], [COLS[last], CROWN_X - 60])} y={interpolate(champGo, [0, 1], [slotY(last, 0, 1), champY])} palette={palette} glow={v >= CUE.hookCrown ? 1 : 0.3} scale={1 + 0.12 * slam} />,
    );
  if (v >= CUE.hookCrown)
    nodes.push(
      <div
        key="crown"
        style={{
          position: "absolute",
          left: CROWN_X - 60 + CHIP.w / 2 - 60,
          top: champY - 130 - (1 - slam) * 140,
          width: 120,
          fontSize: 110,
          lineHeight: 1,
          textAlign: "center",
          color: palette.accent,
          opacity: Math.min(1, slam * 1.5),
          textShadow: `0 0 40px ${alpha(palette.accent, 0.8)}`,
        }}
      >
        ♛
      </div>,
    );

  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {lines}
      </svg>
      {nodes}
    </AbsoluteFill>
  );
};

export const Hook: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rewindEnd = CUE.hookRewind + 9;
  // virtual time: forward, then a fast rewind to empty seats
  const v =
    frame < CUE.hookRewind
      ? frame
      : interpolate(frame, [CUE.hookRewind, rewindEnd], [CUE.hookRewind, 0], {
          ...clamp,
          easing: (t) => t * t,
        });
  const rewinding = frame >= CUE.hookRewind && frame < rewindEnd;
  const jitter = rewinding ? Math.sin(frame * 3.1) * 14 : 0;
  const after = interpolate(frame, [rewindEnd - 2, rewindEnd + 6], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `translateX(${jitter}px)`,
          filter: rewinding ? "blur(1.5px) saturate(1.6)" : undefined,
          opacity: 1 - after * 0.55,
        }}
      >
        <Bracket v={v} palette={palette} fps={fps} />
      </AbsoluteFill>
      {rewinding ? (
        <AbsoluteFill
          style={{
            background: `repeating-linear-gradient(0deg, ${alpha("#FFFFFF", 0.07)} 0 2px, transparent 2px 6px)`,
            mixBlendMode: "screen",
          }}
        >
          <div style={{ position: "absolute", left: 80, top: 60, fontFamily: font.display, fontSize: 64, color: palette.ink, letterSpacing: 4 }}>
            ◀◀
          </div>
        </AbsoluteFill>
      ) : null}
      <Copy
        palette={palette}
        at={CUE.hookRounds[0]}
        out={CUE.hookRewind - 4}
        eyebrow="Tournaments"
        headline="Eight players. One champion."
      />
      {frame >= CUE.hookTitle - 2 ? (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div
            style={{
              opacity: interpolate(frame, [CUE.hookTitle - 2, CUE.hookTitle + 6], [0, 1], clamp),
              transform: `scale(${interpolate(frame, [CUE.hookTitle - 2, CUE.hookTitle + 8], [1.25, 1], { ...clamp, easing: EASE })})`,
            }}
          >
            <Headline text="Tournaments are here." palette={palette} size={150} />
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
