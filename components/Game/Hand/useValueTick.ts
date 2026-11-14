import { useEffect, useRef } from "react";
import { colors } from "@/styles/style";
import { motionAllowed } from "./fanMotion";

/** A number ticking over, ms. */
export const TICK_MS = 260;
/** A pile button acknowledging a card, ms. */
export const PULSE_MS = 200;

export type TickStyle = {
  /**
   * "roll": the number comes in from below when it went up, from above when
   * it went down. "pulse": the element swells once, whichever way it changed.
   */
  kind?: "roll" | "pulse";
  /** Flash green on a gain and red on a loss (health). */
  tone?: boolean;
};

/** Keyframes for a value that changed from `prev` to `next`; null = no tick. */
export const tickKeyframes = (
  prev: number | undefined,
  next: number | undefined,
  { kind = "roll", tone = false }: TickStyle = {},
): Keyframe[] | null => {
  if (typeof prev !== "number" || typeof next !== "number") return null;
  if (prev === next || Number.isNaN(prev) || Number.isNaN(next)) return null;
  if (kind === "pulse")
    return [
      { transform: "scale(1)" },
      { transform: "scale(1.07)", offset: 0.4 },
      { transform: "scale(1)" },
    ];
  const up = next > prev;
  const flash = tone
    ? { color: up ? colors.brand.positive : colors.brand.danger }
    : {};
  return [
    {
      transform: `translateY(${up ? 40 : -40}%) scale(1.3)`,
      opacity: 0.4,
      ...flash,
    },
    { opacity: 1, ...flash, offset: 0.45 },
    { transform: "translateY(0) scale(1)", opacity: 1 },
  ];
};

/**
 * Ref for an element that should tick when `value` changes. The value itself
 * is rendered at once; this only plays a short compositor animation over it,
 * which a newer change replaces. Never plays on mount, so a HUD that appears
 * with a whole game's worth of numbers stays still.
 */
export const useValueTick = <T extends HTMLElement>(
  value: number | undefined,
  style: TickStyle = {},
) => {
  const ref = useRef<T | null>(null);
  const prev = useRef(value);
  const running = useRef<Animation | null>(null);
  const { kind, tone } = style;
  useEffect(() => {
    const was = prev.current;
    prev.current = value;
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || !motionAllowed()) return;
    const frames = tickKeyframes(was, value, { kind, tone });
    if (!frames) return;
    running.current?.cancel();
    running.current = el.animate(frames, {
      duration: kind === "pulse" ? PULSE_MS : TICK_MS,
      easing: "cubic-bezier(0.2, 0.8, 0.3, 1)",
    });
  }, [value, kind, tone]);
  useEffect(() => () => running.current?.cancel(), []);
  return ref;
};
