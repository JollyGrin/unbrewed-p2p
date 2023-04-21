import { Box } from "@chakra-ui/react";
import * as d3 from "d3";
import * as d3Drag from "d3-drag";
import Image from "next/image";
// import { drag as d3_drag } from "d3-drag";
import { RefObject, useEffect, useRef, useState } from "react";

interface Circle {
  x: number;
  y: number;
  r: number;
  startX?: number;
  startY?: number;
}

const BoardPage = () => {
  const canvasRef: RefObject<SVGSVGElement> = useRef(null);
  const gRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = d3.select<SVGSVGElement, Circle[]>(canvasRef.current);

    const radius = 6;
    const step = radius * 2;
    const width = 500;
    const height = 500;

    if (!gRef.current) {
      gRef.current = canvas.append("g").attr("cursor", "grab").node();
    }
    const g = d3.select(gRef.current);

    const data: Circle[] = [
      { x: 50, y: 50, r: 25 },
      { x: 150, y: 50, r: 25 },
      { x: 100, y: 150, r: 25 },
    ];

    g.selectAll<SVGCircleElement, Circle>("circle")
      .data(data)
      .join("circle")
      .attr("cx", ({ x }) => x)
      .attr("cy", ({ y }) => y)
      .attr("r", ({ r }) => r)
      // .attr("fill", (d, i) => d3.interpolateRainbow(i / 360))
      .call(
        d3
          .drag<SVGCircleElement, Circle>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
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
          console.log({ transform });
          g.attr("transform", transform);
        })
    );

    function dragstarted(e: { target: any }) {
      d3.select(e.target).raise();
      g.attr("cursor", "grabbing");
    }

    function dragged(event: DragEvent, d: any) {
      console.log("t", this, event, d);
      d3.select<SVGCircleElement, Circle>(this)
        .attr("cx", (d.x = event.x))
        .attr("cy", (d.y = event.y));
    }

    function dragended() {
      g.attr("cursor", "grab");
    }

    // d3.xml("jpark.svg").then((data) => {
    //   console.log({ data });
    //   canvas.append(data.documentElement);
    // });
  }, []);

  return (
    <Box w="100%" h="95vh">
      {/* <Image src="jpark.svg" alt="board" width={100} height={100} /> */}
      <svg width="100%" height="100%" ref={canvasRef}></svg>
    </Box>
  );
};

export default BoardPage;
