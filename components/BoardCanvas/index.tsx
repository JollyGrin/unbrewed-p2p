//@ts-nocheck
import { Box } from "@chakra-ui/react";
import * as d3 from "d3";
import { RefObject, useEffect, useRef, useState } from "react";
import { RepeatIcon } from "@chakra-ui/icons";
import { Size } from "../Positions/position.type";

export interface Circle {
  x: number;
  y: number;
  tokenSize?: Size;
  startX?: number;
  startY?: number;
  id?: string;
}
const defaultData: Circle[] = [
  { id: "hero", x: 25, y: 25, r: 10 },
  { id: "sidekick", x: 75, y: 25, r: 10 },
  // { id: "enemey", x: 125, y: 25, r: 10 },
];

type BoardProps = {
  src: `${string}.svg`;
  data?: Circle[];
  move?: any;
  self?: string;
};
export const BoardCanvas: React.FC<BoardProps> = ({
  src = "jpark.svg",
  data = defaultData,
  move,
  self,
}) => {
  const parentRef: RefObject<> = useRef();
  const canvasRef: RefObject<SVGSVGElement> = useRef(null);
  const gRef = useRef<SVGGElement | null>(null);
  const [w, setW] = useState<number>(100);
  const [h, setH] = useState<number>(100);

  // HACK: toggle boolean to trigger useEffect
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

    const radius = 13;
    // const radius = w * 0.03;

    if (!gRef.current) {
      gRef.current = canvas.append("g").attr("cursor", "grab").node();
    }
    const g = d3.select(gRef.current);

    const getSize = (size: Size) =>
      size === "lg" ? 30 : size === "md" ? 20 : 10;

    g.selectAll<SVGCircleElement, Circle>("circle")
      .data(data)
      .join("circle")
      .attr("cx", ({ x }) => x)
      .attr("cy", ({ y }) => y)
      .attr("r", ({ tokenSize }) => (tokenSize ? getSize(tokenSize) : 15))
      .attr("fill", ({ color }) => color && color)
      // TODO: replace this to limit which token the user can control
      .attr("opacity", ({ id }) => (id === (self as string) ? 1 : 0.5))
      .filter(({ id }) => {
        console.log("ppp", id);
        return id === self;
      })
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
        .scaleExtent([0.5, 4])
        .on("zoom", ({ transform }) => {
          g.attr("transform", transform);
          canvas.select("image").attr("transform", transform);
        })
    );

    function dragstarted(e: { target: any }) {
      d3.select(e.target).raise();
      g.attr("cursor", "grabbing");
      const circle = d3.select<SVGCircleElement, Circle>(this);
      circle
        .transition()
        .duration(200)
        .attr("stroke", "red")
        .attr("stroke-width", 1);
    }

    function dragged(event: DragEvent, d: any) {
      d3.select<SVGCircleElement, Circle>(this)
        .attr("cx", (d.x = event.x))
        .attr("cy", (d.y = event.y));

      const scaleX = 1600 / w;
      const scaleY = 856 / h;

      console.log("event", [event.x, event.y], event.subject.id);
      move({ id: event.subject.id, x: event.x, y: event.y });
      // // TODO: replace with websocket
      // console.log(
      //   "replace with move() function callback to websocket",
      //   data.map((circle) => {
      //     if (circle.id !== d.id) return circle;
      //     return {
      //       ...circle,
      //       x: event.x,
      //       y: event.y,
      //     };
      //   })
      // );
    }

    function dragended() {
      g.attr("cursor", "grab");

      const circle = d3.select<SVGCircleElement, Circle>(this);
      // circle.attr("stroke", "red").attr("stroke-width", 0);
      circle
        .transition()
        .duration(350)
        // change the stroke-width attribute to 5
        .attr("stroke-width", 0);
    }
  }, [data, updateCanvas, parentRef]);

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
        style={
          {
            // borderBottom: "1px solid rgba(0,0,0,0.25)",
            // margin: "0 auto",
            // boxShadow: "0 10px 20px rgba(0,0,0,0.4)",
            // borderRadius: "0.5rem",
            // backgroundColor: "ghostwhite",
          }
        }
      >
        <image
          xlinkHref={src}
          // width={w * 1}
          // height={h * 1}

          width={1200}
          height={1000}
          x={1}
          y={1}
          // x={w * 0.01}
          // y={h * 0.01}
        />
      </svg>
    </Box>
  );
};
