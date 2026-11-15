import { Img, interpolate, spring } from "remotion";
import { font } from "../theme";
import { alpha, mix, type Palette } from "../shared/color";
import type { BonusDeck } from "../shared/deck";
import { type EffectParams, VIGNETTE } from "./effects";
import { STAGE } from "./layout";
import { Chip, clamp, EASE, Space, Token } from "./ui";

/**
 * One animated picture per reward mechanic, drawn on the stage right of the
 * flipped card. `t` counts frames from the vignette's start (`CUE.effect`);
 * every number on screen comes from `EffectParams`, which were read out of the
 * deck JSON. Coordinates are stage-local: 0..STAGE.w × 0..STAGE.h.
 */

type VignetteProps<K extends EffectParams["kind"]> = {
  t: number;
  params: Extract<EffectParams, { kind: K }>;
  palette: Palette;
  deck: BonusDeck;
  stripes: [string, string];
};

const FPS = 30;
const pop = (t: number, at: number, damping = 12) =>
  spring({ frame: t - at, fps: FPS, config: { damping, stiffness: 180 } });
const ramp = (t: number, from: number, to: number) =>
  interpolate(t, [from, to], [0, 1], { ...clamp, easing: EASE });

const SPACE_FILL = "#2a1d33";
const SPACE_RING = "#5b4766";

/** Centres a child on a stage-local point. */
const At: React.FC<{
  x: number;
  y: number;
  z?: number;
  transform?: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({ x, y, z, transform, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      zIndex: z,
      opacity,
      transform: `translate(-50%, -50%) ${transform ?? ""}`,
    }}
  >
    {children}
  </div>
);

