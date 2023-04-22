//@ts-nocheck
import { Box } from "@chakra-ui/react";
import * as d3 from "d3";
import { RefObject, useEffect, useRef, useState } from "react";

interface Circle {
  x: number;
  y: number;
  r: number;
  startX?: number;
  startY?: number;
}

export const BoardCanvas = () => {
  const canvasRef: RefObject<SVGSVGElement> = useRef(null);
  const gRef = useRef<SVGGElement | null>(null);
  const [w, setW] = useState<number>(100);
  const [h, setH] = useState<number>(100);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!window) return;
    console.log(window.innerWidth, "aaaa");
    const margin = { top: 0, right: 10, bottom: 300, left: 10 };
    const width = window.innerWidth - 100;
    const height = window.innerHeight - 300;

    setW(width);
    setH(height);
    const canvas = d3
      .select<SVGSVGElement, Circle[]>(canvasRef.current)
      .attr("width", width)
      .attr("height", height);

    const radius = width * 0.022;

    if (!gRef.current) {
      gRef.current = canvas.append("g").attr("cursor", "grab").node();
    }
    const g = d3.select(gRef.current);

    const data: Circle[] = [
      { x: 200, y: 500, r: 10 },
      { x: 200, y: 300, r: 10 },
      { x: 200, y: 400, r: 10 },
    ];

    // canvas.call(() =>
    //   d3.xml("jpark.svg").then((data) => {
    //     console.log(data.documentElement);
    //     canvas.append(data.documentElement);
    //   })
    // );

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
    }

    function dragended() {
      g.attr("cursor", "grab");
    }
  }, []);

  console.log({ w });

  return (
    <Box w="100%">
      <svg
        ref={canvasRef}
        style={{
          border: "1px solid red",
          margin: "0 auto",
          boxShadow: "0 10px 20px rgba(0,0,0,0.4)",
          borderRadius: "0.5rem",
          backgroundColor: "ghostwhite",
        }}
      >
        <image
          xlinkHref="jpark.svg"
          width={w * 0.8}
          height="400"
          x={w * 0.1}
          y={h * 0.1}
        />
      </svg>
    </Box>
  );
};
