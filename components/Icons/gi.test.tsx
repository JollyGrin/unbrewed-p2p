import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as local from "./gi";
import * as full from "react-icons/gi";

describe("local gi icons match react-icons/gi", () => {
  it.each(Object.keys(local))("%s renders identical markup", (name) => {
    const a = (local as Record<string, any>)[name];
    const b = (full as Record<string, any>)[name];
    const props = { size: 20, color: "#123456", className: "x", style: { opacity: 0.5 } };
    expect(renderToStaticMarkup(createElement(a, props))).toBe(
      renderToStaticMarkup(createElement(b, props)),
    );
  });
});
