import { Box } from "@chakra-ui/react";
import * as d3 from "d3";
import { RefObject, useEffect, useRef, useState } from "react";
import { RepeatIcon } from "@chakra-ui/icons";
import { PositionType, Size } from "../Positions/position.type";

const defaultData: PositionType[] = [
  { id: "hero", x: 25, y: 25, r: 10 },
  { id: "sidekick", x: 75, y: 25, r: 10 },
];

type BoardProps = {
  src: `${string}.svg`;
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

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!window) return;
    if (!parentRef) return;

    const parent = parentRef.current;
    const width = parent.offsetWidth;
    const height = parent.offsetHeight;

    const canvas = d3
      .select<SVGSVGElement, PositionType[]>(canvasRef.current)
      .attr("width", width)
      .attr("height", height);

    if (!gRef.current) {
      gRef.current = canvas.append("g").attr("cursor", "grab").node();
    }
    const g = d3.select(gRef.current);

    g.selectAll<SVGCircleElement, PositionType>("circle")
      .data(data)
      .join("circle")
      .attr("cx", ({ x }) => x)
      .attr("cy", ({ y }) => y)
      .attr("r", ({ r }) => (r ? r : 15))
      .attr("fill", ({ color }) => color ?? "black")
      // TODO: replace this to limit which token the user can control
      .attr("opacity", ({ id }) => (id === (self as string) ? 1 : 0.75))
      .filter(({ id }) => {
        return id === self;
      })
      .call(
        d3
          .drag<SVGCircleElement, PositionType>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
          .touchable(true),
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
        }),
    );

    function dragstarted(e: { target: any }) {
      d3.select(e.target).raise();
      g.attr("cursor", "grabbing");
      //@ts-expect-error: implicit any
      const circle = d3.select<SVGCircleElement, PositionType>(this);
      circle
        .transition()
        .duration(200)
        .attr("stroke", "red")
        .attr("stroke-width", 1);
    }

    function dragged(
      event: DragEvent & { subject: PositionType },
      d: PositionType,
    ) {
      //@ts-expect-error: implicit any
      d3.select<SVGCircleElement, PositionType>(this)
        .attr("cx", (d.x = event.x))
        .attr("cy", (d.y = event.y));

      if (!move) return;
      move({ id: event.subject.id, x: event.x, y: event.y });
    }

    function dragended() {
      g.attr("cursor", "grab");

      //@ts-expect-error: implicit any
      const circle = d3.select<SVGCircleElement, PositionType>(this);
      // circle.attr("stroke", "red").attr("stroke-width", 0);
      circle
        .transition()
        .duration(350)
        // change the stroke-width attribute to 5
        .attr("stroke-width", 0);
    }
  }, [data, updateCanvas, parentRef, move, self]);

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
          margin: "0 auto",
          boxShadow: "0 10px 20px rgba(0,0,0,0.4)",
          backgroundColor: "ghostwhite",
        }}
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
