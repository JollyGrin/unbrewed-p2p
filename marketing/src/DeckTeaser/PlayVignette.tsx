import { Img, interpolate, spring } from "remotion";
import { STAGE } from "../BonusShowcase/layout";
import { Chip, clamp, EASE, Space, Token } from "../BonusShowcase/ui";
import { font } from "../theme";
import { alpha, mix, type Palette } from "../shared/color";
import type { BonusDeck } from "../shared/deck";
import { PAYOFF_TARGET_LOCAL } from "./layout";
import { PLAY_VIGNETTE, type PlayParams } from "./plays";
import { PAYOFF_CUE } from "./timeline";

/**
 * A played main-deck card, acted out on the stage right of its face — the
 * same stage, tokens and spaces the reward vignettes use, so a turn and a
 * reward read as one board. Stage-local coordinates, `t` from the effect's
 * start; every number comes from `PlayParams` (the card's own text).
 */

const FPS = 30;
const SPACE_FILL = "#2a1d33";
const SPACE_RING = "#5b4766";
const ramp = (t: number, from: number, to: number) =>
  interpolate(t, [from, to], [0, 1], { ...clamp, easing: EASE });
const pop = (t: number, at: number, damping = 12) =>
  spring({ frame: t - at, fps: FPS, config: { damping, stiffness: 180 } });

const At: React.FC<{
  x: number;
  y: number;
  z?: number;
  opacity?: number;
  transform?: string;
  children: React.ReactNode;
}> = ({ x, y, z, opacity = 1, transform = "", children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      zIndex: z,
      opacity,
      transform: `translate(-50%, -50%) ${transform}`,
    }}
  >
    {children}
  </div>
);

