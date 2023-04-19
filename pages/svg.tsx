import { useState, useEffect } from "react";
import { createCanvas, Canvas } from "canvas";

const SVGPage = () => {
  const [canvas, setCanvas] = useState<Canvas>();
  const text = "effects on your";
  const font = "effects on your 3.3px Archivo Narrow";

  useEffect(() => {
    if (canvas) return;
    if (typeof window !== "undefined") {
      const _canvas = createCanvas(200, 200);
      setCanvas(_canvas);
      console.log(_canvas);
    }
  }, [canvas]);

  if (canvas) {
    const context = canvas.getContext("2d");
    context.font = font;
    console.log({ context }, context.measureText(text).width);
  }

  // const canvas = createCanvas(200, 200);
  // const context = canvas.getContext("2d");
  // if (typeof window === "undefined") return;
  // const canvas = window.document.createElement("canvas");
  // return 10;
  // console.log({ font });
  return (
    <svg>
      <text
        x="-20"
        y="70"
        textAnchor="end"
        transform="rotate(-90 0 0)"
        lengthAdjust="spacingAndGlyphs"
        //   textLength={cantonAdjust === 0 ? 23.5 : null}
        textLength={canvas ? getTextWidth(text, font, canvas) : 100}
      >
        GHelelel
      </text>
    </svg>
  );
};
export default SVGPage;

const getTextWidth = (text: string, font: string, canvas: Canvas) => {
  const context = canvas.getContext("2d");
  context.font = font;
  console.log({ context }, context.measureText(text).width);
  const width = context.measureText(text).width;
  return width;
};