const Caption: React.FC<{ palette: Palette; children: React.ReactNode }> = ({
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

// ---- Reward 1: the hero turns ranged ----

const Reach: React.FC<VignetteProps<"reach">> = ({
  t,
  params,
  palette,
  deck,
}) => {
  const v = VIGNETTE.reach;
  const y = 300;
  const xs = [100, 265, 430, 595, 760];
  const reach = ramp(t, v.lineFrom, v.lineTo);
  const tip = interpolate(reach, [0, 1], [xs[0] + 70, xs[4] - 66]);
  const hit = pop(t, v.lineTo, 8);
  const ranged = pop(t, v.ranged);
  return (
    <>
      {xs.map((x, index) => (
        <Space
          key={x}
          x={x}
          y={y}
          size={104}
          fill={SPACE_FILL}
          ring={SPACE_RING}
          lit={index === 0 ? 0 : interpolate(tip - x, [-40, 10], [0, 1], clamp)}
          litColour={palette.accent}
        />
      ))}
      {/* the reach line: a dashed beam that grows from her to the target */}
      <div
        style={{
          position: "absolute",
          left: xs[0] + 70,
          top: y - 7,
          width: Math.max(0, tip - xs[0] - 70),
          height: 14,
          borderRadius: 7,
          background: `repeating-linear-gradient(90deg, ${palette.accent} 0 34px, ${alpha(
            palette.accent,
            0,
          )} 34px 50px)`,
          boxShadow: `0 0 26px ${alpha(palette.accent, 0.8)}`,
          opacity: reach > 0 ? 1 : 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: tip - 4,
          top: y - 22,
          width: 0,
          height: 0,
          borderTop: "22px solid transparent",
          borderBottom: "22px solid transparent",
          borderLeft: `34px solid ${palette.accent}`,
          opacity: reach > 0 && reach < 1 ? 1 : 0,
        }}
      />
      <At x={xs[0]} y={y - 6} z={2}>
        <Token src={deck.hero.portraitUrl} size={136} ring={palette.accent} />
      </At>
      {/* an opposing fighter, four spaces off — a target, not a named hero */}
      <At
        x={xs[4]}
        y={y}
        z={2}
        transform={`scale(${1 + 0.18 * hit * (1 - ramp(t, v.lineTo + 6, v.lineTo + 16))})`}
      >
        <div
          style={{
            position: "relative",
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: `6px solid ${mix(palette.ink, "#000000", 0.2)}`,
            backgroundColor: "#160f1b",
            boxShadow: `0 0 ${40 * hit}px ${alpha(palette.accent, 0.9)}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 54,
              top: 12,
              width: 6,
              height: 84,
              backgroundColor: alpha(palette.ink, 0.7),
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 54,
              left: 12,
              height: 6,
              width: 84,
              backgroundColor: alpha(palette.ink, 0.7),
            }}
          />
        </div>
      </At>
      <At x={430} y={96} transform={`scale(${0.8 + 0.2 * ranged})`}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div
            style={{
              fontFamily: font.display,
              fontSize: 56,
              color: palette.inkDim,
              textDecoration: ranged > 0.5 ? "line-through" : "none",
              opacity: interpolate(ranged, [0, 1], [1, 0.55]),
            }}
          >
            {params.wasRanged ? "RANGED" : "MELEE"}
          </div>
          <div
            style={{
              fontFamily: font.display,
              fontSize: 56,
              color: palette.inkDim,
              opacity: ranged,
            }}
          >
            →
          </div>
          <div style={{ opacity: ranged }}>
            <Chip label={params.hero} palette={palette}>
              RANGED
            </Chip>
          </div>
        </div>
      </At>
      <At x={430} y={420} opacity={ranged}>
        <Caption palette={palette}>Attacks from across the board</Caption>
      </At>
    </>
  );
};

// ---- Reward 2: cards torn out of an opponent's discard pile ----

const PILE = 6;
const DCARD = { w: 150, h: 210 };

const DiscardCard: React.FC<{ clip?: "left" | "right" }> = ({ clip }) => (
  <div
    style={{
      width: DCARD.w,
      height: DCARD.h,
      borderRadius: 12,
      border: "5px solid #d9d0c4",
      background:
        "repeating-linear-gradient(135deg, #4a4150 0 14px, #3b3342 14px 28px)",
      boxShadow: `0 10px 22px ${alpha("#000000", 0.45)}`,
      clipPath:
        clip === "left"
          ? "polygon(0 0, 54% 0, 44% 22%, 56% 46%, 42% 70%, 52% 100%, 0 100%)"
          : clip === "right"
            ? "polygon(54% 0, 100% 0, 100% 100%, 52% 100%, 42% 70%, 56% 46%, 44% 22%)"
            : undefined,
    }}
  />
);

const Exile: React.FC<VignetteProps<"exile">> = ({ t, params, palette }) => {
  const v = VIGNETTE.exile;
  const pile = { x: 190, y: 270 };
  const tearAt = { x: 520, y: 200 };
  const torn = Array.from({ length: params.count }, (_, index) => {
    const u = t - (v.first + index * v.gap);
    return { index, u };
  });
  const tornSoFar = torn.filter(({ u }) => u >= v.lift).length;
  const lifted = torn.filter(({ u }) => u >= 0).length;
  const counter = pop(t, v.first + v.lift, 10);
  return (
    <>
      {/* what is left of the pile — the top cards leave it one by one */}
      {Array.from({ length: PILE - lifted }, (_, index) => (
        <At
          key={index}
          x={pile.x - index * 3}
          y={pile.y + index * 4}
          z={PILE - index}
        >
          <DiscardCard />
        </At>
      ))}
      <At x={pile.x} y={pile.y + 158}>
        <Caption palette={palette}>Opponent&apos;s discard</Caption>
      </At>

      {torn.map(({ index, u }) => {
        if (u < 0 || u > v.lift + v.tear) return null;
        if (u < v.lift) {
          const k = ramp(u, 0, v.lift);
          return (
            <At
              key={index}
              x={interpolate(k, [0, 1], [pile.x, tearAt.x])}
              y={
                interpolate(k, [0, 1], [pile.y, tearAt.y]) -
                Math.sin(Math.PI * k) * 60
              }
              z={20}
              transform={`rotate(${interpolate(k, [0, 1], [0, -8])}deg) scale(${interpolate(k, [0, 1], [1, 1.1])})`}
            >
              <DiscardCard />
            </At>
          );
        }
        // torn in two: the halves fall apart and burn out
        const w = u - v.lift;
        const fade = interpolate(w, [0, v.tear], [1, 0], clamp);
        return [-1, 1].map((side) => (
          <At
            key={`${index}-${side}`}
            x={tearAt.x + side * w * 7}
            y={tearAt.y + w * w * 0.9}
            z={20}
            opacity={fade}
            transform={`rotate(${-8 + side * w * 2.4}deg) scale(1.1)`}
          >
            <DiscardCard clip={side < 0 ? "left" : "right"} />
          </At>
        ));
      })}
      {/* the rip: a flash where each card splits */}
      {torn.map(({ index, u }) => {
        const flash = interpolate(u - v.lift, [0, 2, 9], [0, 1, 0], clamp);
        if (flash <= 0) return null;
        return (
          <At
            key={`flash-${index}`}
            x={tearAt.x}
            y={tearAt.y}
            z={30}
            opacity={flash}
          >
            <div
              style={{
                width: 260,
                height: 260,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${alpha("#ffffff", 0.9)} 0%, ${alpha(
                  palette.accent,
                  0.5,
                )} 30%, ${alpha(palette.accent, 0)} 68%)`,
              }}
            />
          </At>
        );
      })}

      <At
        x={660}
        y={400}
        transform={`scale(${0.85 + 0.15 * counter})`}
        opacity={counter}
      >
        <Chip label="Exiled" palette={palette}>
          {`${tornSoFar}/${params.count}`}
        </Chip>
      </At>
    </>
  );
};