const Label: React.FC<{ palette: Palette; children: React.ReactNode }> = ({
  palette,
  children,
}) => (
  <div
    style={{
      fontFamily: font.body,
      fontSize: 26,
      letterSpacing: 6,
      textTransform: "uppercase",
      color: palette.inkDim,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

const Popup: React.FC<{ colour: string; children: React.ReactNode }> = ({
  colour,
  children,
}) => (
  <div
    style={{
      fontFamily: font.display,
      fontSize: 72,
      color: colour,
      textShadow: `0 4px 0 ${alpha("#000000", 0.5)}, 0 0 24px ${alpha(colour, 0.6)}`,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

/** Where a hopping token is after `t`, along a row, `steps` hops of `hop`. */
const hopAlong = (
  t: number,
  from: number,
  hop: number,
  steps: number,
  xs: number[],
  y: number,
) => {
  const progress = Math.max(0, Math.min(steps, (t - from) / hop));
  const at = Math.floor(progress);
  const within = progress - at;
  const a = xs[Math.min(at, steps)];
  const b = xs[Math.min(at + 1, steps)];
  return {
    x: interpolate(within, [0, 1], [a, b]),
    y: y - Math.sin(Math.PI * within) * 46,
    progress,
  };
};

// ---- Welcome to the Amazing Digital Circus!: everyone moves, heal, draw ----

const Regroup: React.FC<{
  t: number;
  params: Extract<PlayParams, { kind: "regroup" }>;
  palette: Palette;
  deck: BonusDeck;
}> = ({ t, params, palette, deck }) => {
  const v = PLAY_VIGNETTE.regroup;
  const xs = Array.from(
    { length: params.move + 1 },
    (_, i) => 90 + (i * 420) / params.move,
  );
  const rows = [150, 320];
  const hero = hopAlong(t, v.heroFrom, v.hop, params.move, xs, rows[0] - 8);
  const side = hopAlong(t, v.sidekickFrom, v.hop, params.move, xs, rows[1] - 8);
  const heal = pop(t, v.heal, 10);
  const healRise = ramp(t, v.heal, v.heal + 26);
  const hand = { x: 720, y: 250 };
  return (
    <>
      {rows.map((y, row) =>
        xs.map((x, index) => (
          <Space
            key={`${row}-${index}`}
            x={x}
            y={y}
            size={84}
            fill={SPACE_FILL}
            ring={SPACE_RING}
            lit={
              index === 0
                ? 0
                : interpolate(
                    (row ? side : hero).progress,
                    [index - 0.5, index, index + 1.5],
                    [0, 1, 0.35],
                    clamp,
                  )
            }
            litColour={palette.accent}
          />
        )),
      )}
      <At x={hero.x} y={hero.y} z={3}>
        <Token src={deck.hero.portraitUrl} size={104} ring={palette.accent} />
      </At>
      {deck.sidekick ? (
        <At x={side.x} y={side.y} z={3}>
          <Token
            src={deck.sidekick.portraitUrl}
            size={92}
            ring={palette.accent}
          />
        </At>
      ) : null}
      {/* the heal lands on the sidekick */}
      <At
        x={side.x}
        y={side.y - 70 - 40 * healRise}
        z={4}
        opacity={heal * (1 - ramp(t, v.heal + 30, v.heal + 40))}
        transform={`scale(${0.6 + 0.4 * heal})`}
      >
        <Popup colour="#5fe08a">{`+${params.heal}`}</Popup>
      </At>
      {/* the draw: cards fan into a hand on the right */}
      {Array.from({ length: params.draw }, (_, index) => {
        const k = ramp(
          t,
          v.drawFrom + index * v.drawGap,
          v.drawFrom + index * v.drawGap + 10,
        );
        if (k <= 0) return null;
        return (
          <At
            key={index}
            x={interpolate(
              k,
              [0, 1],
              [880, hand.x + (index - (params.draw - 1) / 2) * 60],
            )}
            y={
              interpolate(k, [0, 1], [60, hand.y]) - Math.sin(Math.PI * k) * 40
            }
            z={2}
            transform={`rotate(${interpolate(k, [0, 1], [30, (index - (params.draw - 1) / 2) * 10])}deg)`}
          >
            <div
              style={{
                width: 110,
                height: 154,
                borderRadius: 10,
                overflow: "hidden",
                boxShadow: `0 10px 24px ${alpha("#000000", 0.5)}`,
              }}
            >
              {deck.cardbackUrl ? (
                <Img
                  src={deck.cardbackUrl}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : null}
            </div>
          </At>
        );
      })}
      <At
        x={hand.x}
        y={hand.y + 130}
        opacity={ramp(t, v.drawFrom, v.drawFrom + 10)}
      >
        <Label palette={palette}>{`Draw ${params.draw}`}</Label>
      </At>
      <At x={300} y={420} opacity={ramp(t, v.heroFrom, v.heroFrom + 10)}>
        <Label palette={palette}>{`Everyone moves up to ${params.move}`}</Label>
      </At>
    </>
  );
};

// ---- Team Bad Guys: side by side, splash the target's zone ----

const Splash: React.FC<{
  t: number;
  params: Extract<PlayParams, { kind: "splash" }>;
  palette: Palette;
  deck: BonusDeck;
}> = ({ t, params, palette, deck }) => {
  const v = PLAY_VIGNETTE.splash;
  const zone = { x: 470, y: 90, w: 360, h: 300 };
  const targets = [
    { x: zone.x + 110, y: zone.y + 100 },
    { x: zone.x + 250, y: zone.y + 200 },
  ].slice(0, Math.max(1, params.split));
  const share = (index: number) =>
    Math.floor(params.damage / targets.length) +
    (index < params.damage % targets.length ? 1 : 0);
  const shot = ramp(t, v.shot, v.impact);
  const impact = t - v.impact;
  const hit = interpolate(impact, [0, 3, 14], [0, 1, 0], clamp);
  const numbers = pop(t, v.impact + 2, 10);
  const from = { x: 200, y: 240 };
  const to = { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
  return (
    <>
      {/* the opposing fighter's zone */}
      <div
        style={{
          position: "absolute",
          left: zone.x,
          top: zone.y,
          width: zone.w,
          height: zone.h,
          borderRadius: 40,
          border: `4px dashed ${alpha("#e2364b", 0.7 + 0.3 * hit)}`,
          backgroundColor: alpha("#e2364b", 0.12 + 0.35 * hit),
        }}
      />
      <At x={zone.x + zone.w / 2} y={zone.y + zone.h + 34}>
        <Label palette={palette}>Their zone</Label>
      </At>
      {targets.map((target, index) => (
        <At
          key={index}
          x={target.x + Math.sin(impact * 2.2 + index) * 10 * hit}
          y={target.y}
          z={2}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              border: `5px solid ${mix(palette.ink, "#e2364b", hit)}`,
              backgroundColor: "#160f1b",
              boxShadow: `0 10px 22px ${alpha("#000000", 0.5)}`,
            }}
          />
        </At>
      ))}
      {targets.map((target, index) => (
        <At
          key={`n-${index}`}
          x={target.x + 54}
          y={target.y - 60 - 20 * ramp(t, v.impact, v.impact + 24)}
          z={4}
          opacity={numbers}
          transform={`scale(${0.6 + 0.4 * numbers})`}
        >
          <Popup colour="#ff5a6a">{`-${share(index)}`}</Popup>
        </At>
      ))}
      {/* the duo, adjacent */}
      <At x={110} y={240} z={3}>
        <Token src={deck.hero.portraitUrl} size={116} ring={palette.accent} />
      </At>
      {deck.sidekick ? (
        <At x={225} y={250} z={3}>
          <Token
            src={deck.sidekick.portraitUrl}
            size={104}
            ring={palette.accent}
          />
        </At>
      ) : null}
      <At x={168} y={350}>
        <Label palette={palette}>Side by side</Label>
      </At>
      {/* the lob */}
      {shot > 0 && shot < 1 ? (
        <At
          x={interpolate(shot, [0, 1], [from.x, to.x])}
          y={
            interpolate(shot, [0, 1], [from.y, to.y]) -
            Math.sin(Math.PI * shot) * 150
          }
          z={5}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: `radial-gradient(circle, #fff 0%, ${palette.accent} 55%, ${alpha(palette.accent, 0)} 75%)`,
            }}
          />
        </At>
      ) : null}
      {impact >= 0 && impact < 18 ? (
        <At
          x={to.x}
          y={to.y}
          z={1}
          opacity={interpolate(impact, [0, 18], [1, 0])}
        >
          <div
            style={{
              width: 120 + impact * 22,
              height: 120 + impact * 22,
              borderRadius: "50%",
              border: `8px solid ${palette.accent}`,
            }}
          />
        </At>
      ) : null}
      <At
        x={690}
        y={30}
        opacity={numbers}
        transform={`scale(${0.8 + 0.2 * numbers})`}
      >
        <Chip label="Splash" palette={palette} scale={0.75}>
          {`${params.damage} DMG`}
        </Chip>
      </At>
    </>
  );
};

// ---- the payoff: value climbs per completed reward, then fires ----

export const Scaling: React.FC<{
  t: number;
  params: Extract<PlayParams, { kind: "scaling" }>;
  palette: Palette;
  deck: BonusDeck;
}> = ({ t, params, palette, deck }) => {
  const c = PAYOFF_CUE;
  const steps = Array.from({ length: params.completed }, (_, i) => i);
  const climbed = steps.filter((i) => t >= c.climbFrom + i * c.climbGap).length;
  const value = params.base + climbed * params.per;
  const bump = steps.reduce(
    (sum, i) =>
      Math.max(
        sum,
        interpolate(
          t - (c.climbFrom + i * c.climbGap),
          [0, 2, 8],
          [0, 1, 0],
          clamp,
        ),
      ),
    0,
  );
  const final = pop(t, c.climbFrom + params.completed * c.climbGap, 8);
  const y = PAYOFF_TARGET_LOCAL.y;
  const xs = [100, 267, 434, 601, PAYOFF_TARGET_LOCAL.x];
  const beam = ramp(t, c.beamFrom, c.hit);
  const tip = interpolate(beam, [0, 1], [xs[0] + 66, xs[4] - 60]);
  const hitT = t - c.hit;
  const shake = interpolate(hitT, [0, 2, 14], [0, 1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translate(${Math.sin(hitT * 3.1) * 14 * shake}px, ${Math.cos(hitT * 2.3) * 9 * shake}px)`,
      }}
    >
      <At x={430} y={70} transform={`scale(${1 + 0.12 * bump + 0.1 * final})`}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "10px 40px",
            borderRadius: 999,
            backgroundColor: alpha(palette.panel, 0.92),
            border: `4px solid ${mix(palette.inkDim, palette.accent, final)}`,
            boxShadow: `0 0 ${60 * final}px ${alpha(palette.accent, 0.7)}`,
          }}
        >
          <div
            style={{
              fontFamily: font.body,
              fontSize: 32,
              letterSpacing: 8,
              color: palette.inkDim,
            }}
          >
            ATTACK
          </div>
          <div
            style={{
              fontFamily: font.display,
              fontSize: 124,
              lineHeight: 1,
              color: palette.ink,
            }}
          >
            {value}
          </div>
        </div>
      </At>
      <At x={430} y={170} opacity={ramp(t, c.climbFrom - 6, c.climbFrom)}>
        <Label
          palette={palette}
        >{`+${params.per} for every completed adventure`}</Label>
      </At>
      {xs.map((x, index) =>
        index === 4 ? null : (
          <Space
            key={x}
            x={x}
            y={y}
            size={96}
            fill={SPACE_FILL}
            ring={SPACE_RING}
            lit={
              index === 0 ? 0 : interpolate(tip - x, [-40, 10], [0, 1], clamp)
            }
            litColour={palette.accent}
          />
        ),
      )}
      {params.ranged ? (
        <div
          style={{
            position: "absolute",
            left: xs[0] + 66,
            top: y - 9,
            width: Math.max(0, tip - xs[0] - 66),
            height: 18,
            borderRadius: 9,
            background: `linear-gradient(90deg, ${alpha("#fff3a0", 0.9)}, #ffe14a)`,
            boxShadow: `0 0 40px ${alpha("#ffe14a", 0.9)}`,
            opacity:
              beam > 0 && hitT < 10
                ? 1
                : interpolate(hitT, [10, 20], [1, 0], clamp) *
                  (beam > 0 ? 1 : 0),
          }}
        />
      ) : null}
      <At x={xs[0]} y={y - 6} z={3}>
        <Token src={deck.hero.portraitUrl} size={130} ring={palette.accent} />
      </At>
      <At x={xs[4]} y={y} z={3} transform={`scale(${1 + 0.25 * shake})`}>
        <div
          style={{
            width: 124,
            height: 124,
            borderRadius: "50%",
            border: `6px solid ${mix(palette.ink, "#ff5a6a", shake)}`,
            backgroundColor: "#160f1b",
            boxShadow: `0 0 ${70 * shake}px ${alpha("#ffe14a", 0.9)}`,
          }}
        />
      </At>
      {hitT >= 0 ? (
        <At
          x={xs[4] - 30}
          y={y + 120}
          z={5}
          opacity={pop(t, c.hit, 9)}
          transform={`scale(${interpolate(pop(t, c.hit, 9), [0, 1], [2, 1])}) rotate(-8deg)`}
        >
          <Popup colour="#ffe14a">RICOCHET!</Popup>
        </At>
      ) : null}
      {params.ranged ? (
        <At x={300} y={y + 110} opacity={ramp(t, c.beamFrom, c.beamFrom + 8)}>
          <Label palette={palette}>Fired from range</Label>
        </At>
      ) : null}
    </div>
  );
};

/** The stage under a played card's vignette. */
export const PlayStage: React.FC<{
  t: number;
  params: PlayParams;
  palette: Palette;
  deck: BonusDeck;
  opacity: number;
}> = ({ t, params, palette, deck, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: STAGE.x - STAGE.w / 2,
      top: STAGE.y - STAGE.h / 2,
      width: STAGE.w,
      height: STAGE.h,
      opacity,
    }}
  >
    {params.kind === "regroup" ? (
      <Regroup t={t} params={params} palette={palette} deck={deck} />
    ) : null}
    {params.kind === "splash" ? (
      <Splash t={t} params={params} palette={palette} deck={deck} />
    ) : null}
    {params.kind === "scaling" ? (
      <Scaling t={t} params={params} palette={palette} deck={deck} />
    ) : null}
  </div>
);
