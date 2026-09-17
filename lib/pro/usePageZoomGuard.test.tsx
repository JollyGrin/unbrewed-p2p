import { render } from "@testing-library/react";
import { GAME_TOUCH_ACTION, ZOOM_GUARD_STYLE_ID, usePageZoomGuard } from "./usePageZoomGuard";

const Harness = ({ on = true }: { on?: boolean }) => {
  usePageZoomGuard(on);
  return null;
};

const pinch = () => {
  const event = new Event("gesturestart", { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("usePageZoomGuard", () => {
  it("cancels Safari's page-zoom gesture while the game is open", () => {
    const { unmount } = render(<Harness />);

    expect(pinch()).toBe(true);

    unmount();
    expect(pinch()).toBe(false);
  });

  it("leaves scrolling alone but takes pinch and double-tap zoom off the page", () => {
    const { unmount } = render(<Harness />);

    expect(document.getElementById(ZOOM_GUARD_STYLE_ID)?.textContent).toContain(GAME_TOUCH_ACTION);

    unmount();
    expect(document.getElementById(ZOOM_GUARD_STYLE_ID)).toBeNull();
  });

  it("stays out of the way when it is not enabled", () => {
    render(<Harness on={false} />);

    expect(pinch()).toBe(false);
    expect(document.getElementById(ZOOM_GUARD_STYLE_ID)).toBeNull();
  });
});