// ---- Reward 3: the sidekick revives in a burst ----

const Revive: React.FC<VignetteProps<"revive">> = ({
  t,
  params,
  palette,
  deck,
}) => {
  const v = VIGNETTE.revive;
  const centre = { x: 430, y: 200 };
  const charge = ramp(t, 0, v.burst);
  const burst = t - v.burst;
  const back = pop(t, v.burst, 9);
  const grey = interpolate(burst, [0, 6], [1, 0], clamp);
  const pips = Array.from({ length: params.maxHealth }, (_, index) =>
    ramp(t, v.pipsFrom + index * v.pipGap, v.pipsFrom + index * v.pipGap + 4),
  );
  const filled = (index: number) => (index < params.health ? pips[index] : 0);
  const label = pop(t, v.burst + 4);
  return (
    <>
      {/* gathering light before the burst */}
      {burst < 0 ? (
        <At x={centre.x} y={centre.y} opacity={charge}>
          <div
            style={{
              width: 200 + 260 * (1 - charge),
              height: 200 + 260 * (1 - charge),
              borderRadius: "50%",
              border: `6px solid ${alpha(palette.accent, 0.8)}`,
              boxShadow: `0 0 40px ${alpha(palette.accent, 0.6)}`,
            }}
          />
        </At>
      ) : null}
      {/* the burst: a ring and a spray of rays */}
      {burst >= 0 && burst < 22 ? (
        <>
          <At
            x={centre.x}
            y={centre.y}
            opacity={interpolate(burst, [0, 22], [1, 0])}
          >
            <div
              style={{
                width: 220 + burst * 26,
                height: 220 + burst * 26,
                borderRadius: "50%",
                border: `${10 - burst * 0.4}px solid ${palette.accent}`,
                boxShadow: `0 0 50px ${alpha(palette.accent, 0.8)}`,
              }}
            />
          </At>
          {Array.from({ length: 12 }, (_, index) => {
            const angle = (index / 12) * 360;
            return (
              <At
                key={index}
                x={centre.x}
                y={centre.y}
                opacity={interpolate(burst, [0, 4, 18], [0, 1, 0], clamp)}
                transform={`rotate(${angle}deg) translateX(${130 + burst * 9}px)`}
              >
                <div
                  style={{
                    width: 70,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: index % 2 ? "#ffffff" : palette.accent,
                  }}
                />
              </At>
            );
          })}
        </>
      ) : null}
      <At
        x={centre.x}
        y={centre.y}
        z={2}
        transform={`scale(${burst < 0 ? 0.86 : interpolate(back, [0, 1], [0.86, 1])})`}
      >
        <Token
          src={deck.sidekick?.portraitUrl}
          size={210}
          ring={burst < 0 ? "#555" : palette.accent}
          grey={grey}
        />
      </At>
      {/* defeated marker, gone the instant the burst hits */}
      {burst < 0 ? (
        <At x={centre.x} y={centre.y + 140}>
          <Caption palette={palette}>Defeated</Caption>
        </At>
      ) : null}

      {/* health refills to the reward's number, out of the sidekick's own max */}
      <At x={centre.x} y={395}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {pips.map((_, index) => (
            <div
              key={index}
              style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                border: `3px solid ${alpha(palette.ink, 0.35)}`,
                backgroundColor: mix("#2a1d33", "#e2364b", filled(index)),
                transform: `scale(${1 + 0.25 * Math.sin(Math.PI * filled(index))})`,
              }}
            />
          ))}
          <div
            style={{
              marginLeft: 16,
              fontFamily: font.display,
              fontSize: 60,
              color: palette.ink,
            }}
          >
            {`${pips.filter((fill, index) => index < params.health && fill >= 0.5).length}/${params.maxHealth}`}
          </div>
        </div>
      </At>
      <At
        x={660}
        y={86}
        opacity={label}
        transform={`scale(${0.8 + 0.2 * label}) rotate(4deg)`}
      >
        <div
          style={{
            fontFamily: font.display,
            fontSize: 74,
            letterSpacing: 3,
            whiteSpace: "nowrap",
            color: palette.ink,
            textShadow: `0 0 26px ${alpha(palette.accent, 0.8)}`,
          }}
        >
          {`${params.fighter} IS BACK`}
        </div>
      </At>
    </>
  );
};

