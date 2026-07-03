import * as d3 from "d3";
import { MutableRefObject, RefObject, useEffect } from "react";
import { PositionType } from "../Positions/position.type";
import { TokenIcon } from "./Tokens";

type CanvasProps = {
  canvasRef: RefObject<SVGSVGElement>;
  gRef: MutableRefObject<SVGElement | null>;
  parentRef?: RefObject<any>;
  data?: PositionType[];
  self?: string;
  size: { width: number; height: number };
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
  size,
}: CanvasProps) => {
  useEffect(() => {
    if (!data) return;
    if (!canvasRef.current) return;
    if (!window) return;
    if (!parentRef) return;
    if (!size.width || !size.height) return;

    const { width, height } = size;

    const canvas = d3
      .select<SVGSVGElement, PositionType[]>(canvasRef.current)
      .attr("width", width)
      .attr("height", height);

    const isFirstRender = !gRef.current;
    if (!gRef.current) {
      gRef.current = canvas.append("g").attr("cursor", "grab").node();
    }
    const g = d3.select(gRef.current);

    g.selectAll<SVGCircleElement, PositionType>("g")
      // Key by id so reordering the DOM (raise, below) doesn't scramble which
      // datum binds to which node on the next re-render.
      .data(data, (d) => (d as PositionType).id)
      .join((enter) => enter.append("g"))
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
      .html((props) =>
        props?.imageUrl
          ? TokenIcon.Image({ imageUrl: props.imageUrl })
          : TokenIcon.Circle({ color: props.color, size: props.r }),
      )
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
      )
      // Keep the local player's own tokens painted last (on top) so they can
      // always be grabbed, even when other players' tokens overlap them.
      .raise();

    const zoom = d3
      .zoom()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([0.25, 4])
      .on("zoom", ({ transform }) => {
        g.attr("transform", transform);
        canvas.select("image").attr("transform", transform);
      });
    //@ts-ignore
    canvas.call(zoom);

    // fit + center the map on first render (moves map and tokens together)
    if (isFirstRender) {
      const MAP_W = 1200;
      const MAP_H = 1000;
      const scale = Math.min(width / MAP_W, height / MAP_H, 1);
      const tx = (width - MAP_W * scale) / 2;
      const ty = (height - MAP_H * scale) / 2;
      canvas.call(
        //@ts-ignore
        zoom.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale),
      );
    }

    function dragstarted(e: any, d: PositionType) {
      const isSelf = d?.id === self;
      const isSidekick = d?.id.includes("_");
      const isSidekickSelf = d?.id.split("_")[0] === self;
      if (isSidekick && !isSidekickSelf) return;
      if (!isSelf) return;

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
  }, [data, size, parentRef, move, self]);
};
