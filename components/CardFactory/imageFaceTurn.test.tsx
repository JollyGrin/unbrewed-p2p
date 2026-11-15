import { render } from "@testing-library/react";
import { ImageFace } from "./Card";

/**
 * A "turned" upload (#1623): POMNI's Adventure / Reward faces are landscape cards
 * saved a quarter turn round in a portrait file. `cardImage.turn` says so, and the
 * one image renderer turns them back in every slot.
 */
describe("ImageFace — turned uploads", () => {
  const url = "/evergreen-decks/art/1y_5/adventure-1.webp";

  it("an ordinary image is drawn as it always was", () => {
    const { container } = render(<ImageFace image={{ url }} title="x" />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 63 88");
    expect(container.querySelector("image")?.getAttribute("transform")).toBeNull();
  });

  it("in a portrait card slot it is turned upright and letterboxed to the slot's width", () => {
    const { container } = render(<ImageFace image={{ url, turn: "ccw" }} title="Adventure 1" />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 63 88");
    const transform = container.querySelector("image")?.getAttribute("transform") ?? "";
    expect(transform).toContain("rotate(-90)");
    expect(transform).toContain(`scale(${63 / 88})`);
    expect(transform.startsWith("translate(31.5 44)")).toBe(true);
  });

  it("in a landscape frame it fills the frame", () => {
    const { container } = render(<ImageFace image={{ url, turn: "ccw" }} title="Adventure 1" frame="landscape" />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 88 63");
    const transform = container.querySelector("image")?.getAttribute("transform") ?? "";
    expect(transform).toContain("rotate(-90)");
    expect(transform).toContain("scale(1)");
    expect(transform.startsWith("translate(44 31.5)")).toBe(true);
  });

  it("never turns a sprite-sheet cell", () => {
    const { container } = render(<ImageFace image={{ url, cols: 10, rows: 7, index: 3, turn: "ccw" }} title="x" />);
    expect(container.querySelector("image")?.getAttribute("transform")).toBeNull();
  });
});