// ---- Reward 4: the move value ticks up ----

const Move: React.FC<VignetteProps<"move">> = ({
  t,
  params,
  palette,
  deck,
}) => {
  const v = VIGNETTE.move;
  const steps = Math.max(0, params.to - params.from);
  const values = Array.from(
    { length: steps + 1 },
    (_, index) => params.from + index,
  );
  // the ticker rolls one number per tickGap, each step on a spring
  const rolled = values.reduce(
    (sum, _, index) =>
      index === 0 ? 0 : sum + pop(t, v.tickFrom + index * v.tickGap, 14),
    0,
  );
  const landed = pop(t, v.tickFrom + steps * v.tickGap, 8);
  const row = Array.from({ length: params.to + 1 }, (_, index) => ({
    x: 90 + (index * 680) / params.to,
    y: 340,
  }));
  // which space she is on, fractionally, and how high she is mid-hop
  const hop = Math.max(0, Math.min(params.to, (t - v.hopFrom) / v.hopGap));
  const at = Math.floor(hop);
  const within = hop - at;
  const from = row[Math.min(at, params.to)];
  const to = row[Math.min(at + 1, params.to)];
  const px = interpolate(within, [0, 1], [from.x, to.x]);
  const py = from.y - 14 - Math.sin(Math.PI * within) * 80;
  const NUMBER_H = 120;
  return (
    <>
      <At x={430} y={110}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 26,
            padding: "14px 40px",
            borderRadius: 999,
            backgroundColor: alpha(palette.panel, 0.92),
            border: `4px solid ${mix(alpha(palette.ink, 0.3), palette.accent, landed)}`,
            boxShadow: `0 0 ${50 * landed}px ${alpha(palette.accent, 0.6)}, 0 12px 30px ${alpha("#000000", 0.4)}`,
          }}
        >
          <div
            style={{
              fontFamily: font.body,
              fontSize: 34,
              letterSpacing: 8,
              color: palette.inkDim,
            }}
          >
            {`${params.hero} MOVE`}
          </div>
          <div style={{ height: NUMBER_H, overflow: "hidden" }}>
            <div style={{ transform: `translateY(${-rolled * NUMBER_H}px)` }}>
              {values.map((value) => (
                <div
                  key={value}
                  style={{
                    height: NUMBER_H,
                    lineHeight: `${NUMBER_H}px`,
                    fontFamily: font.display,
                    fontSize: 118,
                    color: palette.ink,
                    textAlign: "center",
                  }}
                >
                  {value}
                </div>
              ))}
            </div>
          </div>
        </div>
      </At>
      {row.map((space, index) => (
        <Space
          key={index}
          x={space.x}
          y={space.y}
          size={92}
          fill={SPACE_FILL}
          ring={SPACE_RING}
          lit={
            index === 0
              ? 0
              : interpolate(
                  hop,
                  [index - 0.4, index, index + 1.2],
                  [0, 1, 0.45],
                  clamp,
                )
          }
          litColour={palette.accent}
        />
      ))}
      <At x={px} y={py} z={3}>
        <Token src={deck.hero.portraitUrl} size={112} ring={palette.accent} />
      </At>
      <At x={430} y={440} opacity={ramp(t, v.hopFrom, v.hopFrom + 8)}>
        <Caption palette={palette}>When no enemy shares her zone</Caption>
      </At>
    </>
  );
};

// ---- Reward 5: a blind boost slides under, then goes to the deck bottom ----

const Back: React.FC<{ src?: string; w: number; rotate?: number }> = ({
  src,
  w,
  rotate = 0,
}) => (
  <div
    style={{
      width: w,
      height: (w * 88) / 63,
      borderRadius: 12,
      overflow: "hidden",
      transform: `rotate(${rotate}deg)`,
      boxShadow: `0 10px 24px ${alpha("#000000", 0.5)}`,
      backgroundColor: "#311",
    }}
  >
    {src ? (
      <Img
        src={src}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    ) : null}
  </div>
);

