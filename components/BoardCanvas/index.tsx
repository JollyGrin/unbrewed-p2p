import { Box } from "@chakra-ui/react";
import { RefObject, useRef, useState } from "react";
import { RepeatIcon } from "@chakra-ui/icons";
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

  // HACK: toggle boolean to trigger useEffect
  const [updateCanvas, setUpdateCanvas] = useState<boolean>(false);
  useCanvas({
    gRef,
    canvasRef,
    parentRef,
    data: data.map((dataPoint) => [...flattenWithSidekicks(dataPoint)]).flat(),
    move,
    self,
    updateCanvas,
  });

  return (
    <Box h="100%" w="100%" ref={parentRef}>
      <Refresh
        onClick={() => {
          setUpdateCanvas(!updateCanvas);
        }}
      />
      <svg
        ref={canvasRef}
        style={{
          borderBottom: "1px solid rgba(0,0,0,0.25)",
          margin: "0 auto",
          boxShadow: "0 10px 20px rgba(0,0,0,0.4)",
          backgroundColor: "ghostwhite",
        }}
      >
        <image xlinkHref={src} width={1200} height={1000} x={1} y={1} />
      </svg>
    </Box>
  );
};

const Refresh = (props: { onClick: () => void }) => (
  <RepeatIcon
    position={"absolute"}
    right={0}
    h="20px"
    w="20px"
    cursor="pointer"
    onClick={props.onClick}
    transition="all 0.25s ease-in-out"
    _hover={{
      transform: "rotate(60deg)",
    }}
    _active={{
      transform: "rotate(-90deg)",
    }}
  />
);

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
