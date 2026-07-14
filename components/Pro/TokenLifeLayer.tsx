/**
 * TokenLifeLayer — the per-token motion carrier for the `tokenLife` beta feature
 * (issue #320). Wraps a fighter token's inner content and gives it physical life:
 * discrete combat gestures (recoil / lunge / brace) via framer springs, and a
 * continuous ambient "breathing" via a CSS keyframe (GPU transform, cheap).
 *
 * Design (from the issue): gestures ride an INNER transform wrapper so they never
 * fight the token's own left/top move tween or its centering transform, both of
 * which stay on the outer MotionFlex. Two non-overlapping vocabularies:
 *   • idle  → ambient transform on the OUTER wrapper here (breathing / ready-bob /
 *             labored) — never touches box-shadow (the selection ring lives on the
 *             MotionFlex above and stays rock-steady).
 *   • event → discrete framer gesture on the INNER wrapper, which also carries the
 *             visible circle body (bg/border) so the whole token recoils as one.
 * The two nest, so a hit mid-breath composes naturally. K.O. (topple) is handled
 * separately by ProBoard as an overlay ghost — a defeated fighter has already left
 * the board's token list, so it can't animate here.
 *
 * prefers-reduced-motion: idle is dropped entirely and gestures soften to a short
 * recoil/brace (no shake, no lunge). Hidden tab pauses the idle keyframe.
 */
import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { motion, useAnimationControls } from "framer-motion";
import { ReactNode, useEffect, useRef } from "react";
import { TokenGesture, HEAVY_HIT_THRESHOLD } from "@/lib/pro/tokenLife";

/** Ambient state for a resting token. `ready` is the selected/deciding fighter —
 *  a clear confident bob that reads as unmistakably different from idle breathing;
 *  `labored` is heavy near-death breathing; `none` suppresses ambient motion. */
export type TokenIdle = "breathing" | "ready" | "labored" | "none";

/** All amplitudes/durations in one place so the feel is tunable from a single
 *  spot (translations are % of the token's own size; angles in deg; times in s). */
export const TOKEN_LIFE_TUNING = {
  recoil: { base: 13, perDamage: 5, max: 32, dur: 0.34 },
  shake: { dur: 0.5 },
  lunge: { dist: 40, dur: 0.32 },
  brace: { squash: 0.84, dur: 0.42 },
  land: { squash: 0.86, dur: 0.4 },
  flinch: { dur: 0.36 },
  reducedScale: 0.4,
  idle: {
    breatheDur: 3.4,
    laboredDur: 4.9,
    readyDur: 1.15,
  },
} as const;

const breathe = keyframes`
  0%, 100% { transform: translateY(0) scale(1) rotate(0deg); }
  50%      { transform: translateY(-2%) scale(1.015) rotate(0.5deg); }
`;
const laboredBreathe = keyframes`
  0%, 100% { transform: translateY(0.6%) scale(0.985) rotate(-0.4deg); }
  50%      { transform: translateY(-1.4%) scale(1.02) rotate(0.4deg); }
`;
const readyBob = keyframes`
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-9%) scale(1.03); }
`;

const IDLE_KEYFRAME: Record<Exclude<TokenIdle, "none">, ReturnType<typeof keyframes>> = {
  breathing: breathe,
  labored: laboredBreathe,
  ready: readyBob,
};
const IDLE_DUR: Record<Exclude<TokenIdle, "none">, number> = {
  breathing: TOKEN_LIFE_TUNING.idle.breatheDur,
  labored: TOKEN_LIFE_TUNING.idle.laboredDur,
  ready: TOKEN_LIFE_TUNING.idle.readyDur,
};

/** Small deterministic hash of the fighter id → a stable 0..1 phase seed, so every
 *  token starts its breathing cycle at a different point and the board never pulses
 *  in unison (and the same token is stable across re-renders). */
export const phaseSeed = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
};

interface TokenLifeLayerProps {
  gesture?: TokenGesture;
  idle: TokenIdle;
  reduced: boolean;
  /** tab hidden — pause the continuous idle keyframe (no point painting it) */
  paused: boolean;
  /** currently tweening a board move — suppress idle, and land-squash on settle */
  moving: boolean;
  seed: number;
  /** the visible circle body, moved onto the inner wrapper so it recoils as one */
  body: { bg: string; border: string; opacity: number };
  children: ReactNode;
}

/**
 * Idle rides the OUTER wrapper (CSS keyframe), the visible body + discrete
 * gestures ride the INNER wrapper (framer). They nest so a gesture composes on
 * top of breathing.
 */
