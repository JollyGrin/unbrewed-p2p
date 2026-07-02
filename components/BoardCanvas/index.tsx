import { Box } from "@chakra-ui/react";
import { RefObject, useEffect, useRef, useState } from "react";
import { PositionType } from "../Positions/position.type";
import { useCanvas } from "./useCanvas";

const defaultData: PositionType[] = [
  { id: "hero", x: 25, y: 25, r: 10 },
  { id: "sidekick", x: 75, y: 25, r: 10 },
];

type BoardProps = {
  src: string;
  data?: PositionType[];
  move?: (e: PositionType) => void;
  self?: string;
};
export const BoardCanvas: React.FC<BoardProps> = ({
  src = "jpark.svg",
  data = defaultData,
  move,
  self,
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
    data: data.map((dataPoint) => [...flattenWithSidekicks(dataPoint)]).flat(),
    move,
    self,
    size,
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

function flattenWithSidekicks(object: PositionType) {
  const flattened: PositionType[] = [];

  function flatten(obj: PositionType) {
    flattened.push({
      ...obj,
      sidekicks: undefined, // Remove sidekicks property
    });

    if (obj.sidekicks) {
      for (const sidekick of obj.sidekicks) {
        flatten(sidekick); // Flatten sidekicks recursively
      }
    }
  }

  flatten(object);
  return flattened;
}
