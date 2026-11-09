import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { CardTilt, tiltAngles } from "./CardTilt";

const mount = (props = {}) =>
  render(
    <ChakraProvider>
      <CardTilt data-testid="tilt" {...props}>
        <p>card</p>
      </CardTilt>
    </ChakraProvider>,
  );

// jsdom has no PointerEvent: a MouseEvent of type pointermove carries the coords
const move = (
  el: HTMLElement,
  clientX: number,
  clientY: number,
  pointerType = "mouse",
) => {
  const event = new MouseEvent("pointermove", { clientX, clientY, bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(el, event);
};

const sized = (el: HTMLElement) =>
  (el.getBoundingClientRect = () =>
    ({ left: 100, top: 100, width: 200, height: 300 }) as DOMRect);

describe("tiltAngles", () => {
  it("is flat at the centre and capped at maxTilt on the edges", () => {
    expect(tiltAngles(0.5, 0.5, 10)).toEqual({ rx: -0, ry: 0 });
    expect(tiltAngles(1, 0, 10)).toEqual({ rx: 10, ry: 10 });
    expect(tiltAngles(0, 1, 10)).toEqual({ rx: -10, ry: -10 });
    expect(tiltAngles(5, -5, 10)).toEqual({ rx: 10, ry: 10 });
  });
});

describe("CardTilt", () => {
  it("renders its child untouched", () => {
    mount();
    expect(screen.getByText("card")).toBeTruthy();
  });

  it("sets tilt + glare vars toward the cursor and resets on leave", () => {
    mount();
    const el = screen.getByTestId("tilt");
    sized(el);
    move(el, 300, 100);
    expect(el.style.getPropertyValue("--ry")).toBe("10.00deg");
    expect(el.style.getPropertyValue("--rx")).toBe("10.00deg");
    expect(el.style.getPropertyValue("--gx")).toBe("100.0%");
    expect(el.style.getPropertyValue("--gy")).toBe("0.0%");
    fireEvent.pointerLeave(el);
    expect(el.style.getPropertyValue("--rx")).toBe("0deg");
    expect(el.style.getPropertyValue("--ry")).toBe("0deg");
  });

  it("tilt={false} leaves rotation alone but still tracks the glare", () => {
    mount({ tilt: false });
    const el = screen.getByTestId("tilt");
    sized(el);
    move(el, 300, 100);
    expect(el.style.getPropertyValue("--rx")).toBe("");
    expect(el.style.getPropertyValue("--gx")).toBe("100.0%");
  });

  it("omits the glare overlay when glare={false}", () => {
    mount({ glare: false });
    expect(document.querySelector("[data-card-tilt-glare]")).toBeNull();
  });

  it("does not tilt for touch pointers or reduced motion", () => {
    mount();
    const el = screen.getByTestId("tilt");
    sized(el);
    move(el, 300, 100, "touch");
    expect(el.style.getPropertyValue("--ry")).toBe("");
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    move(el, 300, 100, "mouse");
    expect(el.style.getPropertyValue("--ry")).toBe("");
  });
});
