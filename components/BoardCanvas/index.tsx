//@ts-nocheck
import { Box } from "@chakra-ui/react";
import * as d3 from "d3";
import { RefObject, useEffect, useRef, useState } from "react";
import { RepeatIcon } from "@chakra-ui/icons";

export interface Circle {
  x: number;
  y: number;
  r: number;
  startX?: number;
  startY?: number;
  id?: string;
}
const defaultData: Circle[] = [
  { id: "hero", x: 200, y: 500, r: 10 },
  { id: "sidekick", x: 200, y: 300, r: 10 },
  { id: "enemey", x: 200, y: 400, r: 10 },
];

type BoardProps = {
  src: `${string}.svg`;
  data?: Circle[];
  move?: any;
};
export const BoardCanvas: React.FC<BoardProps> = ({
  src = "jpark.svg",
  data = defaultData,
  move,
}) => {
  const parentRef: RefObject<> = useRef();
  const canvasRef: RefObject<SVGSVGElement> = useRef(null);
  const gRef = useRef<SVGGElement | null>(null);
  const [w, setW] = useState<number>(100);
  const [h, setH] = useState<number>(100);

  const [updateCanvas, setUpdateCanvas] = useState<boolean>(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!window) return;
    if (!parentRef) return;

    const parent = parentRef.current;
    const width = parent.offsetWidth;
    const height = parent.offsetHeight;

    setW(width);
    setH(height);
    const canvas = d3
      .select<SVGSVGElement, Circle[]>(canvasRef.current)
      .attr("width", width)
      .attr("height", height);

    const radius = height * 0.022;

    if (!gRef.current) {
      gRef.current = canvas.append("g").attr("cursor", "grab").node();
    }
    const g = d3.select(gRef.current);

    // const data: Circle[] = [
    //   { x: 200, y: 500, r: 10 },
    //   { x: 200, y: 300, r: 10 },
    //   { x: 200, y: 400, r: 10 },
    // ];

    g.selectAll<SVGCircleElement, Circle>("circle")
      .data(data)
      .join("circle")
      .attr("cx", ({ x }) => x)
      .attr("cy", ({ y }) => y)
      .attr("r", radius)
      // .attr("fill", (d, i) => d3.interpolateRainbow(i / 360))
      .call(
        d3
          .drag<SVGCircleElement, Circle>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
          .touchable(true)
      );

    canvas.call(
      //@ts-ignore
      d3
        .zoom()
        .extent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent([1, 8])
        .on("zoom", ({ transform }) => {
          g.attr("transform", transform);
          canvas.select("image").attr("transform", transform);
        })
    );

    function dragstarted(e: { target: any }) {
      d3.select(e.target).raise();
      g.attr("cursor", "grabbing");
    }

    function dragged(event: DragEvent, d: any) {
      d3.select<SVGCircleElement, Circle>(this)
        .attr("cx", (d.x = event.x))
        .attr("cy", (d.y = event.y));

      move(
        data.map((circle) => {
          if (circle.id !== d.id) return circle;
          return {
            ...circle,
            x: event.x,
            y: event.y,
          };
        })
      );
    }

    function dragended() {
      g.attr("cursor", "grab");
    }
  }, [data, updateCanvas]);

  return (
    <Box h="100%" w="100%" ref={parentRef}>
      <RepeatIcon
        position={"absolute"}
        right={0}
        h="20px"
        w="20px"
        cursor="pointer"
        onClick={(e) => {
          e.preventDefault();
          setUpdateCanvas(!updateCanvas);
        }}
      />
      <svg
        ref={canvasRef}
        style={{
          borderBottom: "1px solid rgba(0,0,0,0.25)",
          // margin: "0 auto",
          // boxShadow: "0 10px 20px rgba(0,0,0,0.4)",
          // borderRadius: "0.5rem",
          // backgroundColor: "ghostwhite",
        }}
      >
        <image
          xlinkHref={src}
          width={h * 1}
          height="400"
          x={w * 0.1}
          y={h * 0.1}
        />
      </svg>
    </Box>
  );
};
