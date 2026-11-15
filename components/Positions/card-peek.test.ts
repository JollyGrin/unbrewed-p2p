import {
  HAND_RESERVE,
  PEEK_HEIGHT,
  PEEK_WIDTH,
  peekPosition,
} from "./card-peek";

const VIEW = { width: 1280, height: 800 };
const anchor = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  bottom: top + height,
});
const handTop = VIEW.height - HAND_RESERVE;

describe("peekPosition", () => {
  it("sits above the token when there is room", () => {
    const a = anchor(600, 420, 120, 168);
    const p = peekPosition(a, VIEW);
    expect(p.y + PEEK_HEIGHT).toBeLessThan(a.top);
    expect(p.x + PEEK_WIDTH / 2).toBeCloseTo(a.left + a.width / 2);
  });

  it("goes below a token near the top, while that clears the hand", () => {
    const a = anchor(600, 20, 120, 168);
    const p = peekPosition(a, VIEW);
    expect(p.y).toBeGreaterThan(a.bottom);
    expect(p.y + PEEK_HEIGHT).toBeLessThanOrEqual(handTop);
  });

  it("moves beside a tall token instead of dropping into the hand (the old overlap)", () => {
    // the d-09 screenshot: a 260-wide card in the middle of an 800px screen
    const a = anchor(497, 232, 210, 294);
    const p = peekPosition(a, VIEW);
    expect(p.y + PEEK_HEIGHT).toBeLessThanOrEqual(handTop);
    expect(p.x).toBeGreaterThanOrEqual(a.left + a.width);
  });

  it("uses the left side when the right has no room", () => {
    const a = anchor(1050, 232, 210, 294);
    const p = peekPosition(a, VIEW);
    expect(p.x + PEEK_WIDTH).toBeLessThanOrEqual(a.left);
    expect(p.y + PEEK_HEIGHT).toBeLessThanOrEqual(handTop);
  });

  it("never enters the hand strip or leaves the screen, wherever the token is", () => {
    for (const view of [VIEW, { width: 390, height: 844 }]) {
      for (let left = -100; left < view.width; left += 97) {
        for (let top = -100; top < view.height; top += 83) {
          const p = peekPosition(anchor(left, top, 150, 210), view);
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x + PEEK_WIDTH).toBeLessThanOrEqual(view.width);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y + PEEK_HEIGHT).toBeLessThanOrEqual(
            view.height - HAND_RESERVE,
          );
        }
      }
    }
  });
});
