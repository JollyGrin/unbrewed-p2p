import * as d3 from "d3";
import { MutableRefObject, RefObject, cloneElement, useEffect } from "react";
import { PositionType } from "../Positions/position.type";
import { FaBan } from "react-icons/fa";
import { TokenIcon } from "./Tokens";

type CanvasProps = {
  canvasRef: RefObject<SVGSVGElement>;
  gRef: MutableRefObject<SVGElement | null>;
  parentRef?: RefObject<any>;
  data?: PositionType[];
  self?: string;
  updateCanvas: boolean;
  move?: (e: PositionType) => void;
};

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
      .html((props) => TokenIcon.User({ fill: props.color }))
      // NOTE: Bellow attr & filter shows and limits user to moving their own tokens
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
