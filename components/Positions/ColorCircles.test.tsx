import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CIRCLE_COLORS, ColorCircles } from "./ColorCircles";

const show = (color: string) => {
  const onChange = jest.fn();
  render(
    <ChakraProvider>
      <ColorCircles color={color} onChange={onChange} />
    </ChakraProvider>,
  );
  return onChange;
};

describe("ColorCircles", () => {
  it("shows the 18 CirclePicker default swatches", () => {
    show("#48284F");
    expect(screen.getAllByRole("button")).toHaveLength(18);
    expect(CIRCLE_COLORS).toHaveLength(18);
  });

  it("marks the current colour as picked, case-insensitively", () => {
    show("#2196F3");
    expect(screen.getByTitle("#2196f3")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("#f44336")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports a clicked swatch as its hex", () => {
    const onChange = show("#48284F");
    fireEvent.click(screen.getByTitle("#9c27b0"));
    expect(onChange).toHaveBeenCalledWith("#9c27b0");
  });
});