const BlindBoost: React.FC<VignetteProps<"blindBoost">> = ({
  t,
  params,
  palette,
  deck,
}) => {
  const v = VIGNETTE.blindBoost;
  const W = 140;
  const attack = { x: 470, y: 250 };
  const deckAt = { x: 740, y: 250 };
  const under = { x: attack.x + 34, y: attack.y + 40 };
  const bottom = { x: deckAt.x, y: deckAt.y + 22 };
  const slideIn = ramp(t, 0, v.slideIn);
  const slideBack = ramp(t, v.slideBack, v.tucked);
  const boost =
    t < v.slideBack
      ? {
          x: interpolate(slideIn, [0, 1], [deckAt.x, under.x]),
          y:
            interpolate(slideIn, [0, 1], [deckAt.y - 16, under.y]) -
            Math.sin(Math.PI * slideIn) * 50,
          r: interpolate(slideIn, [0, 1], [0, 9]),
        }
      : {
          x: interpolate(slideBack, [0, 1], [under.x, bottom.x]),
          y:
            interpolate(slideBack, [0, 1], [under.y, bottom.y]) +
            Math.sin(Math.PI * slideBack) * 70,
          r: interpolate(slideBack, [0, 1], [9, 0]),
        };
  // it rides above the deck on the way out, BELOW it once it is home
  const boostZ = t >= v.slideBack + (v.tucked - v.slideBack) * 0.55 ? 1 : 6;
  const reveal = pop(t, v.reveal, 10);
  const gone = ramp(t, v.slideBack, v.slideBack + 6);
  const home = pop(t, v.tucked, 12);
  return (
    <>
      <At x={130} y={170} z={3}>
        <Token src={deck.hero.portraitUrl} size={128} ring={palette.accent} />
      </At>
      {params.sidekick ? (
        <>
          <At x={130} y={330} z={3}>
            <Token
              src={deck.sidekick?.portraitUrl}
              size={104}
              ring={palette.accent}
            />
          </At>
          <At x={130} y={250} z={2}>
            <div
              style={{
                width: 8,
                height: 50,
                borderRadius: 4,
                backgroundColor: palette.accent,
              }}
            />
          </At>
          <At x={130} y={420}>
            <Caption palette={palette}>Adjacent</Caption>
          </At>
        </>
      ) : null}

      {/* the draw pile, right; the boost leaves its top and comes home under it */}
      {[3, 2, 1, 0].map((index) => (
        <At
          key={index}
          x={deckAt.x - index * 3}
          y={deckAt.y + index * 4}
          z={2 + (3 - index)}
        >
          <Back src={deck.cardbackUrl} w={W} />
        </At>
      ))}
      <At x={boost.x} y={boost.y} z={boostZ}>
        <Back src={deck.cardbackUrl} w={W} rotate={boost.r} />
      </At>
      {/* the attack, face down — the boost tucks in under it */}
      <At x={attack.x} y={attack.y} z={5} transform="rotate(-4deg)">
        <Back src={deck.cardbackUrl} w={W + 10} />
      </At>
      <At
        x={attack.x}
        y={attack.y - 150}
        z={8}
        opacity={reveal * (1 - gone)}
        transform={`scale(${0.7 + 0.3 * reveal})`}
      >
        <Chip label="Blind boost" palette={palette} scale={0.8}>
          +?
        </Chip>
      </At>
      <At
        x={deckAt.x - 40}
        y={deckAt.y + 170}
        opacity={home}
        transform={`scale(${0.85 + 0.15 * home})`}
      >
        <Caption palette={palette}>Back to the bottom</Caption>
      </At>
      <At x={attack.x} y={attack.y + 170} opacity={reveal * (1 - gone)}>
        <Caption palette={palette}>{`${params.hero} attacks`}</Caption>
      </At>
    </>
  );
};

/** The stage itself: a soft spotlight pool with the vignette on top. */
export const Vignette: React.FC<{
  t: number;
  params: EffectParams;
  palette: Palette;
  deck: BonusDeck;
  stripes: [string, string];
  opacity: number;
}> = ({ t, params, palette, deck, stripes, opacity }) => {
  const common = { t, palette, deck, stripes };
  return (
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
      <div
        style={{
          position: "absolute",
          inset: -60,
          background: `radial-gradient(60% 55% at 50% 58%, ${alpha(
            mix(stripes[1], "#000000", 0.5),
            0.45,
          )} 0%, ${alpha("#000000", 0)} 100%)`,
        }}
      />
      {params.kind === "reach" ? <Reach {...common} params={params} /> : null}
      {params.kind === "exile" ? <Exile {...common} params={params} /> : null}
      {params.kind === "revive" ? <Revive {...common} params={params} /> : null}
      {params.kind === "move" ? <Move {...common} params={params} /> : null}
      {params.kind === "blindBoost" ? (
        <BlindBoost {...common} params={params} />
      ) : null}
    </div>
  );
};
