import { PointerEvent, ReactNode, useRef } from "react";
import { Box, BoxProps } from "@chakra-ui/react";

/** Pure maths of the tilt, exported for tests. `px`/`py` are the pointer's
 * position inside the box as 0..1 fractions (0,0 = top-left). */
export const tiltAngles = (px: number, py: number, maxTilt: number) => {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return {
    // pointer below centre -> top edge tips toward the viewer (positive rotateX is away, so negate)
    rx: -(clamp(py) - 0.5) * 2 * maxTilt,
    ry: (clamp(px) - 0.5) * 2 * maxTilt,
  };
};

export type CardTiltProps = Omit<BoxProps, "children"> & {
  children: ReactNode;
  /** rotate toward the cursor (default on) */
  tilt?: boolean;
  /** scale on hover: 1 disables zoom (tilt-only) */
  zoom?: number;
  /** radial glare following the cursor (default on) */
  glare?: boolean;
  /** max degrees per axis */
  maxTilt?: number;
  /** CSS perspective distance in px */
  perspective?: number;
};

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Cursor-following tilt + zoom wrapper around any card. Purely a
 * transform/shadow layer: the child renders untouched. The scale is small
 * (default 1.08) so the card stays within a few px of its own cell — unlike a
 * big scale(), it never extends the scroll container's overflow, so give the
 * grid a little padding rather than relying on clipping.
 *
 * Quick in, slow out: the base transition is long (leave), `:hover` swaps in a
 * short one with a slight overshoot. Under `prefers-reduced-motion` there is no
 * tilt or zoom, only a ring/shadow.
 */
export const CardTilt = ({
  children,
  tilt = true,
  zoom = 1.08,
  glare = true,
  maxTilt = 10,
  perspective = 900,
  onPointerMove,
  onPointerLeave,
  ...rest
}: CardTiltProps) => {
  const ref = useRef<HTMLDivElement>(null);

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    const el = ref.current;
    if (!el || event.pointerType === "touch" || reducedMotion()) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    if (tilt) {
      const { rx, ry } = tiltAngles(px, py, maxTilt);
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    }
    el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
  };

  const handleLeave = (event: PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(event);
    reset();
  };

  return (
    <Box
      ref={ref}
      data-card-tilt=""
      position="relative"
      borderRadius="0.4rem"
      zIndex={0}
      sx={{
        "--rx": "0deg",
        "--ry": "0deg",
        "--s": "1",
        "--gx": "50%",
        "--gy": "50%",
        transform: `perspective(${perspective}px) rotateX(var(--rx)) rotateY(var(--ry)) scale(var(--s))`,
        transition: "transform .55s cubic-bezier(.2,.8,.2,1), box-shadow .55s ease",
        willChange: "transform",
        "&:hover": {
          "--s": String(zoom),
          zIndex: 10,
          boxShadow: "0 10px 24px rgba(20, 8, 24, 0.45)",
          transition: "transform .12s cubic-bezier(.2,.9,.3,1.2), box-shadow .12s ease",
        },
        "&:hover [data-card-tilt-glare]": { opacity: 1 },
        "@media (prefers-reduced-motion: reduce)": {
          transition: "box-shadow .15s ease",
          "&:hover": {
            "--s": "1",
            transition: "box-shadow .15s ease",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.6), 0 6px 16px rgba(20, 8, 24, 0.4)",
          },
          "[data-card-tilt-glare]": { display: "none" },
        },
      }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      {...rest}
    >
      {children}
      {glare && (
        <Box
          data-card-tilt-glare=""
          aria-hidden
          position="absolute"
          inset={0}
          borderRadius="inherit"
          pointerEvents="none"
          opacity={0}
          transition="opacity .3s ease"
          background="radial-gradient(circle at var(--gx) var(--gy), rgba(255,255,255,0.28), rgba(255,255,255,0) 55%)"
        />
      )}
    </Box>
  );
};
