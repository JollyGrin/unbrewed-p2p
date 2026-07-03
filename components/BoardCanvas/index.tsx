import { Box } from "@chakra-ui/react";
import { MutableRefObject, RefObject, useEffect, useRef, useState } from "react";
import { OwnedToken } from "../Positions/position.type";
import { useCanvas } from "./useCanvas";

type BoardProps = {
  src: string;
  tokens: OwnedToken[];
  self?: string;
  move?: (t: OwnedToken) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onCounterAdjust?: (t: OwnedToken, delta: number) => void;
  onCardPeek?: (t: OwnedToken | null, rect?: DOMRect) => void;
  onForeignCardClick?: (t: OwnedToken) => void;
  iconSvg: (
    name: string,
    opts: { color?: string; size: number; cutout?: boolean; maskId?: string },
  ) => string | null;
  centerRef?: MutableRefObject<() => { x: number; y: number }>;
  screenToBoardRef?: MutableRefObject<
    (sx: number, sy: number) => { x: number; y: number }
  >;
};

export const BoardCanvas: React.FC<BoardProps> = ({
  src = "jpark.svg",
  tokens,
  move,
  self,
  selectedId,
  onSelect,
  onCounterAdjust,
  onCardPeek,
  onForeignCardClick,
  iconSvg,
  centerRef,
  screenToBoardRef,
}) => {
  const parentRef: RefObject<any> = useRef();
  const canvasRef: RefObject<SVGSVGElement> = useRef(null);
  const gRef = useRef<SVGGElement | null>(null);

  // Track the parent size so the svg resizes with the window/layout
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useCanvas({
    gRef,
    canvasRef,
    parentRef,
    tokens,
    move,
    self,
    size,
    selectedId,
    onSelect,
    onCounterAdjust,
    onCardPeek,
    onForeignCardClick,
    iconSvg,
    centerRef,
    screenToBoardRef,
  });

  return (
    <Box h="100%" w="100%" ref={parentRef}>
      <svg ref={canvasRef} style={{ margin: "0 auto", display: "block" }}>
        <image
          className="background"
          xlinkHref={src}
          width={1200}
          height={1000}
          x={1}
          y={1}
          style={{ filter: "drop-shadow(0 12px 28px rgba(0, 0, 0, 0.45))" }}
        />
      </svg>
    </Box>
  );
};
