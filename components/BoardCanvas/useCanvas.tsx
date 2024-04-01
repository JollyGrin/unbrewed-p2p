import * as d3 from "d3";
import { MutableRefObject, RefObject, cloneElement, useEffect } from "react";
import { PositionType } from "../Positions/position.type";
import { FaBan } from "react-icons/fa";

type CanvasProps = {
  canvasRef: RefObject<SVGSVGElement>;
  gRef: MutableRefObject<SVGElement | null>;
  parentRef?: RefObject<any>;
  data?: PositionType[];
  self?: string;
  updateCanvas: boolean;
  move?: (e: PositionType) => void;
};

const Cir = () => (
  <svg width="100" height="100">
    <circle cx="50" cy="50" r="40" fill="blue" />
  </svg>
);

/**
 * Handles the Canvas, placing and moving the circles with the incoming data
 * */
export const useCanvas = ({
  canvasRef,
  parentRef,
  gRef,
  data,
  self,
  move,
  updateCanvas,
}: CanvasProps) => {
  useEffect(() => {
    if (!data) return;
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

    g.selectAll<SVGCircleElement, PositionType>("g")
      .data(data)
      .join((enter) => enter.append("g"))
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
      .attr("fill", ({ color }) => color ?? "black")
      .html(
        `<svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor" viewBox="0 0 24 24">
  <path fill-rule="evenodd" d="M7 2a2 2 0 0 0-2 2v1a1 1 0 0 0 0 2v1a1 1 0 0 0 0 2v1a1 1 0 1 0 0 2v1a1 1 0 1 0 0 2v1a1 1 0 1 0 0 2v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H7Zm3 8a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm-1 7a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3 1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1Z" clip-rule="evenodd"/>
</svg>`,
      )
      // TODO: replace this to limit which token the user can control
      .attr("opacity", ({ id }) => (id.includes(self as string) ? 1 : 0.75))
      .filter(({ id }) => {
        const isSidekick = id.includes("_");
        if (isSidekick) return id.split("_")[0] === self;
        return id === self;
      })
      .call(
        d3
          .drag<SVGGElement, PositionType>()
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

      move({
        ...event.subject,
        id: event.subject.id,
        x: event.x,
        y: event.y,
      });
    }

    function dragended() {
      g.attr("cursor", "grab");

      //@ts-expect-error: implicit any
      const circle = d3.select<SVGCircleElement, PositionType>(this);
      circle.transition().duration(350).attr("stroke-width", 0);
    }
  }, [data, updateCanvas, parentRef, move, self]);
};