export const TokenLifeLayer = ({
  gesture,
  idle,
  reduced,
  paused,
  moving,
  seed,
  body,
  children,
}: TokenLifeLayerProps) => {
  const controls = useAnimationControls();
  const lastKeyRef = useRef<number | null>(null);
  const wasMovingRef = useRef(moving);

  // Discrete gesture: re-fires whenever the gesture key changes.
  useEffect(() => {
    if (!gesture || gesture.key === lastKeyRef.current) return;
    lastKeyRef.current = gesture.key;
    const T = TOKEN_LIFE_TUNING;
    const scale = reduced ? T.reducedScale : 1;
    const len = Math.hypot(gesture.dx, gesture.dy);

    if (gesture.kind === "recoil") {
      const amp = Math.min(T.recoil.base + gesture.amount * T.recoil.perDamage, T.recoil.max) * scale;
      const heavy = gesture.amount >= HEAVY_HIT_THRESHOLD && !reduced;
      if (len < 1e-3) {
        // Non-combat (effect/exhaustion) damage: no axis → an in-place flinch.
        void controls.start({
          scale: heavy ? [1, 0.84, 1.06, 0.97, 1] : [1, 0.88, 1.04, 1],
          transition: { duration: heavy ? T.shake.dur : T.flinch.dur, ease: "easeOut" },
        });
        return;
      }
      const kx = gesture.dx * amp;
      const ky = gesture.dy * amp;
      void controls.start(
        heavy
          ? {
              x: ["0%", `${kx}%`, `${-kx * 0.22}%`, `${kx * 0.1}%`, "0%"],
              y: ["0%", `${ky}%`, `${-ky * 0.22}%`, `${ky * 0.1}%`, "0%"],
              transition: { duration: T.shake.dur, ease: "easeOut" },
            }
          : {
              x: ["0%", `${kx}%`, "0%"],
              y: ["0%", `${ky}%`, "0%"],
              transition: { duration: T.recoil.dur, times: [0, 0.35, 1], ease: "easeOut" },
            }
      );
    } else if (gesture.kind === "lunge") {
      if (reduced || len < 1e-3) return; // recoil-only under reduced motion
      const kx = gesture.dx * T.lunge.dist;
      const ky = gesture.dy * T.lunge.dist;
      void controls.start({
        x: ["0%", `${kx}%`, "0%"],
        y: ["0%", `${ky}%`, "0%"],
        transition: { duration: T.lunge.dur, times: [0, 0.4, 1], ease: "easeOut" },
      });
    } else if (gesture.kind === "brace") {
      const squash = reduced ? 1 - (1 - T.brace.squash) * T.reducedScale : T.brace.squash;
      void controls.start({
        scaleX: [1, 1 + (1 - squash) * 0.8, 0.98, 1],
        scaleY: [1, squash, 1.03, 1],
        transition: { duration: T.brace.dur, ease: "easeOut" },
      });
    }
    // "topple" never reaches here — a defeated fighter is rendered as ProBoard's
    // KO ghost overlay, not through this layer.
  }, [gesture, reduced, controls]);

  // Landing squash when a move tween settles (moving true → false).
  useEffect(() => {
    const was = wasMovingRef.current;
    wasMovingRef.current = moving;
    if (was && !moving && !reduced) {
      const T = TOKEN_LIFE_TUNING.land;
      void controls.start({
        scaleX: [1, 1.12, 0.98, 1],
        scaleY: [1, T.squash, 1.02, 1],
        transition: { duration: T.dur, ease: "easeOut" },
      });
    }
  }, [moving, reduced, controls]);

  const idleActive = !reduced && !moving && idle !== "none";
  // The idle keyframe rides a Chakra Box (NOT a raw inline style) so emotion
  // actually injects the @keyframes rule — a keyframes ref in a plain React
  // `style` attribute never gets registered and would silently no-op.
  const dur = IDLE_DUR[idle === "none" ? "breathing" : idle] * (0.9 + seed * 0.2);
  const idleAnimation = idleActive
    ? `${IDLE_KEYFRAME[idle as Exclude<TokenIdle, "none">]} ${dur}s ease-in-out infinite`
    : undefined;

  return (
    <Box
      w="100%"
      h="100%"
      position="relative"
      display="flex"
      alignItems="center"
      justifyContent="center"
      animation={idleAnimation}
      sx={
        idleActive
          ? {
              // negative delay offsets each token's phase so the board never pulses together
              animationDelay: `${-seed * IDLE_DUR[idle as Exclude<TokenIdle, "none">]}s`,
              animationPlayState: paused ? "paused" : "running",
              willChange: "transform",
            }
          : undefined
      }
    >
      <motion.div
        animate={controls}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          borderRadius: "50%",
          background: body.bg,
          border: body.border,
          opacity: body.opacity,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          willChange: "transform",
        }}
      >
        {children}
      </motion.div>
    </Box>
  );
};
