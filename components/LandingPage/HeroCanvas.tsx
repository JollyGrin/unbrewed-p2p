import { useEffect, useRef } from "react";
import { Box } from "@chakra-ui/react";

/**
 * The hero's faint node map: Unmatched-style spaces drifting and linking behind
 * the headline. Decorative only (aria-hidden, no pointer events). Under
 * prefers-reduced-motion it draws one still frame and never animates; it also
 * stops its loop while the hero is scrolled out of view.
 */
export const HeroCanvas = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx || typeof window.matchMedia !== "function") return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    type Node = { x: number; y: number; vx: number; vy: number; r: number; ph: number };
    let nodes: Node[] = [];
    let w = 0;
    let h = 0;
    let frame = 0;
    let visible = true;

    const size = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      w = canvas.width = Math.floor(rect.width);
      h = canvas.height = Math.floor(rect.height);
      nodes = Array.from({ length: Math.max(14, Math.floor(w / 70)) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: 10 + Math.random() * 16,
        ph: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < 150) {
            ctx.strokeStyle = `rgba(231,204,152,${0.22 * (1 - d / 150)})`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        const pulse = 0.5 + 0.5 * Math.sin(t / 1800 + n.ph);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(231,204,152,${0.05 + 0.06 * pulse})`;
        ctx.fill();
        ctx.strokeStyle = "rgba(231,204,152,.28)";
        ctx.stroke();
        if (!reduce) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }
      }
      if (!reduce && visible) frame = window.requestAnimationFrame(draw);
    };

    size();
    draw(0);

    const onResize = () => {
      size();
      if (reduce) draw(0);
    };
    window.addEventListener("resize", onResize);

    let observer: IntersectionObserver | undefined;
    if (!reduce && typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(([entry]) => {
        const was = visible;
        visible = entry.isIntersecting;
        if (visible && !was) frame = window.requestAnimationFrame(draw);
      });
      observer.observe(canvas);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, []);

  return (
    <Box
      as="canvas"
      ref={ref}
      aria-hidden="true"
      position="absolute"
      inset="0"
      w="100%"
      h="100%"
      pointerEvents="none"
      opacity={0.5}
    />
  );
};
